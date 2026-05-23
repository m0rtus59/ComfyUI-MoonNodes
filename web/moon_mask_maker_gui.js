import { app } from "../../../scripts/app.js";
import { ComfyDialog } from "../../../scripts/ui.js";

const LAYER_COLORS = [
    "#FFFFFF", "#FF3366", "#33FF66", "#3366FF", 
    "#FFFF33", "#FF33FF", "#33FFFF", "#FF9933"
];

class MoonMaskDialog extends ComfyDialog {
    constructor(node, onSave) {
        super();
        this.node = node;
        this.onSave = onSave;
        this.layers = []; 
        this.layerSettings = []; // Stores individual {subtract: boolean} states
        this.activeLayerIndex = 0;
        this.brushSize = 40; 
        this.isDrawing = false;
        
        this.element.style.width = "850px";
        this.element.style.height = "auto"; 
        this.element.style.minHeight = "640px";
        this.element.style.backgroundColor = "#202020";
        this.element.style.color = "#ffffff";
        this.element.style.padding = "20px";
        this.element.style.display = "flex";
        this.element.style.flexDirection = "column";
        this.element.style.borderRadius = "8px";
        this.element.style.border = "2px solid #3c3c3c";
    }

    isCanvasEmpty(canvas) {
        const ctx = canvas.getContext("2d");
        const buffer = new Uint32Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
        for (let i = 0; i < buffer.length; i++) {
            if (buffer[i] !== 0) return false;
        }
        return true;
    }

