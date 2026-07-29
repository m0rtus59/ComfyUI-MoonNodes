import math
from functools import partial
from typing import Optional

import torch
import torch.nn.functional as F
import comfy.patcher_extension
from nodes import CLIPTextEncode

WRAPPER_KEY = "moon_anima_regional_conditioning"

# ---------------------------------------------------------------------------
# Data Structures & Helpers
# ---------------------------------------------------------------------------

class MoonAnimaRegionItem:
    def __init__(self, mask: torch.Tensor, conditioning: list, weight: float = 1.0):
        self.mask = mask
        self.conditioning = conditioning
        self.weight = weight


def _prepare_mask(mask: torch.Tensor) -> torch.Tensor:
    if not torch.is_tensor(mask):
        raise RuntimeError(f"Expected mask tensor, got {type(mask)}.")
    mask = mask.detach().float()
    if mask.ndim == 2:
        mask = mask.unsqueeze(0)
    elif mask.ndim == 3:
        mask = mask[:1]
    elif mask.ndim == 4:
        mask = mask[:1, 0]
    return mask.clamp(0.0, 1.0).cpu().contiguous()


def _extract_conditioning_parts(conditioning: list, name: str) -> tuple[torch.Tensor, dict]:
    if not conditioning:
        raise RuntimeError(f"{name} is empty.")
    first = conditioning[0]
    if not isinstance(first, (list, tuple)) or len(first) < 1:
        raise RuntimeError(f"{name} is not a valid ComfyUI CONDITIONING value.")
    cond = first[0]
    metadata = first[1] if len(first) > 1 and isinstance(first[1], dict) else {}
    if not torch.is_tensor(cond):
        raise RuntimeError(f"{name}[0][0] must be a tensor, got {type(cond)}.")
    cond = cond.detach()
    if cond.ndim == 4 and cond.shape[1] == 1:
        cond = cond.squeeze(1)
    if cond.ndim != 3:
        raise RuntimeError(f"{name} cross-attention tensor must have shape B,T,D or B,1,T,D; got {tuple(cond.shape)}.")
    return cond, metadata


def _as_batched_ids(ids: torch.Tensor, device: torch.device) -> torch.Tensor:
    ids = ids.to(device=device)
    if ids.ndim == 1: return ids.unsqueeze(0)
    if ids.ndim == 2: return ids
    raise RuntimeError(f"t5xxl_ids must have rank 1 or 2, got {ids.ndim}.")


def _as_batched_weights(weights: Optional[torch.Tensor], like: torch.Tensor) -> Optional[torch.Tensor]:
    if weights is None: return None
    weights = weights.to(device=like.device, dtype=like.dtype)
    if weights.ndim == 1: return weights.unsqueeze(0).unsqueeze(-1)
    if weights.ndim == 2: return weights.unsqueeze(-1)
    if weights.ndim == 3: return weights
    raise RuntimeError(f"t5xxl_weights must have rank 1, 2, or 3, got {weights.ndim}.")


def _normalize_context(context: torch.Tensor) -> tuple[torch.Tensor, bool]:
    if context.ndim == 4 and context.shape[1] == 1:
        return context.squeeze(1), True
    if context.ndim == 3:
        return context, False
    raise RuntimeError(f"Unsupported context shape {tuple(context.shape)}.")


def _match_context_length(context: torch.Tensor, target_len: int) -> torch.Tensor:
    if context.shape[1] == target_len: return context
    if context.shape[1] > target_len: return context[:, :target_len, :]
    pad = torch.zeros(context.shape[0], target_len - context.shape[1], context.shape[2], device=context.device, dtype=context.dtype)
    return torch.cat([context, pad], dim=1)


