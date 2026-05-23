import google.generativeai as genai
import torch
import numpy as np
from PIL import Image
import hashlib
import os

_SESSIONS = {}
_LAST_IMAGE_HASH = {}

def get_models():
    models_path = os.path.join(os.path.dirname(__file__), "models.txt")
    
    # Create a starter file if it's missing
    if not os.path.exists(models_path):
        with open(models_path, "w") as f:
            f.write("gemini-2.0-flash\ngemini-1.5-flash\ngemini-1.5-pro")
            
    with open(models_path, "r") as f:
        models = [line.strip() for line in f if line.strip()]
    return models if models else ["gemini-1.5-flash"]

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
            "optional": {"image": ("IMAGE",)}
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("text", "full_history")
    FUNCTION = "chat"
    CATEGORY = "MoonNodes"

    def chat(self, api_key, model_name, system_instruction, user_prompt, seed, enable_ai_processing, image=None):
        session_id = str(seed)
        
        if not enable_ai_processing:
            history_text = self._format_history(session_id)
            return ("AI Processing is PAUSED.", history_text)

        if not api_key: return ("Missing API Key", "")
        
        genai.configure(api_key=api_key)
        
        if session_id not in _SESSIONS:
            model = genai.GenerativeModel(model_name=model_name, system_instruction=system_instruction)
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

        try:
            response = chat_session.send_message(contents)
            history_text = self._format_history(session_id)
            return (response.text, history_text)
        except Exception as e:
            return (f"Gemini API Error: {str(e)}", "")

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