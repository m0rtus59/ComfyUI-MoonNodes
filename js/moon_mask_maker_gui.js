import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { ComfyDialog } from "../../../scripts/ui.js";

const LAYER_COLORS = [
    "#FF0000", "#00FF00", "#0000FF", "#FFFF00",
    "#FF00FF", "#00FFFF", "#FF8000", "#8000FF",
];

const MIN_CANVAS_SIZE = 64;
const MAX_CANVAS_SIZE = 4096;
const MAX_DISPLAY_WIDTH = 680;
const MAX_DISPLAY_HEIGHT = 680;

function clampDimension(value, fallback = 512) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(MIN_CANVAS_SIZE, Math.min(MAX_CANVAS_SIZE, parsed));
}

function getWidget(node, name) {
    return node.widgets?.find((widget) => widget.name === name);
}

function restorePreview(node) {
    if (!node?.id) return;

    const maskNamesWidget = getWidget(node, "mask_names");
    const previewFilename = `moon_mask_preview_${node.id}.png`;
    const imgInfo = [{ filename: previewFilename, type: "input", subfolder: "" }];

    node.images = imgInfo;
    if (node._state) node._state.images = imgInfo;
    if (app.nodeOutputs) {
        app.nodeOutputs[String(node.id)] = { images: imgInfo };
        app.nodeOutputs[node.id] = { images: imgInfo };
    }

    let previewSrc = `/view?filename=${encodeURIComponent(previewFilename)}&type=input&subfolder=&t=${Date.now()}`;
    if (maskNamesWidget?.value) {
        try {
            const data = typeof maskNamesWidget.value === "string"
                ? JSON.parse(maskNamesWidget.value)
                : maskNamesWidget.value;
            const embedded = data?.composite || data?.preview;
            if (embedded?.startsWith("data:image")) previewSrc = embedded;
        } catch (_) {
            // The server-side preview remains the fallback for legacy workflows.
        }
    }

    const img = new Image();
    img.src = previewSrc;
    img.onload = () => {
        node.imgs = [img];
        app.graph?.setDirtyCanvas(true, true);
    };
}

function openMaskGUI(node) {
    const maskNamesWidget = getWidget(node, "mask_names");
    let existingData = null;
    try {
        existingData = typeof maskNamesWidget?.value === "string"
            ? JSON.parse(maskNamesWidget.value)
            : maskNamesWidget?.value;
    } catch (_) {
        existingData = null;
    }

    const dialog = new MoonMaskDialog(node, (data) => {
        if (maskNamesWidget) {
            const serialized = JSON.stringify(data);
            maskNamesWidget.value = serialized;
            if (maskNamesWidget._state) maskNamesWidget._state.value = serialized;
            maskNamesWidget.callback?.(serialized);
        }
        restorePreview(node);
    });
    dialog.show();
    dialog.createDOM(existingData);
}

class MoonMaskDialog extends ComfyDialog {
    constructor(node, onSave) {
        super();
        this.node = node;
        this.onSave = onSave;
        this.layers = [];
        this.layerSettings = [];
        this.activeLayerIndex = 0;
        this.brushSize = 40;
        this.isDrawing = false;
        this.lastDrawPosition = null;
        this.canvasWidth = 512;
        this.canvasHeight = 512;
        this.referenceImage = null;
        this.referenceDataUrl = "";
        this.referenceOpacity = 0.65;
        this.referenceFit = "contain";
        this.maskOpacity = 0.72;
        this.compositeBackground = "white";

        this.element.style.width = "min(1120px, 96vw)";
        this.element.style.height = "min(900px, 94vh)";
        this.element.style.backgroundColor = "#202020";
        this.element.style.color = "#ffffff";
        this.element.style.padding = "16px";
        this.element.style.display = "flex";
        this.element.style.flexDirection = "column";
        this.element.style.borderRadius = "8px";
        this.element.style.border = "1px solid #484848";
        this.element.style.overflow = "hidden";
    }