    createDOM(existingData) {
        this.element.innerHTML = "";

        const header = document.createElement("div");
        header.style.display = "flex";
        header.style.justifyContent = "space-between";
        header.style.alignItems = "center";
        header.style.marginBottom = "15px";
        header.innerHTML = `<h3 style='margin:0;'>Moon Mask Maker GUI</h3><span style='color:#888;font-size:12px;'>[ArrowUp / Down] to Switch/Add Layers</span>`;
        this.element.appendChild(header);

        const workspace = document.createElement("div");
        workspace.style.display = "flex";
        workspace.style.flex = "1";
        workspace.style.gap = "20px";
        workspace.style.minHeight = "0"; 
        this.element.appendChild(workspace);

        this.sidebar = document.createElement("div");
        this.sidebar.style.width = "200px";
        this.sidebar.style.backgroundColor = "#181818";
        this.sidebar.style.padding = "10px";
        this.sidebar.style.display = "flex";
        this.sidebar.style.flexDirection = "column";
        this.sidebar.style.gap = "8px";
        this.sidebar.style.overflowY = "auto";
        this.sidebar.style.borderRadius = "4px";
        workspace.appendChild(this.sidebar);

        const canvasWrapper = document.createElement("div");
        canvasWrapper.style.position = "relative";
        canvasWrapper.style.width = "512px";
        canvasWrapper.style.height = "512px";
        canvasWrapper.style.backgroundColor = "#000000"; 
        canvasWrapper.style.borderRadius = "4px";
        canvasWrapper.style.overflow = "hidden";
        workspace.appendChild(canvasWrapper);

        this.mainCanvas = document.createElement("canvas");
        this.mainCanvas.width = 512;
        this.mainCanvas.height = 512;
        this.mainCanvas.style.position = "absolute";
        this.mainCanvas.style.left = "0";
        this.mainCanvas.style.top = "0";
        this.mainCanvas.style.cursor = "crosshair";
        this.mainCanvas.style.zIndex = "10";
        canvasWrapper.appendChild(this.mainCanvas);
        this.ctx = this.mainCanvas.getContext("2d");

        const footer = document.createElement("div");
        footer.style.display = "flex";
        footer.style.justifyContent = "space-between";
        footer.style.alignItems = "center";
        footer.style.marginTop = "20px"; 
        
        const sliderContainer = document.createElement("div");
        sliderContainer.style.display = "flex";
        sliderContainer.style.alignItems = "center";
        sliderContainer.style.gap = "8px";
        sliderContainer.innerHTML = `<label style='font-size:13px;'>Brush Size: <span id='b_val'>${this.brushSize}</span></label><input type='range' min='3' max='100' value='${this.brushSize}' id='b_size'/>`;
        footer.appendChild(sliderContainer);

        const btnGroup = document.createElement("div");
        btnGroup.style.display = "flex";
        btnGroup.style.gap = "10px";
        
        const btnClear = document.createElement("button");
        btnClear.innerText = "Clear All";
        btnClear.style.padding = "8px 16px";
        btnClear.style.backgroundColor = "#ff9800";
        btnClear.style.color = "white";
        btnClear.style.border = "none";
        btnClear.style.borderRadius = "4px";
        btnClear.style.cursor = "pointer";
        btnClear.onclick = () => {
            if (confirm("Clear all painted masks?")) {
                this.layers = [this.layers[0]]; 
                this.layerSettings = [{ subtract: false }];
                const ctx = this.layers[0].getContext("2d");
                ctx.clearRect(0, 0, 512, 512); 
                this.activeLayerIndex = 0;
                this.redrawWorkspace();
            }
        };

        const btnSave = document.createElement("button");
        btnSave.innerText = "Save to Node";
        btnSave.style.padding = "8px 16px";
        btnSave.style.backgroundColor = "#4CAF50";
        btnSave.style.color = "white";
        btnSave.style.border = "none";
        btnSave.style.borderRadius = "4px";
        btnSave.style.cursor = "pointer";
        btnSave.onclick = () => this.save();
        
        const btnClose = document.createElement("button");
        btnClose.innerText = "Cancel";
        btnClose.style.padding = "8px 16px";
        btnClose.style.backgroundColor = "#f44336";
        btnClose.style.color = "white";
        btnClose.style.border = "none";
        btnClose.style.borderRadius = "4px";
        btnClose.style.cursor = "pointer";
        btnClose.onclick = () => this.close();
        
        btnGroup.appendChild(btnClear);
        btnGroup.appendChild(btnSave);
        btnGroup.appendChild(btnClose);
        footer.appendChild(btnGroup);
        this.element.appendChild(footer);

        footer.querySelector("#b_size").oninput = (e) => {
            this.brushSize = parseInt(e.target.value);
            footer.querySelector("#b_val").innerText = this.brushSize;
        };

        // LOAD LOGIC: Determine if loading new Dict format or legacy Array format
        let rawFiles = [];
        let loadedSettings = [];
        let isLegacy = false;

        if (existingData && !Array.isArray(existingData) && existingData.raw) {
            rawFiles = existingData.raw;
            loadedSettings = existingData.settings || [];
        } else if (Array.isArray(existingData) && existingData.length > 0) {
            rawFiles = existingData;
            isLegacy = true; // Needs color remapping
        }

        if (rawFiles.length > 0) {
            let loadedCount = 0;
            rawFiles.forEach((filename, idx) => {
                const layerCanvas = document.createElement("canvas");
                layerCanvas.width = 512;
                layerCanvas.height = 512;
                const layerCtx = layerCanvas.getContext("2d");
                
                layerCtx.clearRect(0, 0, 512, 512);

                const img = new Image();
                img.src = `/view?filename=${filename}&type=input&t=${Date.now()}`;
                img.onload = () => {
                    layerCtx.drawImage(img, 0, 0);

                    // If loading an old legacy mask, we must remap the black/white back to Neon transparent
                    if (isLegacy) {
                        const imgData = layerCtx.getImageData(0, 0, 512, 512);
                        const data = imgData.data;
                        const color = this.getLayerColor(idx);
                        const r = parseInt(color.slice(1, 3), 16);
                        const g = parseInt(color.slice(3, 5), 16);
                        const b = parseInt(color.slice(5, 7), 16);
                        
                        for (let p = 0; p < data.length; p += 4) {
                            if (data[p] > 10 || data[p+1] > 10 || data[p+2] > 10) { 
                                data[p] = r; data[p+1] = g; data[p+2] = b; data[p+3] = 255;
                            } else {
                                data[p] = 0; data[p+1] = 0; data[p+2] = 0; data[p+3] = 0;
                            }
                        }
                        layerCtx.putImageData(imgData, 0, 0);
                    }

                    loadedCount++;
                    if (loadedCount === rawFiles.length) {
                        this.redrawWorkspace();
                    }
                };
                this.layers.push(layerCanvas);
                this.layerSettings.push(loadedSettings[idx] || { subtract: false });
            });
        } else {
            this.addLayer();
        }

        this.setupDrawEvents();
        this.setupKeyboardEvents();
        this.redrawWorkspace();
    }

