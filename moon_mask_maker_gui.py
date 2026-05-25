import os
import torch
import numpy as np
from PIL import Image
import base64
import json
from io import BytesIO
from server import PromptServer
from aiohttp import web
import folder_paths
import time

# Custom API endpoint to receive Base64 painting streams from the frontend browser
@PromptServer.instance.routes.post("/moon/save_masks")
async def save_masks(request):
    post = await request.json()
    
    # SECURITY FIX: Strictly sanitize the incoming node_id to prevent directory traversal attacks (e.g. "../")
    node_id = str(post.get("node_id", ""))
    node_id = "".join(c for c in node_id if c.isalnum() or c in "-_")
    if not node_id:
        return web.json_response({"error": "Invalid node ID"}, status=400)
    
    layers = post.get("layers", [])           # Computed masks (Grayscale L)
    raw_layers = post.get("raw_layers", [])   # Raw strokes (RGBA transparent)
    settings = post.get("settings", [])       # Checkbox settings
    preview_b64 = post.get("preview", "")
    
    input_dir = folder_paths.get_input_directory()
    filenames = []
    raw_filenames = []
    
    # Generate a unique timestamp to completely bust ComfyUI's aggressive caching
    timestamp = int(time.time() * 1000)
    
    # Clean up old masks & previews for this specific node ID to prevent hard drive bloating
    for f in os.listdir(input_dir):
        if f.startswith(f"moon_mask_{node_id}_") or f.startswith(f"moon_mask_raw_{node_id}_") or f.startswith(f"moon_mask_preview_{node_id}_"):
            try:
                os.remove(os.path.join(input_dir, f))
            except OSError:
                pass

    # Save COMPUTED masks (Black/White - For ComfyUI Tensors)
    for idx, b64_data in enumerate(layers):
        if "," in b64_data: 
            b64_data = b64_data.split(",")[1]
        img_data = base64.b64decode(b64_data)
        img = Image.open(BytesIO(img_data)).convert("L") 
        filename = f"moon_mask_{node_id}_{idx}_{timestamp}.png"
        img.save(os.path.join(input_dir, filename))
        filenames.append(filename)
        
    # Save RAW masks (Transparent RGBA - For GUI Restoring)
    for idx, b64_data in enumerate(raw_layers):
        if "," in b64_data: 
            b64_data = b64_data.split(",")[1]
        img_data = base64.b64decode(b64_data)
        img = Image.open(BytesIO(img_data)).convert("RGBA") 
        raw_filename = f"moon_mask_raw_{node_id}_{idx}_{timestamp}.png"
        img.save(os.path.join(input_dir, raw_filename))
        raw_filenames.append(raw_filename)

    # Save the composed preview thumbnail with a timestamp
    if preview_b64:
        if "," in preview_b64: 
            preview_b64 = preview_b64.split(",")[1]
        preview_data = base64.b64decode(preview_b64)
        preview_img = Image.open(BytesIO(preview_data)).convert("RGB")
        preview_filename = f"moon_mask_preview_{node_id}_{timestamp}.png"
        preview_filepath = os.path.join(input_dir, preview_filename)
        preview_img.save(preview_filepath)
        
    # Corrected: Return the complete dictionary structure so JS and load_masks work correctly
    return web.json_response({
        "computed": filenames,
        "raw": raw_filenames,
        "settings": settings
    })


class MoonMaskMakerGUI:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mask_names": ("STRING", {"default": "[]", "multiline": True}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID", 
            }
        }

    RETURN_TYPES = ("MASK",)
    FUNCTION = "load_masks"
    OUTPUT_IS_LIST = (True,)
    CATEGORY = "MoonNodes"
    OUTPUT_NODE = True 

    @classmethod
    def IS_CHANGED(s, mask_names, unique_id):
        # Guarantee ComfyUI re-evaluates if the JSON string updates
        return mask_names

    def load_masks(self, mask_names, unique_id):
        input_dir = folder_paths.get_input_directory()
        
        try:
            data = json.loads(mask_names)
            # Parse the new JSON format, fallback to standard array for backward compatibility
            filenames = data.get("computed", []) if isinstance(data, dict) else data
        except:
            filenames = []
            
        mask_tensors = []
        
        # Read files and pack them into our [N, H, W] tensor batch
        for f in filenames:
            filepath = os.path.join(input_dir, f)
            if os.path.exists(filepath):
                img = Image.open(filepath).convert("L")
                mask_np = (np.array(img) > 10).astype(np.float32)
                mask_tensor = torch.from_numpy(mask_np)
                mask_tensors.append(mask_tensor)
        
        # Dynamically find the current timestamped preview image for this node
        ui_images = []
        for f in os.listdir(input_dir):
            if f.startswith(f"moon_mask_preview_{unique_id}_"):
                ui_images = [{"filename": f, "type": "input"}]
                break

        if not mask_tensors:
            return {
                "ui": {"images": ui_images},
                "result": (torch.zeros((1, 512, 512), dtype=torch.float32),)
            }
            
        return {
            "ui": {"images": ui_images},
            "result": (torch.stack(mask_tensors, dim=0),)
        }