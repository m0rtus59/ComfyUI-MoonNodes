import numpy as np
import torch
import torch.nn.functional as F


def seg_to_full_mask(seg, canvas_shape):
    """Converts a cropped SEG object into a full-canvas binary mask (H, W)."""
    h, w = canvas_shape[:2]
    full_mask = np.zeros((h, w), dtype=np.float32)

    cmask = getattr(seg, "cropped_mask", None)
    if cmask is None:
        return full_mask

    if isinstance(cmask, torch.Tensor):
        cmask = cmask.cpu().numpy()
    cmask = np.squeeze(cmask)

    if cmask.ndim != 2:
        return full_mask

    ch, cw = cmask.shape
    r = getattr(seg, "crop_region", None)

    if r is None or len(r) != 4:
        if (ch, cw) == (h, w):
            return (cmask > 0.5).astype(np.float32)
        return full_mask

    v1, v2, v3, v4 = [int(v) for v in r]

    if (v4 - v2 == ch) and (v3 - v1 == cw):
        x1, y1, x2, y2 = v1, v2, v3, v4
    elif (v3 - v1 == ch) and (v4 - v2 == cw):
        y1, x1, y2, x2 = v1, v2, v3, v4
    elif (v2 - v1 == ch) and (v4 - v3 == cw):
        y1, y2, x1, x2 = v1, v2, v3, v4
    else:
        x1, y1, x2, y2 = v1, v2, v3, v4

    x1, y1 = max(0, min(w, x1)), max(0, min(h, y1))
    x2, y2 = max(0, min(w, x2)), max(0, min(h, y2))

    box_w, box_h = x2 - x1, y2 - y1

    if box_w <= 0 or box_h <= 0:
        return full_mask

    if (ch, cw) != (box_h, box_w):
        cmask_tensor = torch.from_numpy(cmask).unsqueeze(0).unsqueeze(0).float()
        cmask_resized = F.interpolate(
            cmask_tensor,
            size=(box_h, box_w),
            mode="bilinear",
            align_corners=False,
        )
        cmask = cmask_resized.squeeze().numpy()

    full_mask[y1:y2, x1:x2] = (cmask > 0.5).astype(np.float32)
    return full_mask


def sanitize_to_2d_tensor(t):
    """Ensures tensor is strictly 2D (H, W)."""
    if isinstance(t, np.ndarray):
        t = torch.from_numpy(t)
    while t.ndim > 2:
        t = t.squeeze(0)
    return t.float()


def parse_segs_or_masks(segs_or_masks):
    extracted_masks_np = []
    target_h, target_w = None, None

    items = (
        segs_or_masks
        if isinstance(segs_or_masks, list)
        else [segs_or_masks]
    )

    for item in items:
        if item is None:
            continue

        if (
            isinstance(item, tuple)
            and len(item) >= 2
            and isinstance(item[0], (tuple, list))
        ):
            target_h, target_w = int(item[0][0]), int(item[0][1])
            if len(item) > 1 and item[1]:
                for seg in item[1]:
                    m = seg_to_full_mask(seg, (target_h, target_w))
                    if np.any(m > 0.5):
                        extracted_masks_np.append(m)

        elif isinstance(item, torch.Tensor):
            t = item.cpu().detach()
            while t.ndim > 3:
                t = t.squeeze(1)

            if target_h is None or target_w is None:
                target_h, target_w = int(t.shape[-2]), int(t.shape[-1])

            if (t.shape[-2], t.shape[-1]) != (target_h, target_w):
                t_4d = (
                    t.unsqueeze(1)
                    if t.ndim == 3
                    else t.unsqueeze(0).unsqueeze(0)
                )
                t_4d = F.interpolate(
                    t_4d, size=(target_h, target_w), mode="nearest"
                )
                t = t_4d.squeeze(1) if t.ndim == 3 else t_4d.squeeze()

            if t.ndim == 2:
                m_np = (t.numpy() > 0.5).astype(np.float32)
                if np.any(m_np > 0.5):
                    extracted_masks_np.append(m_np)
            elif t.ndim == 3:
                for b in range(t.shape[0]):
                    m_np = (t[b].numpy() > 0.5).astype(np.float32)
                    if np.any(m_np > 0.5):
                        extracted_masks_np.append(m_np)

        elif isinstance(item, np.ndarray):
            m_np = (item > 0.5).astype(np.float32)
            if target_h is None or target_w is None:
                target_h, target_w = m_np.shape[-2], m_np.shape[-1]
            if np.any(m_np > 0.5):
                extracted_masks_np.append(m_np)

    return (target_h, target_w), extracted_masks_np