def _masks_to_token_masks(
    masks: list[torch.Tensor],
    latent_h: int,
    latent_w: int,
    patch_spatial: int,
    temporal_tokens: int,
    threshold: float = 1e-6,
) -> torch.Tensor:
    padded_h = math.ceil(latent_h / patch_spatial) * patch_spatial
    padded_w = math.ceil(latent_w / patch_spatial) * patch_spatial
    h_tokens = padded_h // patch_spatial
    w_tokens = padded_w // patch_spatial
    spatial_tokens = h_tokens * w_tokens

    resized: list[torch.Tensor] = []
    for mask in masks:
        m = F.interpolate(mask.unsqueeze(1), size=(h_tokens, w_tokens), mode="nearest-exact").squeeze(1).squeeze(0)
        m = m.reshape(spatial_tokens).unsqueeze(0).expand(temporal_tokens, -1).reshape(-1)
        resized.append(m)

    stacked = torch.stack(resized, dim=0)
    return stacked > float(threshold)


def _slot_strengths_to_token_strengths(masks: torch.Tensor, slot_strengths: torch.Tensor, default_strength: float) -> torch.Tensor:
    strengths = torch.zeros(masks.shape[1], device=masks.device, dtype=slot_strengths.dtype)
    for slot_idx in range(masks.shape[0]):
        strengths = torch.maximum(strengths, masks[slot_idx].to(slot_strengths.dtype) * slot_strengths[slot_idx])
    return torch.maximum(strengths, torch.full_like(strengths, float(default_strength)))


def _build_flux_cross_attention_bias(
    masks: torch.Tensor,
    text_lengths: list[int],
    base_mode: str,
    device: torch.device,
    dtype: torch.dtype,
    mask_strength: float = 1.0,
    slot_strengths: Optional[torch.Tensor] = None,
) -> torch.Tensor:
    N, S_latent = masks.shape
    S_total = sum(text_lengths)

    if mask_strength <= 0.0:
        return torch.zeros((1, 1, S_latent, S_total), device=device, dtype=dtype)

    masks = masks.to(device=device)
    allowed = torch.zeros((S_latent, S_total), device=device, dtype=torch.bool)
    slot_strengths = slot_strengths.to(device=device, dtype=dtype).clamp(0.0, 1.0) if slot_strengths is not None else torch.ones(N, device=device, dtype=dtype)

    offsets = [0]
    for l in text_lengths[:-1]: offsets.append(offsets[-1] + l)

    for slot_idx in range(N):
        start = offsets[slot_idx]
        end = start + text_lengths[slot_idx]
        if start == end: continue

        if slot_idx == 0 and base_mode == "global":
            allowed[:, start:end] = True
        elif slot_idx == 0 and base_mode == "disabled":
            continue
        else:
            positions = masks[slot_idx].nonzero(as_tuple=True)[0]
            if positions.numel() > 0:
                allowed[positions, start:end] = True

    fully_blocked = ~allowed.any(dim=-1)
    if fully_blocked.any() and text_lengths[0] > 0:
        allowed[fully_blocked, :text_lengths[0]] = True

    token_strengths = _slot_strengths_to_token_strengths(masks, slot_strengths * float(mask_strength), default_strength=0.0)
    row_penalties = -12.0 * token_strengths
    bias_2d = torch.where(allowed, torch.zeros((S_latent, S_total), device=device, dtype=dtype), row_penalties[:, None].expand(-1, S_total))
    hard_rows = token_strengths >= 1.0
    if hard_rows.any():
        bias_2d[hard_rows[:, None].expand(-1, S_total) & ~allowed] = float("-inf")

    return bias_2d.unsqueeze(0).unsqueeze(0)


