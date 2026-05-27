# ComfyUI-MoonNodes 🌗

These nodes are primarily built for multi-area regional prompting without turning your workspace into an unreadable bowl of noodle spaghetti.

> ⚠️ **Note:** This repository was developed collaboratively with AI. While it is fully functional and has been tested, there is always room for optimization. If you have ideas for improvements, contributions via Pull Requests are highly welcome!

The core attention patching (`attention_couple.py`) is built upon [MultiMaskCouple](https://github.com/tumbowungus/MultiMaskCouple), which itself is built upon [ComfyCouple](https://github.com/rei-koshka/ComfyUI-ComfyCouple). The greedy text encoding feature is inspired by the regional prompter from [Omost](https://github.com/lllyasviel/Omost) via [ComfyUI_omost](https://github.com/huchenlei/ComfyUI_omost).

---

## 🛠️ Installation

To install this custom node pack, follow these steps:

1. Open your terminal, navigate to your ComfyUI custom nodes directory, and clone the repository:
   ```bash
   cd ComfyUI/custom_nodes
   git clone https://github.com/m0rtus59/ComfyUI-MoonNodes.git
   ```
2. Install the necessary dependencies (such as the Google Generative AI SDK for the Gemini nodes):
   ```bash
   cd ComfyUI-MoonNodes
   pip install -r requirements.txt
   ```
3. Restart ComfyUI.

---

## 🎨 Regional Prompting & Masking Nodes

### 1. **Moon Indexed Encoder**
Allows you to encode multiple prompts for different areas using a single text box separated by the `BREAK` keyword.
* **`greedy` Toggle:** When enabled, it uses greedy token-packing to efficiently group comma-separated subprompts into 77-token blocks to maximize CLIP encoding efficiency and prevent text truncation.
<img width="3390" height="1245" alt="workflow (5)" src="https://github.com/user-attachments/assets/6c3b779c-ed43-4b5e-a8e7-7792a62b9dd3" />


### 2. **Moon Regional Sampler**
The central hub that links your masks and encoded prompts to the model.
* **`mode` Selector:** Supports choosing between `Concat` (physically appends regional prompts to the base prompt) or `Merge` (blends attention maps) for area prompts.
* **`head_start_percent` Parameter:** Isolates self-attention (`attn1`) for the first X% of the generation steps. This prevents the physical features of different prompt areas from bleeding into each other during the early layout stages.

### 3. **Moon Mask Maker Simple**
A quick, string-based mask generator. You can define prompt zones just by typing a simple number grid.

<img width="1485" height="1182" alt="workflow (3)" src="https://github.com/user-attachments/assets/f7fc0f1a-0f89-49c5-add1-ec0d9900c124" />

### 4. **Moon Mask Maker GUI**
An interactive, pop-up drawing workspace directly inside the node.
* **Usage:** Right-click the node and select **"Open Painting GUI..."** to open the canvas.
* **Layer System:** Supports adding multiple distinct layers, with non-active layers shown semi-transparently so you can align your boundaries.
* **Non-Destructive Exclusion:** Features an `Allow Overlap` toggle. When disabled, layers automatically subtract from layers beneath them upon saving, while keeping your original shapes editable in the GUI.
* **Node Preview:** Displays a real-time, multi-colored preview of your layout directly on the node in your ComfyUI workspace.
* **Controls:** 
  * *Left Click + Drag:* Draw mask.
  * *Right Click + Drag:* Erase mask.
  * *Arrow Up / Down keys:* Switch layers (pressing Down on the last layer automatically creates a new one).

<img width="647" height="588" alt="image" src="https://github.com/user-attachments/assets/c0064859-acbe-41f5-8617-6601da251284" />

### 5. **Moon Multi-Pass Sampler** (Experiment)

A complete, all-in-one replacement for ComfyUI's standard `KSampler` designed to automate advanced multi-pass layout isolation and stitching natively inside a single node.

*   **How it works:** Instead of denoising the entire canvas together, it dynamically splits your generation into alternating phases of **Isolated Denoising** and **Global Harmonization** based on your settings.
    *   *Isolated Steps:* Denoises each masked region and the background separately by exactly 1 step under its own prompt, then composites them back onto the latent canvas.
    *   *Global Steps:* Denoises the entire canvas together using the core attention patcher to keep the composition, lighting, and borders perfectly cohesive.
*   **`local_pass_percent`:** Controls the percentage of total steps run in this alternating weave mode (e.g., at `0.20`, the first 20% of steps alternate, and the remaining 80% are finished as a unified global pass).
*   **Dynamic Seed Offsetting:** Automatically offsets the random seed step-by-step (`seed + current_step`) during isolation. This prevents the "Re-Seeding Trap" (constructive noise accumulation) and allows ancestral/stochastic samplers (like `euler_a` and `dpm++`) to converge cleanly.
*   **No Downstream KSampler Required:** Plug your `Empty Latent` into the node, and connect the `LATENT` output directly to your `VAE Decode`.
<img width="3345" height="1374" alt="workflow (6)" src="https://github.com/user-attachments/assets/93f60d0f-e8da-406f-bfbe-8efc49760ddd" />


---

## 🤖 Gemini API Utilities

### 1. **Gemini Persistent Chat**
A native connection to the Google Gemini API.
* **Persistence:** Maintains conversation history tied to the current `seed` (allowing actual persistent chats without resetting context).
* **Multimodal:** Supports multimodal inputs (you can feed image tensors directly from your workflow).
* **Custom Models:** Reads from a local `models.txt` file (you can edit this file to add/update your available Gemini models).

### 2. **Clearable Text Input**
A simple text string node that automatically wipes its text box clean immediately upon execution. Designed to be used as the prompt input for the Gemini chat node so you don't have to manually delete your last message every time.

### 3. **LLM Submit Input**
A specialized multi-line text input node designed for manual prompt dispatching.

  - Submit Prompt Button: Sends the text input downstream and instantly fires
    the ComfyUI execution queue.
  - Auto-Clear Toggle: When enabled (default), automatically clears the input
    text field after a successful queue execution. Disabling it leaves your
    prompt intact for further adjustments.
  - Selective Execution: Standard global queue runs (using ComfyUI's main
    sidebar) will process the workflow properly, but will not submit the query to the LLM (`trigger` output should be connected to the `enable_ai_processing` input, see the screenshot below).

### 4. **Markdown output**
A simple node to display the markdown structured output, such as Gemini AI output.
<img width="1826" height="1101" alt="image" src="https://github.com/user-attachments/assets/9d7b5432-b7bd-4ef9-a3a2-03cb67f302de" />

---
## 🛠️ Other tools

🎲 Quickstart

A compact conversation lifecycle controller that outputs a persistent
random integer (ideal for quick seeding, inspired by [ComfyUI-Easy-Use](https://github.com/yolain/ComfyUI-Easy-Use).

  - Minimalist Interface: One single button to quickly pick a random seed number and run the queue.
<img width="575" height="600" alt="image" src="https://github.com/user-attachments/assets/1027c227-86fa-4f6a-8256-5a9b6be14b83" />

---

## 🔒 Security & Sandboxing Rationale

This repository exposes a custom web route (`/moon/save_masks`) in `moon_mask_maker_gui.py` to allow the interactive painting GUI to communicate with the ComfyUI backend. The security architecture is designed to prevent remote code execution and directory traversal:

*   **Input Sanitization (No Directory Traversal):** The `node_id` parameter passed from the browser is strictly sanitized using alphanumeric-only filtering (`"".join(c for c in node_id if c.isalnum() or c in "-_")`). This prevents attackers from passing path traversal sequences (like `../`) to write files outside of ComfyUI's standard workspace.
*   **No Arbitrary File Writes:** The route does not save raw, arbitrary binary streams to disk. Instead, the uploaded Base64 image streams are passed through Pillow (`PIL.Image.open`), converted, and re-encoded from scratch using Pillow's native, compiled PNG encoder. This strictly sanitizes the files and strips out any malicious executable payloads or steganographic scripts.
*   **Sandboxed Directory:** All files and previews are strictly written inside ComfyUI's official, designated sandbox directory for temporary assets (`folder_paths.get_input_directory()`).
