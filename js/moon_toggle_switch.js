import { app } from "../../../scripts/app.js";

// Bulletproof CSS isolation between Vue and Classic LiteGraph:
// 1. In Vue mode (.comfy-vue-node), ALWAYS display flex
// 2. In LiteGraph canvas mode (.dom-widget), ALWAYS hide and disable pointer-events
if (!document.getElementById("moon-toggle-switch-style")) {
    const style = document.createElement("style");
    style.id = "moon-toggle-switch-style";
    style.textContent = `
        .comfy-vue-node .moon-toggle-vue-container,
        .vue-node .moon-toggle-vue-container {
            display: flex !important;
            pointer-events: auto !important;
        }
        .dom-widget:has(.moon-toggle-vue-container),
        .dom-widget .moon-toggle-vue-container {
            display: none !important;
            pointer-events: none !important;
            visibility: hidden !important;
        }
        .moon-toggle-vue-container {
            position: absolute !important;
            top: 32px !important;
            left: 16px !important;
            right: 48px !important;
            width: auto !important;
            z-index: 10;
        }
    `;
    document.head.appendChild(style);
}

function neutralizeWidget(w) {
    if (!w) return;
    w.origType = w.type;
    w.type = "hidden";
    w.hidden = true;
    if (!w.options) w.options = {};
    w.options.hidden = true;
    w.computeSize = () => [0, -4];
    w.draw = () => {};
    w.mouse = () => false;
    w.clicked = () => false;
    if (w.inputEl) {
        w.inputEl.style.display = "none";
        w.inputEl.style.visibility = "hidden";
        w.inputEl.style.height = "0px";
        w.inputEl.style.pointerEvents = "none";
    }
}

function getCustomLabel(node, index) {
    if (node.properties?.custom_labels?.[index]) {
        return node.properties.custom_labels[index];
    }
    return `Input ${index + 1}`;
}

// Your tuned compact height formula
function getSnugHeight(numInputs) {
    return (numInputs * 20) + 10;
}

