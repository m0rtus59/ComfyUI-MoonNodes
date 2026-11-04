from comfy_api.latest import io

class MoonTextConcat(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        # Autogrow template: starts with 2 inputs and automatically creates a new one when connected
        autogrow_template = io.Autogrow.TemplatePrefix(
            io.MultiType.Input("text", [io.String, io.Int, io.Float, io.Boolean], tooltip="Connect text, integer, float, or boolean"),
            prefix="text",
            min=2,
            max=50,
        )

        return io.Schema(
            node_id="MoonTextConcat",
            display_name="🌗 Moon Text Concat",
            category="MoonNodes/Text",
            inputs=[
                io.Autogrow.Input("inputs", template=autogrow_template),
            ],
            outputs=[
                io.String.Output(display_name="text"),
            ],
        )

    @classmethod
    def execute(cls, inputs: io.Autogrow.Type) -> io.NodeOutput:
        texts = []

        # Autogrow passes connected values in order
        for val in inputs.values():
            if val is not None and str(val) != "":
                try:
                    # Converts numbers/booleans to text, converts literal \n or \t, and preserves line breaks
                    str_val = str(val).replace("\\n", "\n").replace("\\t", "\t")
                    texts.append(str_val)
                except Exception as e:
                    texts.append(f"[Error: {e}]")

        # Pure direct concatenation with no forced delimiters
        return io.NodeOutput("".join(texts))