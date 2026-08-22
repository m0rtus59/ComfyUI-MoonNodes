import { app } from "../../../scripts/app.js";

const RATIOS = {
    "1:1": [1, 1],
    "3:2": [3, 2],
    "4:3": [4, 3],
    "16:9": [16, 9],
    "21:9": [21, 9],
    "2:3": [2, 3],
    "3:4": [3, 4],
    "9:16": [9, 16]
};

function calculateResolution(aspectRatio, megapixels, multiple) {
    const [wRatio, hRatio] = RATIOS[aspectRatio] || [1, 1];
    const totalPixels = megapixels * 1024 * 1024;
    const scale = Math.sqrt(totalPixels / (wRatio * hRatio));
    const width = Math.max(multiple, Math.round((wRatio * scale) / multiple) * multiple);
    const height = Math.max(multiple, Math.round((hRatio * scale) / multiple) * multiple);
    return { width, height };
}

function neutralizeWidget(w) {
    if (!w) return;
    w.origType = w.type;
    w.type = "hidden"; 
    w.hidden = true;
    
    // Explicitly hide via options (helps some versions of the Vue frontend collapse the empty space)
    if (!w.options) w.options = {};
    w.options.hidden = true;

    w.computeSize = () => [0, 0];
    w.draw = () => {};
    w.mouse = () => false;
    w.clicked = () => false;
    if (w.inputEl) {
        w.inputEl.style.display = "none";
        w.inputEl.style.visibility = "hidden";
        w.inputEl.style.height = "0";
        w.inputEl.style.pointerEvents = "none";
    }
}

