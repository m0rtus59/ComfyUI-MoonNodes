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


def image_to_tensor(img):
    image_np = np.asarray(img.convert("RGB"), dtype=np.float32) / 255.0
    return torch.from_numpy(image_np).unsqueeze(0)


def load_embedded_or_input_image(value, input_dir, mode):
    if not isinstance(value, str) or not value:
        return None
    if value.startswith("data:image"):
        return base64_to_image(value, mode=mode)

    if os.path.basename(value) != value:
        return None
    filepath = os.path.join(input_dir, value)
    if os.path.isfile(filepath):
        return Image.open(filepath).convert(mode)
    return None

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
    try:
        canvas_width = int(post.get("canvas_width", 512))
        canvas_height = int(post.get("canvas_height", 512))
    except (TypeError, ValueError):
        return web.json_response({"error": "Canvas dimensions must be integers."}, status=400)

    if not (64 <= canvas_width <= 4096 and 64 <= canvas_height <= 4096):
        return web.json_response({"error": "Canvas dimensions must be between 64 and 4096 pixels."}, status=400)
    
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
        "preview": preview_filename,
        "composite": preview_filename,
        "canvas_width": canvas_width,
        "canvas_height": canvas_height,
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

    RETURN_TYPES = ("MASK", "IMAGE", "INT", "INT")
    RETURN_NAMES = ("masks", "composite", "width", "height")
    FUNCTION = "load_masks"
    OUTPUT_IS_LIST = (True, False, False, False)
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
            composite_data = data.get("composite", data.get("preview", "")) if isinstance(data, dict) else ""
            declared_width = data.get("canvas_width") if isinstance(data, dict) else None
            declared_height = data.get("canvas_height") if isinstance(data, dict) else None
        except Exception:
            items = []
            composite_data = ""
            declared_width = None
            declared_height = None

        mask_images = []
        for item in items:
            img = load_embedded_or_input_image(item, input_dir, "L")
            if img is not None:
                mask_images.append(img)

        composite_img = load_embedded_or_input_image(composite_data, input_dir, "RGB")

        try:
            target_size = (int(declared_width), int(declared_height))
        except (TypeError, ValueError):
            if mask_images:
                target_size = mask_images[0].size
            elif composite_img is not None:
                target_size = composite_img.size
            else:
                target_size = (512, 512)

        if not all(64 <= dimension <= 4096 for dimension in target_size):
            raise ValueError("Canvas dimensions must be between 64 and 4096 pixels.")

        mask_tensors = []
        for img in mask_images:
            if img.size != target_size:
                img = img.resize(target_size, Image.Resampling.NEAREST)
            mask_np = np.asarray(img, dtype=np.float32) / 255.0
            mask_tensors.append(torch.from_numpy(mask_np))

        preview_filename = f"moon_mask_preview_{unique_id}.png"
        preview_filepath = os.path.join(input_dir, preview_filename)
        
        if composite_data and composite_data.startswith("data:image"):
            try:
                p_img = base64_to_image(composite_data, mode="RGB")
                p_img.save(preview_filepath)
            except Exception:
                pass

        ui_images = []
        if os.path.exists(preview_filepath):
            ui_images = [{"filename": preview_filename, "type": "input", "subfolder": ""}]

        if composite_img is None:
            composite_img = Image.new("RGB", target_size, color=(0, 0, 0))
        elif composite_img.size != target_size:
            composite_img = composite_img.resize(target_size, Image.Resampling.NEAREST)

        if not mask_tensors:
            mask_tensors = [torch.zeros((target_size[1], target_size[0]), dtype=torch.float32)]

        return {
            "ui": {"images": ui_images},
            "result": (
                torch.stack(mask_tensors, dim=0),
                image_to_tensor(composite_img),
                target_size[0],
                target_size[1],
            )
        }
