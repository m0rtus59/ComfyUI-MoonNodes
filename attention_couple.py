import torch
import torch.nn.functional as F
from contextlib import nullcontext
import copy
import comfy
from comfy.ldm.modules.attention import optimized_attention
from nodes import CLIPTextEncode

def _safe_interpolate_nchw(x: torch.Tensor, size):
    if x.shape[2] == size[0] and x.shape[3] == size[1]:
        return x
    if size[0] > x.shape[2] or size[1] > x.shape[3]:
        return F.interpolate(x, size=size, mode="bilinear", align_corners=False)
    else:
        return F.interpolate(x, size=size, mode="area")

def _match_len(cond: torch.Tensor, target_len: int) -> torch.Tensor:
    cur = cond.shape[1]
    if cur == target_len:
        return cond
    if cur > target_len:
        return cond[:, :target_len, :]
    reps = (target_len + cur - 1) // cur
    return cond.repeat(1, reps, 1)[:, :target_len, :]

def _q_spatial_from_original(q: torch.Tensor, original_shape):
    _, S, _ = q.shape
    H, W = int(original_shape[2]), int(original_shape[3])
    if H <= 0 or W <= 0 or S <= 0:
        return 1, S

    for ds in (1, 2, 4, 8, 16, 32):
        h, w = H // ds, W // ds
        if h > 0 and w > 0 and h * w == S:
            return h, w

    target = W / max(1.0, H)
    best = None
    lim = int(S ** 0.5) + 1
    for h in range(1, lim):
        if S % h: continue
        w = S // h
        err = abs((w / max(1.0, h)) - target)
        if best is None or err < best[0]:
            best = (err, h, w)

    return (best[1], best[2]) if best else (1, S)


def _mask_to_q_layout(mask_any, q: torch.Tensor, original_shape) -> torch.Tensor:
    B, S, _ = q.shape

    if mask_any is None:
        return torch.ones((B, S, 1), dtype=q.dtype, device=q.device)

    m = mask_any
    if not torch.is_tensor(m):
        m = torch.as_tensor(m, dtype=q.dtype, device=q.device)
    else:
        m = m.to(dtype=q.dtype, device=q.device)

    if m.ndim == 0 or (m.ndim == 1 and m.numel() == 1):
        return torch.ones((B, S, 1), dtype=q.dtype, device=q.device) * m.clamp(0.0, 1.0)

    if m.ndim == 3:
        if m.shape[0] in (1, 3, 4):
            m = (m.any(dim=0)).to(m.dtype)
        else:
            m = m.squeeze()
    if m.ndim != 2:
        raise RuntimeError(f"Expected HxW-like mask, got {tuple(m.shape)}")

    hds, wds = _q_spatial_from_original(q, original_shape)
    m = m.unsqueeze(0).unsqueeze(0)                 
    m = _safe_interpolate_nchw(m, size=(hds, wds))  
    m = m.view(1, 1, hds * wds, 1).repeat(B, 1, 1, 1).squeeze(1)  
    return m.clamp(0.0, 1.0)

def _to(x: torch.Tensor, device, dtype):
    if x.device != device or x.dtype != dtype:
        return x.to(device=device, dtype=dtype)
    return x

def _fp32_autocast_for(t: torch.Tensor):
    dev = t.device.type
    try:
        # Modern PyTorch 2.x unified Autocast API (suppresses deprecation warnings)
        if hasattr(torch, "amp") and hasattr(torch.amp, "autocast"):
            return torch.amp.autocast(device_type=dev, enabled=False)
        
        # Legacy PyTorch 1.x fallback
        if dev == "cuda":
            return torch.cuda.amp.autocast(enabled=False)
        elif dev == "cpu":
            return torch.cpu.amp.autocast(enabled=False)
    except Exception:
        pass
    return nullcontext()

def set_model_patch_replace(model, patch_attn1, patch_attn2, key):
    to = model.model_options["transformer_options"]
    if "patches_replace" not in to:
        to["patches_replace"] = {}
    if "attn1" not in to["patches_replace"]:
        to["patches_replace"]["attn1"] = {}
    if "attn2" not in to["patches_replace"]:
        to["patches_replace"]["attn2"] = {}
    to["patches_replace"]["attn1"][key] = patch_attn1
    to["patches_replace"]["attn2"][key] = patch_attn2

def iter_attn_modules(unet):
    roots = [
        ("input", getattr(unet, "input_blocks", [])),
        ("middle", getattr(unet, "middle_block", [])),
        ("output", getattr(unet, "output_blocks", [])),
    ]
    for root_name, seq in roots:
        for i, sub in enumerate(seq):
            modules = sub if isinstance(sub, (list, tuple)) else [sub]
            for j, mod in enumerate(modules):
                for name, m in mod.named_modules():
                    if hasattr(m, "attn1") and hasattr(m, "attn2"):
                        tbi = None
                        parts = name.split(".")
                        if "transformer_blocks" in parts:
                            k = parts.index("transformer_blocks")
                            if k + 1 < len(parts) and parts[k + 1].isdigit():
                                tbi = int(parts[k + 1])
                        key = (root_name, i) if tbi is None else (root_name, i, tbi)
                        yield key, m.attn1, m.attn2

