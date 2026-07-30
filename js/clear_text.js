import { app } from "../../../scripts/app.js";

app.registerExtension({
    name: "MoonNodes.LLMInput",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        // Extension for ClearableTextInput
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
        
        // Extension for LLMSubmitInput
        if (nodeData.name === "LLMSubmitInput") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);
                
                // Hide trigger_state widget
                const triggerWidget = this.widgets?.find((w) => w.name === "trigger_state");
                if (triggerWidget) {
                    triggerWidget.type = "converted-widget";
                    triggerWidget.computeSize = () => [0, -4];
                    if (triggerWidget.inputEl) triggerWidget.inputEl.style.display = "none";
                }
                
                // Add Submit button
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

        // Extension for MoonQuickstart (🎲 Quickstart)
        if (nodeData.name === "MoonQuickstart") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);
                const node = this;
                
                // Hide "value" widget and neutralize canvas mouse drag/drawing on it
                const valueWidget = node.widgets?.find((w) => w.name === "value");
                if (valueWidget) {
                    valueWidget.type = "converted-widget";
                    valueWidget.computeSize = () => [0, -4];
                    valueWidget.draw = () => {};
                    valueWidget.mouse = () => false;
                    if (valueWidget.inputEl) {
                        valueWidget.inputEl.style.display = "none";
                        valueWidget.inputEl.style.pointerEvents = "none";
                    }
                }
                
                const initialValue = valueWidget ? valueWidget.value : 0;
                const initialStr = String(initialValue);

                // Add custom button displaying the current numeric value
                const restartBtn = node.addWidget("button", initialStr, initialStr, function (val, canvas, targetNode) {
                    const actualNode = targetNode || node;

                    // Safe 53-bit random integer generator
                    const newValue = Math.floor(Math.random() * 9007199254740991);
                    const newStr = String(newValue);

                    // Update hidden value widget
                    const valWidget = actualNode.widgets?.find((w) => w.name === "value");
                    if (valWidget) {
                        valWidget.value = newValue;
                        if (valWidget._state) valWidget._state.value = newValue;
                    }

                    // Update button label across Litegraph and Vue
                    const btnWidget = actualNode.widgets?.find((w) => w.type === "button") || restartBtn;
                    if (btnWidget) {
                        btnWidget.name = newStr;
                        btnWidget.label = newStr;
                        btnWidget.value = newStr;
                        if (btnWidget._state) {
                            btnWidget._state.name = newStr;
                            btnWidget._state.label = newStr;
                            btnWidget._state.displayName = newStr;
                            btnWidget._state.value = newStr;
                        }
                    }

                    if (typeof actualNode.setDirtyCanvas === "function") actualNode.setDirtyCanvas(true, true);
                    if (app.graph?.change) app.graph.change();
                    
                    app.queuePrompt(0);
                });

                // Dynamic getters for Vue and Litegraph mode compatibility
                const getValStr = () => String(valueWidget ? valueWidget.value : 0);
                try {
                    Object.defineProperties(restartBtn, {
                        name: { get: getValStr, set: () => {}, configurable: true },
                        label: { get: getValStr, set: () => {}, configurable: true },
                        displayName: { get: getValStr, set: () => {}, configurable: true }
                    });
                } catch (e) {}

                node.restartBtn = restartBtn;
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function (info) {
                onConfigure?.apply(this, arguments);
                const valueWidget = this.widgets?.find((w) => w.name === "value");
                const btnWidget = this.widgets?.find((w) => w.type === "button") || this.restartBtn;
                if (valueWidget && btnWidget) {
                    const strVal = String(valueWidget.value);
                    btnWidget.name = strVal;
                    btnWidget.label = strVal;
                    btnWidget.value = strVal;
                    if (btnWidget._state) {
                        btnWidget._state.name = strVal;
                        btnWidget._state.label = strVal;
                        btnWidget._state.displayName = strVal;
                        btnWidget._state.value = strVal;
                    }
                }
            };
        }
    },
});