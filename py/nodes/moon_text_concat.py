from comfy_api.latest import io

class MoonTextConcat(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        # Generate dynamic options from 2 up to 10 inputs
        dynamic_options = []
        for n in range(2, 11):
            sub_inputs = [
                io.String.Input(f"text_{i}", multiline=True, default="", tooltip=f"Text input {i}")
                for i in range(1, n + 1)
            ]
            dynamic_options.append(io.DynamicCombo.Option(str(n), sub_inputs))

        return io.Schema(
            node_id="MoonTextConcat",
            display_name="🌗 Moon Text Concat",
            category="MoonNodes/Text",
            inputs=[
                # Dropdown dynamically rebuilds the node with N native multiline fields at runtime
                io.DynamicCombo.Input(
                    "inputs",
                    options=dynamic_options,
                    tooltip="Select how many text fields to display on the node.",
                ),
            ],
            outputs=[
                io.String.Output(display_name="text"),
            ],
        )

    @classmethod
    def execute(cls, inputs: dict) -> io.NodeOutput:
        # ComfyUI passes all active inputs (both wired and typed) in the 'inputs' dictionary
        sorted_keys = sorted(
            [k for k in inputs.keys() if k.startswith("text_")],
            key=lambda k: int(k.split("_")[1]) if k.split("_")[1].isdigit() else 999
        )

        texts = []
        for k in sorted_keys:
            val = inputs.get(k)
            if val is not None and str(val) != "":
                # Converts literal \n or \t into real breaks, and preserves Enter keypresses
                str_val = str(val).replace("\\n", "\n").replace("\\t", "\t")
                texts.append(str_val)

        # Pure direct concatenation with no forced delimiters
        return io.NodeOutput("".join(texts))