import { app } from "../../../scripts/app.js";

// Global helper to handle copying
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

// Parses inline styles (Bold, Italic, Strikethrough, Code, Links, Inline Math)
function parseInlineMarkdown(html) {
    if (!html) return "";

    // 1. Inline Code (escapes `code` blocks safely)
    html = html.replace(/`([^`]+)`/g, '<code style="background:#252525;padding:2px 6px;border-radius:3px;font-family:monospace;color:#e06c75;border:1px solid #333;font-size:12px;">$1</code>');

    // 2. Bold and Italic Combined (triple stars)
    html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong style="color:#ffffff;font-weight:600;"><em>$1</em></strong>');
    
    // 3. Bold (**text** or __text__)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#ffffff;font-weight:600;">$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong style="color:#ffffff;font-weight:600;">$1</strong>');

    // 4. Italic (*text* or _text_)
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');

    // 5. Strikethrough (~~text~~)
    html = html.replace(/~~(.*?)~~/g, '<span style="text-decoration:line-through;color:#888;">$1</span>');

    // 6. Hyperlinks ([text](url))
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:#61afef;text-decoration:none;border-bottom:1px dashed #61afef;cursor:pointer;transition:color 0.15s;" onmouseover="this.style.color=\'#98c379\';this.style.borderBottomColor=\'#98c379\'" onmouseout="this.style.color=\'#61afef\';this.style.borderBottomColor=\'#61afef\'">$1</a>');

    // 7. Inline LaTeX ($E = mc^2$ - ignores spaces at boundary boundaries to avoid currency symbol clashes)
    html = html.replace(/\$(?!\s)([^\$]+?)(?<!\s)\$/g, '<span style="font-family:\'Times New Roman\',Times,serif;font-size:14px;color:#e5c07b;font-style:italic;padding:0 2px;">$1</span>');

    return html;
}

// State-aware offline Markdown to HTML parser
function parseMarkdown(text) {
    if (!text) return "";
    
    let rawLines = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .split("\n");

    let htmlLines = [];
    
    // State Tracking
    let inCodeBlock = false;
    let codeContent = [];
    let codeLang = "";
    
    let inUl = false;
    let inOl = false;
    let inTable = false;
    let tableHeaders = [];
    let tableAlignments = [];
    let tableRows = [];

    // State Closers
    function closeUl() {
        if (inUl) {
            htmlLines.push("</ul>");
            inUl = false;
        }
    }
    function closeOl() {
        if (inOl) {
            htmlLines.push("</ol>");
            inOl = false;
        }
    }
    function closeTable() {
        if (inTable) {
            let tableHtml = `<table style="border-collapse:collapse;width:100%;margin:12px 0;font-size:12px;border:1px solid #333;color:#ddd;text-align:left;">`;
            
            if (tableHeaders.length > 0) {
                tableHtml += `<thead style="background:#1a1a1a;font-weight:600;color:#fff;border-bottom:2px solid #444;"><tr>`;
                for (let i = 0; i < tableHeaders.length; i++) {
                    const align = tableAlignments[i] || 'left';
                    tableHtml += `<th style="padding:8px 12px;border:1px solid #333;text-align:${align};">${parseInlineMarkdown(tableHeaders[i])}</th>`;
                }
                tableHtml += `</tr></thead>`;
            }
            
            tableHtml += "<tbody>";
            for (let r = 0; r < tableRows.length; r++) {
                const row = tableRows[r];
                const bg = r % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent';
                tableHtml += `<tr style="background:${bg};border-bottom:1px solid #222;">`;
                for (let i = 0; i < tableHeaders.length; i++) {
                    const align = tableAlignments[i] || 'left';
                    const cellVal = row[i] || '';
                    tableHtml += `<td style="padding:8px 12px;border:1px solid #333;text-align:${align};">${parseInlineMarkdown(cellVal)}</td>`;
                }
                tableHtml += `</tr>`;
            }
            tableHtml += "</tbody></table>";
            htmlLines.push(tableHtml);
            
            inTable = false;
            tableHeaders = [];
            tableAlignments = [];
            tableRows = [];
        }
    }

    for (let line of rawLines) {
        const trimmed = line.trim();

        // 1. Code Block Detector
        if (trimmed.startsWith("```")) {
            closeUl();
            closeOl();
            closeTable();
            
            if (inCodeBlock) {
                const rCode = codeContent.join("\n");
                
                const langBadge = codeLang ? `<div style="position:absolute;top:6px;left:10px;color:#85c5ec;font-size:10px;font-family:sans-serif;font-weight:bold;text-transform:uppercase;opacity:0.8;user-select:none;z-index:20;">${codeLang}</div>` : '';
                const btnStyle = "position:absolute;top:6px;right:6px;background:#333;color:#aaa;border:1px solid #555;border-radius:3px;padding:3px 8px;font-size:10px;cursor:pointer;font-family:sans-serif;user-select:none;pointer-events:auto;z-index:20;transition:background 0.15s, border-color 0.15s, color 0.15s;";
                const hoverStyle = "this.style.background='#444';this.style.color='#fff';";
                const normalStyle = "this.style.background='#333';this.style.color='#aaa';";

                htmlLines.push(`<div class="code-block-container" style="position:relative; margin: 8px 0;">${langBadge}<button onclick="window.moonCopyCode(this)" onmouseover="${hoverStyle}" onmouseout="${normalStyle}" style="${btnStyle}">Copy</button><pre style="background:#1e1e1e;padding:10px;padding-top:28px;border-radius:4px;border:1px solid #333;font-family:monospace;overflow-x:auto;margin:0;color:#85c5ec;position:relative;z-index:10;"><code>${rCode}</code></pre></div>`);
                
                codeContent = [];
                codeLang = "";
                inCodeBlock = false;
            } else {
                inCodeBlock = true;
                codeLang = trimmed.slice(3).trim();
            }
            continue;
        }

        if (inCodeBlock) {
            codeContent.push(line);
            continue;
        }

        // 2. Horizontal Rules
        if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
            closeUl();
            closeOl();
            closeTable();
            htmlLines.push(`<hr style="border:0;border-top:1px solid #333;margin:16px 0;">`);
            continue;
        }

        // 3. Block LaTeX Math (e.g. $$E = mc^2$$)
        if (trimmed.startsWith("$$") && trimmed.endsWith("$$")) {
            closeUl();
            closeOl();
            closeTable();
            const formula = trimmed.slice(2, -2).trim();
            htmlLines.push(`<div style="text-align:center;margin:12px 0;font-family:'Times New Roman',Times,serif;font-size:16px;color:#e5c07b;background:rgba(255,255,255,0.01);padding:10px;border-radius:4px;border:1px dashed #3e4451;font-style:italic;">${formula}</div>`);
            continue;
        }

        // 4. Table Parser
        if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
            closeUl();
            closeOl();
            
            const isSeparator = /^\|[\s\-\:\s\|]+\|$/.test(trimmed);
            const cells = trimmed.split("|").slice(1, -1).map(c => c.trim());
            
            if (isSeparator) {
                tableAlignments = cells.map(cell => {
                    const left = cell.startsWith(":");
                    const right = cell.endsWith(":");
                    if (left && right) return "center";
                    if (right) return "right";
                    return "left";
                });
                inTable = true;
            } else {
                if (!inTable) {
                    tableHeaders = cells;
                    inTable = true;
                } else {
                    tableRows.push(cells);
                }
            }
            continue;
        } else {
            closeTable();
        }

        // 5. Blockquotes
        if (trimmed.startsWith(">")) {
            closeUl();
            closeOl();
            const match = trimmed.match(/^([>\s]+)(.*)/);
            if (match) {
                const depth = (match[1].match(/>/g) || []).length;
                const content = match[2].trim();
                
                let quote = parseInlineMarkdown(content);
                for (let d = 0; d < depth; d++) {
                    quote = `<blockquote style="border-left:4px solid #4CAF50;margin:6px 0;padding:6px 12px;color:#aaa;font-style:italic;background-color:rgba(255,255,255,0.015);">${quote}</blockquote>`;
                }
                htmlLines.push(quote);
            }
            continue;
        }

        // 6. Headers
        if (line.startsWith("### ")) {
            closeUl();
            closeOl();
            htmlLines.push(`<h3 style="margin:12px 0 6px 0;color:#ffffff;font-weight:600;font-size:14px;">${parseInlineMarkdown(line.slice(4))}</h3>`);
            continue;
        } else if (line.startsWith("## ")) {
            closeUl();
            closeOl();
            htmlLines.push(`<h2 style="margin:16px 0 8px 0;color:#ffffff;font-weight:600;font-size:16px;border-bottom:1px solid #333;padding-bottom:4px;">${parseInlineMarkdown(line.slice(3))}</h2>`);
            continue;
        } else if (line.startsWith("# ")) {
            closeUl();
            closeOl();
            htmlLines.push(`<h1 style="margin:20px 0 10px 0;color:#ffffff;font-weight:700;font-size:18px;border-bottom:2px solid #444;padding-bottom:6px;">${parseInlineMarkdown(line.slice(2))}</h1>`);
            continue;
        }

        // 7. Unordered Lists (supports spaces/tabs for nested items)
        const ulMatch = line.match(/^(\s*)([-*])\s(.*)/);
        if (ulMatch) {
            closeOl();
            if (!inUl) {
                // Changed padding-left from 0 to 20px to shift bullets away from the container's left border
                htmlLines.push(`<ul style="margin:8px 0;padding-left:20px;list-style-type:disc;">`);
                inUl = true;
            }
            
            const indent = ulMatch[1].length;
            const content = ulMatch[3].trim();
            const paddingLeft = indent > 0 ? `${indent * 8}px` : "0px";
            const listStyle = indent > 0 ? "circle" : "disc";

            if (content.startsWith("[ ]")) {
                htmlLines.push(`<li style="margin-left:${paddingLeft};margin-bottom:4px;color:#ddd;list-style-type:none;"><input type="checkbox" disabled style="margin-right:6px;vertical-align:middle;pointer-events:none;">${parseInlineMarkdown(content.slice(3).trim())}</li>`);
            } else if (content.toLowerCase().startsWith("[x]")) {
                htmlLines.push(`<li style="margin-left:${paddingLeft};margin-bottom:4px;color:#ddd;list-style-type:none;"><input type="checkbox" checked disabled style="margin-right:6px;vertical-align:middle;pointer-events:none;">${parseInlineMarkdown(content.slice(3).trim())}</li>`);
            } else {
                htmlLines.push(`<li style="margin-left:${paddingLeft};list-style-type:${listStyle};margin-bottom:4px;color:#ddd;padding-left:4px;">${parseInlineMarkdown(content)}</li>`);
            }
            continue;
        }

        // 8. Ordered Lists
        const olMatch = line.match(/^(\s*)(\d+)\.\s(.*)/);
        if (olMatch) {
            closeUl();
            if (!inOl) {
                // Changed padding-left from 0 to 24px to prevent numbering from clipping the left edge
                htmlLines.push(`<ol style="margin:8px 0;padding-left:24px;list-style-type:decimal;">`);
                inOl = true;
            }
            const indent = olMatch[1].length;
            const content = olMatch[3].trim();
            const paddingLeft = indent > 0 ? `${indent * 8}px` : "0px";
            
            htmlLines.push(`<li style="margin-left:${paddingLeft};list-style-type:decimal;margin-bottom:4px;color:#ddd;padding-left:4px;">${parseInlineMarkdown(content)}</li>`);
            continue;
        }

        // 9. Blank Lines (converts double breaks cleanly)
        if (trimmed === "") {
            closeUl();
            closeOl();
            htmlLines.push("<br>");
        } else {
            closeUl();
            closeOl();
            htmlLines.push(`<p style="margin:6px 0;color:#ddd;line-height:1.6;">${parseInlineMarkdown(line)}</p>`);
        }
    }

    // Tag Cleanup on stream end
    closeUl();
    closeOl();
    closeTable();

    return htmlLines.join("\n");
}

