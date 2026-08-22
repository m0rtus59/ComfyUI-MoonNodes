import math
import re
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
    while mask.ndim > 2:
        mask = mask[0]
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
        m = F.interpolate(mask.unsqueeze(0).unsqueeze(0), size=(h_tokens, w_tokens), mode="nearest-exact").squeeze()
        m = m.reshape(spatial_tokens).unsqueeze(0).expand(temporal_tokens, -1).reshape(-1)
        resized.append(m)

    if not resized:
        return torch.zeros((0, spatial_tokens * temporal_tokens), dtype=torch.bool)
    stacked = torch.stack(resized, dim=0)
    return stacked > float(threshold)


def _build_flux_cross_attention_bias(
    region_masks: torch.Tensor,
    text_lengths: list[int],
    base_strength: float,
    mask_strength: float,
    device: torch.device,
    dtype: torch.dtype,
) -> torch.Tensor:
    num_regions, S_latent = region_masks.shape
    S_total = sum(text_lengths)

    if mask_strength <= 0.0 and base_strength >= 1.0:
        return torch.zeros((1, 1, S_latent, S_total), device=device, dtype=dtype)

    region_masks = region_masks.to(device=device)
    bias_2d = torch.zeros((S_latent, S_total), device=device, dtype=dtype)

    S_background = text_lengths[0]
    offsets = [0]
    for l in text_lengths[:-1]:
        offsets.append(offsets[-1] + l)

    in_any_region = region_masks.any(dim=0) if num_regions > 0 else torch.zeros(S_latent, device=device, dtype=torch.bool)

    # 1. Base prompt tokens (Slot 0)
    if S_background > 0:
        if base_strength <= 0.0:
            bias_2d[in_any_region, :S_background] = float("-inf")
        elif base_strength < 1.0:
            base_penalty = (1.0 - float(base_strength)) * -6.0
            bias_2d[in_any_region, :S_background] = base_penalty

    # 2. Regional prompt tokens (Slots 1..N)
    cross_penalty = float("-inf") if mask_strength >= 1.0 else -12.0 * float(mask_strength)
    for r_idx in range(num_regions):
        start = offsets[r_idx + 1]
        end = start + text_lengths[r_idx + 1]
        if start == end:
            continue
        is_outside_region = ~region_masks[r_idx]
        bias_2d[is_outside_region, start:end] = cross_penalty

    fully_blocked = (bias_2d == float("-inf")).all(dim=-1)
    if fully_blocked.any() and S_background > 0:
        bias_2d[fully_blocked, :S_background] = 0.0

    return bias_2d.unsqueeze(0).unsqueeze(0)


def _build_flux_self_attention_bias(
    region_masks: torch.Tensor,
    mask_strength: float,
    device: torch.device,
    dtype: torch.dtype,
) -> torch.Tensor:
    num_regions, S_latent = region_masks.shape
    if mask_strength <= 0.0 or num_regions <= 1:
        return torch.zeros((1, 1, S_latent, S_latent), device=device, dtype=dtype)

    m = region_masks.to(device=device)
    allowed = torch.eye(S_latent, device=device, dtype=torch.bool)

    for slot_idx in range(num_regions):
        slot = m[slot_idx]
        allowed |= slot[:, None] & slot[None, :]

    in_any_region = m.any(dim=0)
    background = ~in_any_region
    allowed |= background[:, None] & background[None, :]

    penalty = float("-inf") if mask_strength >= 1.0 else -12.0 * float(mask_strength)
    bias = torch.where(
        allowed,
        torch.zeros((S_latent, S_latent), device=device, dtype=dtype),
        torch.full((S_latent, S_latent), penalty, device=device, dtype=dtype)
    )
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
# Prompt Output Formatting & Scheduling Helpers
# ---------------------------------------------------------------------------