app.registerExtension({
    name: "MoonNodes.ToggleSwitch",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "MoonToggleSwitch") return;

        function syncSockets(node) {
            if (!node.inputs) return;
            const targetShape = (node.inputs[0]?.shape !== undefined && node.inputs[0]?.shape !== 0) 
                ? node.inputs[0].shape 
                : 7;

            for (let i = 0; i < node.inputs.length; i++) {
                node.inputs[i].shape = targetShape;
                node.inputs[i].label = " ";
            }
        }

        function updateNodeSize(node) {
            const numInputs = node.inputs ? node.inputs.length : 2;
            const snugHeight = getSnugHeight(numInputs);
            const snugWidth = Math.max(node.size[0] || 160, 140);

            if (node.setSize) {
                node.setSize([snugWidth, snugHeight]);
            } else {
                node.size = [snugWidth, snugHeight];
            }
            node.min_size = [140, snugHeight];
        }

        function handleDynamicInputs(node) {
            if (!node.inputs || node.inputs.length === 0) return;
            if (node._isConfiguring || node.configuring) return;

            let maxConnectedIdx = -1;
            for (let i = 0; i < node.inputs.length; i++) {
                if (node.inputs[i].link != null) {
                    maxConnectedIdx = i;
                }
            }

            const targetCount = Math.max(2, maxConnectedIdx + 2);

            while (node.inputs.length > targetCount) {
                node.removeInput(node.inputs.length - 1);
            }

            while (node.inputs.length < targetCount) {
                const nextIdx = node.inputs.length + 1;
                const newInput = node.addInput(`input_${nextIdx}`, "*");
                newInput.shape = 7;
                newInput.label = " ";
            }

            if (node.properties?.custom_labels) {
                for (const k in node.properties.custom_labels) {
                    if (parseInt(k, 10) >= node.inputs.length) {
                        delete node.properties.custom_labels[k];
                    }
                }
            }

            const valWidget = node.widgets?.find(w => w.name === "selected_index");
            if (valWidget && valWidget.value >= node.inputs.length) {
                valWidget.value = Math.max(0, node.inputs.length - 1);
            }

            syncSockets(node);
            updateNodeSize(node);
            if (node.renderVueDOM) node.renderVueDOM();
        }

        nodeType.prototype.computeSize = function () {
            const numInputs = this.inputs ? this.inputs.length : 2;
            return [140, getSnugHeight(numInputs)];
        };

        nodeType.prototype.onResize = function (size) {
            const minH = getSnugHeight(this.inputs ? this.inputs.length : 2);
            if (size[0] < 140) size[0] = 140;
            if (size[1] < minH) size[1] = minH;
        };

        const origConfigure = nodeType.prototype.configure;
        nodeType.prototype.configure = function (info) {
            this._isConfiguring = true;
            try {
                if (origConfigure) {
                    origConfigure.apply(this, arguments);
                }
            } finally {
                this._isConfiguring = false;
            }

            this.show_slot_names = false;
            this.widgets_up = true;
            handleDynamicInputs(this);
            syncSockets(this);
            updateNodeSize(this);
            if (this.renderVueDOM) this.renderVueDOM();
        };

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            const node = this;

            node.show_slot_names = false;
            node.widgets_up = true;
            node.properties = node.properties || {};
            node.properties.custom_labels = node.properties.custom_labels || {};

            const valWidget = node.widgets?.find(w => w.name === "selected_index");
            neutralizeWidget(valWidget);

            handleDynamicInputs(node);
            syncSockets(node);
            updateNodeSize(node);

            // ==========================================
            // VUE FRONTEND DOM CONTAINER
            // ==========================================
            const domContainer = document.createElement("div");
            domContainer.className = "moon-toggle-vue-container";
            domContainer.style.display = "flex";
            domContainer.style.flexDirection = "column";
            domContainer.style.gap = "0px";
            domContainer.style.padding = "0px";
            domContainer.style.margin = "0px";
            domContainer.style.boxSizing = "border-box";
            domContainer.style.userSelect = "none";

            node.domContainer = domContainer;

            function updateActiveVisuals(newIndex) {
                if (valWidget) {
                    valWidget.value = newIndex;
                    if (valWidget._state) valWidget._state.value = newIndex;
                    if (valWidget.callback) valWidget.callback(newIndex);
                }

                const rows = domContainer.children;
                for (let r = 0; r < rows.length; r++) {
                    const active = (r === newIndex);
                    const rPill = rows[r].querySelector(".moon-pill");
                    const rDot = rows[r].querySelector(".moon-dot");
                    const rLabel = rows[r].querySelector(".moon-label");

                    if (rPill) {
                        rPill.style.border = active ? "1px solid #475a6e" : "1px solid #333333";
                        rPill.style.backgroundColor = active ? "#222830" : "#181818";
                    }
                    if (rDot) {
                        rDot.style.left = active ? "16px" : "2px";
                        rDot.style.backgroundColor = active ? "#7d99af" : "#2d2d2d";
                    }
                    if (rLabel) {
                        rLabel.style.color = active ? "#ffffff" : "#777777";
                    }
                }
                if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
                if (app.graph?.change) app.graph.change();
            }

            node.renderVueDOM = function () {
                domContainer.innerHTML = "";
                const curSelected = valWidget ? valWidget.value : 0;

                for (let i = 0; i < (node.inputs?.length || 0); i++) {
                    const isSelected = (curSelected === i);
                    const currentLabelText = getCustomLabel(node, i);

                    const row = document.createElement("div");
                    row.style.height = "20px";
                    row.style.display = "flex";
                    row.style.alignItems = "center";
                    row.style.gap = "8px";
                    row.style.cursor = "pointer";
                    row.style.paddingLeft = "4px";
                    row.style.width = "fit-content";

                    const pill = document.createElement("div");
                    pill.className = "moon-pill";
                    pill.style.width = "28px";
                    pill.style.height = "14px";
                    pill.style.borderRadius = "7px";
                    pill.style.position = "relative";
                    pill.style.boxSizing = "border-box";
                    pill.style.border = isSelected ? "1px solid #475a6e" : "1px solid #333333";
                    pill.style.backgroundColor = isSelected ? "#222830" : "#181818";
                    pill.style.flexShrink = "0";

                    const dot = document.createElement("div");
                    dot.className = "moon-dot";
                    dot.style.width = "8px";
                    dot.style.height = "8px";
                    dot.style.borderRadius = "50%";
                    dot.style.position = "absolute";
                    dot.style.top = "2px";
                    dot.style.left = isSelected ? "16px" : "2px";
                    dot.style.backgroundColor = isSelected ? "#7d99af" : "#2d2d2d";

                    pill.appendChild(dot);

                    pill.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        updateActiveVisuals(i);
                    };

                    const label = document.createElement("span");
                    label.className = "moon-label";
                    label.innerText = currentLabelText;
                    label.style.fontSize = "11px";
                    label.style.fontFamily = "sans-serif";
                    label.style.color = isSelected ? "#ffffff" : "#777777";
                    label.style.userSelect = "none";
                    label.style.cursor = "pointer";
                    label.title = "Click to select, double-click to rename";

                    label.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        updateActiveVisuals(i);
                    };

                    label.ondblclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        const input = document.createElement("input");
                        input.type = "text";
                        input.value = getCustomLabel(node, i);
                        input.style.width = "85px";
                        input.style.height = "16px";
                        input.style.fontSize = "11px";
                        input.style.fontFamily = "sans-serif";
                        input.style.backgroundColor = "#111111";
                        input.style.color = "#ffffff";
                        input.style.border = "1px solid #61afef";
                        input.style.borderRadius = "3px";
                        input.style.padding = "0 4px";
                        input.style.outline = "none";
                        input.style.boxSizing = "border-box";
                        input.style.zIndex = "100";

                        ["keydown", "keyup", "keypress", "pointerdown", "mousedown", "click", "dblclick"].forEach(ev => {
                            input.addEventListener(ev, evt => evt.stopPropagation());
                        });

                        let finished = false;
                        const finish = (save) => {
                            if (finished) return;
                            finished = true;
                            if (save) {
                                const trimmed = input.value.trim();
                                if (!node.properties) node.properties = {};
                                if (!node.properties.custom_labels) node.properties.custom_labels = {};
                                if (trimmed && trimmed !== `Input ${i + 1}`) {
                                    node.properties.custom_labels[i] = trimmed;
                                } else {
                                    delete node.properties.custom_labels[i];
                                }
                            }
                            label.innerText = getCustomLabel(node, i);
                            if (input.parentNode) {
                                input.parentNode.replaceChild(label, input);
                            }
                            if (node.setDirtyCanvas) node.setDirtyCanvas(true, true);
                            if (app.graph?.change) app.graph.change();
                        };

                        input.onkeydown = (ke) => {
                            if (ke.key === "Enter") {
                                ke.preventDefault();
                                finish(true);
                            } else if (ke.key === "Escape") {
                                ke.preventDefault();
                                finish(false);
                            }
                        };

                        input.onblur = () => finish(true);

                        if (label.parentNode) {
                            label.parentNode.replaceChild(input, label);
                        }
                        input.focus();
                        input.select();
                    };

                    row.appendChild(pill);
                    row.appendChild(label);
                    domContainer.appendChild(row);
                }
            };

            const domW = node.addDOMWidget("toggle_switch_vue_ui", "div", domContainer, {
                getValue() { return ""; },
                setValue() {},
                computeSize() {
                    return [0, -4];
                }
            });
            // Stop ComfyUI's DOM widget from swallowing canvas clicks!
            if (domW) {
                domW.mouse = () => false;
                domW.clicked = () => false;
                domW.computeSize = () => [0, -4];
            }

            node.computeSize = function () {
                const numInputs = this.inputs ? this.inputs.length : 2;
                return [140, getSnugHeight(numInputs)];
            };

            node.renderVueDOM();
        };

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function (type, slotIndex, isConnected, linkInfo, inputInfo) {
            onConnectionsChange?.apply(this, arguments);
            if (this._isConfiguring || this.configuring) return;

            if (type === 1) {
                handleDynamicInputs(this);
            }
        };

        // ==========================================
        // CLASSIC CANVAS DRAWING (Directly beside inlets)
        // ==========================================
        nodeType.prototype.onDrawForeground = function (ctx) {
            if (this.flags.collapsed) return;
            // In Vue mode, let Vue DOM handle drawing
            if (this.domElement || document.querySelector(".comfy-vue-node")) return;

            const valWidget = this.widgets?.find(w => w.name === "selected_index");
            const selectedIdx = valWidget ? valWidget.value : 0;

            const pillX = 18;
            const pillW = 28;
            const pillH = 14;
            const pillRadius = 7;

            ctx.save();

            for (let i = 0; i < (this.inputs?.length || 0); i++) {
                const connPos = this.getConnectionPos(true, i);
                const localY = (connPos && !isNaN(connPos[1])) 
                    ? (connPos[1] - this.pos[1]) 
                    : (30 + (i * 20) + 10);
                const pillY = localY - (pillH / 2);

                const isSelected = (selectedIdx === i);

                // 1. Pill Track
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(pillX, pillY, pillW, pillH, pillRadius);
                } else {
                    ctx.rect(pillX, pillY, pillW, pillH);
                }
                ctx.fillStyle = isSelected ? "#222830" : "#181818";
                ctx.fill();

                // 2. Pill Border
                ctx.lineWidth = 1.2;
                ctx.strokeStyle = isSelected ? "#475a6e" : "#333333";
                ctx.stroke();

                // 3. Dot Only
                const dotRadius = 4;
                const dotY = pillY + (pillH / 2);
                const dotX = isSelected ? (pillX + pillW - 6) : (pillX + 6);

                ctx.beginPath();
                ctx.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
                ctx.fillStyle = isSelected ? "#7d99af" : "#2d2d2d";
                ctx.fill();

                // 4. Custom or Default Label
                const labelText = getCustomLabel(this, i);
                ctx.font = "11px sans-serif";
                ctx.fillStyle = isSelected ? "#ffffff" : "#777777";
                ctx.fillText(labelText, pillX + pillW + 8, localY + 4);
            }

            ctx.restore();
        };

        // --- Single Click on Classic Canvas ---
        nodeType.prototype.onMouseDown = function (event, localPos) {
            if (this.domElement || document.querySelector(".comfy-vue-node")) return;

            const pillX = 18;
            const pillH = 14;
            const rowClickableWidth = 120;

            for (let i = 0; i < (this.inputs?.length || 0); i++) {
                const connPos = this.getConnectionPos(true, i);
                const localY = (connPos && !isNaN(connPos[1])) 
                    ? (connPos[1] - this.pos[1]) 
                    : (30 + (i * 20) + 10);
                const pillY = localY - (pillH / 2);

                if (
                    localPos[0] >= pillX - 2 &&
                    localPos[0] <= pillX + rowClickableWidth &&
                    localPos[1] >= pillY - 4 &&
                    localPos[1] <= pillY + pillH + 4
                ) {
                    const valWidget = this.widgets?.find(w => w.name === "selected_index");
                    if (valWidget) {
                        valWidget.value = i;
                        if (valWidget._state) valWidget._state.value = i;
                        if (valWidget.callback) valWidget.callback(i);
                    }

                    if (this.renderVueDOM) this.renderVueDOM();
                    if (typeof this.setDirtyCanvas === "function") {
                        this.setDirtyCanvas(true, true);
                    }
                    if (app.graph?.change) {
                        app.graph.change();
                    }
                    return true;
                }
            }
        };

        // --- Double Click on Classic Canvas (Rename Input) ---
        nodeType.prototype.onDblClick = function (event, localPos) {
            if (this.domElement || document.querySelector(".comfy-vue-node")) return;

            for (let i = 0; i < (this.inputs?.length || 0); i++) {
                const connPos = this.getConnectionPos(true, i);
                const localY = (connPos && !isNaN(connPos[1])) 
                    ? (connPos[1] - this.pos[1]) 
                    : (30 + (i * 20) + 10);
                const pillY = localY - 7;

                if (
                    localPos[0] >= 50 &&
                    localPos[0] <= this.size[0] - 10 &&
                    localPos[1] >= pillY - 4 &&
                    localPos[1] <= pillY + 18
                ) {
                    const currentLabel = getCustomLabel(this, i);
                    const newLabel = window.prompt(`Rename Input ${i + 1}:`, currentLabel);
                    if (newLabel !== null) {
                        const trimmed = newLabel.trim();
                        if (!this.properties) this.properties = {};
                        if (!this.properties.custom_labels) this.properties.custom_labels = {};

                        if (trimmed && trimmed !== `Input ${i + 1}`) {
                            this.properties.custom_labels[i] = trimmed;
                        } else {
                            delete this.properties.custom_labels[i];
                        }

                        this.setDirtyCanvas(true, true);
                        if (this.renderVueDOM) this.renderVueDOM();
                        if (app.graph?.change) app.graph.change();
                    }
                    return true;
                }
            }
        };
    }
});