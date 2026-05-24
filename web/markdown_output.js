import { app } from "../../../scripts/app.js";

// Global helper to handle highly robust copying (with legacy fallback for non-secure HTTP contexts)
window.moonCopyCode = function(button) {
    try {
        const container = button.parentElement;
        if (!container) return;
        
        const codeEl = container.querySelector("code");
        if (!codeEl) return;
        
        const text = codeEl.innerText;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => showSuccessState(button))
                .catch(() => fallbackCopyToClipboard(button, text));
        } else {
            fallbackCopyToClipboard(button, text);
        }
    } catch (e) {
        button.innerText = "Error";
        setTimeout(() => button.innerText = "Copy", 1500);
    }
};

function fallbackCopyToClipboard(button, text) {
    try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);
        
        if (successful) {
            showSuccessState(button);
        } else {
            button.innerText = "Error";
            setTimeout(() => button.innerText = "Copy", 1500);
        }
    } catch (err) {
        button.innerText = "Error";
        setTimeout(() => button.innerText = "Copy", 1500);
    }
}

function showSuccessState(button) {
    button.innerText = "Copied!";
    button.style.backgroundColor = "#4CAF50";
    button.style.borderColor = "#45a049";
    button.style.color = "#ffffff";
    setTimeout(() => {
        button.innerText = "Copy";
        button.style.backgroundColor = "#333333";
        button.style.borderColor = "#555555";
        button.style.color = "#aaaaaa";
    }, 1500);
}

// A lightweight, robust, offline-safe line-by-line Markdown to HTML converter
function parseMarkdown(text) {
    if (!text) return "";
    
    // Escape HTML to prevent injection issues (Safe: do NOT escape ">" so we can parse blockquotes!)
    let rawLines = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .split("\n");

    let htmlLines = [];
    let inCodeBlock = false;
    let codeContent = [];

    for (let line of rawLines) {
        // Code block detector (```code```)
        if (line.trim().startsWith("```")) {
            if (inCodeBlock) {
                const rCode = codeContent.join("\n");
                
                const btnStyle = "position:absolute;top:6px;right:6px;background:#333;color:#aaa;border:1px solid #555;border-radius:3px;padding:3px 8px;font-size:10px;cursor:pointer;font-family:sans-serif;user-select:none;pointer-events:auto;z-index:20;transition:background 0.15s, border-color 0.15s, color 0.15s;";
                const hoverStyle = "this.style.background='#444';this.style.color='#fff';";
                const normalStyle = "this.style.background='#333';this.style.color='#aaa';";

                htmlLines.push(`<div class="code-block-container" style="position:relative; margin: 8px 0;"><button onclick="window.moonCopyCode(this)" onmouseover="${hoverStyle}" onmouseout="${normalStyle}" style="${btnStyle}">Copy</button><pre style="background:#1e1e1e;padding:10px;padding-top:28px;border-radius:4px;border:1px solid #333;font-family:monospace;overflow-x:auto;margin:0;color:#85c5ec;position:relative;z-index:10;"><code>${rCode}</code></pre></div>`);
                
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
        // Unordered lists & Task Lists (- [ ] or - [x])
        else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
            let content = trimmed.slice(2).trim();
            
            if (content.startsWith("[ ]")) {
                htmlLines.push(`<li style="margin-left:20px;margin-bottom:4px;color:#ddd;list-style-type:none;"><input type="checkbox" disabled style="margin-right:6px;vertical-align:middle;pointer-events:none;">${content.slice(3).trim()}</li>`);
            } else if (content.toLowerCase().startsWith("[x]")) {
                htmlLines.push(`<li style="margin-left:20px;margin-bottom:4px;color:#ddd;list-style-type:none;"><input type="checkbox" checked disabled style="margin-right:6px;vertical-align:middle;pointer-events:none;">${content.slice(3).trim()}</li>`);
            } else {
                htmlLines.push(`<li style="margin-left:20px;margin-bottom:4px;color:#ddd;">${content}</li>`);
            }
        }
        // Ordered lists (1. 2. etc)
        else if (/^\d+\.\s/.test(trimmed)) {
            const match = trimmed.match(/^(\d+\.\s)(.*)/);
            htmlLines.push(`<li style="margin-left:20px;list-style-type:decimal;margin-bottom:4px;color:#ddd;">${match[2]}</li>`);
        }
        // Nested Blockquotes (> or >> or >>>)
        else if (trimmed.startsWith(">")) {
            const match = trimmed.match(/^([>\s]+)(.*)/);
            if (match) {
                const depth = (match[1].match(/>/g) || []).length;
                const content = match[2].trim();
                
                let quote = content;
                for (let d = 0; d < depth; d++) {
                    quote = `<blockquote style="border-left:4px solid #4CAF50;margin:6px 0;padding-left:10px;color:#aaa;font-style:italic;background-color:rgba(255,255,255,0.015);">${quote}</blockquote>`;
                }
                htmlLines.push(quote);
            }
        }
        // Normal text line
        else {
            htmlLines.push(line);
        }
    }

    let html = htmlLines.join("\n");

    // Post-processing inline elements:
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#ffffff;font-weight:600;">$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong style="color:#ffffff;font-weight:600;">$1</strong>');
    
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');
    
    // Inline code
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
                
                this.addDOMWidget("markdown_display", "div", div, {
                    getValue() { return div.innerHTML; },
                    setValue(v) { div.innerHTML = v; }
                });
                
                this.markdownContainer = div;
                this.size = [450, 220]; 
            };

            nodeType.prototype.onResize = function(size) {
                if (this.markdownContainer) {
                    this.markdownContainer.style.height = (size[1] - 50) + "px";
                }
            };

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