class MoonMarkdownOutput:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                # ForceInput ensures it only accepts a link from another text output
                "text": ("STRING", {"forceInput": True}),
            }
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "render"
    CATEGORY = "MoonNodes"
    OUTPUT_NODE = True

    def render(self, text):
        # Return both the execution result and the UI event payload
        return {"ui": {"text": [text]}, "result": (text,)}