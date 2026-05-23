from .gemini_nodes import GeminiPersistentChat, ClearableTextInput
from .mask_maker import *
from .indexed_encoder import MoonIndexedEncoder
from .regional_sampler import MoonRegionalSampler
from .moon_mask_maker_gui import MoonMaskMakerGUI

NODE_CLASS_MAPPINGS = {
    "GeminiPersistentChat": GeminiPersistentChat,
    "ClearableTextInput": ClearableTextInput,
    "MoonMaskMaker": MoonMaskMaker,
    "MoonIndexedEncoder": MoonIndexedEncoder,
    "MoonRegionalSampler": MoonRegionalSampler,
    "MoonMaskMakerGUI": MoonMaskMakerGUI,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "GeminiPersistentChat": "♊ Gemini Persistent Chat",
    "ClearableTextInput": "🫙 Clearable Text Input",
    "MoonMaskMaker": "🌗 Moon Mask Maker Simple",
    "MoonIndexedEncoder": "🌗 Moon Indexed Encoder",
    "MoonRegionalSampler": "🌗 Moon Regional Sampler",
    "MoonMaskMakerGUI": "🌗 Moon Mask Maker GUI",
}
WEB_DIRECTORY = "web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]