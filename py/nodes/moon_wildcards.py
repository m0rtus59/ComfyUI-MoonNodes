import os
import re
import random
import shutil

def _ensure_wildcards_dir() -> str:
    """
    Finds wildcards/ directory. Copies files from wildcards/.example/ if missing.
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    wildcards_dir = os.path.join(base_dir, "wildcards")
    example_dir = os.path.join(wildcards_dir, ".example")

    os.makedirs(wildcards_dir, exist_ok=True)

    # Copy defaults from .example/ to wildcards/ if .txt file doesn't exist yet
    if os.path.exists(example_dir):
        for file in os.listdir(example_dir):
            if file.endswith(".txt") and not file.startswith("."):
                target_txt = os.path.join(wildcards_dir, file)
                example_txt = os.path.join(example_dir, file)
                if not os.path.exists(target_txt):
                    try:
                        shutil.copyfile(example_txt, target_txt)
                    except Exception as e:
                        print(f"MoonNodes [Wildcards]: Failed to copy {file} from .example: {e}")

    return wildcards_dir

def load_wildcard_files() -> dict[str, list[str]]:
    """Scans wildcards/ directory for .txt files (skipping hidden folders) and returns 'name' -> list of lines."""
    wildcards_dir = _ensure_wildcards_dir()
    wildcards = {}
    if os.path.exists(wildcards_dir):
        for root, dirs, files in os.walk(wildcards_dir):
            # Exclude hidden directories (like .example or .git)
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for file in files:
                if file.endswith(".txt") and not file.startswith("."):
                    rel_path = os.path.relpath(os.path.join(root, file), wildcards_dir)
                    key = os.path.splitext(rel_path)[0].replace("\\", "/").lower()
                    file_path = os.path.join(root, file)
                    try:
                        with open(file_path, "r", encoding="utf-8") as f:
                            lines = [
                                line.strip() for line in f.readlines()
                                if line.strip() and not line.strip().startswith("#")
                            ]
                            if lines:
                                wildcards[key] = lines
                    except Exception as e:
                        print(f"MoonNodes [Wildcards]: Error reading {file_path}: {e}")
    return wildcards

def generate_node_description() -> str:
    """Generates description text displayed on hover tooltip."""
    wildcards = load_wildcard_files()
    desc_lines = ["Resolves [wildcard] or __wildcard__ tokens using a seed.\n", "Available Wildcards:"]
    if not wildcards:
        desc_lines.append(" (No .txt files found in wildcards/ directory)")
    else:
        for key, lines in sorted(wildcards.items()):
            desc_lines.append(f" • [{key}] → {len(lines)} items")
    return "\n".join(desc_lines)


class MoonSimpleWildcards:
    """
    Moon Simple Wildcards: Resolves [wildcard] or __wildcard__ tokens deterministically using a seed.
    """
    DESCRIPTION = generate_node_description()

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "text": ("STRING", {
                    "multiline": True,
                    "default": "A [color] shirt, [clothes], in a [background]",
                    "dynamicPrompts": False
                }),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "process"
    CATEGORY = "MoonNodes"

    def process(self, text: str, seed: int):
        rng = random.Random(seed)
        wildcards = load_wildcard_files()

        pattern = re.compile(r"\[([a-zA-Z0-9_\-\/]+)\]|__([a-zA-Z0-9_\-\/]+)__")

        current_text = text
        for _ in range(5):
            matches = list(pattern.finditer(current_text))
            if not matches:
                break

            new_text = ""
            last_idx = 0
            for m in matches:
                tag = m.group(1) if m.group(1) is not None else m.group(2)
                key = tag.lower()
                new_text += current_text[last_idx:m.start()]

                if key in wildcards:
                    chosen = rng.choice(wildcards[key])
                    new_text += chosen
                else:
                    new_text += m.group(0)

                last_idx = m.end()

            new_text += current_text[last_idx:]

            if new_text == current_text:
                break
            current_text = new_text

        return (current_text,)