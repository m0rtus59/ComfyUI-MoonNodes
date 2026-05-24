import { app } from "../../../scripts/app.js";

// A lightweight, robust, offline-safe line-by-line Markdown to HTML converter
function parseMarkdown(text) {
    if (!text) return "";
    
    // Escape HTML to prevent injection issues
    let rawLines = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .split("\n");

    let htmlLines = [];
    let inCodeBlock = false;
    let codeContent = [];

    for (let line of rawLines) {
        // Code block detector (```code```)
        if (line.trim().startsWith("```")) {
            if (inCodeBlock) {
                htmlLines.push(`<pre style="background:#1e1e1e;padding:10px;border-radius:4px;border:1px solid #333;font-family:monospace;overflow-x:auto;margin:8px 0;color:#85c5ec;"><code>${codeContent.join("\n")}</code></pre>`);
                codeContent = [];
                inCodeBlock = false;
            } else {
                inCodeBlock = true;
            }
            continue;
        }

        if (inCodeBlock) {
            codeContent.push(line);
            continue;
        }

        const trimmed = line.trim();

        // Headers
        if (line.startsWith("### ")) {
            htmlLines.push(`<h3 style="margin:12px 0 6px 0;color:#ffffff;font-weight:600;font-size:14px;">${line.slice(4)}</h3>`);
        } else if (line.startsWith("## ")) {
            htmlLines.push(`<h2 style="margin:16px 0 8px 0;color:#ffffff;font-weight:600;font-size:16px;border-bottom:1px solid #333;padding-bottom:4px;">${line.slice(3)}</h2>`);
        } else if (line.startsWith("# ")) {
            htmlLines.push(`<h1 style="margin:20px 0 10px 0;color:#ffffff;font-weight:700;font-size:18px;border-bottom:2px solid #444;padding-bottom:6px;">${line.slice(2)}</h1>`);
        }
        // Unordered lists (- or *)
        else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
            htmlLines.push(`<li style="margin-left:20px;margin-bottom:4px;color:#ddd;">${trimmed.slice(2)}</li>`);
        }
        // Ordered lists (1. 2. etc)
        else if (/^\d+\.\s/.test(trimmed)) {
            const match = trimmed.match(/^(\d+\.\s)(.*)/);
            htmlLines.push(`<li style="margin-left:20px;list-style-type:decimal;margin-bottom:4px;color:#ddd;">${match[2]}</li>`);
        }
        // Blockquotes (> text)
        else if (trimmed.startsWith("> ")) {
            htmlLines.push(`<blockquote style="border-left:4px solid #4CAF50;margin:8px 0;padding-left:10px;color:#aaa;font-style:italic;">${trimmed.slice(2)}</blockquote>`);
        }
        // Normal text line
        else {
            htmlLines.push(line);
        }
    }

    let html = htmlLines.join("\n");

    // Post-processing inline elements:
    // Bold (**text** or __text__)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#ffffff;font-weight:600;">$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong style="color:#ffffff;font-weight:600;">$1</strong>');
    
    // Italic (*text* or _text_)
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');
    
    // Inline code (`code`)
    html = html.replace(/`([^`]+)`/g, '<code style="background:#252525;padding:2px 4px;border-radius:3px;font-family:monospace;color:#e06c75;">$1</code>');
    
    // Convert newlines to breaks
    html = html.replace(/\n/g, '<br>');

    return html;
}

app.registerExtension({
    name: "MoonNodes.MoonMarkdownOutput",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "MoonMarkdownOutput") {
            
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                onNodeCreated?.apply(this, arguments);
                
                // Create the DOM container to render HTML
                const div = document.createElement("div");
                div.className = "moon-markdown-container";
                div.style.color = "#dddddd";
                div.style.fontFamily = "sans-serif";
                div.style.fontSize = "13px";
                div.style.lineHeight = "1.5";
                div.style.overflowY = "auto";
                div.style.padding = "10px";
                div.style.backgroundColor = "#121212";
                div.style.border = "1px solid #333333";
                div.style.borderRadius = "4px";
                div.style.boxSizing = "border-box";
                div.style.width = "100%";
                div.style.height = "160px";
                div.style.pointerEvents = "auto";
                
                // Add the custom DOM element widget into the node
                this.addDOMWidget("markdown_display", "div", div, {
                    getValue() { return div.innerHTML; },
                    setValue(v) { div.innerHTML = v; }
                });
                
                this.markdownContainer = div;
                this.size = [450, 220]; // Default convenient display size
            };

            // Automatically resize the inner container height when you stretch the node box
            nodeType.prototype.onResize = function(size) {
                if (this.markdownContainer) {
                    this.markdownContainer.style.height = (size[1] - 50) + "px";
                }
            };

            // Catch the UI message event when the Python node finishes rendering
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                onExecuted?.apply(this, arguments);
                if (message?.text && this.markdownContainer) {
                    const rawText = message.text[0];
                    this.markdownContainer.innerHTML = parseMarkdown(rawText);
                    this.setDirtyCanvas(true, true);
                }
            };
        }
    }
});