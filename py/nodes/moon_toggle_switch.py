# Wildcard type that matches any data type (IMAGE, MODEL, LATENT, STRING, etc.)
class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False

ANY = AnyType("*")

class MoonToggleSwitch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "selected_index": ("INT", {"default": 0, "min": 0, "max": 64, "step": 1}),
            },
            "optional": {
                # Exactly 2 inputs by default (NOT 3)
                "input_1": (ANY,),
                "input_2": (ANY,),
            }
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("output",)
    FUNCTION = "route_data"
    CATEGORY = "MoonNodes/Logic"

    def route_data(self, selected_index=0, **kwargs):
        connected_keys = sorted(
            [k for k in kwargs.keys() if k.startswith("input_")],
            key=lambda k: int(k.split("_")[1]) if k.split("_")[1].isdigit() else 999
        )

        target_key = f"input_{selected_index + 1}"
        if target_key in kwargs:
            return (kwargs[target_key],)

        if 0 <= selected_index < len(connected_keys):
            return (kwargs[connected_keys[selected_index]],)

        return (None,)