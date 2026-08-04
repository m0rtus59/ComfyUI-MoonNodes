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

def base64_to_image(b64_str, mode="L"):
    if "," in b64_str:
        b64_str = b64_str.split(",")[1]
    img_data = base64.b64decode(b64_str)
    return Image.open(BytesIO(img_data)).convert(mode)

@PromptServer.instance.routes.post("/moon/save_masks")
async def save_masks(request):
    post = await request.json()
    
    node_id = str(post.get("node_id", ""))
    node_id = "".join(c for c in node_id if c.isalnum() or c in "-_")
    if not node_id:
        return web.json_response({"error": "Invalid node ID"}, status=400)
    
    layers = post.get("layers", [])           
    raw_layers = post.get("raw_layers", [])   
    settings = post.get("settings", [])       
    preview_b64 = post.get("preview", "")
    
    input_dir = folder_paths.get_input_directory()
    filenames = []
    raw_filenames = []
    
    timestamp = int(time.time() * 1000)
    
    for f in os.listdir(input_dir):
        if f.startswith(f"moon_mask_{node_id}_") or f.startswith(f"moon_mask_raw_{node_id}_"):
            try:
                os.remove(os.path.join(input_dir, f))
            except OSError:
                pass

    for idx, b64_data in enumerate(layers):
        img = base64_to_image(b64_data, mode="L")
        filename = f"moon_mask_{node_id}_{idx}_{timestamp}.png"
        img.save(os.path.join(input_dir, filename))
        filenames.append(filename)
        
    for idx, b64_data in enumerate(raw_layers):
        img = base64_to_image(b64_data, mode="RGBA")
        raw_filename = f"moon_mask_raw_{node_id}_{idx}_{timestamp}.png"
        img.save(os.path.join(input_dir, raw_filename))
        raw_filenames.append(raw_filename)

    preview_filename = f"moon_mask_preview_{node_id}.png"
    if preview_b64:
        preview_img = base64_to_image(preview_b64, mode="RGB")
        preview_filepath = os.path.join(input_dir, preview_filename)
        preview_img.save(preview_filepath)
        
    return web.json_response({
        "computed": filenames,
        "raw": raw_filenames,
        "settings": settings,
        "preview": preview_filename
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
        return mask_names

    def load_masks(self, mask_names, unique_id):
        input_dir = folder_paths.get_input_directory()
        
        try:
            data = json.loads(mask_names)
            items = data.get("computed", []) if isinstance(data, dict) else data
            preview_data = data.get("preview", "") if isinstance(data, dict) else ""
        except Exception:
            items = []
            preview_data = ""
            
        mask_tensors = []
        
        for item in items:
            if isinstance(item, str) and item.startswith("data:image"):
                img = base64_to_image(item, mode="L")
                mask_np = np.array(img, dtype=np.float32) / 255.0
                mask_tensor = torch.from_numpy(mask_np)
                mask_tensors.append(mask_tensor)
            elif isinstance(item, str):
                filepath = os.path.join(input_dir, item)
                if os.path.exists(filepath):
                    img = Image.open(filepath).convert("L")
                    mask_np = np.array(img, dtype=np.float32) / 255.0
                    mask_tensor = torch.from_numpy(mask_np)
                    mask_tensors.append(mask_tensor)

        preview_filename = f"moon_mask_preview_{unique_id}.png"
        preview_filepath = os.path.join(input_dir, preview_filename)
        
        if preview_data and preview_data.startswith("data:image") and not os.path.exists(preview_filepath):
            try:
                p_img = base64_to_image(preview_data, mode="RGB")
                p_img.save(preview_filepath)
            except Exception:
                pass

        ui_images = []
        if os.path.exists(preview_filepath):
            ui_images = [{"filename": preview_filename, "type": "input", "subfolder": ""}]

        if not mask_tensors:
            return {
                "ui": {"images": ui_images},
                "result": (torch.zeros((1, 512, 512), dtype=torch.float32),)
            }
            
        # Ensure all mask tensors match target spatial dimensions
        target_shape = mask_tensors[0].shape[-2:]
        aligned_tensors = []
        for m in mask_tensors:
            if m.shape[-2:] != target_shape:
                m_4d = m.unsqueeze(0).unsqueeze(0)
                m_4d = torch.nn.functional.interpolate(m_4d, size=target_shape, mode="nearest")
                aligned_tensors.append(m_4d.squeeze())
            else:
                aligned_tensors.append(m)

        return {
            "ui": {"images": ui_images},
            "result": (torch.stack(aligned_tensors, dim=0),)
        }