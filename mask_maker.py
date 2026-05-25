import torch
import numpy as np

def create_mask_tensor(arr, zone, h, w):
    mask_np = (arr == zone).astype(np.float32)
    mask_tensor = torch.from_numpy(mask_np)
    if h < 90 or w < 90:
        temp = mask_tensor.unsqueeze(0).unsqueeze(0)
        temp = torch.nn.functional.interpolate(temp, size=(90, 90), mode='nearest')
        mask_tensor = temp.squeeze(0).squeeze(0)
    return mask_tensor

class MoonMaskMaker:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mask_grid": ("STRING", {"multiline": True, "default": "0 1"}),
            }
        }

    RETURN_TYPES = ("MASK",)
    FUNCTION = "create_masks"
    OUTPUT_IS_LIST = (True,)
    CATEGORY = "MoonNodes"

    def create_masks(self, mask_grid):
        lines = [l.strip() for l in mask_grid.strip().split('\n') if l.strip()]
        if not lines:
            return (torch.zeros((1, 90, 90)),)

        try:
            grid = [line.split() for line in lines]
            arr = np.array(grid, dtype=int)
        except:
            return (torch.zeros((1, 90, 90)),)

        zones = np.unique(arr)
        h, w = arr.shape
        mask_list = [create_mask_tensor(arr, zone, h, w) for zone in zones]
        return (torch.stack(mask_list, dim=0),)