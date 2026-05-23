import torch
from nodes import ConditioningSetMask, ConditioningCombine, ConditioningConcat, CLIPTextEncode
from .attention_couple import AttentionCouple

class MoonRegionalSampler:
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
                # New Parameter: Isolates self-attention for the first X% of steps
                "head_start_percent": ("FLOAT", {"default": 0.00, "min": 0.0, "max": 1.0, "step": 0.05}),
            }
        }

    RETURN_TYPES = ("MODEL", "CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("MODEL", "POSITIVE", "NEGATIVE")
    INPUT_IS_LIST = True
    FUNCTION = "apply"
    CATEGORY = "MoonNodes"

    def apply(self, model, clip, mask_list, positive_list, negative_list, mode, head_start_percent):
        model = model[0]; clip_obj = clip[0]; mode_val = mode[0]; head_start = head_start_percent[0]
        
        # SMART MASK DETECTION
        if len(mask_list) == 1 and mask_list[0].ndim == 3 and mask_list[0].shape[0] > 1:
            masks = mask_list[0]
        else:
            cleaned_masks = []
            for m in mask_list:
                if m.ndim == 3:
                    cleaned_masks.extend(list(m))
                elif m.ndim == 2:
                    cleaned_masks.append(m)
            masks = torch.stack(cleaned_masks, dim=0)

        def process_side(cond_list, masks_tensor):
            final_cond = None
            base_prompt = None
            
            if len(cond_list) > 0 and cond_list[0] is not None:
                base_prompt = cond_list[0]
                final_cond = base_prompt
                
            num_masks = masks_tensor.shape[0]
            
            for i in range(num_masks):
                cond_idx = i + 1
                
                if cond_idx < len(cond_list):
                    region_prompt = cond_list[cond_idx]
                    
                    if region_prompt is None:
                        continue 
                    
                    if mode_val == "Concat" and base_prompt is not None:
                        current_region = ConditioningConcat().concat(base_prompt, region_prompt)[0]
                    else:
                        current_region = region_prompt
                        
                    mask = masks_tensor[i]
                    masked_reg = ConditioningSetMask().append(current_region, mask, "default", 1.0)[0]
                    
                    if final_cond is None:
                        final_cond = masked_reg
                    else:
                        final_cond = ConditioningCombine().combine(final_cond, masked_reg)[0]
            
            if final_cond is None:
                final_cond = CLIPTextEncode().encode(clip_obj, "")[0]
                
            return final_cond

        final_pos = process_side(positive_list, masks)
        final_neg = process_side(negative_list, masks)

        new_model, _, _ = AttentionCouple().attention_couple(
            model=model,
            clip=clip_obj, 
            positive=final_pos,
            negative=final_neg,
            mode="Attention",
            isolation_pct=head_start
        )
        
        return (new_model, final_pos, final_neg)