    getLayerColor(idx) {
        return LAYER_COLORS[idx % LAYER_COLORS.length];
    }

    addLayer() {
        const layerCanvas = document.createElement("canvas");
        layerCanvas.width = 512;
        layerCanvas.height = 512;
        layerCanvas.getContext("2d").clearRect(0, 0, 512, 512); 
        
        this.layers.push(layerCanvas);
        this.layerSettings.push({ subtract: false }); // Default new layers to normal overlap
        this.activeLayerIndex = this.layers.length - 1;
        this.redrawWorkspace();
    }

    deleteLayer(idx) {
        if (this.layers.length <= 1) return;
        this.layers.splice(idx, 1);
        this.layerSettings.splice(idx, 1);
        if (this.activeLayerIndex >= this.layers.length) {
            this.activeLayerIndex = this.layers.length - 1;
        }
        this.redrawWorkspace();
    }

    redrawWorkspace() {
        this.sidebar.innerHTML = "";
        
        const label = document.createElement("div");
        label.innerText = "LAYER LIST";
        label.style.fontWeight = "bold";
        label.style.fontSize = "11px";
        label.style.color = "#777";
        this.sidebar.appendChild(label);

        this.layers.forEach((layer, idx) => {
            const item = document.createElement("div");
            item.style.display = "flex";
            item.style.justifyContent = "space-between";
            item.style.alignItems = "center";
            item.style.padding = "8px";
            item.style.borderRadius = "4px";
            item.style.cursor = "pointer";
            item.style.backgroundColor = idx === this.activeLayerIndex ? "#444" : "#262626";
            item.style.border = idx === this.activeLayerIndex ? `1px solid ${this.getLayerColor(idx)}` : "1px solid transparent";
            item.onclick = () => {
                this.activeLayerIndex = idx;
                this.redrawWorkspace();
            };

            const leftGroup = document.createElement("div");
            leftGroup.style.display = "flex";
            leftGroup.style.alignItems = "center";
            leftGroup.style.gap = "8px";

            const bullet = document.createElement("span");
            bullet.style.width = "10px";
            bullet.style.height = "10px";
            bullet.style.borderRadius = "50%";
            bullet.style.backgroundColor = this.getLayerColor(idx);
            leftGroup.appendChild(bullet);

            const name = document.createElement("span");
            name.innerText = `Mask Layer ${idx}`;
            name.style.fontSize = "13px";
            leftGroup.appendChild(name);
            item.appendChild(leftGroup);

            // Right side: Checkbox + Delete
            const rightGroup = document.createElement("div");
            rightGroup.style.display = "flex";
            rightGroup.style.alignItems = "center";
            rightGroup.style.gap = "10px";

            const subContainer = document.createElement("label");
            subContainer.style.display = "flex";
            subContainer.style.alignItems = "center";
            subContainer.style.gap = "4px";
            subContainer.style.fontSize = "11px";
            subContainer.style.cursor = "pointer";
            subContainer.style.color = "#aaa";
            
            const subCheck = document.createElement("input");
            subCheck.type = "checkbox";
            subCheck.checked = this.layerSettings[idx].subtract;
            subCheck.onclick = (e) => e.stopPropagation(); 
            subCheck.onchange = (e) => {
                this.layerSettings[idx].subtract = e.target.checked;
                this.redrawWorkspace(); 
            };
            
            subContainer.appendChild(subCheck);
            subContainer.appendChild(document.createTextNode("Sub"));

            const deleteBtn = document.createElement("span");
            deleteBtn.innerText = "✖";
            deleteBtn.style.color = "#ff5555";
            deleteBtn.style.padding = "2px 6px";
            deleteBtn.style.cursor = "pointer";
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                this.deleteLayer(idx);
            };

            rightGroup.appendChild(subContainer);
            rightGroup.appendChild(deleteBtn);
            item.appendChild(rightGroup);
            
            this.sidebar.appendChild(item);
        });

