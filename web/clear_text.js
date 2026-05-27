import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "MoonNodes.LLMInput",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Extension for ClearableTextInput
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
        
        // Extension for LLMSubmitInput
        if (nodeData.name === "LLMSubmitInput") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);
                
                // Hide the trigger_state widget
                const triggerWidget = this.widgets.find((w) => w.name === "trigger_state");
                if (triggerWidget) {
                    triggerWidget.type = "converted-widget";
                    triggerWidget.computeSize = () => [0, -4];
                    if (triggerWidget.inputEl) {
                        triggerWidget.inputEl.style.display = "none";
                    }
                }
                
                // Add the Submit button
                this.addWidget("button", "Submit Prompt", null, () => {
                    const triggerWidget = this.widgets.find((w) => w.name === "trigger_state");
                    if (triggerWidget) {
                        triggerWidget.value = true;
                    }
                    app.queuePrompt(0);
                });
            };

            // Reset state and clear input based on execution results
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                onExecuted?.apply(this, arguments);
                
                const triggered = message?.trigger_state?.[0];
                const autoClear = message?.auto_clear?.[0] !== false;
                
                if (triggered) {
                    const triggerWidget = this.widgets.find((w) => w.name === "trigger_state");
                    if (triggerWidget) {
                        triggerWidget.value = false;
                    }
                    if (autoClear) {
                        const textWidget = this.widgets.find((w) => w.name === "text");
                        if (textWidget) {
                            textWidget.value = "";
                            if (textWidget.callback) textWidget.callback("");
                        }
                    }
                    this.setDirtyCanvas(true);
                }
            };
        }

        // Extension for MoonQuickstart (🎲 Quickstart)
        if (nodeData.name === "MoonQuickstart") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);
                
                // Hide the "value" widget completely to keep layout perfectly clean
                const valueWidget = this.widgets.find((w) => w.name === "value");
                if (valueWidget) {
                    valueWidget.type = "converted-widget";
                    valueWidget.computeSize = () => [0, -4];
                    if (valueWidget.inputEl) {
                        valueWidget.inputEl.style.display = "none";
                    }
                }
                
                // Add the custom button displaying only the current numeric value
                const initialValue = valueWidget ? valueWidget.value : 0;
                const restartBtn = this.addWidget("button", String(initialValue), null, () => {
                    // Safe 53-bit random integer generator
                    const newValue = Math.floor(Math.random() * 9007199254740991);
                    if (valueWidget) {
                        valueWidget.value = newValue;
                    }
                    restartBtn.name = String(newValue);
                    this.setDirtyCanvas(true);
                    
                    // Fire the queue prompt immediately to reset/restart the session
                    app.queuePrompt(0);
                });
                this.restartBtn = restartBtn;
            };

            // Restore the correct numeric value onto the button name when loading/configuring
            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function (info) {
                onConfigure?.apply(this, arguments);
                const valueWidget = this.widgets.find((w) => w.name === "value");
                if (valueWidget && this.restartBtn) {
                    this.restartBtn.name = String(valueWidget.value);
                }
            };
        }
    },
});