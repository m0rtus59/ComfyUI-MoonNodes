import torch
import torch.nn.functional as F
import copy
from comfy.ldm.modules.attention import optimized_attention

def _mask_to_dit_patches(mask_any, q_shape, device, dtype):
    """
    Converts a 2D spatial mask into a 1D token sequence layout [B, S_img, 1]
    matching DiT patch sequences.
    """
    B, S, _ = q_shape

    if mask_any is None:
        return torch.ones((B, S, 1), dtype=dtype, device=device)

    m = mask_any
    if not torch.is_tensor(m):
        m = torch.as_tensor(m, dtype=dtype, device=device)
    else:
        m = m.to(dtype=dtype, device=device)

    if m.ndim == 3:
        m = m.squeeze(0) if m.shape[0] == 1 else m.any(dim=0).to(dtype)
    if m.ndim != 2:
        return torch.ones((B, S, 1), dtype=dtype, device=device)

    # Estimate 2D spatial patch grid from 1D token length S
    grid_h = int(S ** 0.5)
    grid_w = S // grid_h if grid_h > 0 else S

    m_2d = m.unsqueeze(0).unsqueeze(0)
    m_resized = F.interpolate(m_2d, size=(grid_h, grid_w), mode="bilinear", align_corners=False)
    m_flat = m_resized.view(1, grid_h * grid_w, 1).repeat(B, 1, 1)

    if m_flat.shape[1] < S:
        m_flat = F.pad(m_flat, (0, 0, 0, S - m_flat.shape[1]))
    elif m_flat.shape[1] > S:
        m_flat = m_flat[:, :S, :]

    return m_flat.clamp(0.0, 1.0)


def iter_dit_attn_modules(unet):
    """
    Finds attention module keys across UNet and DiT (Anima, Cosmos, Flux, SD3) structures.
    """
    roots = [
        ("input", getattr(unet, "input_blocks", [])),
        ("middle", getattr(unet, "middle_block", [])),
        ("output", getattr(unet, "output_blocks", [])),
        ("blocks", getattr(unet, "blocks", [])),
        ("transformer_blocks", getattr(unet, "transformer_blocks", [])),
        ("double_blocks", getattr(unet, "double_blocks", [])),
        ("single_blocks", getattr(unet, "single_blocks", [])),
        ("joint_blocks", getattr(unet, "joint_blocks", [])),
    ]
    
    found_any = False
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
                        found_any = True
                        yield key

    # Fallback key registration if model uses unified blocks
    if not found_any:
        for root_name, seq in roots:
            for i, _ in enumerate(seq):
                yield (root_name, i)


class AnimaAttentionCouple:
    """
    Dedicated Attention Engine for Anima (Qwen TE + Cosmos DiT) and DiT models.
    """
    def __init__(self):
        self.raw_positive = []
        self.raw_negative = []

    def attention_couple_anima(self, model, clip, positive, negative):
        self.raw_positive = copy.deepcopy(positive)
        self.raw_negative = copy.deepcopy(negative)

        new_model = model.clone()
        to = new_model.model_options.setdefault("transformer_options", {})
        
        # ComfyUI requires patches_replace to be a dictionary mapping key -> function
        if "patches_replace" not in to:
            to["patches_replace"] = {}
        if "attn1" not in to["patches_replace"]:
            to["patches_replace"]["attn1"] = {}
        if "attn2" not in to["patches_replace"]:
            to["patches_replace"]["attn2"] = {}

        unet = new_model.model.diffusion_model
        
        # Map keys to the patch function dict
        for key in iter_dit_attn_modules(unet):
            patch_fn = self.make_dit_attn_patch()
            to["patches_replace"]["attn1"][key] = patch_fn
            to["patches_replace"]["attn2"][key] = patch_fn

        return new_model

    def make_dit_attn_patch(self):
        def patch(q, k, v, extra_options):
            heads = extra_options.get("n_heads", 8)
            
            # If standard unmasked pass or single conditioning, use default attention
            if len(self.raw_positive) <= 1:
                return optimized_attention(q, k, v, heads)

            # Extract spatial masks for each regional prompt
            masks_list = []
            for ent in self.raw_positive:
                opts = ent[1] if isinstance(ent[1], dict) else {}
                if "mask" in opts:
                    m = _mask_to_dit_patches(opts["mask"], q.shape, q.device, q.dtype)
                    masks_list.append(m)

            if not masks_list:
                return optimized_attention(q, k, v, heads)

            # Compute standard attention
            out = optimized_attention(q, k, v, heads)
            
            # Blend region features across patch tokens
            stacked_masks = torch.stack(masks_list, dim=0) # [Num_Regions, B, S, 1]
            sum_masks = torch.clamp(stacked_masks.sum(dim=0), min=1e-6)
            norm_weights = stacked_masks / sum_masks

            # Apply region token weight modulation
            weighted_out = torch.zeros_like(out)
            for mask_w in norm_weights:
                weighted_out += out * mask_w.squeeze(-1)

            return weighted_out

        return patch