        // DRAW REAL-TIME VISUALIZATION (Includes active non-destructive exclusions)
        this.ctx.fillStyle = "#000000";
        this.ctx.fillRect(0, 0, 512, 512);
        
        this.layers.forEach((layer, idx) => {
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = 512; tempCanvas.height = 512;
            const tCtx = tempCanvas.getContext("2d");
            
            tCtx.drawImage(layer, 0, 0);

            // Apply subtractions visually from any higher layers that have 'subtract' checked
            tCtx.globalCompositeOperation = "destination-out";
            for (let j = idx + 1; j < this.layers.length; j++) {
                if (this.layerSettings[j].subtract) {
                    tCtx.drawImage(this.layers[j], 0, 0);
                }
            }
            
            this.ctx.globalAlpha = (idx === this.activeLayerIndex) ? 1.0 : 0.45;
            this.ctx.drawImage(tempCanvas, 0, 0);
        });
    }

    setupDrawEvents() {
        const getMousePos = (e) => {
            const rect = this.mainCanvas.getBoundingClientRect();
            return {
                x: ((e.clientX - rect.left) / rect.width) * 512,
                y: ((e.clientY - rect.top) / rect.height) * 512
            };
        };

        const draw = (e) => {
            if (!this.isDrawing) return;
            const pos = getMousePos(e);
            
            const activeCtx = this.layers[this.activeLayerIndex].getContext("2d");
            
            activeCtx.globalCompositeOperation = e.buttons === 2 ? "destination-out" : "source-over";
            activeCtx.fillStyle = this.getLayerColor(this.activeLayerIndex);
            
            activeCtx.beginPath();
            activeCtx.arc(pos.x, pos.y, this.brushSize, 0, Math.PI * 2);
            activeCtx.fill();
            
            activeCtx.globalCompositeOperation = "source-over"; 
            
            this.redrawWorkspace();
        };

        this.mainCanvas.onmousedown = (e) => {
            e.preventDefault();
            this.isDrawing = true;
            draw(e);
        };

        this.mainCanvas.onmousemove = (e) => {
            draw(e);
        };

        this.mainCanvas.onmouseup = () => this.isDrawing = false;
        this.mainCanvas.onmouseleave = () => this.isDrawing = false;
        this.mainCanvas.oncontextmenu = (e) => e.preventDefault();
    }

    setupKeyboardEvents() {
        this._keydownRef = (e) => {
            if (e.key === "ArrowUp") {
                e.preventDefault();
                if (this.activeLayerIndex > 0) {
                    this.activeLayerIndex--;
                    this.redrawWorkspace();
                }
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                if (this.activeLayerIndex < this.layers.length - 1) {
                    this.activeLayerIndex++;
                    this.redrawWorkspace();
                } else {
                    if (!this.isCanvasEmpty(this.layers[this.activeLayerIndex])) {
                        this.addLayer();
                    }
                }
            }
        };
        window.addEventListener("keydown", this._keydownRef);
    }

    close() {
        window.removeEventListener("keydown", this._keydownRef);
        super.close();
    }

    async save() {
        // Clean out empty layers
        let validLayers = [];
        let validSettings = [];
        for(let i = 0; i < this.layers.length; i++) {
            if (!this.isCanvasEmpty(this.layers[i])) {
                validLayers.push(this.layers[i]);
                validSettings.push(this.layerSettings[i]);
            }
        }
        
        if (validLayers.length === 0) {
            validLayers = [this.layers[0]];
            validSettings = [this.layerSettings[0]];
        }
        
        this.layers = validLayers;
        this.layerSettings = validSettings;
        this.activeLayerIndex = Math.min(this.activeLayerIndex, this.layers.length - 1);
        this.redrawWorkspace();

        // COMPUTE MASKS (Applies Non-Destructive Subtraction math)
        const b64Computed = this.layers.map((layerCanvas, idx) => {
            const temp = document.createElement("canvas");
            temp.width = 512; temp.height = 512;
            const tCtx = temp.getContext("2d");
            
            tCtx.drawImage(layerCanvas, 0, 0); 
            
            tCtx.globalCompositeOperation = "destination-out";
            for (let j = idx + 1; j < this.layers.length; j++) {
                if (this.layerSettings[j].subtract) {
                    tCtx.drawImage(this.layers[j], 0, 0);
                }
            }
            
            tCtx.globalCompositeOperation = "destination-over";
            tCtx.fillStyle = "#000000";
            tCtx.fillRect(0, 0, 512, 512); 
            
            return temp.toDataURL("image/png");
        });

        // COMPUTE RAW (Saves untouched RGBA transparent strokes)
        const b64Raw = this.layers.map(canvas => canvas.toDataURL("image/png"));
        
        // COMPUTE PREVIEW (Visual reflection of the GUI workspace)
        const previewCanvas = document.createElement("canvas");
        previewCanvas.width = 512; previewCanvas.height = 512;
        const pCtx = previewCanvas.getContext("2d");
        pCtx.fillStyle = "#000000";
        pCtx.fillRect(0, 0, 512, 512);
        
        this.layers.forEach((layer, idx) => {
            const temp = document.createElement("canvas");
            temp.width = 512; temp.height = 512;
            const tCtx = temp.getContext("2d");
            tCtx.drawImage(layer, 0, 0);

            tCtx.globalCompositeOperation = "destination-out";
            for (let j = idx + 1; j < this.layers.length; j++) {
                if (this.layerSettings[j].subtract) {
                    tCtx.drawImage(this.layers[j], 0, 0);
                }
            }
            pCtx.drawImage(temp, 0, 0);
        });
        const previewB64 = previewCanvas.toDataURL("image/png");

        const instantPreviewImg = new Image();
        instantPreviewImg.src = previewB64;
        instantPreviewImg.onload = () => {
            this.node.imgs = [instantPreviewImg];
            app.graph.setDirtyCanvas(true, true);
        };
        
        try {
            const response = await fetch("/moon/save_masks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    node_id: this.node.id,
                    layers: b64Computed,
                    raw_layers: b64Raw,
                    settings: this.layerSettings,
                    preview: previewB64
                })
            });
            const data = await response.json();
            this.onSave(data); // Send whole object to widget
            this.close();
        } catch (error) {
            console.error("Failed to save masks to the server:", error);
            alert("Error saving masks. Check console logs.");
        }
    }
}

