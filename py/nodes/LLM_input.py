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


class LLMSubmitInput:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "text": ("STRING", {"multiline": True, "default": ""}),
                "auto_clear": ("BOOLEAN", {"default": True}),
                "trigger_state": ("BOOLEAN", {"default": False, "label_on": "triggered", "label_off": "idle"}),
            }
        }
    
    RETURN_TYPES = ("STRING", "BOOLEAN")
    RETURN_NAMES = ("text", "trigger")
    FUNCTION = "process"
    CATEGORY = "MoonNodes"
    OUTPUT_NODE = True
    
    def process(self, text, auto_clear, trigger_state):
        return {
            "ui": {
                "trigger_state": [trigger_state],
                "auto_clear": [auto_clear]
            }, 
            "result": (text, trigger_state)
        }