def _build_flux_self_attention_bias(
    masks: torch.Tensor,
    base_mode: str,
    mask_strength: float,
    device: torch.device,
    dtype: torch.dtype,
    slot_strengths: Optional[torch.Tensor] = None,
) -> torch.Tensor:
    N, S_latent = masks.shape
    if mask_strength <= 0.0:
        return torch.zeros((1, 1, S_latent, S_latent), device=device, dtype=dtype)

    m = masks.to(device=device)
    slot_strengths = slot_strengths.to(device=device, dtype=dtype).clamp(0.0, 1.0) if slot_strengths is not None else torch.ones(N, device=device, dtype=dtype)
    allowed = torch.zeros((S_latent, S_latent), device=device, dtype=torch.bool)

    for slot_idx in range(N):
        if slot_idx == 0 and base_mode == "disabled": continue
        slot = m[slot_idx]
        allowed |= slot[:, None] & slot[None, :]

    if base_mode == "global": allowed[:] = True

    union = torch.zeros(S_latent, device=device, dtype=torch.bool)
    for slot_idx in range(1, N): union |= m[slot_idx]
    if base_mode != "disabled": union |= m[0]
    background = ~union
    allowed |= background[:, None] & background[None, :]
    allowed |= torch.eye(S_latent, device=device, dtype=torch.bool)

    token_strengths = _slot_strengths_to_token_strengths(m, slot_strengths * float(mask_strength), default_strength=0.0)
    row_penalties = -12.0 * token_strengths
    bias = torch.where(allowed, torch.zeros((S_latent, S_latent), device=device, dtype=dtype), row_penalties[:, None].expand(-1, S_latent))
    hard_rows = token_strengths >= 1.0
    if hard_rows.any():
        bias[hard_rows[:, None].expand(-1, S_latent) & ~allowed] = float("-inf")
    return bias.unsqueeze(0).unsqueeze(0)


def _masked_attn_op(q: torch.Tensor, k: torch.Tensor, v: torch.Tensor, transformer_options: Optional[dict] = None, attn_bias: Optional[torch.Tensor] = None) -> torch.Tensor:
    B, Sq, H, D = q.shape
    q_b = q.permute(0, 2, 1, 3)
    k_b = k.permute(0, 2, 1, 3)
    v_b = v.permute(0, 2, 1, 3)
    bias = attn_bias.to(device=q.device, dtype=q.dtype) if attn_bias is not None else None
    out = F.scaled_dot_product_attention(q_b, k_b, v_b, attn_mask=bias)
    return out.permute(0, 2, 1, 3).reshape(B, Sq, H * D)

# ---------------------------------------------------------------------------
# Anima Patch Class
# ---------------------------------------------------------------------------

class AnimaRegionalConditioningPatch:
    def __init__(
        self,
        region_items: list[MoonAnimaRegionItem],
        base_mode: str,
        base_strength: float,
        start_sigma: float,
        end_sigma: float,
        cross_mask_strength: float,
        self_mask_strength: float,
        base_ratio: float,
        cross_inject_every_n_blocks: int = 1,
        self_inject_every_n_blocks: int = 1,
    ):
        if not region_items: raise RuntimeError("At least one conditioning region is required.")
        self.base_mode = base_mode
        self.base_strength = max(float(base_strength), 0.0)
        self.start_sigma = float(start_sigma)
        self.end_sigma = float(end_sigma)
        self.cross_mask_strength = max(0.0, min(float(cross_mask_strength), 1.0))
        self.self_mask_strength = max(0.0, min(float(self_mask_strength), 1.0))
        self.base_ratio = max(0.0, min(float(base_ratio), 1.0))
        self.cross_inject_every_n_blocks = max(1, int(cross_inject_every_n_blocks))
        self.self_inject_every_n_blocks = max(1, int(self_inject_every_n_blocks))

        self.region_masks: list[torch.Tensor] = []
        self.region_weights: list[float] = []
        self.region_conditionings: list[tuple[torch.Tensor, dict]] = []

        for idx, region in enumerate(region_items, start=1):
            weight = max(float(region.weight), 0.0)
            mask = _prepare_mask(region.mask) if weight > 0.0 else torch.zeros_like(_prepare_mask(region.mask))
            cond, metadata = _extract_conditioning_parts(region.conditioning, f"region_{idx}.conditioning")
            self.region_masks.append(mask)
            self.region_weights.append(weight)
            self.region_conditionings.append((cond.detach().float().cpu().contiguous(), metadata.copy()))

    def prepare_region_conds(self, diffusion_model, device: torch.device, dtype: torch.dtype) -> list[torch.Tensor]:
        prepared: list[torch.Tensor] = []
        for cond, metadata in self.region_conditionings:
            cond = cond.to(device=device, dtype=dtype)
            t5xxl_ids = metadata.get("t5xxl_ids", None)
            if t5xxl_ids is not None and hasattr(diffusion_model, "preprocess_text_embeds"):
                t5xxl_weights = metadata.get("t5xxl_weights", None)
                cond = diffusion_model.preprocess_text_embeds(
                    cond, _as_batched_ids(t5xxl_ids, device), t5xxl_weights=_as_batched_weights(t5xxl_weights, cond)
                )
            prepared.append(cond)
        return prepared

    def is_active(self, transformer_options: dict) -> bool:
        sigmas = transformer_options.get("sigmas", None)
        if sigmas is None or not torch.is_tensor(sigmas) or sigmas.numel() == 0: return True
        sigma = float(sigmas.max().detach().cpu().item())
        low, high = min(self.start_sigma, self.end_sigma), max(self.start_sigma, self.end_sigma)
        return low <= sigma <= high

