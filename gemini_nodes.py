import torch
import numpy as np
from PIL import Image
import hashlib
import os
import re

from google import genai
from google.genai import types

_CLIENTS = {} # Keeps genai.Client instances alive to prevent closed httpx connections
_SESSIONS = {}
_LAST_IMAGE_HASH = {}
_CACHED_SETUP = {}

def get_models():
    """Reads models from models.txt, generating a default list if missing."""
    models_path = os.path.join(os.path.dirname(__file__), "models.txt")
    default_models = [
        "gemini-3.5-flash",
        "gemini-3.5-pro",
        "gemini-3.0-flash",
        "gemini-3.0-pro",
        "gemini-2.5-flash",
        "gemini-2.5-pro"
    ]
    
    # Create default file if it doesn't exist
    if not os.path.exists(models_path):
        try:
            with open(models_path, "w") as f:
                f.write("# Add one model name per line.\n")
                f.write("# Lines starting with '#' are ignored.\n")
                f.write("\n".join(default_models))
        except Exception:
            pass # Fail silently to defaults if folder is read-only
            
    # Read the file
    try:
        with open(models_path, "r") as f:
            models = [line.strip() for line in f if line.strip() and not line.startswith("#")]
        return models if models else default_models
    except Exception:
        return default_models

MODELS = get_models()

class GeminiAdvancedSettings:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                # 1.0 is the strict minimum recommended for Gemini 3.0+ thinking models
                "temperature": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.05}),
                "top_p": ("FLOAT", {"default": 0.95, "min": 0.0, "max": 1.0, "step": 0.05}),
                "top_k": ("INT", {"default": 40, "min": 0, "max": 100, "step": 1}),
                "max_output_tokens": ("INT", {"default": 0, "min": 0, "max": 65536, "step": 128}),
                "thinking_level": (["default", "minimal", "low", "medium", "high"], {"default": "default"}),
                "structured_outputs_json": ("BOOLEAN", {"default": False}),
                "google_search_grounding": ("BOOLEAN", {"default": False}),
                "code_execution": ("BOOLEAN", {"default": False}),
            }
        }

    RETURN_TYPES = ("GEMINI_SETTINGS",)
    RETURN_NAMES = ("advanced_settings",)
    FUNCTION = "get_settings"
    CATEGORY = "MoonNodes"

    def get_settings(self, temperature, top_p, top_k, max_output_tokens, thinking_level, structured_outputs_json, google_search_grounding, code_execution):
        return ({
            "temperature": temperature,
            "top_p": top_p,
            "top_k": top_k,
            "max_output_tokens": max_output_tokens,
            "thinking_level": thinking_level,
            "structured_outputs": structured_outputs_json,
            "google_search_grounding": google_search_grounding,
            "code_execution": code_execution,
        },)


