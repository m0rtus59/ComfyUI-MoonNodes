import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "MoonNodes.LLMInputs",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "ClearableTextInput") {
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                onExecuted?.apply(this, arguments);
                const textWidget = this.widgets?.find((w) => w.name === "text");
                if (textWidget) {
                    textWidget.value = "";
                    if (textWidget._state) textWidget._state.value = "";
                    if (typeof textWidget.callback === "function") textWidget.callback("");
                    if (typeof this.setDirtyCanvas === "function") this.setDirtyCanvas(true);
                }
            };
        }
        
        if (nodeData.name === "LLMSubmitInput") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);
                
                const triggerWidget = this.widgets?.find((w) => w.name === "trigger_state");
                if (triggerWidget) {
                    triggerWidget.type = "converted-widget";
                    triggerWidget.computeSize = () => [0, -4];
                    if (triggerWidget.inputEl) triggerWidget.inputEl.style.display = "none";
                }
                
                this.addWidget("button", "Submit Prompt", null, (val, canvas, targetNode) => {
                    const node = targetNode || this;
                    const tw = node.widgets?.find((w) => w.name === "trigger_state");
                    if (tw) {
                        tw.value = true;
                        if (tw._state) tw._state.value = true;
                    }
                    app.queuePrompt(0);
                });
            };

            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                onExecuted?.apply(this, arguments);
                const triggered = message?.trigger_state?.[0];
                const autoClear = message?.auto_clear?.[0] !== false;
                
                if (triggered) {
                    const tw = this.widgets?.find((w) => w.name === "trigger_state");
                    if (tw) {
                        tw.value = false;
                        if (tw._state) tw._state.value = false;
                    }
                    if (autoClear) {
                        const textWidget = this.widgets?.find((w) => w.name === "text");
                        if (textWidget) {
                            textWidget.value = "";
                            if (textWidget._state) textWidget._state.value = "";
                            if (typeof textWidget.callback === "function") textWidget.callback("");
                        }
                    }
                    if (typeof this.setDirtyCanvas === "function") this.setDirtyCanvas(true);
                }
            };
        }
    },
});