    isCanvasEmpty(canvas) {
        const ctx = canvas.getContext("2d");
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < pixels.length; i += 4) {
            if (pixels[i] !== 0) return false;
        }
        return true;
    }

    getLayerColor(index) {
        return LAYER_COLORS[index % LAYER_COLORS.length];
    }

    createLayerCanvas() {
        const canvas = document.createElement("canvas");
        canvas.width = this.canvasWidth;
        canvas.height = this.canvasHeight;
        return canvas;
    }

    createDOM(existingData) {
        this.element.innerHTML = "";

        this.canvasWidth = clampDimension(existingData?.canvas_width, 512);
        this.canvasHeight = clampDimension(existingData?.canvas_height, 512);

        const hasLegacyData = Array.isArray(existingData)
            ? existingData.length > 0
            : Boolean(existingData?.raw?.length || existingData?.computed?.length);
        this.compositeBackground = existingData?.composite_background || (hasLegacyData ? "black" : "white");
        this.referenceOpacity = Number(existingData?.reference?.opacity ?? 0.65);
        this.referenceFit = existingData?.reference?.fit || "contain";
        this.maskOpacity = Number(existingData?.mask_opacity ?? 0.72);

        const header = document.createElement("div");
        header.style.display = "flex";
        header.style.justifyContent = "space-between";
        header.style.alignItems = "center";
        header.style.gap = "16px";
        header.style.marginBottom = "12px";
        header.innerHTML = "<h3 style='margin:0;font-size:16px;'>Moon Mask Maker GUI</h3><span style='color:#999;font-size:12px;'>Arrow Up/Down: switch or add layers</span>";
        this.element.appendChild(header);

        const toolbar = document.createElement("div");
        toolbar.style.display = "flex";
        toolbar.style.flexWrap = "wrap";
        toolbar.style.alignItems = "center";
        toolbar.style.gap = "8px";
        toolbar.style.marginBottom = "12px";
        this.element.appendChild(toolbar);

        const widthInput = this.makeNumberInput(this.canvasWidth, "Width");
        const heightInput = this.makeNumberInput(this.canvasHeight, "Height");
        toolbar.appendChild(widthInput.wrapper);
        toolbar.appendChild(heightInput.wrapper);

        const applySizeButton = this.makeButton("Apply Size", "#444");
        applySizeButton.onclick = () => {
            this.resizeCanvases(widthInput.input.value, heightInput.input.value, true);
            widthInput.input.value = this.canvasWidth;
            heightInput.input.value = this.canvasHeight;
        };
        toolbar.appendChild(applySizeButton);

        const referenceInput = document.createElement("input");
        referenceInput.type = "file";
        referenceInput.accept = "image/*";
        referenceInput.style.display = "none";
        referenceInput.onchange = () => {
            const file = referenceInput.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => this.loadReference(String(reader.result));
            reader.readAsDataURL(file);
            referenceInput.value = "";
        };
        toolbar.appendChild(referenceInput);

        const loadReferenceButton = this.makeButton("Load Reference", "#315b7d");
        loadReferenceButton.onclick = () => referenceInput.click();
        toolbar.appendChild(loadReferenceButton);

        this.useReferenceSizeButton = this.makeButton("Use Reference Size", "#315b7d");
        this.useReferenceSizeButton.disabled = true;
        this.useReferenceSizeButton.onclick = () => {
            if (!this.referenceImage) return;
            this.resizeCanvases(this.referenceImage.naturalWidth, this.referenceImage.naturalHeight, true);
            widthInput.input.value = this.canvasWidth;
            heightInput.input.value = this.canvasHeight;
        };
        toolbar.appendChild(this.useReferenceSizeButton);

        const clearReferenceButton = this.makeButton("Remove Reference", "#593d3d");
        clearReferenceButton.onclick = () => {
            this.referenceImage = null;
            this.referenceDataUrl = "";
            this.useReferenceSizeButton.disabled = true;
            this.redrawReference();
        };
        toolbar.appendChild(clearReferenceButton);

        const fitLabel = document.createElement("label");
        fitLabel.style.fontSize = "12px";
        fitLabel.textContent = "Reference fit ";
        this.fitSelect = document.createElement("select");
        ["contain", "cover", "stretch"].forEach((value) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            this.fitSelect.appendChild(option);
        });
        this.fitSelect.value = this.referenceFit;
        this.fitSelect.onchange = () => {
            this.referenceFit = this.fitSelect.value;
            this.redrawReference();
        };
        fitLabel.appendChild(this.fitSelect);
        toolbar.appendChild(fitLabel);

        const backgroundLabel = document.createElement("label");
        backgroundLabel.style.fontSize = "12px";
        backgroundLabel.textContent = "Composite background ";
        this.backgroundSelect = document.createElement("select");
        ["white", "black"].forEach((value) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            this.backgroundSelect.appendChild(option);
        });
        this.backgroundSelect.value = this.compositeBackground;
        this.backgroundSelect.onchange = () => {
            this.compositeBackground = this.backgroundSelect.value;
            this.canvasWrapper.style.backgroundColor = this.compositeBackground;
        };
        backgroundLabel.appendChild(this.backgroundSelect);
        toolbar.appendChild(backgroundLabel);

        const workspace = document.createElement("div");
        workspace.style.display = "flex";
        workspace.style.flex = "1";
        workspace.style.gap = "16px";
        workspace.style.minHeight = "0";
        workspace.style.overflow = "auto";
        this.element.appendChild(workspace);

        this.sidebar = document.createElement("div");
        this.sidebar.style.width = "220px";
        this.sidebar.style.flex = "0 0 220px";
        this.sidebar.style.backgroundColor = "#181818";
        this.sidebar.style.padding = "10px";
        this.sidebar.style.display = "flex";
        this.sidebar.style.flexDirection = "column";
        this.sidebar.style.gap = "8px";
        this.sidebar.style.overflowY = "auto";
        this.sidebar.style.borderRadius = "4px";
        workspace.appendChild(this.sidebar);

        const canvasArea = document.createElement("div");
        canvasArea.style.flex = "1";
        canvasArea.style.display = "flex";
        // Keep overflowing canvases anchored at the scroll origin. Centering a
        // child larger than a flex scroll area creates negative overflow, which
        // makes the top of a tall canvas impossible to scroll back into view.
        canvasArea.style.alignItems = "flex-start";
        canvasArea.style.justifyContent = "flex-start";
        canvasArea.style.minWidth = "0";
        canvasArea.style.minHeight = "0";
        canvasArea.style.overflow = "auto";
        canvasArea.style.padding = "8px";
        canvasArea.style.boxSizing = "border-box";
        workspace.appendChild(canvasArea);

        this.canvasWrapper = document.createElement("div");
        this.canvasWrapper.style.position = "relative";
        this.canvasWrapper.style.backgroundColor = this.compositeBackground;
        this.canvasWrapper.style.border = "1px solid #555";
        this.canvasWrapper.style.overflow = "hidden";
        this.canvasWrapper.style.flex = "0 0 auto";
        this.canvasWrapper.style.margin = "0 auto";
        canvasArea.appendChild(this.canvasWrapper);

        this.referenceCanvas = document.createElement("canvas");
        this.referenceCanvas.width = this.canvasWidth;
        this.referenceCanvas.height = this.canvasHeight;
        this.referenceCanvas.style.position = "absolute";
        this.referenceCanvas.style.inset = "0";
        this.referenceCanvas.style.width = "100%";
        this.referenceCanvas.style.height = "100%";
        this.referenceCanvas.style.zIndex = "1";
        this.canvasWrapper.appendChild(this.referenceCanvas);

        this.mainCanvas = document.createElement("canvas");
        this.mainCanvas.width = this.canvasWidth;
        this.mainCanvas.height = this.canvasHeight;
        this.mainCanvas.style.position = "absolute";
        this.mainCanvas.style.inset = "0";
        this.mainCanvas.style.width = "100%";
        this.mainCanvas.style.height = "100%";
        this.mainCanvas.style.cursor = "crosshair";
        this.mainCanvas.style.zIndex = "2";
        this.canvasWrapper.appendChild(this.mainCanvas);
        this.ctx = this.mainCanvas.getContext("2d");
        this.updateCanvasDisplaySize();

        const footer = document.createElement("div");
        footer.style.display = "flex";
        footer.style.flexWrap = "wrap";
        footer.style.justifyContent = "space-between";
        footer.style.alignItems = "center";
        footer.style.gap = "12px";
        footer.style.marginTop = "12px";
        this.element.appendChild(footer);

        const sliders = document.createElement("div");
        sliders.style.display = "flex";
        sliders.style.flexWrap = "wrap";
        sliders.style.alignItems = "center";
        sliders.style.gap = "14px";
        footer.appendChild(sliders);
        sliders.appendChild(this.makeSlider("Brush", 3, 256, this.brushSize, 1, (value) => { this.brushSize = value; }));
        sliders.appendChild(this.makeSlider("Reference", 0, 1, this.referenceOpacity, 0.05, (value) => {
            this.referenceOpacity = value;
            this.redrawReference();
        }));
        sliders.appendChild(this.makeSlider("Masks", 0.1, 1, this.maskOpacity, 0.05, (value) => {
            this.maskOpacity = value;
            this.redrawWorkspace();
        }));

        const buttons = document.createElement("div");
        buttons.style.display = "flex";
        buttons.style.gap = "8px";
        footer.appendChild(buttons);

        const clearButton = this.makeButton("Clear All", "#8a5b13");
        clearButton.onclick = () => {
            if (!confirm("Clear all painted masks?")) return;
            this.layers = [this.createLayerCanvas()];
            this.layerSettings = [{ subtract: false }];
            this.activeLayerIndex = 0;
            this.redrawWorkspace();
        };
        buttons.appendChild(clearButton);

        const saveButton = this.makeButton("Save to Node", "#337a37");
        saveButton.onclick = () => this.save();
        buttons.appendChild(saveButton);

        const closeButton = this.makeButton("Cancel", "#8b3333");
        closeButton.onclick = () => this.close();
        buttons.appendChild(closeButton);

        this.loadExistingLayers(existingData);
        if (existingData?.reference?.data) this.loadReference(existingData.reference.data);
        this.setupDrawEvents();
        this.setupKeyboardEvents();
        this.redrawWorkspace();
    }

    makeButton(text, backgroundColor) {
        const button = document.createElement("button");
        button.textContent = text;
        button.style.padding = "7px 11px";
        button.style.backgroundColor = backgroundColor;
        button.style.color = "white";
        button.style.border = "1px solid #666";
        button.style.borderRadius = "4px";
        button.style.cursor = "pointer";
        return button;
    }

    makeNumberInput(value, labelText) {
        const wrapper = document.createElement("label");
        wrapper.style.fontSize = "12px";
        wrapper.textContent = `${labelText} `;
        const input = document.createElement("input");
        input.type = "number";
        input.min = String(MIN_CANVAS_SIZE);
        input.max = String(MAX_CANVAS_SIZE);
        input.step = "8";
        input.value = String(value);
        input.style.width = "78px";
        wrapper.appendChild(input);
        return { wrapper, input };
    }

    makeSlider(labelText, min, max, value, step, onInput) {
        const wrapper = document.createElement("label");
        wrapper.style.display = "flex";
        wrapper.style.alignItems = "center";
        wrapper.style.gap = "6px";
        wrapper.style.fontSize = "12px";
        const valueLabel = document.createElement("span");
        valueLabel.textContent = `${labelText}: ${value}`;
        const input = document.createElement("input");
        input.type = "range";
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(value);
        input.oninput = () => {
            const parsed = Number(input.value);
            valueLabel.textContent = `${labelText}: ${parsed}`;
            onInput(parsed);
        };
        wrapper.appendChild(valueLabel);
        wrapper.appendChild(input);
        return wrapper;
    }

    loadExistingLayers(existingData) {
        let rawFiles = [];
        let loadedSettings = [];
        let isLegacy = false;
        if (existingData && !Array.isArray(existingData) && existingData.raw) {
            rawFiles = existingData.raw;
            loadedSettings = existingData.settings || [];
        } else if (Array.isArray(existingData) && existingData.length > 0) {
            rawFiles = existingData;
            isLegacy = true;
        }

        if (rawFiles.length === 0) {
            this.addLayer(false);
            return;
        }

        let loadedCount = 0;
        rawFiles.forEach((source, index) => {
            const layerCanvas = this.createLayerCanvas();
            const image = new Image();
            image.src = source.startsWith("data:")
                ? source
                : `/view?filename=${encodeURIComponent(source)}&type=input&subfolder=&t=${Date.now()}`;
            image.onload = () => {
                const ctx = layerCanvas.getContext("2d");
                ctx.drawImage(image, 0, 0, this.canvasWidth, this.canvasHeight);
                this.recolorLayer(layerCanvas, this.getLayerColor(index), isLegacy);
                loadedCount += 1;
                if (loadedCount === rawFiles.length) this.redrawWorkspace();
            };
            this.layers.push(layerCanvas);
            this.layerSettings.push(loadedSettings[index] || { subtract: false });
        });
    }

    recolorLayer(canvas, color, legacyLuminance = false) {
        const ctx = canvas.getContext("2d");
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const red = Number.parseInt(color.slice(1, 3), 16);
        const green = Number.parseInt(color.slice(3, 5), 16);
        const blue = Number.parseInt(color.slice(5, 7), 16);
        for (let i = 0; i < data.length; i += 4) {
            const visible = legacyLuminance
                ? data[i] > 10 || data[i + 1] > 10 || data[i + 2] > 10
                : data[i + 3] > 10;
            if (visible) {
                data[i] = red;
                data[i + 1] = green;
                data[i + 2] = blue;
                data[i + 3] = 255;
            } else {
                data[i] = 0;
                data[i + 1] = 0;
                data[i + 2] = 0;
                data[i + 3] = 0;
            }
        }
        ctx.putImageData(imageData, 0, 0);
    }

    addLayer(redraw = true) {
        this.layers.push(this.createLayerCanvas());
        this.layerSettings.push({ subtract: false });
        this.activeLayerIndex = this.layers.length - 1;
        if (redraw) this.redrawWorkspace();
    }

    deleteLayer(index) {
        if (this.layers.length <= 1) return;
        this.layers.splice(index, 1);
        this.layerSettings.splice(index, 1);
        this.activeLayerIndex = Math.min(this.activeLayerIndex, this.layers.length - 1);
        this.layers.forEach((layer, layerIndex) => this.recolorLayer(layer, this.getLayerColor(layerIndex)));
        this.redrawWorkspace();
    }

    resizeCanvases(width, height, preserveContents) {
        const nextWidth = clampDimension(width, this.canvasWidth);
        const nextHeight = clampDimension(height, this.canvasHeight);
        if (nextWidth === this.canvasWidth && nextHeight === this.canvasHeight) return;

        this.layers = this.layers.map((oldCanvas) => {
            const nextCanvas = document.createElement("canvas");
            nextCanvas.width = nextWidth;
            nextCanvas.height = nextHeight;
            if (preserveContents) nextCanvas.getContext("2d").drawImage(oldCanvas, 0, 0, nextWidth, nextHeight);
            return nextCanvas;
        });
        this.canvasWidth = nextWidth;
        this.canvasHeight = nextHeight;
        this.mainCanvas.width = nextWidth;
        this.mainCanvas.height = nextHeight;
        this.referenceCanvas.width = nextWidth;
        this.referenceCanvas.height = nextHeight;
        this.ctx = this.mainCanvas.getContext("2d");
        this.updateCanvasDisplaySize();
        this.redrawReference();
        this.redrawWorkspace();
    }

    updateCanvasDisplaySize() {
        const scale = Math.min(
            MAX_DISPLAY_WIDTH / this.canvasWidth,
            MAX_DISPLAY_HEIGHT / this.canvasHeight,
            1,
        );
        this.canvasWrapper.style.width = `${Math.max(1, Math.round(this.canvasWidth * scale))}px`;
        this.canvasWrapper.style.height = `${Math.max(1, Math.round(this.canvasHeight * scale))}px`;
    }

    loadReference(dataUrl) {
        const image = new Image();
        image.onload = () => {
            this.referenceImage = image;
            this.referenceDataUrl = dataUrl;
            this.useReferenceSizeButton.disabled = false;
            this.redrawReference();
        };
        image.onerror = () => alert("The reference image could not be loaded.");
        image.src = dataUrl;
    }

    redrawReference() {
        if (!this.referenceCanvas) return;
        const ctx = this.referenceCanvas.getContext("2d");
        ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        if (!this.referenceImage) return;

        const imageWidth = this.referenceImage.naturalWidth;
        const imageHeight = this.referenceImage.naturalHeight;
        let drawX = 0;
        let drawY = 0;
        let drawWidth = this.canvasWidth;
        let drawHeight = this.canvasHeight;
        if (this.referenceFit !== "stretch") {
            const scale = this.referenceFit === "cover"
                ? Math.max(this.canvasWidth / imageWidth, this.canvasHeight / imageHeight)
                : Math.min(this.canvasWidth / imageWidth, this.canvasHeight / imageHeight);
            drawWidth = imageWidth * scale;
            drawHeight = imageHeight * scale;
            drawX = (this.canvasWidth - drawWidth) / 2;
            drawY = (this.canvasHeight - drawHeight) / 2;
        }

        ctx.save();
        ctx.globalAlpha = this.referenceOpacity;
        ctx.drawImage(this.referenceImage, drawX, drawY, drawWidth, drawHeight);
        ctx.restore();
    }

    buildProcessedLayer(index, binary = false) {
        const canvas = document.createElement("canvas");
        canvas.width = this.canvasWidth;
        canvas.height = this.canvasHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(this.layers[index], 0, 0);
        ctx.globalCompositeOperation = "destination-out";
        for (let j = index + 1; j < this.layers.length; j += 1) {
            if (this.layerSettings[j].subtract) ctx.drawImage(this.layers[j], 0, 0);
        }
        if (binary) {
            ctx.globalCompositeOperation = "source-in";
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
        }
        ctx.globalCompositeOperation = "source-over";
        return canvas;
    }

    redrawWorkspace() {
        if (!this.sidebar || !this.ctx) return;
        this.sidebar.innerHTML = "";

        const label = document.createElement("div");
        label.textContent = "LAYER LIST";
        label.style.fontWeight = "bold";
        label.style.fontSize = "11px";
        label.style.color = "#888";
        this.sidebar.appendChild(label);

        this.layers.forEach((_, index) => {
            const item = document.createElement("div");
            item.style.display = "flex";
            item.style.justifyContent = "space-between";
            item.style.alignItems = "center";
            item.style.padding = "7px";
            item.style.borderRadius = "4px";
            item.style.cursor = "pointer";
            item.style.backgroundColor = index === this.activeLayerIndex ? "#444" : "#262626";
            item.style.border = index === this.activeLayerIndex ? `1px solid ${this.getLayerColor(index)}` : "1px solid transparent";
            item.onclick = () => {
                this.activeLayerIndex = index;
                this.redrawWorkspace();
            };

            const name = document.createElement("span");
            name.style.display = "flex";
            name.style.alignItems = "center";
            name.style.gap = "7px";
            name.style.fontSize = "12px";
            const swatch = document.createElement("span");
            swatch.style.width = "12px";
            swatch.style.height = "12px";
            swatch.style.backgroundColor = this.getLayerColor(index);
            swatch.style.border = "1px solid #aaa";
            name.appendChild(swatch);
            name.appendChild(document.createTextNode(`Mask ${index}`));
            item.appendChild(name);

            const actions = document.createElement("span");
            actions.style.display = "flex";
            actions.style.alignItems = "center";
            actions.style.gap = "7px";
            const subtractLabel = document.createElement("label");
            subtractLabel.style.fontSize = "11px";
            subtractLabel.style.color = "#bbb";
            const subtract = document.createElement("input");
            subtract.type = "checkbox";
            subtract.checked = Boolean(this.layerSettings[index].subtract);
            subtract.onclick = (event) => event.stopPropagation();
            subtract.onchange = (event) => {
                this.layerSettings[index].subtract = event.target.checked;
                this.redrawWorkspace();
            };
            subtractLabel.appendChild(subtract);
            subtractLabel.appendChild(document.createTextNode(" subtract"));
            actions.appendChild(subtractLabel);

            const remove = document.createElement("button");
            remove.textContent = "×";
            remove.title = "Delete layer";
            remove.style.color = "#ff7777";
            remove.style.background = "transparent";
            remove.style.border = "0";
            remove.style.cursor = "pointer";
            remove.onclick = (event) => {
                event.stopPropagation();
                this.deleteLayer(index);
            };
            actions.appendChild(remove);
            item.appendChild(actions);
            this.sidebar.appendChild(item);
        });

        const addButton = this.makeButton("+ Add Layer", "#333");
        addButton.onclick = () => this.addLayer();
        this.sidebar.appendChild(addButton);

        this.ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
        this.layers.forEach((_, index) => {
            this.ctx.globalAlpha = index === this.activeLayerIndex
                ? this.maskOpacity
                : this.maskOpacity * 0.55;
            this.ctx.drawImage(this.buildProcessedLayer(index), 0, 0);
        });
        this.ctx.globalAlpha = 1;
    }

    setupDrawEvents() {
        const getPosition = (event) => {
            const rect = this.mainCanvas.getBoundingClientRect();
            return {
                x: ((event.clientX - rect.left) / rect.width) * this.canvasWidth,
                y: ((event.clientY - rect.top) / rect.height) * this.canvasHeight,
            };
        };

        const paint = (event) => {
            if (!this.isDrawing) return;
            const position = getPosition(event);
            const ctx = this.layers[this.activeLayerIndex].getContext("2d");
            const erase = (event.buttons & 2) === 2;
            ctx.save();
            ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
            ctx.strokeStyle = this.getLayerColor(this.activeLayerIndex);
            ctx.fillStyle = this.getLayerColor(this.activeLayerIndex);
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.lineWidth = this.brushSize * 2;
            if (this.lastDrawPosition) {
                ctx.beginPath();
                ctx.moveTo(this.lastDrawPosition.x, this.lastDrawPosition.y);
                ctx.lineTo(position.x, position.y);
                ctx.stroke();
            } else {
                ctx.beginPath();
                ctx.arc(position.x, position.y, this.brushSize, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
            this.lastDrawPosition = position;
            this.redrawWorkspace();
        };

        this.mainCanvas.onpointerdown = (event) => {
            event.preventDefault();
            this.mainCanvas.setPointerCapture?.(event.pointerId);
            this.isDrawing = true;
            this.lastDrawPosition = null;
            paint(event);
        };
        this.mainCanvas.onpointermove = paint;
        const finish = () => {
            this.isDrawing = false;
            this.lastDrawPosition = null;
        };
        this.mainCanvas.onpointerup = finish;
        this.mainCanvas.onpointercancel = finish;
        this.mainCanvas.onpointerleave = finish;
        this.mainCanvas.oncontextmenu = (event) => event.preventDefault();
    }

    setupKeyboardEvents() {
        this._keydownRef = (event) => {
            if (event.key === "ArrowUp" && this.activeLayerIndex > 0) {
                event.preventDefault();
                this.activeLayerIndex -= 1;
                this.redrawWorkspace();
            } else if (event.key === "ArrowDown") {
                event.preventDefault();
                if (this.activeLayerIndex < this.layers.length - 1) {
                    this.activeLayerIndex += 1;
                    this.redrawWorkspace();
                } else if (!this.isCanvasEmpty(this.layers[this.activeLayerIndex])) {
                    this.addLayer();
                }
            }
        };
        window.addEventListener("keydown", this._keydownRef);
    }

    close() {
        window.removeEventListener("keydown", this._keydownRef);
        super.close();
    }

    buildComposite() {
        const canvas = document.createElement("canvas");
        canvas.width = this.canvasWidth;
        canvas.height = this.canvasHeight;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = this.compositeBackground === "white" ? "#FFFFFF" : "#000000";
        ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
        this.layers.forEach((_, index) => ctx.drawImage(this.buildProcessedLayer(index), 0, 0));
        return canvas;
    }

    async save() {
        const validLayers = [];
        const validSettings = [];
        this.layers.forEach((layer, index) => {
            if (!this.isCanvasEmpty(layer)) {
                validLayers.push(layer);
                validSettings.push(this.layerSettings[index]);
            }
        });
        if (validLayers.length === 0) {
            validLayers.push(this.layers[0]);
            validSettings.push(this.layerSettings[0]);
        }
        this.layers = validLayers;
        this.layerSettings = validSettings;
        this.activeLayerIndex = Math.min(this.activeLayerIndex, this.layers.length - 1);
        this.layers.forEach((layer, index) => this.recolorLayer(layer, this.getLayerColor(index)));
        this.redrawWorkspace();

        const computed = this.layers.map((_, index) => {
            const canvas = this.buildProcessedLayer(index, true);
            const ctx = canvas.getContext("2d");
            ctx.globalCompositeOperation = "destination-over";
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
            return canvas.toDataURL("image/png");
        });
        const raw = this.layers.map((canvas) => canvas.toDataURL("image/png"));
        const composite = this.buildComposite().toDataURL("image/png");

        try {
            const response = await fetch("/moon/save_masks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    node_id: this.node.id,
                    layers: computed,
                    raw_layers: raw,
                    settings: this.layerSettings,
                    preview: composite,
                    canvas_width: this.canvasWidth,
                    canvas_height: this.canvasHeight,
                }),
            });
            if (!response.ok) throw new Error(await response.text());
            const data = await response.json();
            const previewFilename = data.preview || `moon_mask_preview_${this.node.id}.png`;
            const imgInfo = [{ filename: previewFilename, type: "input", subfolder: "" }];
            this.node.images = imgInfo;
            if (this.node._state) this.node._state.images = imgInfo;
            if (app.nodeOutputs) {
                app.nodeOutputs[String(this.node.id)] = { images: imgInfo };
                app.nodeOutputs[this.node.id] = { images: imgInfo };
            }
            try {
                api.dispatchEvent(new CustomEvent("executed", {
                    detail: { node: String(this.node.id), output: { images: imgInfo } },
                }));
            } catch (_) {
                // A normal queue execution will refresh the preview if this event API changes.
            }

            const previewImage = new Image();
            previewImage.src = composite;
            previewImage.onload = () => {
                this.node.imgs = [previewImage];
                app.graph?.setDirtyCanvas(true, true);
            };

            this.onSave({
                computed,
                raw,
                settings: this.layerSettings,
                preview: composite,
                composite,
                composite_background: this.compositeBackground,
                canvas_width: this.canvasWidth,
                canvas_height: this.canvasHeight,
                mask_opacity: this.maskOpacity,
                reference: this.referenceDataUrl ? {
                    data: this.referenceDataUrl,
                    opacity: this.referenceOpacity,
                    fit: this.referenceFit,
                } : null,
            });
            this.close();
        } catch (error) {
            console.error("Failed to save masks to the server:", error);
            alert("Error saving masks. Check the browser and ComfyUI logs.");
        }
    }
}

app.registerExtension({
    name: "MoonNodes.MoonMaskMakerGUI",

    async nodeCreated(node) {
        if (node.comfyClass !== "MoonMaskMakerGUI") return;
        const maskNamesWidget = getWidget(node, "mask_names");
        if (maskNamesWidget) {
            maskNamesWidget.type = "converted-widget";
            maskNamesWidget.hidden = true;
            maskNamesWidget.computeSize = () => [0, 0];
            if (maskNamesWidget._state) {
                maskNamesWidget._state.type = "converted-widget";
                maskNamesWidget._state.hidden = true;
            }
            if (maskNamesWidget.inputEl) maskNamesWidget.inputEl.style.display = "none";
        }

        const openButton = node.addWidget("button", "Edit Masks", null, () => openMaskGUI(node));
        openButton.computeSize = () => [0, 22];
        restorePreview(node);
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "MoonMaskMakerGUI") return;
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function(info) {
            onConfigure?.apply(this, arguments);
            restorePreview(this);
        };

        const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
        nodeType.prototype.getExtraMenuOptions = function(canvas, options) {
            getExtraMenuOptions?.apply(this, arguments);
            options.push({ content: "Edit Masks...", callback: () => openMaskGUI(this) });
        };
    },
});
