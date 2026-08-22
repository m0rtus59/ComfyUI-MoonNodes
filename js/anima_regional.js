import { app } from "../../scripts/app.js";

function toggleWidget(widget, show) {
    if (!widget) return;

    // Cache original LiteGraph properties on first run
    if (!widget.origType) {
        widget.origType = widget.type || "number";
        widget.origComputeSize = widget.computeSize;
    }

    if (show) {
        widget.type = widget.origType;
        widget.computeSize = widget.origComputeSize;
        widget.hidden = false;
    } else {
        widget.type = "hidden";
        widget.computeSize = () => [0, -4]; // Collapses vertical space on LiteGraph canvas
        widget.hidden = true;               // Triggers reactive DOM hiding in Vue
    }
}

app.registerExtension({
    name: "MoonNodes.AnimaRegionalDynamicWidgets",
    async nodeCreated(node) {
        if (node.comfyClass !== "MoonAnimaRegionalPatcherAdvanced") return;

        const promptModeWidget = node.widgets?.find(w => w.name === "prompt_mode");
        const startWidget = node.widgets?.find(w => w.name === "conditioning_start_percent");
        const dropoffWidget = node.widgets?.find(w => w.name === "conditioning_dropoff");

        if (!promptModeWidget || !startWidget || !dropoffWidget) return;

        function updateVisibility() {
            const isBaseOnly = promptModeWidget.value === "base_only";
            const show = !isBaseOnly;

            toggleWidget(startWidget, show);
            toggleWidget(dropoffWidget, show);

            // Recompute node bounding box for canvas
            node.setSize?.(node.computeSize?.());
            app.graph?.setDirtyCanvas?.(true, true);
        }

        // Trigger on dropdown selection change
        const originalCallback = promptModeWidget.callback;
        promptModeWidget.callback = function (value) {
            const result = originalCallback ? originalCallback.apply(this, arguments) : undefined;
            updateVisibility();
            return result;
        };

        // Trigger when loading saved workflows / templates
        const originalOnConfigure = node.onConfigure;
        node.onConfigure = function () {
            const result = originalOnConfigure ? originalOnConfigure.apply(this, arguments) : undefined;
            updateVisibility();
            return result;
        };

        // Initial check on placement
        setTimeout(updateVisibility, 20);
    }
});