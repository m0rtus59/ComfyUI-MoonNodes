import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "MoonNodes.ClearText",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "ClearableTextInput") {
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                onExecuted?.apply(this, arguments);
                const textWidget = this.widgets.find((w) => w.name === "text");
                if (textWidget) {
                    textWidget.value = "";
                    if (textWidget.callback) textWidget.callback("");
                    this.setDirtyCanvas(true);
                }
            };
        }
    },
});