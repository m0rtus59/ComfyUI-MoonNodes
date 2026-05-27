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
                # Hidden widget to pass trigger state from JS to Python
                "trigger_state": ("BOOLEAN", {"default": False, "label_on": "triggered", "label_off": "idle"}),
            }
        }
    
    RETURN_TYPES = ("STRING", "BOOLEAN")
    RETURN_NAMES = ("text", "trigger")
    FUNCTION = "process"
    CATEGORY = "MoonNodes"
    OUTPUT_NODE = True
    
    def process(self, text, auto_clear, trigger_state):
        # We pass both states back to UI so JS knows whether to clear the input
        return {
            "ui": {
                "trigger_state": [trigger_state],
                "auto_clear": [auto_clear]
            }, 
            "result": (text, trigger_state)
        }


class MoonQuickstart:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                # Renamed to "value" to bypass ComfyUI's automatic seed-formatting extensions
                "value": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
            }
        }
    
    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("value",)
    FUNCTION = "process"
    CATEGORY = "MoonNodes"
    
    def process(self, value):
        # Outputs the constant value downstream
        return (value,)