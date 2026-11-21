import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";

// Inline Lucide SVG Icon Provider (100% offline, matches ComfyUI native styling)
function lucideIcon(name, size = 13, extraStyle = "") {
    const paths = {
        "message-square": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
        "messages-square": '<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2v5Z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>',
        "settings": '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
        "zap": '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
        "pencil": '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
        "trash": '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
        "paperclip": '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
        "square": '<rect width="18" height="18" x="3" y="3" rx="2"/>',
        "key": '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
        "refresh": '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
        "sparkles": '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>',
        "brain": '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M12 18v4"/>',
        "check": '<polyline points="20 6 9 17 4 12"/>',
        "x": '<line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/>',
        "user": '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        "plus": '<line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/>',
        "loader": '<line x1="12" x2="12" y1="2" y2="6"/><line x1="12" x2="12" y1="18" y2="22"/><line x1="4.93" x2="7.76" y1="4.93" y2="7.76"/><line x1="16.24" x2="19.07" y1="16.24" y2="19.07"/><line x1="2" x2="6" y1="12" y2="12"/><line x1="18" x2="22" y1="12" y2="12"/><line x1="4.93" x2="7.76" y1="19.07" y2="16.24"/><line x1="16.24" x2="19.07" y1="7.76" y2="4.93"/>'
    };
    const body = paths[name] || '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;${extraStyle}">${body}</svg>`;
}

// Global helper to handle copying code blocks
if (!window.moonCopyCode) {
    window.moonCopyCode = function(button) {
        try {
            const container = button.parentElement;
            if (!container) return;
            const codeEl = container.querySelector("code");
            if (!codeEl) return;
            const text = codeEl.innerText;

            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text)
                    .then(() => showCopySuccess(button))
                    .catch(() => fallbackCopy(button, text));
            } else {
                fallbackCopy(button, text);
            }
        } catch (e) {
            button.innerText = "Error";
            setTimeout(() => button.innerText = "Copy", 1500);
        }
    };
}

function fallbackCopy(button, text) {
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
        if (successful) showCopySuccess(button);
        else throw new Error();
    } catch (err) {
        button.innerText = "Error";
        setTimeout(() => button.innerText = "Copy", 1500);
    }
}

function showCopySuccess(button) {
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

// Full inline parser (code, bold, italic, strikethrough, links, LaTeX)
function parseInlineMarkdown(html) {
    if (!html) return "";

    // 1. Inline Code
    html = html.replace(/`([^`]+)`/g, '<code style="background:#252525;padding:2px 6px;border-radius:3px;font-family:monospace;color:#e06c75;border:1px solid #333;font-size:11px;">$1</code>');

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
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:#61afef;text-decoration:none;border-bottom:1px dashed #61afef;cursor:pointer;">$1</a>');

    // 7. Inline LaTeX Math ($formula$)
    html = html.replace(/\$(?!\s)([^\$]+?)(?<!\s)\$/g, '<span style="font-family:\'Times New Roman\',Times,serif;font-size:13px;color:#e5c07b;font-style:italic;padding:0 2px;">$1</span>');

    return html;
}

// Complete Block-level Markdown parser from MoonMarkdownOutput
function parseMarkdown(text) {
    if (!text) return "";

    let rawLines = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .split("\n");

    let htmlLines = [];
    let inCodeBlock = false;
    let codeContent = [];
    let codeLang = "";
    let inUl = false;
    let inOl = false;
    let inTable = false;
    let tableHeaders = [];
    let tableAlignments = [];
    let tableRows = [];

    function closeUl() {
        if (inUl) { htmlLines.push("</ul>"); inUl = false; }
    }
    function closeOl() {
        if (inOl) { htmlLines.push("</ol>"); inOl = false; }
    }
    function closeTable() {
        if (inTable) {
            let tableHtml = `<table style="border-collapse:collapse;width:100%;margin:8px 0;font-size:11px;border:1px solid #333;color:#ddd;text-align:left;">`;
            if (tableHeaders.length > 0) {
                tableHtml += `<thead style="background:#1a1a1a;font-weight:600;color:#fff;border-bottom:2px solid #444;"><tr>`;
                for (let i = 0; i < tableHeaders.length; i++) {
                    const align = tableAlignments[i] || 'left';
                    tableHtml += `<th style="padding:6px 10px;border:1px solid #333;text-align:${align};">${parseInlineMarkdown(tableHeaders[i])}</th>`;
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
                    tableHtml += `<td style="padding:6px 10px;border:1px solid #333;text-align:${align};">${parseInlineMarkdown(cellVal)}</td>`;
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

        // 1. Code Blocks (with Copy Button)
        if (trimmed.startsWith("```")) {
            closeUl();
            closeOl();
            closeTable();
            if (inCodeBlock) {
                const rCode = codeContent.join("\n");
                const langBadge = codeLang ? `<div style="position:absolute;top:4px;left:8px;color:#85c5ec;font-size:9px;font-family:sans-serif;font-weight:bold;text-transform:uppercase;opacity:0.8;user-select:none;">${codeLang}</div>` : '';
                const btnStyle = "position:absolute;top:4px;right:6px;background:#333;color:#aaa;border:1px solid #555;border-radius:3px;padding:2px 6px;font-size:10px;cursor:pointer;font-family:sans-serif;user-select:none;";
                htmlLines.push(`<div class="code-block-container" style="position:relative;margin:6px 0;">${langBadge}<button onclick="window.moonCopyCode(this)" style="${btnStyle}">Copy</button><pre style="background:#181818;padding:8px;padding-top:24px;border-radius:4px;border:1px solid #333;font-family:monospace;overflow-x:auto;margin:0;color:#85c5ec;font-size:11px;"><code>${rCode}</code></pre></div>`);
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

        // 2. Horizontal Divider
        if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
            closeUl();
            closeOl();
            closeTable();
            htmlLines.push(`<hr style="border:0;border-top:1px solid #333;margin:10px 0;">`);
            continue;
        }

        // 3. Block LaTeX Math ($$formula$$)
        if (trimmed.startsWith("$$") && trimmed.endsWith("$$")) {
            closeUl();
            closeOl();
            closeTable();
            const formula = trimmed.slice(2, -2).trim();
            htmlLines.push(`<div style="text-align:center;margin:8px 0;font-family:'Times New Roman',Times,serif;font-size:14px;color:#e5c07b;background:rgba(255,255,255,0.015);padding:6px;border-radius:4px;border:1px dashed #3e4451;font-style:italic;">${formula}</div>`);
            continue;
        }

        // 4. Markdown Tables
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
                if (!inTable) { tableHeaders = cells; inTable = true; }
                else { tableRows.push(cells); }
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
                let quote = parseInlineMarkdown(match[2].trim());
                for (let d = 0; d < depth; d++) {
                    quote = `<blockquote style="border-left:3px solid #61afef;margin:4px 0;padding:4px 8px;color:#aaa;font-style:italic;background-color:rgba(255,255,255,0.02);">${quote}</blockquote>`;
                }
                htmlLines.push(quote);
            }
            continue;
        }

        // 6. Headers
        if (line.startsWith("### ")) {
            closeUl();
            closeOl();
            htmlLines.push(`<h3 style="margin:8px 0 4px 0;color:#ffffff;font-weight:600;font-size:13px;">${parseInlineMarkdown(line.slice(4))}</h3>`);
            continue;
        } else if (line.startsWith("## ")) {
            closeUl();
            closeOl();
            htmlLines.push(`<h2 style="margin:12px 0 6px 0;color:#ffffff;font-weight:600;font-size:14px;border-bottom:1px solid #333;padding-bottom:2px;">${parseInlineMarkdown(line.slice(3))}</h2>`);
            continue;
        } else if (line.startsWith("# ")) {
            closeUl();
            closeOl();
            htmlLines.push(`<h1 style="margin:14px 0 6px 0;color:#ffffff;font-weight:700;font-size:16px;border-bottom:2px solid #444;padding-bottom:4px;">${parseInlineMarkdown(line.slice(2))}</h1>`);
            continue;
        }

        // 7. Unordered Lists
        const ulMatch = line.match(/^(\s*)([-*])\s(.*)/);
        if (ulMatch) {
            closeOl();
            if (!inUl) {
                htmlLines.push(`<ul style="margin:4px 0;padding-left:18px;list-style-type:disc;">`);
                inUl = true;
            }
            const indent = ulMatch[1].length;
            const content = ulMatch[3].trim();
            const paddingLeft = indent > 0 ? `${indent * 6}px` : "0px";
            const listStyle = indent > 0 ? "circle" : "disc";

            if (content.startsWith("[ ]")) {
                htmlLines.push(`<li style="margin-left:${paddingLeft};margin-bottom:2px;color:#ddd;list-style-type:none;"><input type="checkbox" disabled style="margin-right:4px;vertical-align:middle;">${parseInlineMarkdown(content.slice(3).trim())}</li>`);
            } else if (content.toLowerCase().startsWith("[x]")) {
                htmlLines.push(`<li style="margin-left:${paddingLeft};margin-bottom:2px;color:#ddd;list-style-type:none;"><input type="checkbox" checked disabled style="margin-right:4px;vertical-align:middle;">${parseInlineMarkdown(content.slice(3).trim())}</li>`);
            } else {
                htmlLines.push(`<li style="margin-left:${paddingLeft};list-style-type:${listStyle};margin-bottom:2px;color:#ddd;padding-left:2px;">${parseInlineMarkdown(content)}</li>`);
            }
            continue;
        }

        // 8. Ordered Lists
        const olMatch = line.match(/^(\s*)(\d+)\.\s(.*)/);
        if (olMatch) {
            closeUl();
            if (!inOl) {
                htmlLines.push(`<ol style="margin:4px 0;padding-left:20px;list-style-type:decimal;">`);
                inOl = true;
            }
            const indent = olMatch[1].length;
            const content = olMatch[3].trim();
            const paddingLeft = indent > 0 ? `${indent * 6}px` : "0px";
            htmlLines.push(`<li style="margin-left:${paddingLeft};list-style-type:decimal;margin-bottom:2px;color:#ddd;padding-left:2px;">${parseInlineMarkdown(content)}</li>`);
            continue;
        }

        // 9. Plain Paragraphs & Line Breaks
        if (trimmed === "") {
            closeUl();
            closeOl();
            htmlLines.push("<br>");
        } else {
            closeUl();
            closeOl();
            htmlLines.push(`<p style="margin:3px 0;color:#ddd;line-height:1.5;">${parseInlineMarkdown(line)}</p>`);
        }
    }

    closeUl();
    closeOl();
    closeTable();
    return htmlLines.join("\n");
}

