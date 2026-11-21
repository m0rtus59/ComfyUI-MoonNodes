import socket
import threading
from contextlib import contextmanager

# Thread-safe IPv4 prioritization for users behind IPv4-only VPN tunnels
_tls = threading.local()
_orig_getaddrinfo = socket.getaddrinfo

def _patched_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    if getattr(_tls, "force_ipv4", False) and (family == 0 or family == socket.AF_UNSPEC):
        family = socket.AF_INET
    return _orig_getaddrinfo(host, port, family, type, proto, flags)

socket.getaddrinfo = _patched_getaddrinfo

@contextmanager
def force_ipv4_context(enabled: bool):
    prev = getattr(_tls, "force_ipv4", False)
    _tls.force_ipv4 = bool(enabled)
    try:
        yield
    finally:
        _tls.force_ipv4 = prev

import torch
import numpy as np
from PIL import Image
import hashlib
import os
import re
import json
import concurrent.futures
from typing_extensions import override
from aiohttp import web

from google import genai
from google.genai import types

import comfy.model_management
from comfy_api.latest import io
from server import PromptServer

_CLIENTS = {}
_SESSIONS = {}
_LAST_IMAGE_HASH = {}
_CACHED_SETUP = {}
_RESPONSE_CACHE = {}

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS_PATH = os.path.join(ROOT_DIR, "models.txt")
API_KEY_PATH = os.path.join(ROOT_DIR, "api_key.txt")
PROMPTS_DIR = os.path.join(ROOT_DIR, "prompts")
os.makedirs(PROMPTS_DIR, exist_ok=True)

def sanitize_filename(name: str) -> str:
    """Strictly sanitize filename to pass ComfyRegistry / security guardrails."""
    name = os.path.basename(name).strip()
    if name.lower().endswith(".txt"):
        name = name[:-4].strip()
    clean = re.sub(r'[^a-zA-Z0-9_\- ]', '', name).strip()
    if not clean:
        clean = "default"
    return clean + ".txt"

def get_safe_prompt_path(filename: str) -> str:
    """Verifies that the target path stays strictly inside PROMPTS_DIR."""
    clean_name = sanitize_filename(filename)
    target = os.path.abspath(os.path.join(PROMPTS_DIR, clean_name))
    if os.path.commonpath([target, os.path.abspath(PROMPTS_DIR)]) != os.path.abspath(PROMPTS_DIR):
        raise ValueError("Security violation: Path traversal detected.")
    return target

_KEY_INDEX = 0

def get_api_keys() -> list[str]:
    """Reads all API keys from local api_key.txt or environment variables."""
    keys = []
    if os.path.exists(API_KEY_PATH):
        try:
            with open(API_KEY_PATH, "r", encoding="utf-8") as f:
                for line in f:
                    k = line.strip()
                    if k and not k.startswith("#") and k not in keys:
                        keys.append(k)
        except Exception:
            pass
    if not keys:
        env_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or ""
        if env_key:
            keys.append(env_key.strip())
    return keys

def get_api_key() -> str:
    """Returns the primary or current active API key."""
    keys = get_api_keys()
    return keys[0] if keys else ""

def save_api_keys(keys_list: list[str]):
    """Saves a list of API keys to api_key.txt locally."""
    try:
        with open(API_KEY_PATH, "w", encoding="utf-8") as f:
            f.write("# Gemini API Keys (one per line, stored locally to prevent workflow leaks)\n")
            for k in keys_list:
                cleaned = k.strip()
                if cleaned:
                    f.write(cleaned + "\n")
        return True
    except Exception:
        return False

def add_api_key(new_key: str):
    """Appends a new key to the local list."""
    keys = get_api_keys()
    cleaned = new_key.strip()
    if cleaned and cleaned not in keys:
        keys.append(cleaned)
        return save_api_keys(keys)
    return False

def clear_api_keys():
    """Clears all stored keys."""
    return save_api_keys([])