class GeminiPersistentChat:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "api_key": ("STRING", {"default": ""}),
                "model_name": (MODELS,), 
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
        
        # --- Persistent Client Management ---
        client_recreated = False
        if session_id not in _CLIENTS or getattr(_CLIENTS[session_id], '_api_key_used', '') != api_key:
            _CLIENTS[session_id] = genai.Client(api_key=api_key)
            _CLIENTS[session_id]._api_key_used = api_key
            client_recreated = True
            
        # --- Handle Advanced Settings ---
        settings = advanced_settings or {}
        
        config_kwargs = {
            "temperature": settings.get("temperature", 1.0),
            "top_p": settings.get("top_p", 0.95),
            "top_k": settings.get("top_k", 40),
            "system_instruction": system_instruction
        }
        
        if settings.get("max_output_tokens", 0) > 0:
            config_kwargs["max_output_tokens"] = settings["max_output_tokens"]
            
        if settings.get("structured_outputs", False):
            config_kwargs["response_mime_type"] = "application/json"
            
        # Strictly typed Thinking Config
        thinking_level = settings.get("thinking_level", "default")
        if thinking_level != "default":
            # include_thoughts=True exposes the thought stream over the API connection
            config_kwargs["thinking_config"] = {
                "thinking_level": thinking_level.upper(),
                "include_thoughts": True 
            }

        # Strongly typed API Tools
        tools = []
        if settings.get("google_search_grounding", False):
            tools.append(types.Tool(google_search=types.GoogleSearch()))
        if settings.get("code_execution", False):
            tools.append(types.Tool(code_execution=types.CodeExecution()))
        if tools:
            config_kwargs["tools"] = tools

        # Build Config object
        generation_config = types.GenerateContentConfig(**config_kwargs)

        # Detect if model, system prompt, tools, thinking level, or structured JSON changed
        current_setup_hash = hashlib.md5(
            f"{model_name}_"
            f"{system_instruction}_"
            f"{settings.get('google_search_grounding', False)}_"
            f"{settings.get('code_execution', False)}_"
            f"{settings.get('thinking_level', 'default')}_"
            f"{settings.get('structured_outputs', False)}".encode()
        ).hexdigest()
        
        settings_changed = (_CACHED_SETUP.get(session_id) != current_setup_hash)
        _CACHED_SETUP[session_id] = current_setup_hash

        # --- Dynamic Session Re-creation & History Migration ---
        existing_history = None
        
        # If the client connection refreshed, or settings changed, extract the history first
        if (client_recreated or settings_changed) and session_id in _SESSIONS:
            old_chat = _SESSIONS[session_id]
            # Safely fetch active chat history from the dying session
            existing_history = old_chat.get_history() if callable(getattr(old_chat, 'get_history', None)) else getattr(old_chat, 'history', [])
            del _SESSIONS[session_id]
            
        client = _CLIENTS[session_id]

        # --- Initialize Session (Sown with existing history if migration occurred) ---
        if session_id not in _SESSIONS:
            _SESSIONS[session_id] = client.chats.create(
                model=model_name, 
                config=generation_config,
                history=existing_history if existing_history else None
            )
            # Only delete the image cache hash if starting a brand new session without history
            if not existing_history and session_id in _LAST_IMAGE_HASH:
                del _LAST_IMAGE_HASH[session_id]

        chat_session = _SESSIONS[session_id]
        contents = [user_prompt]
        
        # Process Images natively into PIL objects
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
            response = chat_session.send_message(contents, config=generation_config)
            
            # --- Extract Thoughts vs Final Text ---
            thoughts_list = []
            text_list = []
            
            if response.candidates and response.candidates[0].content.parts:
                for part in response.candidates[0].content.parts:
                    text_content = getattr(part, 'text', '')
                    if not text_content:
                        continue
                        
                    # 1. Native SDK Thought Boolean
                    if getattr(part, 'thought', False):
                        thoughts_list.append(text_content)
                    else:
                        # 2. SDK Bug Workaround (Catch leaked thoughts prefixed with THOUGHT:)
                        if text_content.strip().startswith("THOUGHT:"):
                            thoughts_list.append(text_content.replace("THOUGHT:", "", 1).strip())
                        else:
                            text_list.append(text_content)

            final_text = "\n".join(text_list).strip()
            thoughts = "\n".join(thoughts_list).strip()
            
            # 3. Secondary Fallback: Catch raw <think> tags if model bleeds reasoning
            if not thoughts:
                think_match = re.search(r"<think>(.*?)</think>", final_text, re.DOTALL | re.IGNORECASE)
                if think_match:
                    thoughts = think_match.group(1).strip()
                    final_text = re.sub(r"<think>.*?</think>", "", final_text, flags=re.DOTALL | re.IGNORECASE).strip()
            
            history_text = self._format_history(session_id)
            return (final_text, thoughts, history_text)
            
        except Exception as e:
            return (f"Gemini API Error: {str(e)}", "", "")

    def _format_history(self, session_id):
        if session_id not in _SESSIONS:
            return "No history for this seed yet."
        
        full_text = ""
        chat_session = _SESSIONS[session_id]
        
        # Robust history fetcher across SDK patches
        history_items = chat_session.get_history() if callable(getattr(chat_session, 'get_history', None)) else getattr(chat_session, 'history', [])
        
        for message in history_items:
            role = "USER" if message.role == "user" else "AI"
            text_parts = []
            
            if message.parts:
                for part in message.parts:
                    # Ignore thoughts natively, or if they have the bugged THOUGHT prefix
                    if getattr(part, 'thought', False):
                        continue
                    if getattr(part, 'text', None):
                        if part.text.strip().startswith("THOUGHT:"):
                            continue
                        text_parts.append(part.text)
                        
            combined_text = " ".join(text_parts)
            full_text += f"--- {role} ---\n{combined_text}\n\n"
        
        return full_text