function neutralizeWidget(w) {
    if (!w) return;
    w.type = "hidden";
    w.hidden = true;
    w.cannot_be_converted_to_input = true;
    w.not_subbable = true;
    if (!w.options) w.options = {};
    w.options.hidden = true;
    w.computeSize = () => [0, -4];
    w.draw = () => {};
    if (w.inputEl) w.inputEl.style.display = "none";
}

app.registerExtension({
    name: "MoonNodes.GeminiChatUI",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "GeminiPersistentChat") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            const node = this;

            const NODE_W = 500;
            const NODE_H = 550;
            node.size = [NODE_W, NODE_H];

            // Remove any phantom connection slot LiteGraph might create for ui_settings
            const uiSlotIdx = node.inputs?.findIndex(i => i.name === "ui_settings");
            if (uiSlotIdx !== -1 && uiSlotIdx !== undefined) {
                node.removeInput(uiSlotIdx);
            }

            // Hide the ui_settings sync widget
            const uiSettingsW = node.widgets?.find(w => w.name === "ui_settings");
            neutralizeWidget(uiSettingsW);

            // Stored state
            node.properties = node.properties || {};
            node.properties.chat_history = node.properties.chat_history || [];
            node.properties.singular_mode = node.properties.singular_mode || false;
            node.properties.session_id = node.properties.session_id || ("session_" + Date.now());
            node.properties.model_name = node.properties.model_name || "gemini-flash-latest";
            node.properties.system_instruction = node.properties.system_instruction || "";
            node.properties.settings = node.properties.settings || {
                temperature: 1.0,
                top_p: 0.95,
                top_k: 40,
                max_output_tokens: 0,
                thinking_level: "default",
                structured_outputs_json: false,
                google_search_grounding: false,
                code_execution: false,
                force_ipv4: false
            };

            function syncSettingsToWidget() {
                if (uiSettingsW) {
                    const isLocal = node.properties.prompt_storage === "local";
                    if (isLocal) {
                        node.properties.system_instruction = "";
                    }
                    const fullData = {
                        session_id: node.properties.session_id,
                        singular_mode: node.properties.singular_mode,
                        model_name: node.properties.model_name,
                        prompt_storage: node.properties.prompt_storage,
                        prompt_file: node.properties.prompt_file,
                        system_instruction: isLocal ? "" : (node.properties.system_instruction || ""),
                        manual_prompt: node.properties.manual_prompt || "",
                        ...node.properties.settings
                    };
                    const jsonStr = JSON.stringify(fullData);
                    uiSettingsW.value = jsonStr;
                    if (uiSettingsW._state) uiSettingsW._state.value = jsonStr;
                }
            }

            node.syncSettingsToWidget = syncSettingsToWidget;

            // Main Root Container
            const root = document.createElement("div");
            root.style.display = "flex";
            root.style.flexDirection = "column";
            root.style.height = "100%";
            root.style.backgroundColor = "#141414";
            root.style.border = "1px solid #2e2e2e";
            root.style.borderRadius = "6px";
            root.style.color = "#ddd";
            root.style.fontFamily = "sans-serif";
            root.style.fontSize = "12px";
            root.style.boxSizing = "border-box";
            root.style.overflow = "hidden";
            root.style.pointerEvents = "auto";

            ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "dblclick", "wheel"].forEach(evt => {
                root.addEventListener(evt, e => e.stopPropagation());
            });

            // Top Navigation Bar
            const navBar = document.createElement("div");
            navBar.style.display = "flex";
            navBar.style.alignItems = "center";
            navBar.style.justifyContent = "space-between";
            navBar.style.backgroundColor = "#1a1a1a";
            navBar.style.borderBottom = "1px solid #2e2e2e";
            navBar.style.padding = "4px 8px";

            const tabsLeft = document.createElement("div");
            tabsLeft.style.display = "flex";
            tabsLeft.style.gap = "4px";

            const chatTabBtn = document.createElement("button");
            chatTabBtn.innerHTML = `${lucideIcon("message-square", 12, "margin-right:4px;")}Chat`;
            const settingsTabBtn = document.createElement("button");
            settingsTabBtn.innerHTML = `${lucideIcon("settings", 12, "margin-right:4px;")}Settings`;

            [chatTabBtn, settingsTabBtn].forEach(b => {
                b.style.background = "transparent";
                b.style.border = "none";
                b.style.color = "#aaa";
                b.style.padding = "4px 10px";
                b.style.borderRadius = "4px";
                b.style.cursor = "pointer";
                b.style.fontWeight = "bold";
                b.style.fontSize = "11px";
                b.style.display = "inline-flex";
                b.style.alignItems = "center";
            });

            tabsLeft.appendChild(chatTabBtn);
            tabsLeft.appendChild(settingsTabBtn);
            navBar.appendChild(tabsLeft);

            const controlsRight = document.createElement("div");
            controlsRight.style.display = "flex";
            controlsRight.style.alignItems = "center";
            controlsRight.style.gap = "8px";

            // Self-explanatory Mode Toggle (Single message mode vs Conversation mode)
            node.properties.workflow_send_mode = node.properties.workflow_send_mode || false;
            node.properties.session_needs_rebuild = false;

            const modeBtn = document.createElement("button");
            modeBtn.style.fontSize = "11px";
            modeBtn.style.padding = "3px 8px";
            modeBtn.style.borderRadius = "4px";
            modeBtn.style.cursor = "pointer";
            modeBtn.style.fontWeight = "bold";
            modeBtn.style.border = "1px solid #444";
            modeBtn.style.display = "inline-flex";
            modeBtn.style.alignItems = "center";
            modeBtn.style.gap = "4px";

            function updateModeUI() {
                if (node.properties.singular_mode) {
                    modeBtn.innerHTML = `${lucideIcon("zap", 11)} Single message mode`;
                    modeBtn.title = "Single message mode: Each message is independent without conversation memory.";
                    modeBtn.style.backgroundColor = "#5c3d1e";
                    modeBtn.style.color = "#ffc078";
                    modeBtn.style.borderColor = "#875424";
                } else {
                    modeBtn.innerHTML = `${lucideIcon("messages-square", 11)} Conversation mode`;
                    modeBtn.title = "Conversation mode: The AI remembers all previous messages in this session.";
                    modeBtn.style.backgroundColor = "#1e2a38";
                    modeBtn.style.color = "#85c5ec";
                    modeBtn.style.borderColor = "#2c4763";
                }
            }
            updateModeUI();

            modeBtn.onclick = () => {
                node.properties.singular_mode = !node.properties.singular_mode;
                updateModeUI();
                syncSettingsToWidget();
                renderMessages();
            };
            controlsRight.appendChild(modeBtn);

            // Clear Button (resets chat and generates fresh session ID)
            const clearBtn = document.createElement("button");
            clearBtn.innerText = "Clear";
            clearBtn.title = "Clear conversation history and start a new session.";
            clearBtn.style.background = "#2a2a2a";
            clearBtn.style.border = "1px solid #444";
            clearBtn.style.color = "#aaa";
            clearBtn.style.borderRadius = "3px";
            clearBtn.style.padding = "3px 8px";
            clearBtn.style.cursor = "pointer";
            clearBtn.style.fontSize = "10px";
            clearBtn.onclick = () => {
                node.properties.chat_history = [];
                node.properties.session_id = "session_" + Date.now();
                node.properties.session_needs_rebuild = false;
                syncSettingsToWidget();
                renderMessages();
            };
            controlsRight.appendChild(clearBtn);
            navBar.appendChild(controlsRight);
            root.appendChild(navBar);

            // Content Area Container
            const contentArea = document.createElement("div");
            contentArea.style.flex = "1";
            contentArea.style.display = "flex";
            contentArea.style.flexDirection = "column";
            contentArea.style.overflow = "hidden";
            root.appendChild(contentArea);

            // ==========================================
            // TAB 1: CHAT PANEL
            // ==========================================
            const chatPanel = document.createElement("div");
            chatPanel.style.display = "flex";
            chatPanel.style.flexDirection = "column";
            chatPanel.style.flex = "1";
            chatPanel.style.overflow = "hidden";

            const messageList = document.createElement("div");
            messageList.style.flex = "1";
            messageList.style.overflowY = "auto";
            messageList.style.padding = "10px";
            messageList.style.display = "flex";
            messageList.style.flexDirection = "column";
            messageList.style.gap = "8px";
            chatPanel.appendChild(messageList);

            function renderMessages() {
                messageList.innerHTML = "";
                const allMsgs = node.properties.chat_history || [];

                // In Single message mode: only display the latest turn (what the AI sees)
                let displayMsgs = allMsgs;
                if (node.properties.singular_mode && allMsgs.length > 0) {
                    const lastUserIdx = allMsgs.findLastIndex(m => m.role === "user");
                    if (lastUserIdx !== -1) {
                        displayMsgs = allMsgs.slice(lastUserIdx);
                    } else {
                        displayMsgs = allMsgs.slice(-1);
                    }
                }

                if (displayMsgs.length === 0) {
                    messageList.innerHTML = `<div style="text-align:center;color:#666;margin-top:40px;font-style:italic;">No messages yet.<br>Type below to chat directly, or use 📎 to queue the workflow.</div>`;
                    return;
                }

                if (node.properties.singular_mode) {
                    const notice = document.createElement("div");
                    notice.style.fontSize = "10px";
                    notice.style.color = "#d19a66";
                    notice.style.textAlign = "center";
                    notice.style.marginBottom = "4px";
                    notice.style.display = "flex";
                    notice.style.alignItems = "center";
                    notice.style.justifyContent = "center";
                    notice.style.gap = "4px";
                    notice.innerHTML = `${lucideIcon("zap", 10)} Single message mode active — showing latest message only.`;
                    messageList.appendChild(notice);
                }

                displayMsgs.forEach(item => {
                    const globalIdx = allMsgs.indexOf(item);
                    const bubble = document.createElement("div");
                    bubble.style.maxWidth = "88%";
                    bubble.style.padding = "6px 10px 8px 10px";
                    bubble.style.borderRadius = "6px";
                    bubble.style.fontSize = "12px";
                    bubble.style.wordBreak = "break-word";
                    bubble.style.display = "flex";
                    bubble.style.flexDirection = "column";

                    // Clean Header Row (Separates Name & Actions from Text - No Overlap!)
                    const headerRow = document.createElement("div");
                    headerRow.style.display = "flex";
                    headerRow.style.justifyContent = "space-between";
                    headerRow.style.alignItems = "center";
                    headerRow.style.fontSize = "10px";
                    headerRow.style.color = item.role === "user" ? "#85c5ec" : "#aaa";
                    headerRow.style.borderBottom = "1px solid rgba(255, 255, 255, 0.08)";
                    headerRow.style.paddingBottom = "3px";
                    headerRow.style.marginBottom = "4px";

                    const senderSpan = document.createElement("span");
                    senderSpan.style.fontWeight = "bold";
                    senderSpan.style.display = "inline-flex";
                    senderSpan.style.alignItems = "center";
                    senderSpan.style.gap = "4px";
                    if (item.role === "user") {
                        senderSpan.innerHTML = item.source === "workflow" 
                            ? `${lucideIcon("zap", 10)} Workflow Run` 
                            : `${lucideIcon("user", 10)} You`;
                    } else {
                        senderSpan.innerHTML = `${lucideIcon("sparkles", 10)} Gemini`;
                    }
                    headerRow.appendChild(senderSpan);

                    const btnBox = document.createElement("div");
                    btnBox.style.display = "flex";
                    btnBox.style.alignItems = "center";
                    btnBox.style.gap = "6px";

                    const editBtn = document.createElement("span");
                    editBtn.innerHTML = lucideIcon("pencil", 11);
                    editBtn.title = "Edit message";
                    editBtn.style.cursor = "pointer";
                    editBtn.style.display = "inline-flex";
                    editBtn.style.alignItems = "center";
                    editBtn.style.opacity = "0.75";

                    const delBtn = document.createElement("span");
                    delBtn.innerHTML = lucideIcon("trash", 11);
                    delBtn.title = "Delete message";
                    delBtn.style.cursor = "pointer";
                    delBtn.style.display = "inline-flex";
                    delBtn.style.alignItems = "center";
                    delBtn.style.opacity = "0.75";

                    delBtn.onclick = (e) => {
                        e.stopPropagation();
                        if (confirm("Delete this message?")) {
                            node.properties.chat_history.splice(globalIdx, 1);
                            renderMessages();
                            markGraphChanged();
                        }
                    };

                    editBtn.onclick = (e) => {
                        e.stopPropagation();
                        contentDiv.style.display = "none";
                        editContainer.style.display = "flex";
                        editTextarea.value = item.text;
                        editTextarea.focus();
                    };

                    btnBox.appendChild(editBtn);
                    btnBox.appendChild(delBtn);
                    headerRow.appendChild(btnBox);
                    bubble.appendChild(headerRow);

                    const contentDiv = document.createElement("div");
                    const editContainer = document.createElement("div");
                    editContainer.style.display = "none";
                    editContainer.style.flexDirection = "column";
                    editContainer.style.gap = "4px";
                    editContainer.style.marginTop = "4px";

                    const editTextarea = document.createElement("textarea");
                    editTextarea.style.backgroundColor = "#121212";
                    editTextarea.style.color = "#eee";
                    editTextarea.style.border = "1px solid #555";
                    editTextarea.style.borderRadius = "3px";
                    editTextarea.style.padding = "4px";
                    editTextarea.style.fontSize = "12px";
                    editTextarea.style.resize = "vertical";

                    const editActions = document.createElement("div");
                    editActions.style.display = "flex";
                    editActions.style.gap = "6px";

                    const saveEditBtn = document.createElement("button");
                    saveEditBtn.innerText = "Save";
                    saveEditBtn.style.backgroundColor = "#2d5a3f";
                    saveEditBtn.style.color = "#fff";
                    saveEditBtn.style.border = "none";
                    saveEditBtn.style.padding = "2px 8px";
                    saveEditBtn.style.borderRadius = "3px";
                    saveEditBtn.style.cursor = "pointer";

                    const cancelEditBtn = document.createElement("button");
                    cancelEditBtn.innerText = "Cancel";
                    cancelEditBtn.style.backgroundColor = "#444";
                    cancelEditBtn.style.color = "#eee";
                    cancelEditBtn.style.border = "none";
                    cancelEditBtn.style.padding = "2px 8px";
                    cancelEditBtn.style.borderRadius = "3px";
                    cancelEditBtn.style.cursor = "pointer";

                    saveEditBtn.onclick = () => {
                        item.text = editTextarea.value;
                        renderMessages();
                        markGraphChanged();
                    };

                    cancelEditBtn.onclick = () => {
                        editContainer.style.display = "none";
                        contentDiv.style.display = "block";
                    };

                    editActions.appendChild(saveEditBtn);
                    editActions.appendChild(cancelEditBtn);
                    editContainer.appendChild(editTextarea);
                    editContainer.appendChild(editActions);

                    if (item.role === "user") {
                        bubble.style.alignSelf = "flex-end";
                        bubble.style.backgroundColor = item.source === "workflow" ? "#1e3344" : "#243746";
                        bubble.style.border = item.source === "workflow" ? "1px solid #3b6385" : "none";
                        bubble.style.color = "#e5f0fa";

                        let userHtml = "";
                        if (item.source === "workflow") {
                            if (item.images_reused) {
                                userHtml += `<div style="font-size:10px;color:#d19a66;margin-bottom:4px;display:flex;align-items:center;gap:4px;">${lucideIcon("refresh", 10)} Same image(s) retained in memory (not re-sent)</div>`;
                            } else if (item.images_count > 0) {
                                userHtml += `<div style="font-size:10px;color:#98c379;margin-bottom:4px;display:flex;align-items:center;gap:4px;">${lucideIcon("paperclip", 10)} ${item.images_count} new image(s) attached</div>`;
                            }
                        }
                        userHtml += parseMarkdown(item.text);
                        contentDiv.innerHTML = userHtml;
                    } else {
                        bubble.style.alignSelf = "flex-start";
                        bubble.style.backgroundColor = "#1e1e1e";
                        bubble.style.border = "1px solid #333";
                        bubble.style.color = "#ddd";

                        let modelHtml = "";
                        if (item.thoughts) {
                            modelHtml += `
                                <details style="margin-bottom:6px;border-bottom:1px dashed #444;padding-bottom:4px;">
                                    <summary style="color:#e5c07b;cursor:pointer;font-size:11px;font-weight:bold;display:flex;align-items:center;gap:4px;">${lucideIcon("brain", 12)} Thoughts (click to expand)</summary>
                                    <div style="font-size:11px;color:#aaa;background:#141414;padding:6px;margin-top:4px;border-radius:4px;white-space:pre-wrap;">${item.thoughts}</div>
                                </details>
                            `;
                        }
                        modelHtml += parseMarkdown(item.text);
                        contentDiv.innerHTML = modelHtml;
                    }

                    bubble.appendChild(contentDiv);
                    bubble.appendChild(editContainer);
                    messageList.appendChild(bubble);
                });
                messageList.scrollTop = messageList.scrollHeight;
            }

            // Input Bar at Bottom
            const inputBar = document.createElement("div");
            inputBar.style.display = "flex";
            inputBar.style.padding = "8px";
            inputBar.style.gap = "6px";
            inputBar.style.borderTop = "1px solid #2e2e2e";
            inputBar.style.backgroundColor = "#1a1a1a";

            const chatTextarea = document.createElement("textarea");
            chatTextarea.placeholder = "Type message (Enter to send, Shift+Enter for newline)...";
            chatTextarea.style.flex = "1";
            chatTextarea.style.height = "36px";
            chatTextarea.style.resize = "none";
            chatTextarea.style.backgroundColor = "#121212";
            chatTextarea.style.color = "#eee";
            chatTextarea.style.border = "1px solid #333";
            chatTextarea.style.borderRadius = "4px";
            chatTextarea.style.padding = "6px 8px";
            chatTextarea.style.fontSize = "12px";
            chatTextarea.style.fontFamily = "sans-serif";

            // Workflow Mode Button (toggles whether Send chats or queues workflow)
            const clipBtn = document.createElement("button");
            clipBtn.innerHTML = lucideIcon("paperclip", 14);
            clipBtn.style.padding = "0 8px";
            clipBtn.style.borderRadius = "4px";
            clipBtn.style.cursor = "pointer";
            clipBtn.style.border = "1px solid #444";
            clipBtn.style.display = "flex";
            clipBtn.style.alignItems = "center";
            clipBtn.style.justifyContent = "center";

            let isGenerating = false;
            let activeAbortController = null;
            let typewriterTimer = null;

            function updateClipUI() {
                if (isGenerating) {
                    sendBtn.innerHTML = `${lucideIcon("square", 12, "fill:currentColor;margin-right:4px;")} Stop`;
                    sendBtn.style.backgroundColor = "#721c24";
                    sendBtn.style.borderColor = "#dc3545";
                    return;
                }
                if (node.properties.workflow_send_mode) {
                    clipBtn.style.backgroundColor = "#1e3344";
                    clipBtn.style.borderColor = "#61afef";
                    clipBtn.title = "Workflow mode ON: Pressing Send will run the ComfyUI workflow.";
                    sendBtn.innerText = "Queue";
                    sendBtn.style.backgroundColor = "#2b5278";
                    sendBtn.style.borderColor = "#3b6385";
                } else {
                    clipBtn.style.backgroundColor = "#242424";
                    clipBtn.style.borderColor = "#444";
                    clipBtn.title = "Workflow mode OFF: Pressing Send will chat directly in the UI.";
                    sendBtn.innerText = "Send";
                    sendBtn.style.backgroundColor = "#2d5a3f";
                    sendBtn.style.borderColor = "#3d7a55";
                }
            }

            clipBtn.onclick = () => {
                node.properties.workflow_send_mode = !node.properties.workflow_send_mode;
                updateClipUI();
            };

            const sendBtn = document.createElement("button");
            sendBtn.style.padding = "0 14px";
            sendBtn.style.borderRadius = "4px";
            sendBtn.style.color = "#fff";
            sendBtn.style.fontWeight = "bold";
            sendBtn.style.cursor = "pointer";
            updateClipUI();

            async function triggerLiveSend() {
                // If generation or typing is active, clicking functions as a STOP button
                if (isGenerating) {
                    if (typewriterTimer) {
                        clearInterval(typewriterTimer);
                        typewriterTimer = null;
                    }
                    if (activeAbortController) {
                        activeAbortController.abort();
                        activeAbortController = null;
                    }
                    if (node.properties.workflow_send_mode && api.interrupt) {
                        api.interrupt();
                    }
                    isGenerating = false;
                    updateClipUI();
                    renderMessages();
                    return;
                }

                const message = chatTextarea.value.trim();
                if (!message && !node.properties.workflow_send_mode) return;

                // Mode 1: 📎 Workflow Send Mode
                if (node.properties.workflow_send_mode) {
                    node.properties.manual_prompt = message;
                    chatTextarea.value = "";
                    syncSettingsToWidget();
                    if (app.queuePrompt) {
                        app.queuePrompt(0);
                    }
                    return;
                }

                // Mode 2: Direct Chat with Memory Synchronization
                node.properties.chat_history.push({ role: "user", text: message, source: "direct" });
                chatTextarea.value = "";
                renderMessages();

                isGenerating = true;
                updateClipUI();

                const modelItem = { role: "model", text: "...", thoughts: "", source: "direct" };
                node.properties.chat_history.push(modelItem);
                renderMessages();

                activeAbortController = new AbortController();

                try {
                    const response = await fetch("/moon/gemini_chat", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            message: message,
                            session_id: node.properties.session_id,
                            model_name: node.properties.model_name,
                            mode: node.properties.singular_mode ? "Singular" : "Persistent",
                            system_instruction: sysTextarea.value.trim(),
                            settings: node.properties.settings,
                            history: node.properties.chat_history.map(m => ({ role: m.role, text: m.text }))
                        }),
                        signal: activeAbortController.signal
                    });

                    const resData = await response.json();

                    if (resData.success) {
                        modelItem.thoughts = resData.thoughts || "";
                        const fullText = resData.text || "";

                        // Smooth token-by-token typewriter animation
                        let currentLen = 0;
                        const step = Math.max(1, Math.floor(fullText.length / 50));
                        modelItem.text = "▌";

                        await new Promise((resolve) => {
                            typewriterTimer = setInterval(() => {
                                if (!isGenerating) {
                                    clearInterval(typewriterTimer);
                                    typewriterTimer = null;
                                    resolve();
                                    return;
                                }
                                currentLen += step;
                                if (currentLen >= fullText.length) {
                                    modelItem.text = fullText;
                                    clearInterval(typewriterTimer);
                                    typewriterTimer = null;
                                    resolve();
                                } else {
                                    modelItem.text = fullText.slice(0, currentLen) + "▌";
                                    renderMessages();
                                }
                            }, 20);
                        });
                    } else {
                        modelItem.text = `❌ Error: ${resData.error || "Unknown error"}`;
                    }
                } catch (err) {
                    if (err.name === "AbortError") {
                        modelItem.text = modelItem.text.replace("▌", "") + "\n*(Generation stopped by user)*";
                    } else {
                        modelItem.text = `❌ Request Error: ${err.message}`;
                    }
                } finally {
                    isGenerating = false;
                    activeAbortController = null;
                    if (typewriterTimer) {
                        clearInterval(typewriterTimer);
                        typewriterTimer = null;
                    }
                    updateClipUI();
                    renderMessages();
                    markGraphChanged();
                }
            }

            function markGraphChanged() {
                if (typeof node.setDirtyCanvas === "function") {
                    node.setDirtyCanvas(true, true);
                }
                if (node.graph) {
                    node.graph.change();
                }
                if (typeof app !== "undefined" && app.graph) {
                    app.graph.change();
                }
            }

            chatTextarea.onkeydown = (e) => {
                if (e.key === "Enter") {
                    if (e.shiftKey) {
                        // Allow shift+enter for a newline
                        return;
                    }
                    // Stop both ComfyUI's global hotkey and default behavior from double-queuing
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    triggerLiveSend();
                }
            };

            // Prevent single-key shortcuts (like Space or Delete) from affecting the canvas while typing
            chatTextarea.addEventListener("keydown", (e) => {
                e.stopPropagation();
            });
            sendBtn.onclick = triggerLiveSend;

            inputBar.appendChild(clipBtn);
            inputBar.appendChild(chatTextarea);
            inputBar.appendChild(sendBtn);
            chatPanel.appendChild(inputBar);
            contentArea.appendChild(chatPanel);

            // ==========================================
            // TAB 2: SETTINGS PANEL
            // ==========================================
            const settingsPanel = document.createElement("div");
            settingsPanel.style.display = "none";
            settingsPanel.style.flexDirection = "column";
            settingsPanel.style.gap = "10px";
            settingsPanel.style.padding = "12px";
            settingsPanel.style.overflowY = "auto";
            contentArea.appendChild(settingsPanel);

            // Section 1: Multi-API Key Management
            const keyBox = document.createElement("div");
            keyBox.style.backgroundColor = "#1c1c1c";
            keyBox.style.padding = "8px";
            keyBox.style.borderRadius = "4px";
            keyBox.style.border = "1px solid #333";

            const keyTitle = document.createElement("div");
            keyTitle.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px;">${lucideIcon("key", 13)} Gemini API Keys (auto-rotates on 429)</span>`;
            keyTitle.style.fontWeight = "bold";
            keyTitle.style.marginBottom = "6px";
            keyTitle.style.color = "#ddd";

            const keyRow = document.createElement("div");
            keyRow.style.display = "flex";
            keyRow.style.gap = "6px";

            const keyInput = document.createElement("input");
            keyInput.type = "password";
            keyInput.placeholder = "Paste key (or comma-separated keys) to add...";
            keyInput.style.flex = "1";
            keyInput.style.backgroundColor = "#111";
            keyInput.style.color = "#eee";
            keyInput.style.border = "1px solid #444";
            keyInput.style.borderRadius = "3px";
            keyInput.style.padding = "4px 8px";

            const addKeyBtn = document.createElement("button");
            addKeyBtn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:3px;">${lucideIcon("plus", 11)} Add Key</span>`;
            addKeyBtn.style.backgroundColor = "#2d5a3f";
            addKeyBtn.style.color = "#fff";
            addKeyBtn.style.border = "1px solid #3d7a55";
            addKeyBtn.style.borderRadius = "3px";
            addKeyBtn.style.padding = "4px 10px";
            addKeyBtn.style.cursor = "pointer";

            const clearKeysBtn = document.createElement("button");
            clearKeysBtn.innerText = "Clear All";
            clearKeysBtn.title = "Delete all stored keys from api_key.txt";
            clearKeysBtn.style.backgroundColor = "#522626";
            clearKeysBtn.style.color = "#eee";
            clearKeysBtn.style.border = "1px solid #663333";
            clearKeysBtn.style.borderRadius = "3px";
            clearKeysBtn.style.padding = "4px 8px";
            clearKeysBtn.style.cursor = "pointer";

            const keyStatus = document.createElement("div");
            keyStatus.style.fontSize = "11px";
            keyStatus.style.marginTop = "6px";
            keyStatus.style.color = "#aaa";

            function renderKeyList(d) {
                if (d.has_key && d.key_count > 0) {
                    keyStatus.innerHTML = `<span style="color:#4CAF50;font-weight:bold;display:inline-flex;align-items:center;gap:4px;">${lucideIcon("check", 12)} ${d.key_count} active key(s) loaded</span> (rotates on quota limits):<br>` +
                        d.masked_keys.map((k, i) => `<span style="color:#85c5ec;font-family:monospace;margin-left:6px;">Key ${i+1}: ${k}</span>`).join("<br>");
                } else {
                    keyStatus.innerHTML = `<span style="color:#e5c07b;display:inline-flex;align-items:center;gap:4px;">${lucideIcon("x", 12)} No API Key saved yet. Paste one above and click '+ Add Key'.</span>`;
                }
            }

            addKeyBtn.onclick = async () => {
                const val = keyInput.value.trim();
                if (!val) return;
                try {
                    const res = await api.fetchApi("/moon/gemini_save_key", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ api_key: val, action: "add" })
                    });
                    const d = await res.json();
                    if (d.success) {
                        renderKeyList({ has_key: d.key_count > 0, key_count: d.key_count, masked_keys: d.masked_keys });
                        keyInput.value = "";
                    } else {
                        alert(d.error);
                    }
                } catch (e) {
                    alert(`Error: ${e.message}`);
                }
            };

            clearKeysBtn.onclick = async () => {
                if (!confirm("Are you sure you want to clear all saved API keys?")) return;
                try {
                    const res = await api.fetchApi("/moon/gemini_save_key", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "clear" })
                    });
                    const d = await res.json();
                    if (d.success) {
                        renderKeyList({ has_key: false, key_count: 0, masked_keys: [] });
                    }
                } catch (e) {
                    alert(`Error: ${e.message}`);
                }
            };

            keyRow.appendChild(keyInput);
            keyRow.appendChild(addKeyBtn);
            keyRow.appendChild(clearKeysBtn);
            keyBox.appendChild(keyTitle);
            keyBox.appendChild(keyRow);
            keyBox.appendChild(keyStatus);
            settingsPanel.appendChild(keyBox);

            // Section 2: Model Selection & Fetch
            const modelBox = document.createElement("div");
            modelBox.style.display = "flex";
            modelBox.style.alignItems = "center";
            modelBox.style.justifyContent = "space-between";
            modelBox.style.gap = "6px";

            const modelLabel = document.createElement("span");
            modelLabel.innerText = "Active Model:";
            modelLabel.style.color = "#aaa";

            const modelRight = document.createElement("div");
            modelRight.style.display = "flex";
            modelRight.style.gap = "6px";

            const modelSelect = document.createElement("select");
            modelSelect.style.backgroundColor = "#222";
            modelSelect.style.color = "#eee";
            modelSelect.style.border = "1px solid #444";
            modelSelect.style.padding = "3px 6px";
            modelSelect.style.borderRadius = "3px";

            function updateToolCompatibility() {
                const model = (node.properties.model_name || "").toLowerCase();
                const isEmbeddingOrLegacy = model.includes("embedding") || model.includes("aqa") || model.includes("imagen");
                const isGeminiSupported = model.includes("gemini") || model.includes("flash") || model.includes("pro");
                const toolsSupported = !isEmbeddingOrLegacy && isGeminiSupported;

                ["code_execution", "google_search_grounding"].forEach(key => {
                    const ctrl = settingControls[key];
                    if (ctrl && ctrl.input) {
                        ctrl.input.disabled = !toolsSupported;
                        if (ctrl.input.parentElement) {
                            ctrl.input.parentElement.style.opacity = toolsSupported ? "1" : "0.4";
                            ctrl.input.parentElement.title = toolsSupported 
                                ? "Supported on this model." 
                                : "Tool not supported on the currently selected model.";
                        }
                    }
                });
            }

            function populateModels(list) {
                modelSelect.innerHTML = "";
                list.forEach(m => {
                    const opt = document.createElement("option");
                    opt.value = m;
                    opt.innerText = m;
                    modelSelect.appendChild(opt);
                });
                modelSelect.value = node.properties.model_name;
                updateToolCompatibility();
            }

            modelSelect.onchange = () => {
                node.properties.model_name = modelSelect.value;
                updateToolCompatibility();
                syncSettingsToWidget();
            };

            const fetchModelsBtn = document.createElement("button");
            fetchModelsBtn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;">${lucideIcon("refresh", 11)} Fetch</span>`;
            fetchModelsBtn.title = "Query Google API and update models.txt";
            fetchModelsBtn.style.backgroundColor = "#333";
            fetchModelsBtn.style.color = "#ddd";
            fetchModelsBtn.style.border = "1px solid #555";
            fetchModelsBtn.style.borderRadius = "3px";
            fetchModelsBtn.style.cursor = "pointer";
            fetchModelsBtn.onclick = async () => {
                fetchModelsBtn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;">${lucideIcon("loader", 11)} Fetching...</span>`;
                fetchModelsBtn.disabled = true;
                try {
                    // Use standard fetch directly with a 35s timeout
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 35000);
                    
                    const res = await api.fetchApi("/moon/gemini_fetch_models", { 
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ force_ipv4: !!node.properties.settings?.force_ipv4 }),
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    
                    const d = await res.json();
                    if (d.success) {
                        populateModels(d.models);
                        fetchModelsBtn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;">${lucideIcon("check", 11)} Done</span>`;
                    } else {
                        alert(d.error);
                        fetchModelsBtn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;">${lucideIcon("x", 11)} Fail</span>`;
                    }
                } catch (e) {
                    alert("Fetch failed: " + (e.name === "AbortError" ? "Request timed out over VPN." : e.message));
                    fetchModelsBtn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;">${lucideIcon("x", 11)} Fail</span>`;
                } finally {
                    fetchModelsBtn.disabled = false;
                    setTimeout(() => { fetchModelsBtn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;">${lucideIcon("refresh", 11)} Fetch</span>`; }, 2500);
                }
            };

            modelRight.appendChild(modelSelect);
            modelRight.appendChild(fetchModelsBtn);
            modelBox.appendChild(modelLabel);
            modelBox.appendChild(modelRight);
            settingsPanel.appendChild(modelBox);

            // Section 3: System Prompt with Workflow / Local Preset Storage
            node.properties.prompt_storage = node.properties.prompt_storage || "workflow";
            node.properties.prompt_file = node.properties.prompt_file || "";
            node.properties.workflow_system_instruction = node.properties.workflow_system_instruction || node.properties.system_instruction || "";

            const sysBox = document.createElement("div");
            sysBox.style.display = "flex";
            sysBox.style.flexDirection = "column";
            sysBox.style.gap = "6px";
            sysBox.style.backgroundColor = "#1a1a1a";
            sysBox.style.padding = "8px";
            sysBox.style.borderRadius = "4px";
            sysBox.style.border = "1px solid #333";

            const sysHeader = document.createElement("div");
            sysHeader.style.display = "flex";
            sysHeader.style.alignItems = "center";
            sysHeader.style.justifyContent = "space-between";

            const sysLabel = document.createElement("span");
            sysLabel.innerText = "System Prompt:";
            sysLabel.style.fontWeight = "bold";
            sysLabel.style.color = "#ddd";

            // Storage mode selector (Workflow vs Local File)
            const storageToggleDiv = document.createElement("div");
            storageToggleDiv.style.display = "flex";
            storageToggleDiv.style.alignItems = "center";
            storageToggleDiv.style.gap = "4px";
            storageToggleDiv.style.fontSize = "11px";

            const storageSelect = document.createElement("select");
            storageSelect.style.backgroundColor = "#242424";
            storageSelect.style.color = "#eee";
            storageSelect.style.border = "1px solid #444";
            storageSelect.style.borderRadius = "3px";
            storageSelect.style.padding = "2px 4px";
            storageSelect.innerHTML = `
                <option value="workflow">Save in Workflow</option>
                <option value="local">Save Locally (prompts/*.txt)</option>
            `;
            storageSelect.value = node.properties.prompt_storage;

            storageToggleDiv.appendChild(document.createTextNode("Storage: "));
            storageToggleDiv.appendChild(storageSelect);
            sysHeader.appendChild(sysLabel);
            sysHeader.appendChild(storageToggleDiv);
            sysBox.appendChild(sysHeader);

            // Local file action bar (File Dropdown, New, Save, Rename, Delete)
            const localFileBar = document.createElement("div");
            localFileBar.style.display = node.properties.prompt_storage === "local" ? "flex" : "none";
            localFileBar.style.alignItems = "center";
            localFileBar.style.gap = "4px";
            localFileBar.style.marginTop = "2px";

            const promptFileSelect = document.createElement("select");
            promptFileSelect.style.flex = "1";
            promptFileSelect.style.backgroundColor = "#242424";
            promptFileSelect.style.color = "#eee";
            promptFileSelect.style.border = "1px solid #444";
            promptFileSelect.style.borderRadius = "3px";
            promptFileSelect.style.padding = "3px 6px";

            async function loadPromptFileContent(filename) {
                if (!filename) {
                    sysTextarea.value = "";
                    return;
                }
                try {
                    const r = await api.fetchApi("/moon/gemini_load_prompt", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ filename: filename })
                    });
                    const d = await r.json();
                    if (d.success) {
                        sysTextarea.value = d.content;
                    } else {
                        console.warn("Failed to load prompt content:", d.error);
                    }
                } catch (e) {
                    console.error("Failed to load prompt:", e);
                }
            }

            async function refreshPromptFiles(selectedName = "") {
                try {
                    const r = await api.fetchApi("/moon/gemini_list_prompts");
                    const d = await r.json();
                    promptFileSelect.innerHTML = "";
                    if (d.files && d.files.length > 0) {
                        d.files.forEach(f => {
                            const opt = document.createElement("option");
                            opt.value = f;
                            opt.innerText = f;
                            promptFileSelect.appendChild(opt);
                        });
                        let targetFile = "";
                        if (selectedName && d.files.includes(selectedName)) {
                            targetFile = selectedName;
                        } else if (node.properties.prompt_file && d.files.includes(node.properties.prompt_file)) {
                            targetFile = node.properties.prompt_file;
                        } else {
                            targetFile = d.files[0];
                        }
                        promptFileSelect.value = targetFile;
                        node.properties.prompt_file = targetFile;
                        await loadPromptFileContent(targetFile);
                    } else {
                        promptFileSelect.innerHTML = `<option value="">(No files in prompts/)</option>`;
                        node.properties.prompt_file = "";
                        sysTextarea.value = "";
                    }
                    syncSettingsToWidget();
                } catch (e) {}
            }

            promptFileSelect.onchange = async () => {
                node.properties.prompt_file = promptFileSelect.value;
                await loadPromptFileContent(node.properties.prompt_file);
                syncSettingsToWidget();
            };

            function createBtn(text, title, color = "#333") {
                const btn = document.createElement("button");
                btn.innerText = text;
                btn.title = title;
                btn.style.backgroundColor = color;
                btn.style.color = "#ddd";
                btn.style.border = "1px solid #555";
                btn.style.borderRadius = "3px";
                btn.style.padding = "2px 7px";
                btn.style.cursor = "pointer";
                btn.style.fontSize = "11px";
                return btn;
            }

            const newFileBtn = createBtn("New", "Create new prompt file");
            const saveFileBtn = createBtn("Save", "Save textarea to file", "#2d5a3f");
            const renameFileBtn = createBtn("Rename", "Rename selected file");
            const deleteFileBtn = createBtn("Delete", "Delete selected file", "#522626");

            newFileBtn.onclick = async () => {
                const name = prompt("Enter new prompt preset name (without .txt):");
                if (!name) return;
                try {
                    const r = await fetch("/moon/gemini_save_prompt", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ filename: name, content: sysTextarea.value })
                    });
                    const d = await r.json();
                    if (d.success) {
                        await refreshPromptFiles(d.filename);
                    } else {
                        alert(d.error);
                    }
                } catch (e) { alert(e.message); }
            };

            saveFileBtn.onclick = async () => {
                let fname = promptFileSelect.value;
                if (!fname) {
                    fname = prompt("Enter filename to save as:");
                    if (!fname) return;
                }
                try {
                    const r = await fetch("/moon/gemini_save_prompt", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ filename: fname, content: sysTextarea.value })
                    });
                    const d = await r.json();
                    if (d.success) {
                        saveFileBtn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;">${lucideIcon("check", 11)} Saved</span>`;
                        setTimeout(() => saveFileBtn.innerText = "Save", 1500);
                        await refreshPromptFiles(d.filename);
                    } else {
                        alert(d.error);
                    }
                } catch (e) { alert(e.message); }
            };

            renameFileBtn.onclick = async () => {
                const oldName = promptFileSelect.value;
                if (!oldName) return;
                const newName = prompt("Rename to:", oldName.replace(/\.txt$/, ""));
                if (!newName || newName === oldName) return;
                try {
                    const r = await fetch("/moon/gemini_rename_prompt", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ old_filename: oldName, new_filename: newName })
                    });
                    const d = await r.json();
                    if (d.success) {
                        await refreshPromptFiles(d.filename);
                    } else {
                        alert(d.error);
                    }
                } catch (e) { alert(e.message); }
            };

            deleteFileBtn.onclick = async () => {
                const fname = promptFileSelect.value;
                if (!fname || !confirm(`Delete ${fname}?`)) return;
                try {
                    const r = await fetch("/moon/gemini_delete_prompt", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ filename: fname })
                    });
                    const d = await r.json();
                    if (d.success) {
                        await refreshPromptFiles();
                    } else {
                        alert(d.error);
                    }
                } catch (e) { alert(e.message); }
            };

            localFileBar.appendChild(promptFileSelect);
            localFileBar.appendChild(newFileBtn);
            localFileBar.appendChild(saveFileBtn);
            localFileBar.appendChild(renameFileBtn);
            localFileBar.appendChild(deleteFileBtn);
            sysBox.appendChild(localFileBar);

            const sysTextarea = document.createElement("textarea");
            sysTextarea.style.height = "55px";
            sysTextarea.style.resize = "vertical";
            sysTextarea.style.backgroundColor = "#111";
            sysTextarea.style.color = "#eee";
            sysTextarea.style.border = "1px solid #333";
            sysTextarea.style.borderRadius = "4px";
            sysTextarea.style.padding = "4px 6px";
            sysTextarea.placeholder = "Enter system instruction...";
            sysTextarea.value = node.properties.prompt_storage === "local" ? "" : (node.properties.system_instruction || "");

            storageSelect.onchange = async () => {
                node.properties.prompt_storage = storageSelect.value;
                localFileBar.style.display = node.properties.prompt_storage === "local" ? "flex" : "none";
                if (node.properties.prompt_storage === "local") {
                    node.properties.workflow_system_instruction = sysTextarea.value;
                    node.properties.system_instruction = "";
                    await refreshPromptFiles();
                } else {
                    sysTextarea.value = node.properties.workflow_system_instruction || "";
                    node.properties.system_instruction = sysTextarea.value;
                }
                syncSettingsToWidget();
            };

            sysTextarea.oninput = () => {
                if (node.properties.prompt_storage === "workflow") {
                    node.properties.system_instruction = sysTextarea.value;
                    node.properties.workflow_system_instruction = sysTextarea.value;
                    syncSettingsToWidget();
                }
            };

            sysTextarea.onchange = async () => {
                if (node.properties.prompt_storage === "workflow") {
                    node.properties.system_instruction = sysTextarea.value;
                    node.properties.workflow_system_instruction = sysTextarea.value;
                    syncSettingsToWidget();
                } else {
                    // In local mode, save directly to the local .txt file on disk
                    if (node.properties.prompt_file) {
                        try {
                            await fetch("/moon/gemini_save_prompt", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ filename: node.properties.prompt_file, content: sysTextarea.value })
                            });
                        } catch (e) {}
                    }
                }
            };

            sysBox.appendChild(sysTextarea);
            settingsPanel.appendChild(sysBox);

            node.applyConfiguredPrompt = () => {
                storageSelect.value = node.properties.prompt_storage || "workflow";
                localFileBar.style.display = node.properties.prompt_storage === "local" ? "flex" : "none";
                if (node.properties.prompt_storage === "local") {
                    node.properties.system_instruction = "";
                    refreshPromptFiles(node.properties.prompt_file);
                } else {
                    sysTextarea.value = node.properties.system_instruction || "";
                }
            };

            if (node.properties.prompt_storage === "local") {
                refreshPromptFiles();
            }

            // Section 4: Sliders & Thinking Level (with UI reload synchronization)
            const settingControls = {};

            function createSettingSlider(label, key, min, max, step) {
                const row = document.createElement("div");
                row.style.display = "flex";
                row.style.alignItems = "center";
                row.style.justifyContent = "space-between";

                const lbl = document.createElement("span");
                lbl.innerText = label;
                lbl.style.color = "#aaa";

                const ctrl = document.createElement("div");
                ctrl.style.display = "flex";
                ctrl.style.alignItems = "center";
                ctrl.style.gap = "8px";

                const valDisplay = document.createElement("span");
                valDisplay.style.fontFamily = "monospace";
                valDisplay.style.width = "35px";
                valDisplay.innerText = node.properties.settings[key];

                const slider = document.createElement("input");
                slider.type = "range";
                slider.min = min;
                slider.max = max;
                slider.step = step;
                slider.value = node.properties.settings[key];
                slider.oninput = () => {
                    node.properties.settings[key] = parseFloat(slider.value);
                    valDisplay.innerText = slider.value;
                    syncSettingsToWidget();
                };

                settingControls[key] = { input: slider, display: valDisplay, type: "slider" };

                ctrl.appendChild(slider);
                ctrl.appendChild(valDisplay);
                row.appendChild(lbl);
                row.appendChild(ctrl);
                settingsPanel.appendChild(row);
            }

            createSettingSlider("Temperature", "temperature", 0.0, 2.0, 0.05);
            createSettingSlider("Top-P", "top_p", 0.0, 1.0, 0.05);
            createSettingSlider("Top-K", "top_k", 0, 100, 1);

            // Thinking Level
            const thinkRow = document.createElement("div");
            thinkRow.style.display = "flex";
            thinkRow.style.justifyContent = "space-between";
            thinkRow.style.alignItems = "center";
            thinkRow.innerHTML = `<span style="color:#aaa;">Thinking Level</span>`;

            const thinkSelect = document.createElement("select");
            thinkSelect.style.backgroundColor = "#222";
            thinkSelect.style.color = "#eee";
            thinkSelect.style.border = "1px solid #444";
            thinkSelect.style.padding = "2px 6px";
            thinkSelect.style.borderRadius = "3px";
            ["default", "minimal", "low", "medium", "high"].forEach(opt => {
                const el = document.createElement("option");
                el.value = opt;
                el.innerText = opt;
                thinkSelect.appendChild(el);
            });
            thinkSelect.value = node.properties.settings.thinking_level;
            thinkSelect.onchange = () => {
                node.properties.settings.thinking_level = thinkSelect.value;
                syncSettingsToWidget();
            };
            settingControls["thinking_level"] = { input: thinkSelect, type: "select" };

            thinkRow.appendChild(thinkSelect);
            settingsPanel.appendChild(thinkRow);

            function createToggle(label, key) {
                const row = document.createElement("div");
                row.style.display = "flex";
                row.style.justifyContent = "space-between";
                row.style.alignItems = "center";

                const lbl = document.createElement("span");
                lbl.innerText = label;
                lbl.style.color = "#aaa";

                const check = document.createElement("input");
                check.type = "checkbox";
                check.checked = !!node.properties.settings[key];
                check.onchange = () => {
                    node.properties.settings[key] = check.checked;
                    syncSettingsToWidget();
                };

                settingControls[key] = { input: check, type: "toggle" };

                row.appendChild(lbl);
                row.appendChild(check);
                settingsPanel.appendChild(row);
            }

            createToggle("Google Search Grounding", "google_search_grounding");
            createToggle("Code Execution", "code_execution");
            createToggle("JSON Output", "structured_outputs_json");
            createToggle("IPv4 only (fix delay)", "force_ipv4");

            // Master Settings Restoration Function
            node.applyAllConfiguredSettings = function() {
                // If properties were somehow missing, restore from the saved widget JSON
                if (uiSettingsW && uiSettingsW.value) {
                    try {
                        const parsed = JSON.parse(uiSettingsW.value);
                        if (parsed.session_id) node.properties.session_id = parsed.session_id;
                        if (parsed.singular_mode !== undefined) node.properties.singular_mode = !!parsed.singular_mode;
                        if (parsed.model_name) node.properties.model_name = parsed.model_name;
                        if (parsed.prompt_storage) node.properties.prompt_storage = parsed.prompt_storage;
                        if (parsed.prompt_file) node.properties.prompt_file = parsed.prompt_file;
                        if (parsed.system_instruction !== undefined) node.properties.system_instruction = parsed.system_instruction;
                        node.properties.settings = node.properties.settings || {};
                        Object.keys(parsed).forEach(k => {
                            if (!["session_id", "singular_mode", "model_name", "prompt_storage", "prompt_file", "system_instruction"].includes(k)) {
                                node.properties.settings[k] = parsed[k];
                            }
                        });
                    } catch (e) {}
                }

                // 1. Refresh Mode Button (Single message mode vs Conversation mode)
                updateModeUI();

                // 2. Refresh 📎 Workflow Queue Button
                updateClipUI();

                // 3. Refresh Active Model Select
                if (modelSelect && node.properties.model_name) {
                    modelSelect.value = node.properties.model_name;
                    updateToolCompatibility();
                }

                // 4. Refresh All Sliders and Toggles
                if (node.properties.settings) {
                    for (const [key, ctrl] of Object.entries(settingControls)) {
                        if (ctrl.type === "slider" && node.properties.settings[key] !== undefined) {
                            ctrl.input.value = node.properties.settings[key];
                            if (ctrl.display) ctrl.display.innerText = ctrl.input.value;
                        } else if (ctrl.type === "toggle" && node.properties.settings[key] !== undefined) {
                            ctrl.input.checked = !!node.properties.settings[key];
                        } else if (ctrl.type === "select" && node.properties.settings[key] !== undefined) {
                            ctrl.input.value = node.properties.settings[key];
                        }
                    }
                }

                // 5. Refresh Prompt Storage & Textarea
                if (typeof node.applyConfiguredPrompt === "function") {
                    node.applyConfiguredPrompt();
                }

                // 6. Refresh Messages & Sync
                renderMessages();
                syncSettingsToWidget();
            };

            // Tab Switcher
            function setTab(isChat) {
                chatPanel.style.display = isChat ? "flex" : "none";
                settingsPanel.style.display = isChat ? "none" : "flex";
                chatTabBtn.style.color = isChat ? "#61afef" : "#aaa";
                settingsTabBtn.style.color = !isChat ? "#61afef" : "#aaa";
            }
            chatTabBtn.onclick = () => setTab(true);
            settingsTabBtn.onclick = () => setTab(false);
            setTab(true);

            // Fetch stored info on startup
            api.fetchApi("/moon/gemini_get_info")
                .then(r => r.json())
                .then(d => {
                    renderKeyList(d);
                    if (d.models && d.models.length > 0) {
                        populateModels(d.models);
                    }
                })
                .catch(() => {});

            // Mount DOM widget into node
            node.addDOMWidget("gemini_hybrid_chat_gui", "div", root, {
                getValue() { return ""; },
                setValue(v) {},
                computeSize() {
                    return [node.size[0], Math.max(node.size[1] - 80, 400)];
                }
            });

            node.renderChat = renderMessages;
            syncSettingsToWidget();
            renderMessages();
        };

        // When a workflow execution finishes:
        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            onExecuted?.apply(this, arguments);
            const wfData = message?.workflow_chat?.[0];
            if (!wfData) return;

            const activeSessionId = wfData.session_id || this.properties?.session_id;

            // Broadcast the turn to ALL nodes on the canvas that share this session!
            const allNodes = (typeof app !== "undefined" && app.graph?._nodes) ? app.graph._nodes : [];
            allNodes.forEach(node => {
                if (node.type === "GeminiPersistentChat" && node.properties) {
                    // Match if sharing same session_id or connected via the session wire
                    const isConnectedSession = node.inputs?.some(input => 
                        input.name === "session" && input.link && app.graph.links[input.link]?.origin_id === this.id
                    );

                    if (node.properties.session_id === activeSessionId || isConnectedSession || node.id === this.id) {
                        node.properties.chat_history = node.properties.chat_history || [];
                        node.properties.chat_history.push({
                            role: "user",
                            text: wfData.prompt,
                            source: "workflow",
                            images_count: wfData.images_count || 0,
                            images_reused: wfData.images_reused || false
                        });
                        node.properties.chat_history.push({
                            role: "model",
                            text: wfData.text,
                            thoughts: wfData.thoughts,
                            source: "workflow"
                        });
                        if (typeof node.renderChat === "function") {
                            node.renderChat();
                        }
                        if (node.graph) {
                            node.graph.change();
                        }
                    }
                }
            });

            // Reset manual prompt after the run finishes
            this.properties.manual_prompt = "";
            if (typeof this.syncSettingsToWidget === "function") {
                this.syncSettingsToWidget();
            }
        };

        // When the session wire is plugged into another node, immediately mirror its session & history
        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function (type, index, isConnected, link_info) {
            onConnectionsChange?.apply(this, arguments);
            if (type === 1 && this.inputs && this.inputs[index]?.name === "session") {
                if (isConnected && link_info && app.graph) {
                    const originNode = app.graph.getNodeById(link_info.origin_id);
                    if (originNode && originNode.type === "GeminiPersistentChat") {
                        this.properties.session_id = originNode.properties.session_id;
                        this.properties.chat_history = JSON.parse(JSON.stringify(originNode.properties.chat_history || []));
                        if (typeof this.renderChat === "function") this.renderChat();
                        if (typeof this.syncSettingsToWidget === "function") this.syncSettingsToWidget();
                    }
                }
            }
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (info) {
            onConfigure?.apply(this, arguments);
            if (typeof this.applyAllConfiguredSettings === "function") {
                this.applyAllConfiguredSettings();
            } else {
                if (typeof this.renderChat === "function") this.renderChat();
                if (typeof this.applyConfiguredPrompt === "function") this.applyConfiguredPrompt();
            }
        };
    }
});