def get_rotated_api_keys() -> list[str]:
    """Returns all available API keys starting with the current round-robin index."""
    global _KEY_INDEX
    keys = get_api_keys()
    if not keys:
        return []
    _KEY_INDEX = _KEY_INDEX % len(keys)
    ordered = keys[_KEY_INDEX:] + keys[:_KEY_INDEX]
    _KEY_INDEX = (_KEY_INDEX + 1) % len(keys)
    return ordered

def is_quota_error(ex: Exception) -> bool:
    """Checks if an exception is a 429 / RESOURCE_EXHAUSTED error."""
    msg = str(ex).lower()
    return any(x in msg for x in ["429", "resource_exhausted", "quota", "rate limit"])

def is_client_closed(client) -> bool:
    """Checks if an underlying httpx client has been closed."""
    try:
        api_client = getattr(client, '_api_client', None)
        if api_client:
            raw_client = getattr(api_client, '_http_client', None) or getattr(api_client, 'client', None)
            if raw_client and getattr(raw_client, 'is_closed', False):
                return True
    except Exception:
        pass
    return False

def is_retryable_error(ex: Exception) -> bool:
    """Checks if an error is eligible for auto-failover or reconnection."""
    msg = str(ex).lower()
    return is_quota_error(ex) or ("client has been closed" in msg) or ("closed" in msg and "client" in msg)

def get_models():
    """Reads models from models.txt."""
    default_models = [
        "gemini-pro-latest",
        "gemini-flash-latest",
        "gemini-flash-lite-latest",
        "gemini-3.1-pro-preview",
        "gemini-3.1-flash-lite",
        "gemini-3.0-pro",
        "gemini-3.0-flash",
        "gemini-2.5-pro",
        "gemini-2.5-flash"
    ]
    if not os.path.exists(MODELS_PATH):
        try:
            with open(MODELS_PATH, "w", encoding="utf-8") as f:
                f.write("# Add one model name or dynamic pointer per line.\n")
                f.write("# Lines starting with '#' are ignored.\n")
                f.write("\n".join(default_models))
        except Exception:
            pass
            
    try:
        with open(MODELS_PATH, "r", encoding="utf-8") as f:
            models = [line.strip() for line in f if line.strip() and not line.startswith("#")]
        return models if models else default_models
    except Exception:
        return default_models

def get_or_create_client(api_key: str, client_key: str):
    """Creates or retrieves a persistent Gemini Client with a 120s timeout."""
    http_options = types.HttpOptions(timeout=120_000)
    if hasattr(types, "HttpRetryOptions"):
        try:
            http_options.retry_options = types.HttpRetryOptions(attempts=2)
        except Exception:
            pass

    existing = _CLIENTS.get(client_key)
    if existing is None or getattr(existing, '_api_key_used', '') != api_key or is_client_closed(existing):
        _CLIENTS[client_key] = genai.Client(api_key=api_key, http_options=http_options)
        _CLIENTS[client_key]._api_key_used = api_key
    return _CLIENTS[client_key]

def build_generation_config(model_name: str, system_instruction: str, settings: dict):
    """Builds a GenerateContentConfig object with model-specific thinking options."""
    settings = settings or {}
    config_kwargs = {
        "temperature": float(settings.get("temperature", 1.0)),
        "top_p": float(settings.get("top_p", 0.95)),
        "top_k": int(settings.get("top_k", 40)),
        "system_instruction": system_instruction.strip() if system_instruction else None
    }

    max_tokens = int(settings.get("max_output_tokens", 0))
    if max_tokens > 0:
        config_kwargs["max_output_tokens"] = max_tokens

    if settings.get("structured_outputs_json", False):
        config_kwargs["response_mime_type"] = "application/json"

    thinking_level = settings.get("thinking_level", "default")
    is_budget_model = any(x in model_name.lower() for x in ["2.5", "2.0", "lite"])

    if thinking_level != "default":
        if is_budget_model:
            budget_map = {"minimal": 1024, "low": 2048, "medium": 8192, "high": 24576}
            budget = budget_map.get(thinking_level.lower(), 2048)
            config_kwargs["thinking_config"] = types.ThinkingConfig(
                thinking_budget=budget,
                include_thoughts=True
            )
        else:
            level = thinking_level.upper()
            if level in ("MINIMAL", "LOW", "MEDIUM", "HIGH"):
                config_kwargs["thinking_config"] = types.ThinkingConfig(
                    thinking_level=level,
                    include_thoughts=True
                )

    tools = []
    if settings.get("google_search_grounding", False):
        tools.append(types.Tool(google_search=types.GoogleSearch()))
    if settings.get("code_execution", False):
        tool_code = getattr(types, "ToolCodeExecution", None)
        if tool_code:
            tools.append(types.Tool(code_execution=tool_code()))
        else:
            tools.append(types.Tool(code_execution={}))
    if tools:
        config_kwargs["tools"] = tools

    return types.GenerateContentConfig(**config_kwargs)