# ---------------------------------------------------------------------------
# Anima Model Wrapper
# ---------------------------------------------------------------------------

def _diffusion_model_wrapper(executor, *args, **kwargs):
    transformer_options = kwargs.get("transformer_options", None)
    if not isinstance(transformer_options, dict): return executor(*args, **kwargs)

    patch: Optional[AnimaRegionalConditioningPatch] = transformer_options.get(WRAPPER_KEY, None)
    if patch is None or not patch.is_active(transformer_options): return executor(*args, **kwargs)
    if patch.base_ratio >= 1.0 or (patch.cross_mask_strength <= 0.0 and patch.self_mask_strength <= 0.0):
        return executor(*args, **kwargs)

    diffusion_model = executor.class_obj
    input_x = args[0] if args else kwargs.get("x", None)
    if input_x is None or input_x.ndim < 5: return executor(*args, **kwargs)

    latent_h, latent_w, latent_t = int(input_x.shape[-2]), int(input_x.shape[-1]), int(input_x.shape[2])
    patch_spatial = int(getattr(diffusion_model, "patch_spatial", 2))
    patch_temporal = int(getattr(diffusion_model, "patch_temporal", 1))

    raw_context = args[2] if len(args) > 2 else kwargs.get("context", None)
    if raw_context is None or not torch.is_tensor(raw_context): return executor(*args, **kwargs)
    context, _ = _normalize_context(raw_context)

    device, dtype = context.device, context.dtype
    B_total, S_base = context.shape[0], context.shape[1]

    cond_or_unconds = transformer_options.get("cond_or_uncond", [])
    if not cond_or_unconds: return executor(*args, **kwargs)

    num_chunks = len(cond_or_unconds)
    if B_total % num_chunks != 0: return executor(*args, **kwargs)
    batch_size = B_total // num_chunks

    region_conds = patch.prepare_region_conds(diffusion_model, device, dtype)
    region_lengths = [rc.shape[1] for rc in region_conds]

    region_conds_batched: list[torch.Tensor] = []
    for rc in region_conds:
        if rc.shape[0] == 1: rc = rc.expand(batch_size, -1, -1)
        else: rc = rc[:1].expand(batch_size, -1, -1)
        region_conds_batched.append(rc)

    S_background = S_base
    S_total = S_background + sum(region_lengths)
    text_lengths = [S_background] + region_lengths

    context_chunks = context.chunk(num_chunks, dim=0)
    unified_chunks: list[torch.Tensor] = []
    for chunk, cond_or_uncond in zip(context_chunks, cond_or_unconds):
        if cond_or_uncond == 1:
            uncond_base = _match_context_length(chunk, S_background)
            pad = torch.zeros(batch_size, S_total - S_background, context.shape[2], device=device, dtype=dtype)
            unified_chunks.append(torch.cat([uncond_base, pad], dim=1))
        else:
            base_chunk = _match_context_length(chunk, S_background)
            unified_chunks.append(torch.cat([base_chunk] + region_conds_batched, dim=1))

    unified_context = torch.cat(unified_chunks, dim=0)

    padded_t = math.ceil(latent_t / patch_temporal) * patch_temporal
    temporal_tokens = padded_t // patch_temporal
    padded_h, padded_w = math.ceil(latent_h / patch_spatial) * patch_spatial, math.ceil(latent_w / patch_spatial) * patch_spatial

    region_masks_at_latent = [F.interpolate(rm.unsqueeze(1), size=(padded_h, padded_w), mode="nearest-exact").squeeze(1) for rm in patch.region_masks]

    if patch.base_mode == "global":
        base_mask = torch.ones(1, padded_h, padded_w)
    elif patch.base_mode == "disabled":
        base_mask = torch.zeros(1, padded_h, padded_w)
    else:
        base_mask = torch.ones(1, padded_h, padded_w)
        for rm in region_masks_at_latent: base_mask = (base_mask - rm).clamp(min=0.0)

    base_mask = base_mask * patch.base_strength
    all_masks = [base_mask] + patch.region_masks
    token_masks = _masks_to_token_masks(all_masks, latent_h, latent_w, patch_spatial, temporal_tokens)
    slot_strengths = torch.tensor([patch.base_strength] + patch.region_weights, device=device, dtype=dtype).clamp(0.0, 1.0)

    cond_bias = _build_flux_cross_attention_bias(token_masks, text_lengths, patch.base_mode, device, dtype, mask_strength=patch.cross_mask_strength, slot_strengths=slot_strengths)
    uncond_bias = torch.full((1, 1, cond_bias.shape[2], S_total), float("-inf"), device=device, dtype=dtype)
    uncond_bias[:, :, :, :S_background] = 0.0

    bias_parts = [uncond_bias.expand(batch_size, -1, -1, -1) if c == 1 else cond_bias.expand(batch_size, -1, -1, -1) for c in cond_or_unconds]
    full_bias = torch.cat(bias_parts, dim=0)

    full_self_bias = None
    if patch.self_mask_strength > 0.0:
        cond_self_bias = _build_flux_self_attention_bias(token_masks, patch.base_mode, patch.self_mask_strength, device, dtype, slot_strengths=slot_strengths)
        uncond_self_bias = torch.zeros_like(cond_self_bias)
        self_parts = [uncond_self_bias.expand(batch_size, -1, -1, -1) if c == 1 else cond_self_bias.expand(batch_size, -1, -1, -1) for c in cond_or_unconds]
        full_self_bias = torch.cat(self_parts, dim=0)

    base_output = executor(*args, **kwargs) if patch.base_ratio > 0.0 else None

    patched: list[tuple] = []
    try:
        for block_index, block in enumerate(getattr(diffusion_model, "blocks", [])):
            if patch.cross_mask_strength > 0.0 and block_index % patch.cross_inject_every_n_blocks == 0:
                cross_attn = getattr(block, "cross_attn", None)
                if cross_attn is not None:
                    original_op = cross_attn.attn_op
                    cross_attn.attn_op = partial(_masked_attn_op, attn_bias=full_bias)
                    patched.append((cross_attn, original_op))

            if full_self_bias is not None and block_index % patch.self_inject_every_n_blocks == 0:
                self_attn = getattr(block, "self_attn", None)
                if self_attn is not None:
                    original_op = self_attn.attn_op
                    self_attn.attn_op = partial(_masked_attn_op, attn_bias=full_self_bias)
                    patched.append((self_attn, original_op))

        args = list(args)
        if len(args) > 2: args[2] = unified_context
        else: kwargs["context"] = unified_context
        args = tuple(args)

        regional_output = executor(*args, **kwargs)
        if base_output is not None and torch.is_tensor(regional_output) and torch.is_tensor(base_output):
            return regional_output * (1.0 - patch.base_ratio) + base_output * patch.base_ratio
        return regional_output

    finally:
        for attn, original_op in patched:
            attn.attn_op = original_op