app.registerExtension({
    name: "MoonNodes.Quickstart",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        // --- 🎲 Quickstart (Original) ---
        if (nodeData.name === "MoonQuickstart") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);
                const node = this;
                const valueWidget = node.widgets?.find((w) => w.name === "value");
                neutralizeWidget(valueWidget);

                const getValStr = () => String(valueWidget ? valueWidget.value : 0);
                const restartBtn = node.addWidget("button", getValStr(), getValStr(), function (val, canvas, targetNode) {
                    const actualNode = targetNode || node;
                    const newValue = Math.floor(Math.random() * 9007199254740991);
                    const newStr = String(newValue);

                    const valWidget = actualNode.widgets?.find((w) => w.name === "value");
                    if (valWidget) {
                        valWidget.value = newValue;
                        if (valWidget._state) valWidget._state.value = newValue;
                    }

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

        // --- 🎲 Quickstart (Advanced) ---
        if (nodeData.name === "MoonQuickstartAdvanced") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                onNodeCreated?.apply(this, arguments);
                const node = this;

                const NODE_WIDTH = 346; 
                const NODE_MIN_HEIGHT = 416; // Nudged slightly tighter
                const UI_MIN_HEIGHT = 290;

                node.size = [NODE_WIDTH, NODE_MIN_HEIGHT];
                node.min_size = [NODE_WIDTH, NODE_MIN_HEIGHT];

                // Neutralize all native widgets so they don't capture ghost clicks/take space
                const valW = node.widgets?.find(w => w.name === "value");
                const aspectW = node.widgets?.find(w => w.name === "aspect_ratio");
                const megaW = node.widgets?.find(w => w.name === "megapixels");
                const multW = node.widgets?.find(w => w.name === "multiple");

                [valW, aspectW, megaW, multW].forEach(neutralizeWidget);

                let isRandomMode = true;

                // Main Container
                const root = document.createElement("div");
                root.style.display = "flex";
                root.style.flexDirection = "column";
                root.style.gap = "8px";
                root.style.padding = "8px";
                root.style.backgroundColor = "#181818";
                root.style.border = "1px solid #333";
                root.style.borderRadius = "6px";
                root.style.color = "#eee";
                root.style.fontFamily = "sans-serif";
                root.style.fontSize = "12px";
                root.style.boxSizing = "border-box";
                root.style.userSelect = "none";
                root.style.width = "100%";
                
                // Forces Vue mode to respect minimum button sizing constraints
                root.style.minWidth = `${NODE_WIDTH - 20}px`;
                root.style.minHeight = `${UI_MIN_HEIGHT}px`;
                root.style.pointerEvents = "auto";

                // Stop all events from bubbling to LiteGraph / Vue canvas to prevent ghost popups
                ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "contextmenu", "wheel"].forEach(evt => {
                    root.addEventListener(evt, (e) => e.stopPropagation());
                });

                // Top Grid Layout
                const topGrid = document.createElement("div");
                topGrid.style.display = "flex";
                topGrid.style.flexDirection = "column";
                topGrid.style.gap = "6px";

                // Top Row
                const topRow = document.createElement("div");
                topRow.style.display = "flex";
                topRow.style.alignItems = "center";
                topRow.style.gap = "6px";

                const middleArea = document.createElement("div");
                middleArea.style.display = "flex";
                middleArea.style.gap = "6px";

                // Left Column
                const leftCol = document.createElement("div");
                leftCol.style.display = "flex";
                leftCol.style.flexDirection = "column";
                leftCol.style.gap = "6px";

                const ratioButtons = {};

                function createRatioButton(ratio, w, h) {
                    const btn = document.createElement("button");
                    btn.innerText = ratio;
                    btn.style.width = `${w}px`;
                    btn.style.height = `${h}px`;
                    btn.style.flexShrink = "0";
                    btn.style.display = "flex";
                    btn.style.alignItems = "center";
                    btn.style.justifyContent = "center";
                    btn.style.backgroundColor = "#242424";
                    btn.style.color = "#aaa";
                    btn.style.border = "1px solid #444";
                    btn.style.borderRadius = "4px";
                    btn.style.cursor = "pointer";
                    btn.style.fontSize = "11px";
                    btn.style.padding = "0";
                    btn.style.transition = "background-color 0.12s, border-color 0.12s, color 0.12s";

                    btn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (aspectW) {
                            aspectW.value = ratio;
                            if (aspectW._state) aspectW._state.value = ratio;
                        }
                        updateUI();
                    };
                    ratioButtons[ratio] = btn;
                    return btn;
                }

                // 1:1 Square Base (36x36)
                const btn1_1 = createRatioButton("1:1", 36, 36);
                topRow.appendChild(btn1_1);

                // Horizontal Buttons Container
                const horizContainer = document.createElement("div");
                horizContainer.style.display = "flex";
                horizContainer.style.alignItems = "center";
                horizContainer.style.gap = "6px";
                horizContainer.style.flex = "1";

                horizContainer.appendChild(createRatioButton("4:3", 48, 36));
                horizContainer.appendChild(createRatioButton("3:2", 54, 36));
                horizContainer.appendChild(createRatioButton("16:9", 64, 36));
                horizContainer.appendChild(createRatioButton("21:9", 84, 36));
                topRow.appendChild(horizContainer);

                // Vertical Buttons (Left Column)
                leftCol.appendChild(createRatioButton("3:4", 36, 48));
                leftCol.appendChild(createRatioButton("2:3", 36, 54));
                leftCol.appendChild(createRatioButton("9:16", 36, 64));
                middleArea.appendChild(leftCol);

                // Dynamic Canvas Display Container
                const previewContainer = document.createElement("div");
                previewContainer.style.flex = "1";
                previewContainer.style.height = "178px";
                previewContainer.style.display = "flex";
                previewContainer.style.justifyContent = "center";
                previewContainer.style.alignItems = "center";
                previewContainer.style.backgroundColor = "#111111";
                previewContainer.style.border = "1px solid #222";
                previewContainer.style.borderRadius = "4px";
                previewContainer.style.padding = "8px";
                previewContainer.style.boxSizing = "border-box";
                // Ensures container does not clip elements on small sizes
                previewContainer.style.overflow = "hidden";

                // The box that physically changes shape based on ratio
                const previewRect = document.createElement("div");
                previewRect.style.display = "flex";
                previewRect.style.flexDirection = "column";
                previewRect.style.justifyContent = "center";
                previewRect.style.alignItems = "center";
                previewRect.style.backgroundColor = "#162028"; // Subtle blue tint
                previewRect.style.border = "2px dashed #3b6385";
                previewRect.style.borderRadius = "4px";
                previewRect.style.transition = "width 0.25s cubic-bezier(0.4, 0, 0.2, 1), height 0.25s cubic-bezier(0.4, 0, 0.2, 1)";
                previewRect.style.boxSizing = "border-box";
                previewRect.style.overflow = "hidden";

                const resText = document.createElement("div");
                resText.style.fontWeight = "bold";
                resText.style.color = "#61afef";
                resText.style.whiteSpace = "nowrap";

                const subText = document.createElement("div");
                subText.style.color = "#888";
                subText.style.marginTop = "4px";
                subText.style.whiteSpace = "nowrap";

                previewRect.appendChild(resText);
                previewRect.appendChild(subText);
                previewContainer.appendChild(previewRect);
                middleArea.appendChild(previewContainer);

                topGrid.appendChild(topRow);
                topGrid.appendChild(middleArea);
                root.appendChild(topGrid);

                // Megapixels Slider Row
                const megaRow = document.createElement("div");
                megaRow.style.display = "flex";
                megaRow.style.alignItems = "center";
                megaRow.style.gap = "8px";

                const megaLabel = document.createElement("span");
                megaLabel.innerText = "Size:";
                megaLabel.style.width = "50px";
                megaLabel.style.flexShrink = "0";

                const megaInput = document.createElement("input");
                megaInput.type = "number";
                megaInput.min = "0.1";
                megaInput.max = "16.0"; // Allow high custom sizes via manual typing
                megaInput.step = "0.05";
                megaInput.style.width = "48px";
                megaInput.style.backgroundColor = "#111";
                megaInput.style.color = "#eee";
                megaInput.style.border = "1px solid #444";
                megaInput.style.borderRadius = "3px";
                megaInput.style.padding = "3px";
                megaInput.style.fontSize = "11px";
                megaInput.style.textAlign = "center";
                megaInput.style.fontFamily = "monospace";
                megaInput.style.flexShrink = "0";

                const megaSlider = document.createElement("input");
                megaSlider.type = "range";
                megaSlider.min = "0.5";
                megaSlider.max = "4.0"; // Capped top range of slider as requested
                megaSlider.step = "0.5"; // Larger slider chunks
                megaSlider.style.flex = "1";
                megaSlider.style.cursor = "pointer";

                megaInput.onchange = () => {
                    let val = parseFloat(megaInput.value);
                    if (isNaN(val)) val = 1.0;
                    if (val < 0.1) val = 0.1;
                    if (val > 16.0) val = 16.0;
                    if (megaW) { megaW.value = val; if (megaW._state) megaW._state.value = val; }
                    updateUI();
                };

                megaSlider.oninput = () => {
                    const val = parseFloat(megaSlider.value);
                    if (megaW) { megaW.value = val; if (megaW._state) megaW._state.value = val; }
                    updateUI();
                };

                megaRow.appendChild(megaLabel);
                megaRow.appendChild(megaInput);
                megaRow.appendChild(megaSlider);
                root.appendChild(megaRow);

                // Multiple Dropdown Row
                const multRow = document.createElement("div");
                multRow.style.display = "flex";
                multRow.style.alignItems = "center";
                multRow.style.gap = "8px"; 
                multRow.style.justifyContent = "flex-start";

                const multLabel = document.createElement("span");
                multLabel.innerText = "Multiple:";
                multLabel.style.width = "50px"; 
                multLabel.style.flexShrink = "0";

                const multSelect = document.createElement("select");
                multSelect.style.backgroundColor = "#242424";
                multSelect.style.color = "#ddd";
                multSelect.style.border = "1px solid #444";
                multSelect.style.borderRadius = "3px";
                multSelect.style.padding = "2px 6px";
                multSelect.style.cursor = "pointer";

                [8, 16, 32, 64].forEach(m => {
                    const opt = document.createElement("option");
                    opt.value = m;
                    opt.innerText = m;
                    multSelect.appendChild(opt);
                });
                multSelect.value = String(multW ? multW.value : 8);

                multSelect.onchange = () => {
                    const val = parseInt(multSelect.value, 10);
                    if (multW) {
                        multW.value = val;
                        if (multW._state) multW._state.value = val;
                    }
                    updateUI();
                };

                multRow.appendChild(multLabel);
                multRow.appendChild(multSelect);
                root.appendChild(multRow);

                // Seed & Quickstart Action Area
                const bottomRow = document.createElement("div");
                bottomRow.style.display = "flex";
                bottomRow.style.alignItems = "center";
                bottomRow.style.gap = "6px";

                // Editable Seed Input Box
                const seedInput = document.createElement("input");
                seedInput.type = "text";
                seedInput.title = "Type custom seed or click to select & copy";
                seedInput.style.flex = "1";
                seedInput.style.minWidth = "0"; 
                seedInput.style.backgroundColor = "#111111";
                seedInput.style.color = "#98c379";
                seedInput.style.border = "1px solid #333";
                seedInput.style.borderRadius = "4px";
                seedInput.style.padding = "6px 8px";
                seedInput.style.fontFamily = "monospace";
                seedInput.style.fontSize = "12px";
                seedInput.style.textAlign = "center";
                seedInput.style.cursor = "text";
                seedInput.onclick = () => seedInput.select();

                seedInput.oninput = () => {
                    const cleanVal = seedInput.value.replace(/[^0-9]/g, "");
                    seedInput.value = cleanVal;
                    const parsed = parseInt(cleanVal, 10) || 0;
                    if (valW) {
                        valW.value = parsed;
                        if (valW._state) valW._state.value = parsed;
                    }
                };

                // Randomize / Fixed Mode Toggle Button (Emojis Only)
                const modeBtn = document.createElement("button");
                modeBtn.style.padding = "4px 8px";
                modeBtn.style.border = "1px solid #444";
                modeBtn.style.borderRadius = "4px";
                modeBtn.style.cursor = "pointer";
                modeBtn.style.fontSize = "15px";
                modeBtn.style.flexShrink = "0";
                modeBtn.style.display = "flex";
                modeBtn.style.alignItems = "center";
                modeBtn.style.justifyContent = "center";

                function updateModeBtn() {
                    if (isRandomMode) {
                        modeBtn.innerText = "🎲";
                        modeBtn.style.backgroundColor = "#263e52";
                        modeBtn.style.borderColor = "#3b6385";
                        modeBtn.title = "Seed: Random";
                    } else {
                        modeBtn.innerText = "🔒";
                        modeBtn.style.backgroundColor = "#3d2b2b";
                        modeBtn.style.borderColor = "#634242";
                        modeBtn.title = "Seed: Fixed";
                    }
                }
                updateModeBtn();

                modeBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    isRandomMode = !isRandomMode;
                    updateModeBtn();
                };

                // Quickstart Trigger Button
                const quickstartBtn = document.createElement("button");
                quickstartBtn.innerText = "Quickstart";
                quickstartBtn.style.padding = "6px 16px";
                quickstartBtn.style.backgroundColor = "#2d5a3f";
                quickstartBtn.style.color = "#fff";
                quickstartBtn.style.fontWeight = "bold";
                quickstartBtn.style.border = "1px solid #3d7a55";
                quickstartBtn.style.borderRadius = "4px";
                quickstartBtn.style.cursor = "pointer";
                quickstartBtn.style.transition = "background-color 0.15s ease";
                quickstartBtn.style.whiteSpace = "nowrap"; 
                quickstartBtn.style.flexShrink = "0";

                quickstartBtn.onmouseover = () => { quickstartBtn.style.backgroundColor = "#356b4a"; };
                quickstartBtn.onmouseout = () => { quickstartBtn.style.backgroundColor = "#2d5a3f"; };

                quickstartBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    let activeSeed;
                    if (isRandomMode) {
                        activeSeed = Math.floor(Math.random() * 9007199254740991);
                        if (valW) {
                            valW.value = activeSeed;
                            if (valW._state) valW._state.value = activeSeed;
                        }
                        seedInput.value = String(activeSeed);
                    } else {
                        activeSeed = parseInt(seedInput.value, 10) || 0;
                        if (valW) {
                            valW.value = activeSeed;
                            if (valW._state) valW._state.value = activeSeed;
                        }
                    }

                    if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
                    if (app.graph?.change) app.graph.change();
                    app.queuePrompt(0);
                };

                bottomRow.appendChild(seedInput);
                bottomRow.appendChild(modeBtn);
                bottomRow.appendChild(quickstartBtn);
                root.appendChild(bottomRow);

                function updateUI() {
                    const curRatio = (aspectW && aspectW.value) || "1:1";
                    const curMega = (megaW && typeof megaW.value === "number") ? megaW.value : 1.0;
                    const curMult = (multW && typeof multW.value === "number") ? multW.value : 8;
                    const curSeed = (valW && valW.value !== undefined) ? valW.value : 0;

                    // Update Highlighted Ratio Button
                    Object.entries(ratioButtons).forEach(([r, b]) => {
                        if (r === curRatio) {
                            b.style.backgroundColor = "#315b7d";
                            b.style.borderColor = "#61afef";
                            b.style.color = "#ffffff";
                            b.style.fontWeight = "bold";
                        } else {
                            b.style.backgroundColor = "#242424";
                            b.style.borderColor = "#444";
                            b.style.color = "#aaa";
                            b.style.fontWeight = "normal";
                        }
                    });

                    // Update Form Inputs
                    megaInput.value = curMega.toFixed(2);
                    megaSlider.value = Math.min(curMega, parseFloat(megaSlider.max)).toString();
                    multSelect.value = String(curMult);
                    seedInput.value = String(curSeed);

                    const { width, height } = calculateResolution(curRatio, curMega, curMult);
                    resText.innerText = `${width} × ${height}`;
                    subText.innerText = `${curRatio} • ${( (width * height) / (1024 * 1024) ).toFixed(2)} MP`;

                    // Update Dynamic Preview Rectangle Size
                    const [wRatio, hRatio] = RATIOS[curRatio] || [1, 1];
                    const aspect = wRatio / hRatio;
                    
                    // Safely scaled down constants so wide ratios don't overflow the container paddings
                    const MAX_BOX_W = 244; 
                    const MAX_BOX_H = 154; 
                    
                    let drawW, drawH;
                    if (MAX_BOX_W / MAX_BOX_H > aspect) {
                        drawH = MAX_BOX_H;
                        drawW = MAX_BOX_H * aspect;
                    } else {
                        drawW = MAX_BOX_W;
                        drawH = MAX_BOX_W / aspect;
                    }

                    previewRect.style.width = `${drawW}px`;
                    previewRect.style.height = `${drawH}px`;
                    
                    // Safely shrink text inside the dynamic box if proportions get very extreme
                    if (drawW < 110 || drawH < 60) {
                        resText.style.fontSize = "13px";
                        subText.style.fontSize = "9px";
                    } else {
                        resText.style.fontSize = "16px";
                        subText.style.fontSize = "11px";
                    }

                    if (typeof node.setDirtyCanvas === "function") node.setDirtyCanvas(true, true);
                }

                node.addDOMWidget("quickstart_advanced_gui", "div", root, {
                    getValue() { return ""; },
                    setValue(v) {},
                    computeSize() {
                        return [node.size[0], Math.max(node.size[1] - 35, UI_MIN_HEIGHT)];
                    }
                });

                node.onResize = function (size) {
                    if (size[0] < NODE_WIDTH) size[0] = NODE_WIDTH;
                    if (size[1] < NODE_MIN_HEIGHT) size[1] = NODE_MIN_HEIGHT;
                };

                node.updateQuickstartUI = updateUI;
                updateUI();
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function (info) {
                onConfigure?.apply(this, arguments);
                if (this.updateQuickstartUI) {
                    this.updateQuickstartUI();
                }
            };
        }
    }
});