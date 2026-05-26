class ClearableTextInput:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {"text": ("STRING", {"multiline": True, "default": ""})}}
    
    RETURN_TYPES = ("STRING",)
    FUNCTION = "process"
    CATEGORY = "MoonNodes"
    OUTPUT_NODE = True
    
    def process(self, text):
        return {"ui": {"text": [text]}, "result": (text,)}