app.registerExtension({
    name: "MoonNodes.MoonMarkdownOutput",
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "MoonMarkdownOutput") {
            
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                onNodeCreated?.apply(this, arguments);
                
                // Initialize standard hidden properties dictionary
                this.properties = this.properties || {};
                this.properties.markdown_text = "";
                
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
                div.style.height = "174px";
                div.style.pointerEvents = "auto";
                
                this.addDOMWidget("markdown_display", "div", div, {
                    getValue() { return div.innerHTML; },
                    setValue(v) { div.innerHTML = v; }
                });
                
                this.markdownContainer = div;
                this.size = [450, 220]; 
            };

            // Restore the rendered Markdown HTML from properties when tabbing back or loading
            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function(info) {
                onConfigure?.apply(this, arguments);
                if (this.properties && this.properties.markdown_text !== undefined && this.markdownContainer) {
                    this.markdownContainer.innerHTML = parseMarkdown(this.properties.markdown_text);
                }
            };

            nodeType.prototype.onResize = function(size) {
                if (this.markdownContainer) {
                    this.markdownContainer.style.height = (size[1] - 46) + "px";
                }
            };

            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                onExecuted?.apply(this, arguments);
                if (message?.text && this.markdownContainer) {
                    const rawText = message.text[0];
                    
                    // Persist the state inside the active node properties
                    if (this.properties) {
                        this.properties.markdown_text = rawText;
                    }
                    
                    this.markdownContainer.innerHTML = parseMarkdown(rawText);
                    this.setDirtyCanvas(true, true);
                }
            };
        }
    }
});