def extract_response_parts(response):
    """Extracts text, thoughts, and grounding search citations from response."""
    thoughts_list = []
    text_list = []
    sources_list = []

    if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
        for part in response.candidates[0].content.parts:
            # 1. Extract Python code written and run by Gemini in the sandbox
            exec_code = getattr(part, 'executable_code', None)
            if exec_code:
                code_text = getattr(exec_code, 'code', '')
                if code_text:
                    text_list.append(f"```python\n# [Code Execution]\n{code_text.strip()}\n```")

            # 2. Extract stdout/result output returned from the Python sandbox
            exec_result = getattr(part, 'code_execution_result', None)
            if exec_result:
                out_text = getattr(exec_result, 'output', '')
                if out_text:
                    text_list.append(f"```\n# [Execution Output]\n{out_text.strip()}\n```")

            # 3. Extract text response
            text_content = getattr(part, 'text', '')
            if not text_content:
                continue

            if getattr(part, 'thought', False):
                thoughts_list.append(text_content)
            else:
                if text_content.strip().startswith("THOUGHT:"):
                    thoughts_list.append(text_content.replace("THOUGHT:", "", 1).strip())
                else:
                    text_list.append(text_content)

        # Extract Grounding Search Citations if present
        grounding = getattr(response.candidates[0], 'grounding_metadata', None)
        if grounding:
            chunks = getattr(grounding, 'grounding_chunks', None) or []
            for c in chunks:
                web_info = getattr(c, 'web', None)
                if web_info:
                    title = getattr(web_info, 'title', None) or "Source"
                    uri = getattr(web_info, 'uri', None)
                    if uri:
                        sources_list.append(f"[{title}]({uri})")

    elif response.candidates and response.candidates[0].finish_reason:
        reason = response.candidates[0].finish_reason
        if str(reason) not in ("FinishReason.STOP", "STOP"):
            text_list.append(f"[Generation stopped with reason: {reason}]")

    final_text = "\n".join(text_list).strip()
    thoughts = "\n".join(thoughts_list).strip()

    if sources_list:
        final_text += "\n\n🌐 **Sources:** " + ", ".join(sources_list[:5])

    if not thoughts and final_text:
        think_match = re.search(r"<think>(.*?)</think>", final_text, re.DOTALL | re.IGNORECASE)
        if think_match:
            thoughts = think_match.group(1).strip()
            final_text = re.sub(r"<think>.*?</think>", "", final_text, flags=re.DOTALL | re.IGNORECASE).strip()

    return final_text, thoughts


# =========================================================================
# API Endpoints for Frontend UI
# =========================================================================
@PromptServer.instance.routes.get("/moon/gemini_get_info")
async def handle_get_info(request):
    keys = get_api_keys()
    masked_keys = [
        ((k[:6] + "..." + k[-4:]) if len(k) > 10 else ("*" * len(k)))
        for k in keys
    ]
    return web.json_response({
        "has_key": bool(keys),
        "key_count": len(keys),
        "masked_keys": masked_keys,
        "models": get_models()
    })