def apply_patches(new_model, make_patch_attn1, make_patch_attn2):
    unet = new_model.model.diffusion_model
    for key, attn1, attn2 in iter_attn_modules(unet):
        set_model_patch_replace(new_model, make_patch_attn1(attn1), make_patch_attn2(attn2), key)

class AttentionCouple:

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "model": ("MODEL", ),
                "positive": ("CONDITIONING",),
                "negative": ("CONDITIONING",),
                "mode": (["Attention", "Latent"], ),
            }
        }

    RETURN_TYPES = ("MODEL", "CONDITIONING", "CONDITIONING")
    FUNCTION = "attention_couple"
    CATEGORY = "loaders"

    def attention_couple(self, model, clip, positive, negative, mode, isolation_pct=0.0):
        if mode == "Latent":
            return (model, positive, negative)

        self.raw_positive = copy.deepcopy(positive)
        self.raw_negative = copy.deepcopy(negative)
        self.isolation_pct = isolation_pct
        self.max_sigma = None 

        new_model = model.clone()

        to = new_model.model_options.setdefault("transformer_options", {})
        to["patches_replace"] = {"attn1": {}, "attn2": {}}

        apply_patches(new_model, self.make_patch_attn1, self.make_patch_attn2)

        empty_pos = CLIPTextEncode().encode(clip, "")[0]
        empty_neg = CLIPTextEncode().encode(clip, "")[0]

        return new_model, [empty_pos[0]], [empty_neg[0]]

    # --- PATCH 1: SELF-ATTENTION ISOLATION (attn1) ---
    def make_patch_attn1(self, module):
        def patch(q, k, v, extra_options):
            B, S, C = q.shape
            heads = extra_options["n_heads"]
            original_shape = extra_options["original_shape"]

            sigmas = extra_options.get("sigmas", None)
            is_isolated = False
            if sigmas is not None and self.isolation_pct > 0.0:
                curr_sig = sigmas[0].item()
                if self.max_sigma is None or curr_sig > self.max_sigma:
                    self.max_sigma = curr_sig
                if self.max_sigma > 0:
                    progress = 1.0 - (curr_sig / self.max_sigma)
                    if progress < self.isolation_pct:
                        is_isolated = True

            if not is_isolated or len(self.raw_positive) <= 1:
                return optimized_attention(q, k, v, heads)

            if S > 4096:
                return optimized_attention(q, k, v, heads)

            masks_list = []
            for ent in self.raw_positive:
                opts = ent[1] if isinstance(ent[1], dict) else {}
                if "mask" in opts:
                    m = _mask_to_q_layout(opts["mask"], q, original_shape) 
                    masks_list.append(m[0, :, 0]) 

            if not masks_list:
                return optimized_attention(q, k, v, heads)

            M = torch.stack(masks_list, dim=0) 
            union = torch.clamp(torch.sum(M, dim=0), 0.0, 1.0) 
            bg = 1.0 - union 

            corr = torch.matmul(M.t(), M) 
            bg_mask = bg.unsqueeze(1) + bg.unsqueeze(0) 

            allowed = (corr > 0.0) | (bg_mask > 0.0)
            
            attn_mask = torch.where(allowed, 0.0, -10000.0).to(device=q.device, dtype=q.dtype)
            attn_mask = attn_mask.unsqueeze(0).unsqueeze(0) 

            d_head = C // heads
            q_r = q.view(B, S, heads, d_head).transpose(1, 2)
            k_r = k.view(B, S, heads, d_head).transpose(1, 2)
            v_r = v.view(B, S, heads, d_head).transpose(1, 2)

            out = F.scaled_dot_product_attention(q_r, k_r, v_r, attn_mask=attn_mask)
            out = out.transpose(1, 2).contiguous().view(B, S, C)
            return out

        return patch

    # --- PATCH 2: CROSS-ATTENTION BLENDING (attn2) ---
    def make_patch_attn2(self, module):
        def patch(q, k, v, extra_options):
            cond_or_uncond = extra_options["cond_or_uncond"]  
            q_list = q.chunk(len(cond_or_uncond), dim=0)  
            b = q_list[0].shape[0]
            original_shape = extra_options["original_shape"]

            q_anchor = q_list[0]
            for j, val in enumerate(cond_or_uncond):
                if int(val) == 1:
                    q_anchor = q_list[j]
                    break

            def build_side(entries):
                conds_list, opts_list = [], []
                for ent in entries:
                    conds_list.append(ent[0])
                    opts_list.append(ent[1] if isinstance(ent[1], dict) else {})

                region_indices, raw_masks, strengths = [], [], []
                base_indices = []
                for idx, opts in enumerate(opts_list):
                    if "mask" in opts:
                        region_indices.append(idx)
                        m = _mask_to_q_layout(opts["mask"], q_anchor, original_shape).to(dtype=torch.float32)
                        raw_masks.append(m)
                        strengths.append(float(opts.get("mask_strength", 1.0)))
                    else:
                        base_indices.append(idx)

                masks_per_entry = []
                num_base = len(base_indices)

                if len(raw_masks) > 0:
                    w_stack = torch.stack([m * s for m, s in zip(raw_masks, strengths)], dim=0)
                    sum_w = torch.sum(w_stack, dim=0)
                    
                    total_w = float(num_base) + sum_w
                    total_w = torch.clamp(total_w, min=1e-6)
                    
                    region_weights = [w / total_w for w in w_stack]
                    
                    if num_base > 0:
                        base_weight = 1.0 / total_w
                    else:
                        base_weight = torch.zeros_like(sum_w)
                else:
                    region_weights = []
                    if num_base > 0:
                        base_weight = torch.ones((q_anchor.shape[0], q_anchor.shape[1], 1), device=q_anchor.device, dtype=torch.float32) / float(num_base)
                    else:
                        base_weight = torch.zeros((q_anchor.shape[0], q_anchor.shape[1], 1), device=q_anchor.device, dtype=torch.float32)

                ridx_map = {entry_idx: j for j, entry_idx in enumerate(region_indices)}
                for entry_idx in range(len(conds_list)):
                    if entry_idx in ridx_map:
                        masks_per_entry.append(region_weights[ridx_map[entry_idx]])
                    else:
                        masks_per_entry.append(base_weight)

                if len(conds_list) == 1:
                    ctx = conds_list[0]
                else:
                    max_len = max(t.shape[1] for t in conds_list)
                    ctx = torch.cat([_match_len(t, max_len) for t in conds_list], dim=0)

                ctx = _to(ctx, device=q_list[0].device, dtype=module.to_k.weight.dtype)
                masks_per_entry = [_to(m, q_list[0].device, q_list[0].dtype) for m in masks_per_entry]

                return masks_per_entry, ctx

            masks_uncond, ctx_uncond = build_side(self.raw_negative)
            masks_cond, ctx_cond = build_side(self.raw_positive)

            k_uncond = module.to_k(ctx_uncond).to(device=q_list[0].device)  
            v_uncond = module.to_v(ctx_uncond).to(device=q_list[0].device)
            k_cond = module.to_k(ctx_cond).to(device=q_list[0].device)  
            v_cond = module.to_v(ctx_cond).to(device=q_list[0].device)

            len_pos = len(self.raw_positive)
            len_neg = len(self.raw_negative)

            out = []
            for i, c in enumerate(cond_or_uncond):
                if int(c) == 0:
                    masks_bank, k_bank, v_bank, length = masks_cond, k_cond, v_cond, len_pos
                else:
                    masks_bank, k_bank, v_bank, length = masks_uncond, k_uncond, v_uncond, len_neg
                q_src = q_list[i]
                q_target = q_src.repeat(length, 1, 1)  
                k_rep = k_bank.repeat_interleave(b, dim=0)  
                v_rep = v_bank.repeat_interleave(b, dim=0)

                with _fp32_autocast_for(q_src):
                    q32 = q_target.float()
                    k32 = k_rep.float()
                    v32 = v_rep.float()
                    qkv32 = optimized_attention(q32, k32, v32, extra_options["n_heads"])

                m_stack = torch.stack(masks_bank, dim=0) 
                torch.nan_to_num_(m_stack, nan=0.0, posinf=1.0, neginf=0.0)
                m_flat = m_stack.reshape(length * b, m_stack.shape[2], 1) 
                m_flat = m_flat.to(device=qkv32.device, dtype=qkv32.dtype)

                qkv32 = qkv32 * m_flat
                qkv32 = qkv32.view(length, b, qkv32.shape[1], qkv32.shape[2]).sum(dim=0)

                torch.nan_to_num_(qkv32, nan=0.0, posinf=0.0, neginf=0.0)
                qkv32 = torch.clamp(qkv32, min=-1e4, max=1e4)
                out.append(qkv32.to(dtype=q_src.dtype))

            y = torch.cat(out, dim=0)
            torch.nan_to_num_(y, nan=0.0, posinf=0.0, neginf=0.0)
            y = torch.clamp(y, min=-1e4, max=1e4)
            return y

        return patch