def _apply_conditioning_schedule(mode_pos: list, base_pos: list, start: float, dropoff: float) -> list:
    start = max(0.0, min(float(start), 1.0))
    dropoff = max(0.0, min(float(dropoff), 1.0))

    if start <= 0.0 and dropoff >= 1.0:
        return mode_pos
    if start >= dropoff:
        return base_pos

    out_scheduled = []

    # Phase 1: 0.0 -> start (Clean Base Prompt before regional mode begins)
    if start > 0.0:
        for t in base_pos:
            d = t[1].copy()
            d['start_percent'] = 0.0
            d['end_percent'] = start
            out_scheduled.append([t[0], d])

    # Phase 2: start -> dropoff (Selected Prompt Mode Conditioning)
    for t in mode_pos:
        d = t[1].copy()
        d['start_percent'] = start
        d['end_percent'] = dropoff
        out_scheduled.append([t[0], d])

    # Phase 3: dropoff -> 1.0 (Clean Base Prompt: removes noise and refines sharp detail)
    if dropoff < 1.0:
        for t in base_pos:
            d = t[1].copy()
            d['start_percent'] = dropoff
            d['end_percent'] = 1.0
            out_scheduled.append([t[0], d])

    return out_scheduled


# ---------------------------------------------------------------------------
# Anima Patch Class
# ---------------------------------------------------------------------------