app.registerExtension({
    name: "MoonNodes.MoonMaskMakerGUI",
    
    async nodeCreated(node) {
        if (node.comfyClass === "MoonMaskMakerGUI") {
            const maskNamesWidget = node.widgets?.find(w => w.name === "mask_names");
            if (maskNamesWidget) {
                maskNamesWidget.type = "hidden";
                maskNamesWidget.computeSize = () => [0, 0];
                if (maskNamesWidget.inputEl) {
                    maskNamesWidget.inputEl.style.display = "none";
                }
            }
        }
    },

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "MoonMaskMakerGUI") {
            const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
            nodeType.prototype.getExtraMenuOptions = function(canvas, options) {
                getExtraMenuOptions?.apply(this, arguments);
                
                options.push({
                    content: "Open Painting GUI...",
                    callback: () => {
                        const maskNamesWidget = this.widgets.find(w => w.name === "mask_names");
                        let existingData = null;
                        try {
                            existingData = JSON.parse(maskNamesWidget.value);
                        } catch(e) {}

                        const dialog = new MoonMaskDialog(this, (dataObj) => {
                            maskNamesWidget.value = JSON.stringify(dataObj);
                            this.setDirtyCanvas(true, true);
                        });
                        dialog.show();
                        dialog.createDOM(existingData);
                    }
                });
            };
        }
    }
});