@PromptServer.instance.routes.post("/moon/gemini_save_key")
async def handle_save_key(request):
    try:
        data = await request.json()
        key = data.get("api_key", "").strip()
        action = data.get("action", "add")  # "add" or "clear"

        if action == "clear":
            clear_api_keys()
            return web.json_response({"success": True, "key_count": 0, "masked_keys": []})

        if not key:
            return web.json_response({"success": False, "error": "API Key cannot be empty."})

        # Support pasting multiple keys at once separated by commas or newlines
        raw_keys = [k.strip() for k in re.split(r'[\r\n,]+', key) if k.strip()]
        for rk in raw_keys:
            add_api_key(rk)

        keys = get_api_keys()
        masked_keys = [
            ((k[:6] + "..." + k[-4:]) if len(k) > 10 else ("*" * len(k)))
            for k in keys
        ]
        return web.json_response({"success": True, "key_count": len(keys), "masked_keys": masked_keys})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})

import asyncio

@PromptServer.instance.routes.post("/moon/gemini_fetch_models")
async def handle_fetch_models(request):
    try:
        data = await request.json() if request.can_read_body else {}
        force_ipv4 = bool(data.get("force_ipv4", False))

        key = get_api_key()
        if not key:
            return web.json_response({"success": False, "error": "Save an API Key first before fetching models."})

        def sync_fetch():
            with force_ipv4_context(force_ipv4):
                http_options = types.HttpOptions(timeout=30_000)
                client = genai.Client(api_key=key, http_options=http_options)
            fetched = []
            try:
                # page_size=100 fetches all models in a single round-trip
                pager = client.models.list(config={"page_size": 100})
                for m in pager:
                    actions = getattr(m, 'supported_actions', []) or getattr(m, 'supported_generation_methods', [])
                    if not actions or "generateContent" in actions:
                        name = m.name.replace("models/", "")
                        if any(x in name.lower() for x in ["gemini", "flash", "pro"]):
                            if "embedding" not in name.lower() and "aqa" not in name.lower():
                                fetched.append(name)
            except Exception:
                # Fallback if config is not supported
                for m in client.models.list():
                    actions = getattr(m, 'supported_actions', []) or getattr(m, 'supported_generation_methods', [])
                    if not actions or "generateContent" in actions:
                        name = m.name.replace("models/", "")
                        if any(x in name.lower() for x in ["gemini", "flash", "pro"]):
                            if "embedding" not in name.lower() and "aqa" not in name.lower():
                                fetched.append(name)
            return fetched

        # Run on a worker thread so the web server event loop never blocks
        fetched = await asyncio.to_thread(sync_fetch)

        if not fetched:
            return web.json_response({"success": False, "error": "No generateContent models returned."})

        fetched.sort(reverse=True)
        existing = get_models()
        existing_set = set(existing)
        new_ones = [m for m in fetched if m not in existing_set]
        combined = existing + new_ones

        with open(MODELS_PATH, "w", encoding="utf-8") as f:
            f.write("# Gemini Model List\n")
            f.write("\n".join(combined))

        return web.json_response({"success": True, "models": combined})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})

@PromptServer.instance.routes.get("/moon/gemini_list_prompts")
async def handle_list_prompts(request):
    try:
        files = [f for f in os.listdir(PROMPTS_DIR) if f.endswith(".txt")]
        files.sort()
        return web.json_response({"success": True, "files": files})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e), "files": []})

@PromptServer.instance.routes.post("/moon/gemini_load_prompt")
async def handle_load_prompt(request):
    try:
        data = await request.json()
        filepath = get_safe_prompt_path(data.get("filename", ""))
        if os.path.exists(filepath):
            with open(filepath, "r", encoding="utf-8") as f:
                content = f.read()
            return web.json_response({"success": True, "content": content})
        return web.json_response({"success": False, "error": "File not found."})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})