# ---------------------------------------------------------------------------
# Moon Custom Node
# ---------------------------------------------------------------------------

class MoonAnimaRegionalPatcher:
    """
    Native Moon Regional Patcher for Anima (Cosmos-Predict2 / MiniTrainDIT).
    Connects directly to MoonMaskMakerGUI (mask_list) and MoonIndexedEncoder (positive_list / negative_list).
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "model": ("MODEL",),
                "mask_list": ("MASK",),
                "positive_list": ("CONDITIONING",),
                "negative_list": ("CONDITIONING",),
                "start_percent": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "end_percent": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "base_strength": ("FLOAT", {"default": 0.20, "min": 0.0, "max": 1.0, "step": 0.01}),
                "cross_mask_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "self_mask_strength": ("FLOAT", {"default": 0.20, "min": 0.0, "max": 1.0, "step": 0.01}),
                "base_ratio": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01}),
            }
        }

    RETURN_TYPES = ("MODEL", "CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("patched_model", "POSITIVE", "NEGATIVE")
    INPUT_IS_LIST = True
    FUNCTION = "apply"
    CATEGORY = "MoonNodes"

    def apply(self, model, mask_list, positive_list, negative_list,
              start_percent, end_percent, base_strength, cross_mask_strength,
              self_mask_strength, base_ratio):

        model_obj = model[0]
        start_pct = start_percent[0]
        end_pct = end_percent[0]
        base_str = base_strength[0]
        cross_str = cross_mask_strength[0]
        self_str = self_mask_strength[0]
        ratio_val = base_ratio[0]
        base_mode_val = "global"

        if len(mask_list) == 1 and mask_list[0].ndim == 3 and mask_list[0].shape[0] > 1:
            masks = mask_list[0]
        else:
            cleaned_masks = []
            for m in mask_list:
                if m.ndim == 3: cleaned_masks.extend(list(m))
                elif m.ndim == 2: cleaned_masks.append(m)
            masks = torch.stack(cleaned_masks, dim=0) if cleaned_masks else torch.zeros((1, 512, 512), dtype=torch.float32)

        num_masks = masks.shape[0]

        base_pos = positive_list[0] if len(positive_list) > 0 and positive_list[0] is not None else None
        base_neg = negative_list[0] if len(negative_list) > 0 and negative_list[0] is not None else None

        if base_pos is None:
            raise RuntimeError("Base positive prompt (first prompt before BREAK) cannot be empty.")

        region_items = []
        for i in range(num_masks):
            cond_idx = i + 1
            if cond_idx < len(positive_list) and positive_list[cond_idx] is not None:
                region_items.append(MoonAnimaRegionItem(mask=masks[i], conditioning=positive_list[cond_idx], weight=1.0))

        if not region_items:
            return (model_obj, base_pos, base_neg)

        model_sampling = model_obj.get_model_object("model_sampling")
        start_sigma = float(model_sampling.percent_to_sigma(start_pct))
        end_sigma = float(model_sampling.percent_to_sigma(end_pct))

        patch = AnimaRegionalConditioningPatch(
            region_items=region_items,
            base_mode=base_mode_val,
            base_strength=base_str,
            start_sigma=start_sigma,
            end_sigma=end_sigma,
            cross_mask_strength=cross_str,
            self_mask_strength=self_str,
            base_ratio=ratio_val
        )

        patched_model = model_obj.clone()
        patched_model.remove_wrappers_with_key(
            comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL, WRAPPER_KEY
        )
        patched_model.add_wrapper_with_key(
            comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL,
            WRAPPER_KEY,
            _diffusion_model_wrapper,
        )
        patched_model.model_options.setdefault("transformer_options", {})[WRAPPER_KEY] = patch
        patched_model.set_attachments(WRAPPER_KEY, patch)

        return (patched_model, base_pos, base_neg)