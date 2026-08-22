# ComfyUI-MoonNodes 🌗

A collection of ComfyUI nodes focused mainly on regional prompting, masking, sampling utilities, and workflow conveniences.

> ⚠️ **Note:** This repository was developed collaboratively with AI. While it is fully functional and has been tested, there is always room for optimization. If you have ideas for improvements, contributions via Pull Requests are highly welcome!

The regional attention patching in `attention_couple.py` is based on [MultiMaskCouple](https://github.com/tumbowungus/MultiMaskCouple), which in turn is based on [ComfyCouple](https://github.com/rei-koshka/ComfyUI-ComfyCouple). The greedy text encoding feature was inspired by the regional prompter in [Omost](https://github.com/lllyasviel/Omost), via [ComfyUI_omost](https://github.com/huchenlei/ComfyUI_omost).

---

## 🛠️ Installation

### ComfyUI Manager

Search for `ComfyUI-MoonNodes` in ComfyUI Manager and install it from there.

### Manual installation

From your ComfyUI `custom_nodes` directory:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/m0rtus59/ComfyUI-MoonNodes.git
cd ComfyUI-MoonNodes
pip install -r requirements.txt
```

Restart ComfyUI after installation.

---

## 🎨 Regional Prompting & Masking

### 1. **Moon Indexed Encoder**

Encodes multiple regional prompts from a single text box. Separate prompts with the `BREAK` keyword:

```text
general prompt goes here
BREAK
prompt for the area 0 goes here
BREAK
prompt for the area 1 goes here
BREAK
prompt for the area 2 goes here
```

The `greedy` toggle enables greedy token packing for comma-separated subprompts, allowing them to be packed efficiently into 77-token CLIP blocks instead of being truncated unnecessarily.

<img width="3390" height="1245" alt="workflow (5)" src="https://github.com/user-attachments/assets/6c3b779c-ed43-4b5e-a8e7-7792a62b9dd3" />

### 2. **Moon Regional Sampler**

Connects regional masks and encoded prompts to the model.

* **`mode`**: `Concat` appends regional prompts to the base prompt, while `Merge` blends the regional attention maps.
* **`head_start_percent`**: Limits self-attention (`attn1`) during the first part of the generation. This helps prevent features from different regions from bleeding into each other during the initial layout phase.

### 3. **Anima Regional Patcher**

Regional prompting support for Anima models.

It works similarly to the SDXL regional prompting workflow. See the `workflows` directory for examples.

Inspired by [Comfyui-Anima-Regional-Conditioning](https://github.com/Sen-sou/Comfyui-Anima-Regional-Conditioning).

### 4. **Anima Regional Patcher Advanced**

An extended version of the Anima Regional Patcher for more advanced regional prompting workflows.

### 5. **Moon Mask Maker Simple**

A simple string-based mask generator. Define the layout by entering a grid of region numbers.

<img width="1485" height="1182" alt="workflow (3)" src="https://github.com/user-attachments/assets/f7fc0f1a-0f89-49c5-add1-ec0d9900c124" />

### 6. **Moon Mask Maker GUI**

An interactive mask editor built directly into the node.

* **Edit Masks**: Open the editor from the node or its context menu.
* **Reference Image**: Load an image as a non-destructive underlay. Adjust opacity and use `contain`, `cover`, or `stretch` modes.
* **Use Reference Size**: Set the canvas to the reference image's native aspect ratio.
* **Canvas Size**: Set width and height independently in the editor.
* **Layers**: Create multiple mask layers. Inactive layers are displayed semi-transparently while editing.
* **Subtract**: Remove the occupied area of an upper layer from the layers beneath it without modifying the original editable strokes.
* **Node Preview**: Displays a multi-colored preview of the current mask layout directly on the node.
* **Outputs**: Provides an indexed `MASK` list, a colored `IMAGE` preview, and the authoritative canvas `width` and `height`.
* **Background**: Choose black or white for the composite image. White can be useful for Regional ControlNet conditioning.
* **Downstream sizing**: Connect the `width` and `height` outputs to the latent-size node used by the workflow. The editor's dimensions are the source of truth.

Controls:

* **Left Click + Drag**: Draw.
* **Right Click + Drag**: Erase.
* **Arrow Up / Down**: Switch layers.
* **Down on the last layer**: Creates a new layer.

<img width="647" height="588" alt="image" src="https://github.com/user-attachments/assets/c0064859-acbe-41f5-8617-6601da251284" />

### 7. **Moon Multi-Pass Sampler** *(Experiment)*

An all-in-one alternative to ComfyUI's standard `KSampler` for multi-pass regional generation.

The sampler alternates between isolated regional denoising and global denoising:

* **Isolated steps**: Each masked region and the background are denoised separately for one step using their respective prompts, then composited back into the latent.
* **Global steps**: The complete canvas is denoised together using the regional attention patcher to keep the composition, lighting, and boundaries coherent.
* **`local_pass_percent`**: Controls how much of the generation uses the alternating isolated/global process.
* **Dynamic seed offsetting**: During isolated passes, the seed is offset by the current step to avoid repeatedly injecting the same noise.
* **No downstream KSampler required**: Connect the input latent and send the output directly to `VAE Decode`.

<img width="3345" height="1374" alt="workflow (6)" src="https://github.com/user-attachments/assets/93f60d0f-e8da-406f-bfbe-8efc49760ddd" />

---

## 🤖 Gemini API Utilities

### 1. **Gemini Persistent Chat**

A native connection to the Google Gemini API.

* **Persistent conversations**: Conversation history is associated with the current `seed`.
* **Multimodal input**: Image tensors can be passed directly from the workflow.
* **Custom models**: Available Gemini models are read from a local `models.txt` file.

### 2. **Clearable Text Input**

A text input node that clears its contents after execution.

Useful as the prompt input for the Gemini chat node when you don't want to manually remove the previous message each time.

### 3. **LLM Submit Input**

A multi-line text input designed for manually submitting prompts to an LLM workflow.

* **Submit Prompt**: Sends the text downstream and queues the workflow.
* **Auto-Clear**: Clears the input after a successful execution. Enabled by default.
* **Selective Execution**: Normal queue runs from ComfyUI's main sidebar execute the workflow without submitting the text to the LLM. Connect the `trigger` output to the `enable_ai_processing` input to control this behavior.

### 4. **Markdown Output**

Displays markdown-formatted text, such as output generated by Gemini.

<img width="1826" height="1101" alt="image" src="https://github.com/user-attachments/assets/9d7b5432-b7bd-4ef9-a3a2-03cb67f302de" />

---

## 🛠️ Other Tools

### **Moon Simple Wildcards**

A lightweight, seed-deterministic wildcard prompt generator.

* **Syntax**: Use `[wildcard]` or `__wildcard__` in prompt text.
* **Nested wildcards**: Supported.
* **Custom wildcards**: Add your own `.txt` files to the `wildcards/` directory. Subdirectories are supported, for example `[folder/name]`.

### **Quickstart**

A compact seed and queue controller.

The node generates a random integer seed and queues the workflow when clicked.

### **Quickstart Advanced**

An expanded Quickstart node that lets you pick image resolutions and aspect ratios.

---

## 🔒 Security & Sandboxing

The mask editor exposes a custom `/moon/save_masks` route so the browser-based editor can communicate with the ComfyUI backend.

The route is designed to restrict what can be written to disk:

* **Input sanitization**: `node_id` is restricted to alphanumeric characters plus `-` and `_`, preventing path traversal attempts.
* **No arbitrary file writes**: Uploaded image data is processed through Pillow and re-encoded as PNG rather than being written directly to disk.
* **Sandboxed output**: Generated files and previews are stored inside ComfyUI's designated input directory.

---
