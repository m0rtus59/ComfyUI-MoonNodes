import torch
import torch.nn.functional as F
import comfy.samplers
from nodes import KSamplerAdvanced, ConditioningSetMask, ConditioningCombine, ConditioningConcat, CLIPTextEncode
from .attention_couple import AttentionCouple

class MoonMultiPassSampler:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "mask_list": ("MASK",),
                "positive_list": ("CONDITIONING",),
                "negative_list": ("CONDITIONING",),
                "mode": (["Merge", "Concat"], {"default": "Merge"}),
                
                # Standard Simple KSampler Inputs
                "latent_image": ("LATENT",),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000}),
                "cfg": ("FLOAT", {"default": 8.0, "min": 0.0, "max": 100.0, "step": 0.1, "round": 0.01}),
                "sampler_name": (comfy.samplers.KSampler.SAMPLERS, ),
                "scheduler": (comfy.samplers.KSampler.SCHEDULERS, ),
                "denoise": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                
                # The Alternating Step Isolation Parameter
                "local_pass_percent": ("FLOAT", {"default": 0.20, "min": 0.0, "max": 1.0, "step": 0.01}),
            }
        }

    RETURN_TYPES = ("LATENT",)
    RETURN_NAMES = ("LATENT",)
    INPUT_IS_LIST = True
    FUNCTION = "apply"
    CATEGORY = "MoonNodes"

    def apply(self, model, clip, mask_list, positive_list, negative_list, mode, 
              latent_image, seed, steps, cfg, sampler_name, scheduler, denoise, local_pass_percent):
        
        # Unpack lists
        model_obj = model[0]
        clip_obj = clip[0]
        mode_val = mode[0]
        latent_obj = latent_image[0]
        
        seed_val = seed[0]
        steps_val = steps[0]
        cfg_val = cfg[0]
        sampler_name_val = sampler_name[0]
        scheduler_val = scheduler[0]
        denoise_val = denoise[0]
        local_pct = local_pass_percent[0]
        
        # Calculate step ranges
        start_at_step_val = round(steps_val * (1.0 - denoise_val))
        local_steps_count = round(steps_val * local_pct)
        isolate_until = min(start_at_step_val + local_steps_count, steps_val)
        
        # 1. SMART MASK DETECTION
        if len(mask_list) == 1 and mask_list[0].ndim == 3 and mask_list[0].shape[0] > 1:
            masks = mask_list[0]
        else:
            cleaned_masks = []
            for m in mask_list:
                if m.ndim == 3: cleaned_masks.extend(list(m))
                elif m.ndim == 2: cleaned_masks.append(m)
            masks = torch.stack(cleaned_masks, dim=0)

        empty_cond = CLIPTextEncode().encode(clip_obj, "")[0]
        base_pos = positive_list[0] if len(positive_list) > 0 and positive_list[0] is not None else empty_cond
        base_neg = negative_list[0] if len(negative_list) > 0 and negative_list[0] is not None else empty_cond

        adv_sampler = KSamplerAdvanced()
        latent_samples = latent_obj["samples"]
        B, C, H, W = latent_samples.shape
        num_masks = masks.shape[0]
        
        # Calculate the Background Mask (inv_mask) at latent resolution
        inv_mask = torch.ones((H, W), device=latent_samples.device, dtype=latent_samples.dtype)
        for i in range(num_masks):
            mask_2d = masks[i].unsqueeze(0).unsqueeze(0)
            down_mask = F.interpolate(mask_2d, size=(H, W), mode="area").squeeze(0).squeeze(0)
            inv_mask = torch.clamp(inv_mask - down_mask, 0.0, 1.0)
        
        # ==========================================
        # PRECOMPUTE CONDITIONINGS
        # ==========================================
        isolated_conds = []
        final_pos = base_pos
        final_neg = base_neg
        
        for i in range(num_masks):
            cond_idx = i + 1
            if cond_idx < len(positive_list) and positive_list[cond_idx] is not None:
                r_pos = positive_list[cond_idx]
                r_neg = negative_list[cond_idx] if cond_idx < len(negative_list) and negative_list[cond_idx] is not None else empty_cond
                
                if mode_val == "Concat":
                    c_pos = ConditioningConcat().concat(base_pos, r_pos)[0]
                    c_neg = ConditioningConcat().concat(base_neg, r_neg)[0]
                else:
                    c_pos = r_pos
                    c_neg = r_neg
                
                # For Isolated Passes (Masked gets Local, Unmasked gets Base)
                m_pos_iso = ConditioningSetMask().append(c_pos, masks[i], "default", 1.0)[0]
                f_pos_iso = ConditioningCombine().combine(base_pos, m_pos_iso)[0]
                
                m_neg_iso = ConditioningSetMask().append(c_neg, masks[i], "default", 1.0)[0]
                f_neg_iso = ConditioningCombine().combine(base_neg, m_neg_iso)[0]
                
                isolated_conds.append((i, f_pos_iso, f_neg_iso))
                
                # For Global Pass (Compile all into one massive conditioning)
                final_pos = ConditioningCombine().combine(final_pos, m_pos_iso)[0]
                final_neg = ConditioningCombine().combine(final_neg, m_neg_iso)[0]
                
        # Patch the model for the global passes using AttentionCouple
        patched_model, _, _ = AttentionCouple().attention_couple(
            model=model_obj, clip=clip_obj, positive=final_pos, negative=final_neg, mode="Attention"
        )
        
        # ==========================================
        # PHASE 1: THE ALTERNATING WEAVE LOOP (Strict Noise Preservation)
        # ==========================================
        working_latent = latent_obj.copy()
        current_step = start_at_step_val
        
        while current_step < isolate_until:
            # Alternates step-by-step: Even steps are isolated, Odd steps are global
            is_isolated_step = (current_step - start_at_step_val) % 2 == 0
            next_step = current_step + 1
            
            is_final_overall_step = (next_step == steps_val)
            curr_add_noise = "enable" if current_step == start_at_step_val else "disable"
            curr_return_noise = "disable" if is_final_overall_step else "enable"
            
            # FIX: Dynamically offset the seed at every step to prevent constructive noise accumulation in SDE/Ancestral samplers
            curr_seed = seed_val + current_step
            
            if is_isolated_step and len(isolated_conds) > 0:
                print(f"MoonNodes: [Weave] ISOLATED Step {current_step} -> {next_step} | Seed: {curr_seed}")
                
                # 1. Denoise Background (Unmasked area) from current_step to next_step
                bg_latent_image = working_latent.copy()
                bg_latent_image['noise_mask'] = inv_mask
                
                bg_latent = adv_sampler.sample(
                    model=model_obj, add_noise=curr_add_noise, noise_seed=curr_seed,
                    steps=steps_val, cfg=cfg_val, sampler_name=sampler_name_val, scheduler=scheduler_val,
                    positive=base_pos, negative=base_neg, latent_image=bg_latent_image,
                    start_at_step=current_step, end_at_step=next_step, 
                    return_with_leftover_noise=curr_return_noise
                )[0]
                
                base_latent_image = bg_latent.copy()
                
                # 2. Denoise each region individually for exactly 1 step
                for idx, f_pos, f_neg in isolated_conds:
                    region_mask = masks[idx]
                    
                    region_latent_image = working_latent.copy()
                    region_latent_image['noise_mask'] = region_mask
                    
                    reg_latent = adv_sampler.sample(
                        model=model_obj, add_noise=curr_add_noise, noise_seed=curr_seed,
                        steps=steps_val, cfg=cfg_val, sampler_name=sampler_name_val, scheduler=scheduler_val,
                        positive=f_pos, negative=f_neg, latent_image=region_latent_image,
                        start_at_step=current_step, end_at_step=next_step,
                        return_with_leftover_noise=curr_return_noise
                    )[0]
                    
                    # Stitch the denoised region back onto our base_latent_image
                    mask_2d = region_mask.unsqueeze(0).unsqueeze(0) 
                    down_mask = F.interpolate(mask_2d, size=(H, W), mode="area").to(device=base_latent_image["samples"].device, dtype=base_latent_image["samples"].dtype)
                    down_mask = down_mask.expand(B, C, H, W)
                    
                    base_latent_image["samples"] = base_latent_image["samples"] * (1.0 - down_mask) + reg_latent["samples"] * down_mask
                
                if 'noise_mask' in base_latent_image:
                    del base_latent_image['noise_mask']
                    
                working_latent = base_latent_image
            else:
                # Global Pass
                print(f"MoonNodes: [Weave] GLOBAL Step {current_step} -> {next_step} | Seed: {curr_seed}")
                if 'noise_mask' in working_latent:
                    del working_latent['noise_mask']
                    
                global_latent = adv_sampler.sample(
                    model=patched_model, add_noise=curr_add_noise, noise_seed=curr_seed,
                    steps=steps_val, cfg=cfg_val, sampler_name=sampler_name_val, scheduler=scheduler_val,
                    positive=final_pos, negative=final_neg, latent_image=working_latent,
                    start_at_step=current_step, end_at_step=next_step,
                    return_with_leftover_noise=curr_return_noise
                )[0]
                working_latent = global_latent
                
            current_step = next_step

        # ==========================================
        # PHASE 2: FINAL HOMOGENEOUS PASS
        # ==========================================
        if current_step < steps_val:
            curr_seed = seed_val + current_step
            print(f"MoonNodes: Final Unified Pass (Steps {current_step} to {steps_val}) | Seed: {curr_seed}...")
            curr_add_noise = "enable" if current_step == start_at_step_val else "disable"
            if 'noise_mask' in working_latent:
                del working_latent['noise_mask']
            
            final_latent = adv_sampler.sample(
                model=patched_model, add_noise=curr_add_noise, noise_seed=curr_seed,
                steps=steps_val, cfg=cfg_val, sampler_name=sampler_name_val, scheduler=scheduler_val,
                positive=final_pos, negative=final_neg, latent_image=working_latent,
                start_at_step=current_step, end_at_step=steps_val,
                return_with_leftover_noise="disable"
            )[0]
            working_latent = final_latent
            
        return (working_latent,)