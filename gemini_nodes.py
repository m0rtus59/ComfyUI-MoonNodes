import google.generativeai as genai
import torch
import numpy as np
from PIL import Image
import hashlib
import os
import re

_SESSIONS = {}
_LAST_IMAGE_HASH = {}
_CACHED_TOOLS = {}

def get_models():
    models_path = os.path.join(os.path.dirname(__file__), "models.txt")
    
    if not os.path.exists(models_path):
        with open(models_path, "w") as f:
            f.write("gemini-3.5-flash\ngemini-3.1-pro-preview\ngemini-3.1-flash-preview\ngemini-3.0-pro\ngemini-2.5-pro\ngemini-2.5-flash\ngemini-2.5-flash-lite")
            
    with open(models_path, "r") as f:
        models = [line.strip() for line in f if line.strip()]
    return models if models else ["gemini-3.5-flash"]


class GeminiAdvancedSettings:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "temperature": ("FLOAT", {"default": 0.7, "min": 0.0, "max": 2.0, "step": 0.05}),
                "top_p": ("FLOAT", {"default": 0.95, "min": 0.0, "max": 1.0, "step": 0.05}),
                "top_k": ("INT", {"default": 40, "min": 0, "max": 100, "step": 1}),
                "max_output_tokens": ("INT", {"default": 0, "min": 0, "max": 65536, "step": 128}),
                "thinking_level": (["default", "low", "standard", "high"], {"default": "default"}),
                "structured_outputs_json": ("BOOLEAN", {"default": False}),
                "google_search_grounding": ("BOOLEAN", {"default": False}),
                "code_execution": ("BOOLEAN", {"default": False}),
                "url_context": ("BOOLEAN", {"default": False}),
            }
        }

    RETURN_TYPES = ("GEMINI_SETTINGS",)
    RETURN_NAMES = ("advanced_settings",)
    FUNCTION = "get_settings"
    CATEGORY = "MoonNodes"

    def get_settings(self, temperature, top_p, top_k, max_output_tokens, thinking_level, structured_outputs_json, google_search_grounding, code_execution, url_context):
        return ({
            "temperature": temperature,
            "top_p": top_p,
            "top_k": top_k,
            "max_output_tokens": max_output_tokens,
            "thinking_level": thinking_level,
            "structured_outputs": structured_outputs_json,
            "google_search_grounding": google_search_grounding,
            "code_execution": code_execution,
            "url_context": url_context,
        },)


class GeminiPersistentChat:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "api_key": ("STRING", {"default": ""}),
                "model_name": (get_models(),), 
                "system_instruction": ("STRING", {"multiline": True, "default": "Expert prompt engineer."}),
                "user_prompt": ("STRING", {"multiline": True}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
                "enable_ai_processing": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "image": ("IMAGE",),
                "advanced_settings": ("GEMINI_SETTINGS",)
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("text", "thoughts", "full_history")
    FUNCTION = "chat"
    CATEGORY = "MoonNodes"

    def chat(self, api_key, model_name, system_instruction, user_prompt, seed, enable_ai_processing, image=None, advanced_settings=None):
        session_id = str(seed)
        
        if not enable_ai_processing:
            history_text = self._format_history(session_id)
            return ("AI Processing is PAUSED.", "", history_text)

        if not api_key: return ("Missing API Key", "", "")
        
        genai.configure(api_key=api_key)
        
        # --- Handle Advanced Settings ---
        settings = advanced_settings or {}
        
        gen_config_dict = {
            "temperature": settings.get("temperature", 0.7),
            "top_p": settings.get("top_p", 0.95),
            "top_k": settings.get("top_k", 40),
        }
        
        if settings.get("max_output_tokens", 0) > 0:
            gen_config_dict["max_output_tokens"] = settings["max_output_tokens"]
            
        if settings.get("structured_outputs", False):
            gen_config_dict["response_mime_type"] = "application/json"
            
        thinking_level = settings.get("thinking_level", "default")
        if thinking_level != "default":
            gen_config_dict["thinking_config"] = {"thinking_level": thinking_level.upper()}

        # Build config object (fallback for older SDKs if thinking_config throws an error)
        try:
            generation_config = genai.types.GenerationConfig(**gen_config_dict)
        except TypeError:
            if "thinking_config" in gen_config_dict:
                del gen_config_dict["thinking_config"]
            generation_config = genai.types.GenerationConfig(**gen_config_dict)

        # Define API Tools
        tools = []
        if settings.get("google_search_grounding", False):
            tools.append("google_search_retrieval")
        if settings.get("code_execution", False):
            tools.append("code_execution")
            
        # Detect if tools changed mid-session. If so, we must clear the cache to apply them
        if session_id in _CACHED_TOOLS and _CACHED_TOOLS[session_id] != tools:
            if session_id in _SESSIONS:
                del _SESSIONS[session_id]
        _CACHED_TOOLS[session_id] = tools

        # --- Initialize Session ---
        if session_id not in _SESSIONS:
            model = genai.GenerativeModel(
                model_name=model_name, 
                system_instruction=system_instruction,
                tools=tools if tools else None
            )
            _SESSIONS[session_id] = model.start_chat(history=[])
            if session_id in _LAST_IMAGE_HASH:
                del _LAST_IMAGE_HASH[session_id]

        chat_session = _SESSIONS[session_id]
        contents = [user_prompt]
        
        if image is not None:
            current_hash = hashlib.md5(image.cpu().numpy().tobytes()).hexdigest()
            if _LAST_IMAGE_HASH.get(session_id) != current_hash:
                for i in range(image.shape[0]):
                    img_np = 255. * image[i].cpu().numpy()
                    img_pil = Image.fromarray(np.clip(img_np, 0, 255).astype(np.uint8))
                    contents.append(img_pil)
                _LAST_IMAGE_HASH[session_id] = current_hash

        # --- Execute API Call ---
        try:
            response = chat_session.send_message(contents, generation_config=generation_config)
            raw_text = response.text
            
            # Intelligent Extraction: Pull internal <think> monologues into their own output pin
            thoughts = ""
            final_text = raw_text
            think_match = re.search(r"<think>(.*?)</think>", raw_text, re.DOTALL | re.IGNORECASE)
            
            if think_match:
                thoughts = think_match.group(1).strip()
                final_text = re.sub(r"<think>.*?</think>", "", raw_text, flags=re.DOTALL | re.IGNORECASE).strip()
            
            history_text = self._format_history(session_id)
            return (final_text, thoughts, history_text)
            
        except Exception as e:
            return (f"Gemini API Error: {str(e)}", "", "")

    def _format_history(self, session_id):
        if session_id not in _SESSIONS:
            return "No history for this seed yet."
        
        full_text = ""
        for message in _SESSIONS[session_id].history:
            role = "USER" if message.role == "user" else "AI"
            text_parts = [part.text for part in message.parts if hasattr(part, 'text')]
            combined_text = " ".join(text_parts)
            full_text += f"--- {role} ---\n{combined_text}\n\n"
        
        return full_text

class ClearableTextInput:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {"text": ("STRING", {"multiline": True, "default": ""})}}
    RETURN_TYPES = ("STRING",)
    FUNCTION = "process"
    CATEGORY = "MoonNodes"
    OUTPUT_NODE = True
    def process(self, text):
        return {"ui": {"text": [text]}, "result": (text,)}