class AnimaRegionalConditioningPatch:
    def __init__(
        self,
        region_items: list[MoonAnimaRegionItem],
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
        self.base_strength = max(0.0, min(float(base_strength), 1.0))
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
    if patch.base_ratio >= 1.0 or (patch.cross_mask_strength <= 0.0 and patch.self_mask_strength <= 0.0 and patch.base_strength >= 1.0):
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
    B_total = context.shape[0]

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

    context_chunks = context.chunk(num_chunks, dim=0)
    S_background = context_chunks[0].shape[1]
    text_lengths = [S_background] + region_lengths

    unified_chunks: list[torch.Tensor] = []
    for chunk, cond_or_uncond in zip(context_chunks, cond_or_unconds):
        if cond_or_uncond == 1:
            uncond_base = _match_context_length(chunk, S_background)
            uncond_regions = [_match_context_length(chunk, r_len) for r_len in region_lengths]
            unified_chunks.append(torch.cat([uncond_base] + uncond_regions, dim=1))
        else:
            base_chunk = _match_context_length(chunk, S_background)
            unified_chunks.append(torch.cat([base_chunk] + region_conds_batched, dim=1))

    unified_context = torch.cat(unified_chunks, dim=0)

    padded_t = math.ceil(latent_t / patch_temporal) * patch_temporal
    temporal_tokens = padded_t // patch_temporal
    region_token_masks = _masks_to_token_masks(patch.region_masks, latent_h, latent_w, patch_spatial, temporal_tokens)

    cond_bias = _build_flux_cross_attention_bias(
        region_token_masks,
        text_lengths,
        patch.base_strength,
        patch.cross_mask_strength,
        device,
        dtype,
    )
    bias_parts = [cond_bias.expand(batch_size, -1, -1, -1) for _ in cond_or_unconds]
    full_bias = torch.cat(bias_parts, dim=0)

    full_self_bias = None
    if patch.self_mask_strength > 0.0:
        cond_self_bias = _build_flux_self_attention_bias(region_token_masks, patch.self_mask_strength, device, dtype)
        self_parts = [cond_self_bias.expand(batch_size, -1, -1, -1) for _ in cond_or_unconds]
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
# Moon Custom Nodes
# ---------------------------------------------------------------------------

class MoonAnimaRegionalPatcher:
    """Standard Node: Accepts pre-encoded CONDITIONING lists."""
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "model": ("MODEL", {
                    "tooltip": "The Anima diffusion model to patch with regional conditioning."
                }),
                "mask_list": ("MASK", {
                    "tooltip": "List of spatial masks corresponding to regional prompt zones (Zone 0, Zone 1, ...)."
                }),
                "positive_list": ("CONDITIONING", {
                    "tooltip": "List of positive conditionings: prompt 0 is base/global, prompts 1..N correspond to regions 0..N-1."
                }),
                "negative_list": ("CONDITIONING", {
                    "tooltip": "Negative conditioning applied across the generation."
                }),
                "base_strength": ("FLOAT", {
                    "default": 0.80, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "How much the global base prompt affects regional zones. Higher values blend more shared style/lighting into regions; lower values isolate the regional prompt."
                }),
                "start_percent": ("FLOAT", {
                    "default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Sampling percentage (0.0–1.0) when regional conditioning starts being applied."
                }),
                "end_percent": ("FLOAT", {
                    "default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Sampling percentage (0.0–1.0) when regional conditioning stops being applied."
                }),
                "cross_mask_strength": ("FLOAT", {
                    "default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Cross-attention isolation between distinct regions (Zone A vs Zone B). 1.0 blocks bleed-through; lower values allow soft cross-regional influence."
                }),
                "self_mask_strength": ("FLOAT", {
                    "default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Spatial self-attention isolation between regions. 0.0 maintains global scene coherence (shared lighting, perspective); higher values isolate spatial patches."
                }),
                "base_ratio": ("FLOAT", {
                    "default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Direct blend ratio with the un-partitioned base generation. 0.0 is pure regional output. Values > 0 blend in the global base image (runs the model twice per step)."
                }),
            }
        }

    RETURN_TYPES = ("MODEL", "CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("patched_model", "POSITIVE", "NEGATIVE")
    INPUT_IS_LIST = True
    FUNCTION = "apply"
    CATEGORY = "MoonNodes"

    def apply(self, model, mask_list, positive_list, negative_list,
              base_strength, start_percent, end_percent, cross_mask_strength,
              self_mask_strength, base_ratio):

        model_obj = model[0]
        base_str = base_strength[0]
        start_pct = start_percent[0]
        end_pct = end_percent[0]
        cross_str = cross_mask_strength[0]
        self_str = self_mask_strength[0]
        ratio_val = base_ratio[0]

        if len(mask_list) == 1 and mask_list[0].ndim == 3 and mask_list[0].shape[0] > 1:
            masks = mask_list[0]
        else:
            cleaned_masks = []
            for m in mask_list:
                if m.ndim == 3: cleaned_masks.extend(list(m))
                elif m.ndim == 2: cleaned_masks.append(m)

            if cleaned_masks:
                target_shape = cleaned_masks[0].shape[-2:]
                aligned_masks = []
                for m in cleaned_masks:
                    if m.shape[-2:] != target_shape:
                        m_4d = m.unsqueeze(0).unsqueeze(0)
                        m_4d = F.interpolate(m_4d, size=target_shape, mode="nearest")
                        aligned_masks.append(m_4d.squeeze())
                    else:
                        aligned_masks.append(m)
                masks = torch.stack(aligned_masks, dim=0)
            else:
                masks = torch.zeros((1, 512, 512), dtype=torch.float32)

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


class MoonAnimaRegionalPatcherAdvanced:
    """Advanced Node: Accepts CLIP and raw prompt texts separated by BREAK with Conditioning Dropoff scheduling."""
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "model": ("MODEL", {
                    "tooltip": "The Anima diffusion model to patch with regional conditioning."
                }),
                "clip": ("CLIP", {
                    "tooltip": "The CLIP / Qwen text encoder used to tokenize and encode prompts."
                }),
                "mask_list": ("MASK", {
                    "tooltip": "List of spatial masks corresponding to regional prompt zones (Zone 0, Zone 1, ...)."
                }),
                "positive_text": ("STRING", {
                    "multiline": True,
                    "default": "duo, outdoors, oil painting\nBREAK\nanthro lynx\nBREAK\nanthro tiger",
                    "tooltip": "Multi-line prompt. Use 'BREAK' on its own line or between phrases to separate the base prompt from regional prompts."
                }),
                "negative_text": ("STRING", {
                    "multiline": True,
                    "default": "low quality, blurry, deformed",
                    "tooltip": "Negative prompt applied across the generation."
                }),
                "prompt_mode": ([
                    "base_only",
                    "concat_text",
                    "concat_conditioning",
                    "merge_average",
                    "comfy_area_conditioning"
                ], {
                    "default": "base_only",
                    "tooltip": "- base_only: passes only prompt 0 (base) to POSITIVE output.\n- concat_text: replaces BREAK with a newline for a single natural language encoding pass.\n- concat_conditioning: concatenates individual conditioning tensors.\n- merge_average: blends/averages all conditionings into a single embedding.\n- comfy_area_conditioning: outputs standard ComfyUI area-conditioning list with spatial masks attached."
                }),
                "conditioning_start_percent": ("FLOAT", {
                    "default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Sampling percentage (0.0 to 1.0) when the selected prompt mode begins. Before this point, only the clean base prompt is applied."
                }),
                "conditioning_dropoff": ("FLOAT", {
                    "default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "At what point in generation (0.0 to 1.0) the prompt switches back to 'base_only'. Default 1.0 uses the selected mode all the way through. Setting to e.g. 0.40–0.60 uses concatenated/merged conditioning for early poses/composition, then drops off to clean base conditioning to eliminate noise and refine sharp details."
                }),
                "base_strength": ("FLOAT", {
                    "default": 0.80, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "How much the global base prompt affects regional zones. Higher values blend more shared style/lighting into regions; lower values isolate the regional prompt."
                }),
                "start_percent": ("FLOAT", {
                    "default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Sampling percentage (0.0–1.0) when regional conditioning starts being applied."
                }),
                "end_percent": ("FLOAT", {
                    "default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Sampling percentage (0.0–1.0) when regional conditioning stops being applied."
                }),
                "cross_mask_strength": ("FLOAT", {
                    "default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Cross-attention isolation between distinct regions (Zone A vs Zone B). 1.0 blocks bleed-through; lower values allow soft cross-regional influence."
                }),
                "self_mask_strength": ("FLOAT", {
                    "default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Spatial self-attention isolation between regions. 0.0 maintains global scene coherence (shared lighting, perspective); higher values isolate spatial patches."
                }),
                "base_ratio": ("FLOAT", {
                    "default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01,
                    "tooltip": "Direct blend ratio with the un-partitioned base generation. 0.0 is pure regional output. Values > 0 blend in the global base image (runs the model twice per step)."
                }),
            }
        }

    RETURN_TYPES = ("MODEL", "CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("patched_model", "POSITIVE", "NEGATIVE")
    INPUT_IS_LIST = True
    FUNCTION = "apply_advanced"
    CATEGORY = "MoonNodes"

    def apply_advanced(self, model, clip, mask_list, positive_text, negative_text,
                       prompt_mode, conditioning_start_percent, conditioning_dropoff,
                       base_strength, start_percent, end_percent, cross_mask_strength,
                       self_mask_strength, base_ratio):

        model_obj = model[0]
        clip_obj = clip[0]
        pos_text_raw = positive_text[0] if isinstance(positive_text, list) else positive_text
        neg_text_raw = negative_text[0] if isinstance(negative_text, list) else negative_text
        mode_val = prompt_mode[0] if isinstance(prompt_mode, list) else prompt_mode
        cond_start_val = conditioning_start_percent[0] if isinstance(conditioning_start_percent, list) else conditioning_start_percent
        dropoff_val = conditioning_dropoff[0] if isinstance(conditioning_dropoff, list) else conditioning_dropoff
        base_str = base_strength[0] if isinstance(base_strength, list) else base_strength
        start_pct = start_percent[0] if isinstance(start_percent, list) else start_percent
        end_pct = end_percent[0] if isinstance(end_percent, list) else end_percent
        cross_str = cross_mask_strength[0] if isinstance(cross_mask_strength, list) else cross_mask_strength
        self_str = self_mask_strength[0] if isinstance(self_mask_strength, list) else self_mask_strength
        ratio_val = base_ratio[0] if isinstance(base_ratio, list) else base_ratio

        # 1. Parse and encode positive text parts
        parts = [p.strip() for p in pos_text_raw.split("BREAK") if p.strip()]
        if not parts:
            parts = [""]

        encoder = CLIPTextEncode()
        positive_list = [encoder.encode(clip_obj, part)[0] for part in parts]
        negative_cond = encoder.encode(clip_obj, neg_text_raw)[0]

        # 2. Process masks list (combines incoming mask links into a single (N, H, W) tensor)
        if len(mask_list) == 1 and mask_list[0].ndim == 3 and mask_list[0].shape[0] > 1:
            masks = mask_list[0]
        else:
            cleaned_masks = []
            for m in mask_list:
                if m.ndim == 3: cleaned_masks.extend(list(m))
                elif m.ndim == 2: cleaned_masks.append(m)

            if cleaned_masks:
                target_shape = cleaned_masks[0].shape[-2:]
                aligned_masks = []
                for m in cleaned_masks:
                    if m.shape[-2:] != target_shape:
                        m_4d = m.unsqueeze(0).unsqueeze(0)
                        m_4d = F.interpolate(m_4d, size=target_shape, mode="nearest")
                        aligned_masks.append(m_4d.squeeze())
                    else:
                        aligned_masks.append(m)
                masks = torch.stack(aligned_masks, dim=0)
            else:
                masks = torch.zeros((1, 512, 512), dtype=torch.float32)

        num_masks = masks.shape[0]
        base_pos = positive_list[0]

        # 3. Build regional conditioning items for the model patch
        region_items = []
        for i in range(num_masks):
            cond_idx = i + 1
            if cond_idx < len(positive_list) and positive_list[cond_idx] is not None:
                region_items.append(MoonAnimaRegionItem(mask=masks[i], conditioning=positive_list[cond_idx], weight=1.0))

        # 4. Construct unified conditioning for POSITIVE port
        if mode_val == "base_only":
            final_pos = base_pos
        elif mode_val == "concat_text":
            combined_text = re.sub(r'\s*\bBREAK\b\s*', '\n', pos_text_raw).strip()
            mode_pos = encoder.encode(clip_obj, combined_text)[0]
            final_pos = _apply_conditioning_schedule(mode_pos, base_pos, cond_start_val, dropoff_val)
        elif mode_val == "comfy_area_conditioning":
            base_cond, base_meta = _extract_conditioning_parts(base_pos, "base_pos")
            mode_pos = [[base_cond, base_meta.copy()]]
            for idx, reg in enumerate(region_items):
                reg_cond, reg_meta = _extract_conditioning_parts(reg.conditioning, f"region_{idx}")
                meta = reg_meta.copy()
                mask_tensor = reg.mask
                while mask_tensor.ndim > 2: mask_tensor = mask_tensor[0]
                meta["mask"] = mask_tensor.unsqueeze(0)
                meta["mask_strength"] = reg.weight
                meta["set_area_to_bounds"] = False
                mode_pos.append([reg_cond, meta])
            final_pos = _apply_conditioning_schedule(mode_pos, base_pos, cond_start_val, dropoff_val)
        elif mode_val == "concat_conditioning":
            all_conds, all_t5_ids, all_t5_weights = [], [], []
            base_cond, base_meta = _extract_conditioning_parts(base_pos, "base_pos")
            meta = base_meta.copy()
            for p in positive_list:
                c, m = _extract_conditioning_parts(p, "positive_item")
                all_conds.append(c)
                if "t5xxl_ids" in m and torch.is_tensor(m["t5xxl_ids"]):
                    all_t5_ids.append(m["t5xxl_ids"].flatten())
                if "t5xxl_weights" in m and torch.is_tensor(m["t5xxl_weights"]):
                    all_t5_weights.append(m["t5xxl_weights"].flatten())
            concat_cond = torch.cat(all_conds, dim=1)
            if all_t5_ids: meta["t5xxl_ids"] = torch.cat(all_t5_ids, dim=0)
            if all_t5_weights: meta["t5xxl_weights"] = torch.cat(all_t5_weights, dim=0)
            mode_pos = [[concat_cond, meta]]
            final_pos = _apply_conditioning_schedule(mode_pos, base_pos, cond_start_val, dropoff_val)
        elif mode_val == "merge_average":
            all_conds = []
            base_cond, base_meta = _extract_conditioning_parts(base_pos, "base_pos")
            meta = base_meta.copy()
            for p in positive_list:
                c, _ = _extract_conditioning_parts(p, "positive_item")
                all_conds.append(c)
            max_len = max(c.shape[1] for c in all_conds)
            padded = [_match_context_length(c, max_len) for c in all_conds]
            avg_cond = torch.stack(padded, dim=0).mean(dim=0)
            mode_pos = [[avg_cond, meta]]
            final_pos = _apply_conditioning_schedule(mode_pos, base_pos, cond_start_val, dropoff_val)
        else:
            final_pos = base_pos

        if not region_items:
            return (model_obj, final_pos, negative_cond)

        # 5. Apply the DiT cross-attention patch to the model
        model_sampling = model_obj.get_model_object("model_sampling")
        start_sigma = float(model_sampling.percent_to_sigma(start_pct))
        end_sigma = float(model_sampling.percent_to_sigma(end_pct))

        patch = AnimaRegionalConditioningPatch(
            region_items=region_items,
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

        return (patched_model, final_pos, negative_cond)


# ---------------------------------------------------------------------------
# Node Class Mappings
# ---------------------------------------------------------------------------

NODE_CLASS_MAPPINGS = {
    "MoonAnimaRegionalPatcher": MoonAnimaRegionalPatcher,
    "MoonAnimaRegionalPatcherAdvanced": MoonAnimaRegionalPatcherAdvanced,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "MoonAnimaRegionalPatcher": "Anima Regional Patcher",
    "MoonAnimaRegionalPatcherAdvanced": "Anima Regional Patcher (Advanced)",
}