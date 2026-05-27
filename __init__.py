from .gemini_nodes import *
from .mask_maker import *
from .indexed_encoder import *
from .regional_sampler import *
from .moon_mask_maker_gui import *
from .markdown_output import *
from .multipass_sampler import *
from .LLM_input import *

NODE_CLASS_MAPPINGS = {
    "GeminiPersistentChat": GeminiPersistentChat,
    "GeminiAdvancedSettings": GeminiAdvancedSettings,
    "ClearableTextInput": ClearableTextInput,
    "MoonMaskMaker": MoonMaskMaker,
    "MoonIndexedEncoder": MoonIndexedEncoder,
    "MoonRegionalSampler": MoonRegionalSampler,
    "MoonMaskMakerGUI": MoonMaskMakerGUI,
    "MoonMarkdownOutput": MoonMarkdownOutput,
    "MoonMultiPassSampler": MoonMultiPassSampler,
    "LLMSubmitInput": LLMSubmitInput,
    "MoonQuickstart": MoonQuickstart,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "GeminiPersistentChat": "♊ Gemini Persistent Chat",
    "GeminiAdvancedSettings": "♊ Gemini Advanced Settings",
    "ClearableTextInput": "🫙 Clearable Text Input",
    "MoonMaskMaker": "🌗 Moon Mask Maker Simple",
    "MoonIndexedEncoder": "🌗 Moon Indexed Encoder",
    "MoonRegionalSampler": "🌗 Moon Regional Patcher",
    "MoonMaskMakerGUI": "🌗 Moon Mask Maker GUI",
    "MoonMarkdownOutput": "🌗 Moon Markdown Output",
    "MoonMultiPassSampler": "🌗 Moon Multi-Area KSampler (experiment)",
    "LLMSubmitInput": "🫙 LLM Submit Input",
    "MoonQuickstart": "🎲 Quickstart",
}
WEB_DIRECTORY = "web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]