from .py.nodes.gemini_nodes import *
from .py.nodes.mask_maker import *
from .py.nodes.indexed_encoder import *
from .py.nodes.regional_sampler import *
from .py.nodes.moon_mask_maker_gui import *
from .py.nodes.markdown_output import *
from .py.nodes.multipass_sampler import *
from .py.nodes.LLM_input import *
from .py.nodes.anima_regional import MoonAnimaRegionalPatcher
from .py.nodes.moon_wildcards import MoonSimpleWildcards
from .py.nodes.moon_segs_to_indexed_masks import MoonSEGSToIndexedMasks

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
    "MoonAnimaRegionalPatcher": MoonAnimaRegionalPatcher,
    "MoonSimpleWildcards": MoonSimpleWildcards,
    "MoonSEGSToIndexedMasks": MoonSEGSToIndexedMasks,
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
    "MoonAnimaRegionalPatcher": "🌗 Moon Anima Regional Patcher",
    "MoonSimpleWildcards": "🎲 Moon Simple Wildcards",
    "MoonSEGSToIndexedMasks": "🌗 Moon SEGS to Indexed Mask List",
}

WEB_DIRECTORY = "js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]