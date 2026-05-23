# ComfyUI-MoonNodes 🌗

⚠️ATTENTION: This repo is 100% machine generated⚠️ It works fine, but it may get better. If you have the improvement ideas, please welcome to the pull requests.

These nodes are primarily built for multi-area regional prompting without turning your workspace into an unreadable bowl of noodle spaghetti.

The core attention patching (`attention_couple.py`) is built upon [MultiMaskCouple](https://github.com/tumbowungus/MultiMaskCouple), which itself is built upon [ComfyCouple](https://github.com/rei-koshka/ComfyUI-ComfyCouple). The greedy text encoding feature is inspired by the regional prompter from [Omost](https://github.com/lllyasviel/Omost) via [ComfyUI_omost](https://github.com/huchenlei/ComfyUI_omost).

### 🎨 Regional Prompting & Masking Nodes

* **Moon Indexed Encoder:** Allows you to encode multiple prompts for different areas using a single text box separated by the `BREAK` keyword.
* Includes a `greedy` toggle: When enabled, it efficiently packs comma-separated subprompts into 77-token blocks to maximize CLIP encoding efficiency.


* **Moon Regional Sampler:** The central hub that links your masks and encoded prompts to the model.
* Supports choosing between `Concat` or `Merge` for area prompts.
* Features a `head_start_percent` parameter. This isolates self-attention for the first X% of the generation steps, preventing the visual features of different prompt areas from bleeding into each other.


* **Moon Mask Maker Simple:** A quick, string-based mask generator. You can define prompt zones just by typing a simple number grid
<img width="1485" height="1182" alt="workflow (3)" src="https://github.com/user-attachments/assets/f7fc0f1a-0f89-49c5-add1-ec0d9900c124" />

* **Moon Mask Maker GUI:** An interactive, pop-up drawing workspace directly inside the node (right click the node to open GUI).
<img width="647" height="588" alt="image" src="https://github.com/user-attachments/assets/c0064859-acbe-41f5-8617-6601da251284" />

* Supports adding multiple distinct layers.
* Features the ability to disable/enable zone overlapping.
* Outputs a neat batch of masks ready for the regional sampler.
* Controls: use up/down keys to switch layers.



### 🤖 Gemini API Utilities

* **Gemini Persistent Chat:** A native connection to the Google Gemini API.
* Maintains conversation history tied to the current `seed` (so you can have actual persistent chats without resetting context).
* Supports multimodal inputs (feed it image tensors directly from your workflow).
* Reads from a local `models.txt` file (edit this file to add/update your Gemini models).


* **Clearable Text Input:** A simple text string node that automatically wipes its text box clean immediately upon execution. Designed to be used as the prompt input for the Gemini chat node so you don't have to manually delete your last message every time.