@PromptServer.instance.routes.post("/moon/gemini_save_prompt")
async def handle_save_prompt(request):
    try:
        data = await request.json()
        filepath = get_safe_prompt_path(data.get("filename", ""))
        content = data.get("content", "")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        return web.json_response({"success": True, "filename": os.path.basename(filepath)})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})

@PromptServer.instance.routes.post("/moon/gemini_rename_prompt")
async def handle_rename_prompt(request):
    try:
        data = await request.json()
        old_path = get_safe_prompt_path(data.get("old_filename", ""))
        new_path = get_safe_prompt_path(data.get("new_filename", ""))
        if not os.path.exists(old_path):
            return web.json_response({"success": False, "error": "Source file does not exist."})
        if os.path.exists(new_path) and old_path != new_path:
            return web.json_response({"success": False, "error": "A file with that name already exists."})
        os.rename(old_path, new_path)
        return web.json_response({"success": True, "filename": os.path.basename(new_path)})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})

@PromptServer.instance.routes.post("/moon/gemini_delete_prompt")
async def handle_delete_prompt(request):
    try:
        data = await request.json()
        filepath = get_safe_prompt_path(data.get("filename", ""))
        if os.path.exists(filepath):
            os.remove(filepath)
            return web.json_response({"success": True})
        return web.json_response({"success": False, "error": "File not found."})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})

@PromptServer.instance.routes.post("/moon/gemini_chat")
async def handle_chat(request):
    session_id = "0"
    try:
        data = await request.json()
        user_message = data.get("message", "").strip()
        model_name = data.get("model_name", "gemini-flash-latest")
        session_id = str(data.get("session_id", "0"))
        mode = data.get("mode", "Persistent")
        system_instruction = data.get("system_instruction", "")
        settings = data.get("settings", {})
        incoming_history = data.get("history", [])

        api_key = get_api_key()
        if not api_key:
            return web.json_response({"success": False, "error": "API Key is required. Please set it in Settings."})
        if not user_message:
            return web.json_response({"success": False, "error": "Message is empty."})

        client = get_or_create_client(api_key, session_id if mode == "Persistent" else "singular")
        generation_config = build_generation_config(model_name, system_instruction, settings)
        force_ipv4 = bool(settings.get("force_ipv4", False))

        current_setup_hash = hashlib.md5(f"{model_name}_{system_instruction}_{str(sorted(settings.items()))}".encode()).hexdigest()
        settings_changed = (_CACHED_SETUP.get(f"chat_{session_id}") != current_setup_hash)
        _CACHED_SETUP[f"chat_{session_id}"] = current_setup_hash

        # Re-seed session if settings changed or if backend was restarted and lost session
        if mode != "Singular":
            if settings_changed or (session_id not in _SESSIONS):
                clean_history = []
                for h in incoming_history:
                    h_role = "user" if h.get("role") == "user" else "model"
                    h_text = h.get("text", "")
                    if h_text and h_text != user_message:
                        clean_history.append(types.Content(role=h_role, parts=[types.Part(text=h_text)]))
                _SESSIONS[session_id] = client.chats.create(
                    model=model_name,
                    config=generation_config,
                    history=clean_history if clean_history else None
                )

        available_keys = get_rotated_api_keys()
        if not available_keys:
            return web.json_response({"success": False, "error": "No API Keys found. Add a key in Settings."})

        last_error = None
        response = None

        for idx, active_key in enumerate(available_keys):
            client = get_or_create_client(active_key, f"{session_id}_{active_key[:8]}" if mode == "Persistent" else "singular")
            try:
                if mode == "Singular":
                    def run_singular():
                        with force_ipv4_context(force_ipv4):
                            return client.models.generate_content(
                                model=model_name,
                                contents=user_message,
                                config=generation_config
                            )
                    response = await asyncio.to_thread(run_singular)
                else:
                    if session_id not in _SESSIONS:
                        clean_history = []
                        for h in incoming_history:
                            h_role = "user" if h.get("role") == "user" else "model"
                            h_text = h.get("text", "")
                            if h_text and h_text != user_message:
                                clean_history.append(types.Content(role=h_role, parts=[types.Part(text=h_text)]))
                        _SESSIONS[session_id] = client.chats.create(
                            model=model_name,
                            config=generation_config,
                            history=clean_history if clean_history else None
                        )
                    chat_session = _SESSIONS[session_id]
                    def run_persistent():
                        with force_ipv4_context(force_ipv4):
                            return chat_session.send_message(user_message)
                    response = await asyncio.to_thread(run_persistent)
                
                # If we succeeded, break out of the key loop!
                break
            except Exception as ex:
                last_error = ex
                if is_quota_error(ex) and idx < len(available_keys) - 1:
                    print(f"[Gemini Node] Key #{idx+1} hit rate limit (429). Failing over to Key #{idx+2}...")
                    if session_id in _SESSIONS:
                        del _SESSIONS[session_id]
                    continue
                else:
                    raise ex

        if response is None:
            raise last_error or Exception("All available API keys failed.")

        final_text, thoughts = extract_response_parts(response)
        return web.json_response({
            "success": True,
            "text": final_text,
            "thoughts": thoughts
        })
    except Exception as e:
        if session_id in _SESSIONS:
            del _SESSIONS[session_id]
        import traceback
        traceback.print_exc()
        err_msg = str(e).strip() or f"{type(e).__name__}: Generation failed."
        return web.json_response({"success": False, "error": err_msg})