class MoonSEGSToIndexedMasks:
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True,)

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "segs_or_masks": (
                    "SEGS,MASK",
                    {
                        "tooltip": "Mandatory: Accepts either SEGS (Ultralytics/Impact) or MASK batch/list (SAM/Florence-2)."
                    },
                ),
            },
            "optional": {
                "base_masks": (
                    "MASK",
                    {
                        "tooltip": "Optional: Reference layout mask list to index-match against."
                    },
                ),
                "fallback_to_base": (
                    "BOOLEAN",
                    {
                        "default": False,
                        "tooltip": "If True and base_masks provided, use base mask if no detection exists for a region index.",
                    },
                ),
            },
        }

    RETURN_TYPES = ("MASK",)
    FUNCTION = "convert_segs"
    CATEGORY = "MoonNodes"

    def convert_segs(self, segs_or_masks, base_masks=None, fallback_to_base=False):
        use_fallback = (
            fallback_to_base[0]
            if isinstance(fallback_to_base, list)
            else fallback_to_base
        )

        (target_h, target_w), char_masks_np = parse_segs_or_masks(
            segs_or_masks
        )

        b_list = []
        if base_masks is not None and len(base_masks) > 0:
            for item in base_masks:
                if item is not None:
                    if isinstance(item, torch.Tensor):
                        if item.ndim == 2:
                            b_list.append(sanitize_to_2d_tensor(item))
                        elif item.ndim == 3:
                            for i in range(item.shape[0]):
                                b_list.append(sanitize_to_2d_tensor(item[i]))
                    elif isinstance(item, np.ndarray):
                        b_list.append(sanitize_to_2d_tensor(item))

        if target_h is None or target_w is None:
            if len(b_list) > 0:
                target_h, target_w = int(b_list[0].shape[-2]), int(b_list[0].shape[-1])
            else:
                target_h, target_w = 512, 512

        # --- MODE 1: Standalone Converter ---
        if len(b_list) == 0:
            if not char_masks_np:
                return (torch.zeros((1, target_h, target_w)),)

            out_tensors = [
                sanitize_to_2d_tensor(m) for m in char_masks_np
            ]
            return (torch.stack(out_tensors, dim=0),)

        # --- MODE 2: Indexed Matcher ---
        num_regions = len(b_list)

        base_np_list = []
        for bm in b_list:
            bm_tensor = bm.unsqueeze(0).unsqueeze(0)
            if bm_tensor.shape[-2:] != (target_h, target_w):
                bm_tensor = F.interpolate(
                    bm_tensor, size=(target_h, target_w), mode="nearest"
                )
            base_np_list.append(
                (bm_tensor.squeeze().cpu().numpy() > 0.5).astype(np.float32)
            )

        out_masks_np = [
            np.zeros((target_h, target_w), dtype=np.float32)
            for _ in range(num_regions)
        ]
        region_has_char = [False] * num_regions

        for c_mask in char_masks_np:
            scores = [np.sum(c_mask * b_mask) for b_mask in base_np_list]
            max_score = np.max(scores)
            
            # Match to best overlapping region
            best_idx = int(np.argmax(scores)) if max_score > 0 else 0

            out_masks_np[best_idx] = np.maximum(out_masks_np[best_idx], c_mask)
            region_has_char[best_idx] = True

        for i in range(num_regions):
            if not region_has_char[i] and use_fallback:
                out_masks_np[i] = base_np_list[i]

        out_tensors = [
            sanitize_to_2d_tensor(mask) for mask in out_masks_np
        ]
        return (torch.stack(out_tensors, dim=0),)