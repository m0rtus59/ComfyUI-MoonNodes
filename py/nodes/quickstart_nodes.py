import math

ASPECT_RATIOS = {
    "1:1": (1, 1),
    "3:2": (3, 2),
    "4:3": (4, 3),
    "16:9": (16, 9),
    "21:9": (21, 9),
    "2:3": (2, 3),
    "3:4": (3, 4),
    "9:16": (9, 16),
}

class MoonQuickstart:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                # Renamed to "value" to avoid ComfyUI's auto seed-control injector
                "value": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
            }
        }
    
    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("seed",)
    FUNCTION = "process"
    CATEGORY = "MoonNodes"
    
    def process(self, value):
        return (value,)


class MoonQuickstartAdvanced:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                # Named "value" so ComfyUI doesn't inject native seed controls
                "value": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "aspect_ratio": (list(ASPECT_RATIOS.keys()), {"default": "1:1"}),
                "megapixels": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 16.0, "step": 0.05}),
                "multiple": ("INT", {"default": 8, "min": 8, "max": 128, "step": 8}),
            }
        }
    
    RETURN_TYPES = ("INT", "INT", "INT")
    RETURN_NAMES = ("seed", "width", "height")
    FUNCTION = "calculate"
    CATEGORY = "MoonNodes"

    def calculate(self, value, aspect_ratio, megapixels, multiple):
        w_ratio, h_ratio = ASPECT_RATIOS.get(aspect_ratio, (1, 1))
        total_pixels = megapixels * 1024 * 1024
        scale = math.sqrt(total_pixels / (w_ratio * h_ratio))
        width = max(multiple, round(w_ratio * scale / multiple) * multiple)
        height = max(multiple, round(h_ratio * scale / multiple) * multiple)
        return (value, width, height)