# =========================================================================
# Main Gemini Node
# =========================================================================
class GeminiPersistentChat(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="GeminiPersistentChat",
            display_name="♊ Gemini Persistent Chat",
            category="MoonNodes",
            inputs=[
                io.String.Input("text_input", force_input=True, optional=True, tooltip="Optional workflow text prompt connector."),
                io.Custom("GEMINI_SESSION").Input("session", optional=True, tooltip="Connect from another Gemini node's session output to share conversation memory."),
                io.Boolean.Input("enable_ai_processing", default=True),
                io.Autogrow.Input(
                    "images",
                    optional=True,
                    template=io.Autogrow.TemplatePrefix(
                        input=io.Image.Input("image"),
                        prefix="image_",
                        min=0,
                        max=20,
                    ),
                    tooltip="Connect images for multimodal workflow execution."
                ),
                io.String.Input("ui_settings", default="{}", optional=True),
            ],
            outputs=[
                io.String.Output(display_name="text"),
                io.Custom("GEMINI_SESSION").Output(display_name="session"),
            ],
        )

    @classmethod
    def execute(cls, text_input: str = "", session: str = None, enable_ai_processing: bool = True, images: dict = None, ui_settings: str = "{}") -> io.NodeOutput:
        settings_dict = {}
        if ui_settings:
            try:
                settings_dict = json.loads(ui_settings)
            except Exception:
                pass

        # Inherit session from connected upstream node if provided
        if session and isinstance(session, str) and session.strip():
            session_id = session.strip()
        else:
            session_id = str(settings_dict.get("session_id", "default_session"))

        is_singular = bool(settings_dict.get("singular_mode", False))
        if is_singular:
            session_id = f"singular_{session_id}"

        model_name = settings_dict.get("model_name", "gemini-flash-latest")
        
        # Determine system prompt based on storage choice (local file or workflow)
        storage_mode = settings_dict.get("prompt_storage", "workflow")
        if storage_mode == "local":
            prompt_file = settings_dict.get("prompt_file", "")
            try:
                target_path = get_safe_prompt_path(prompt_file)
                with open(target_path, "r", encoding="utf-8") as f:
                    effective_sys_inst = f.read().strip()
            except Exception:
                effective_sys_inst = settings_dict.get("system_instruction", "")
        else:
            effective_sys_inst = settings_dict.get("system_instruction", "")

        # Handle Paused State
        if not enable_ai_processing:
            if session_id in _RESPONSE_CACHE:
                last_text, _ = _RESPONSE_CACHE[session_id]["output"]
                paused_text = f"⚠️AI Processing is PAUSED⚠️\n---\n{last_text}" if last_text else "⚠️AI Processing is PAUSED⚠️"
                return io.NodeOutput(paused_text, session_id)
            return io.NodeOutput("⚠️AI Processing is PAUSED⚠️", session_id)

        api_key = get_api_key()
        if not api_key:
            return io.NodeOutput("❌ Missing API Key. Please save your API key in the node's Settings tab.", session_id)

        # Process Attached Images
        pil_images = []
        image_hashes = []
        if images and isinstance(images, dict):
            for key, img_tensor in sorted(images.items()):
                if img_tensor is not None and isinstance(img_tensor, torch.Tensor):
                    try:
                        image_hashes.append(hashlib.md5(img_tensor.cpu().numpy().tobytes()).hexdigest())
                    except Exception:
                        image_hashes.append("image")
                    for i in range(img_tensor.shape[0]):
                        img_np = 255. * img_tensor[i].cpu().numpy()
                        img_pil = Image.fromarray(np.clip(img_np, 0, 255).astype(np.uint8))
                        pil_images.append(img_pil)

        image_hash = "-".join(image_hashes) if image_hashes else "no_image"
        manual_ui_prompt = settings_dict.get("manual_prompt", "").strip()
        wf_prompt = text_input.strip() if text_input else ""

        # Format combined inputs with clear context captions for the AI
        if manual_ui_prompt and wf_prompt:
            effective_prompt = f"### Workflow Input:\n{wf_prompt}\n\n### User Note / Instructions:\n{manual_ui_prompt}"
        elif manual_ui_prompt:
            effective_prompt = manual_ui_prompt
        else:
            effective_prompt = wf_prompt

        # Input Cache Check
        current_input_hash = hashlib.md5(
            f"{model_name}_{effective_sys_inst}_{effective_prompt}_{image_hash}_{str(sorted(settings_dict.items()))}".encode()
        ).hexdigest()

        if session_id in _RESPONSE_CACHE and _RESPONSE_CACHE[session_id]["hash"] == current_input_hash:
            cached_text, cached_thoughts = _RESPONSE_CACHE[session_id]["output"]
            return io.NodeOutput(
                cached_text,
                session_id,
                ui={"workflow_chat": [{
                    "session_id": session_id,
                    "prompt": effective_prompt, 
                    "images_count": len(pil_images), 
                    "images_reused": False, 
                    "text": cached_text, 
                    "thoughts": cached_thoughts
                }]}
            )

        available_keys = get_rotated_api_keys()
        if not available_keys:
            return io.NodeOutput("❌ Missing API Key. Please save your API key in the node's Settings tab.", "")

        generation_config = build_generation_config(model_name, effective_sys_inst, settings_dict)

        # Setup Tracking & Sanitized History Migration
        current_setup_hash = hashlib.md5(f"{model_name}_{effective_sys_inst}_{str(sorted(settings_dict.items()))}".encode()).hexdigest()
        settings_changed = (_CACHED_SETUP.get(session_id) != current_setup_hash)
        _CACHED_SETUP[session_id] = current_setup_hash

        clean_history = None
        if (settings_changed or is_singular) and session_id in _SESSIONS:
            if not is_singular:
                old_chat = _SESSIONS[session_id]
                raw_history = old_chat.get_history() if callable(getattr(old_chat, 'get_history', None)) else getattr(old_chat, 'history', [])
                clean_history = []
                for msg in raw_history:
                    role = getattr(msg, 'role', None)
                    if role in ("user", "model") and getattr(msg, 'parts', None):
                        clean_history.append(msg)
                if not clean_history:
                    clean_history = None
            del _SESSIONS[session_id]

        contents = [effective_prompt] if effective_prompt else []
        new_images_attached = 0
        images_reused = False

        if pil_images:
            if _LAST_IMAGE_HASH.get(session_id) != image_hash:
                contents.extend(pil_images)
                _LAST_IMAGE_HASH[session_id] = image_hash
                new_images_attached = len(pil_images)
            else:
                images_reused = True

        if not contents:
            contents = ["Analyze this run."]

        force_ipv4 = bool(settings_dict.get("force_ipv4", False))
        response = None
        last_error = None

        for idx, active_key in enumerate(available_keys):
            client_key = f"{session_id}_{active_key[:8]}"
            client = get_or_create_client(active_key, client_key)

            # Check if an existing session has a dead/closed client and purge it
            if session_id in _SESSIONS:
                session_client = getattr(_SESSIONS[session_id], '_client', None)
                if session_client and is_client_closed(session_client):
                    del _SESSIONS[session_id]

            if session_id not in _SESSIONS:
                _SESSIONS[session_id] = client.chats.create(
                    model=model_name,
                    config=generation_config,
                    history=clean_history
                )
            chat_session = _SESSIONS[session_id]

            try:
                response = cls._run_with_interrupt_check(
                    chat_session.send_message,
                    contents,
                    force_ipv4=force_ipv4
                )
                break
            except (comfy.model_management.InterruptProcessingException, KeyboardInterrupt):
                if session_id in _SESSIONS:
                    del _SESSIONS[session_id]
                raise
            except Exception as ex:
                last_error = ex
                if is_retryable_error(ex):
                    # Purge dead sessions and clients so the retry starts with a fresh connection
                    if session_id in _SESSIONS:
                        del _SESSIONS[session_id]
                    if client_key in _CLIENTS:
                        del _CLIENTS[client_key]

                    if idx < len(available_keys) - 1:
                        print(f"[Gemini Node] Workflow: Key #{idx+1} error ({ex}). Retrying with Key #{idx+2}...")
                        continue
                    else:
                        # If on the last key and it was a closed client, do one immediate fresh retry
                        if "client has been closed" in str(ex).lower():
                            fresh_client = get_or_create_client(active_key, client_key)
                            _SESSIONS[session_id] = fresh_client.chats.create(
                                model=model_name,
                                config=generation_config,
                                history=clean_history
                            )
                            response = cls._run_with_interrupt_check(
                                _SESSIONS[session_id].send_message,
                                contents,
                                force_ipv4=force_ipv4
                            )
                            break
                        return io.NodeOutput(f"Gemini API Error: {str(ex)}")
                else:
                    return io.NodeOutput(f"Gemini API Error: {str(ex)}")

        if response is None:
            return io.NodeOutput(f"Gemini API Error: {str(last_error or 'All keys failed.')}", session_id)

        final_text, thoughts = extract_response_parts(response)
        output_tuple = (final_text, thoughts)
        _RESPONSE_CACHE[session_id] = {"hash": current_input_hash, "output": output_tuple}

        return io.NodeOutput(
            final_text,
            session_id,
            ui={"workflow_chat": [{
                "session_id": session_id,
                "prompt": effective_prompt or "(Workflow trigger)", 
                "images_count": new_images_attached,
                "images_reused": images_reused,
                "total_images": len(pil_images),
                "text": final_text, 
                "thoughts": thoughts
            }]}
        )

    @classmethod
    def _run_with_interrupt_check(cls, func, *args, force_ipv4: bool = False, **kwargs):
        comfy.model_management.throw_exception_if_processing_interrupted()
        executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)

        # Wrap the function so the worker thread runs inside the IPv4 context
        def thread_runner():
            with force_ipv4_context(force_ipv4):
                return func(*args, **kwargs)

        future = executor.submit(thread_runner)

        try:
            while True:
                try:
                    return future.result(timeout=0.1)
                except concurrent.futures.TimeoutError:
                    if comfy.model_management.processing_interrupted():
                        executor.shutdown(wait=False, cancel_futures=True)
                        comfy.model_management.throw_exception_if_processing_interrupted()
        finally:
            executor.shutdown(wait=False)