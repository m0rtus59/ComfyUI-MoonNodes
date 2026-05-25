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

---

## 🤖 Gemini API Utilities

### 1. **Gemini Persistent Chat**
A native connection to the Google Gemini API.
* **Persistence:** Maintains conversation history tied to the current `seed` (allowing actual persistent chats without resetting context).
* **Multimodal:** Supports multimodal inputs (you can feed image tensors directly from your workflow).
* **Custom Models:** Reads from a local `models.txt` file (you can edit this file to add/update your available Gemini models).

### 2. **Clearable Text Input**
A simple text string node that automatically wipes its text box clean immediately upon execution. Designed to be used as the prompt input for the Gemini chat node so you don't have to manually delete your last message every time.

### 3. **Markdown output**
A simple node to display the markdown structured output, such as Gemini AI output.

---

## 🔒 Security & Sandboxing Rationale

This repository exposes a custom web route (`/moon/save_masks`) in `moon_mask_maker_gui.py` to allow the interactive painting GUI to communicate with the ComfyUI backend. The security architecture is designed to prevent remote code execution and directory traversal:

*   **Input Sanitization (No Directory Traversal):** The `node_id` parameter passed from the browser is strictly sanitized using alphanumeric-only filtering (`"".join(c for c in node_id if c.isalnum() or c in "-_")`). This prevents attackers from passing path traversal sequences (like `../`) to write files outside of ComfyUI's standard workspace.
*   **No Arbitrary File Writes:** The route does not save raw, arbitrary binary streams to disk. Instead, the uploaded Base64 image streams are passed through Pillow (`PIL.Image.open`), converted, and re-encoded from scratch using Pillow's native, compiled PNG encoder. This strictly sanitizes the files and strips out any malicious executable payloads or steganographic scripts.
*   **Sandboxed Directory:** All files and previews are strictly written inside ComfyUI's official, designated sandbox directory for temporary assets (`folder_paths.get_input_directory()`).