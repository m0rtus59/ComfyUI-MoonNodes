from .gemini_nodes import *
from .mask_maker import *
from .indexed_encoder import MoonIndexedEncoder
from .regional_sampler import MoonRegionalSampler
from .moon_mask_maker_gui import MoonMaskMakerGUI
from .markdown_output import MoonMarkdownOutput

NODE_CLASS_MAPPINGS = {
    "GeminiPersistentChat": GeminiPersistentChat,
    "GeminiAdvancedSettings": GeminiAdvancedSettings,
    "ClearableTextInput": ClearableTextInput,
    "MoonMaskMaker": MoonMaskMaker,
    "MoonIndexedEncoder": MoonIndexedEncoder,
    "MoonRegionalSampler": MoonRegionalSampler,
    "MoonMaskMakerGUI": MoonMaskMakerGUI,
    "MoonMarkdownOutput": MoonMarkdownOutput, 
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "GeminiPersistentChat": "♊ Gemini Persistent Chat",
    "GeminiAdvancedSettings": "♊ Gemini Advanced Settings",
    "ClearableTextInput": "🫙 Clearable Text Input",
    "MoonMaskMaker": "🌗 Moon Mask Maker Simple",
    "MoonIndexedEncoder": "🌗 Moon Indexed Encoder",
    "MoonRegionalSampler": "🌗 Moon Regional Sampler",
    "MoonMaskMakerGUI": "🌗 Moon Mask Maker GUI",
    "MoonMarkdownOutput": "🌗 Moon Markdown Output",
}
WEB_DIRECTORY = "web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]