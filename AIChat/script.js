const chat = document.getElementById("chat");
const promptInput = document.getElementById("prompt");
const systemPromptInput = document.getElementById("systemPrompt");
const modelInput = document.getElementById("modelInput");
const sendButton = document.getElementById("sendButton");
const clearButton = document.getElementById("clearButton");
const exportButton = document.getElementById("exportButton");
const importButton = document.getElementById("importButton");
const statusText = document.getElementById("status");
const promptChips = document.getElementById("promptChips");
const themeToggle = document.getElementById("themeToggle");
const ollamaStatus = document.getElementById("ollamaStatus");


const MAX_PROMPT_LENGTH = 30000;
const MAX_SYSTEM_PROMPT_LENGTH = 5000;
const MAX_MESSAGE_LENGTH = 30000;

const messages = [];
let isLoading = false;
let requestStartTime = 0;

function setOllamaStatus(status) {
    ollamaStatus.className = "ollama-status " + status;
    ollamaStatus.title = status === "connected" ? "Ollama is running" : "Ollama is not responding";
}

async function checkOllamaConnection() {
    setOllamaStatus("checking");
    try {
        const response = await fetch("http://localhost:11434/", { method: "GET" });
        if (response.ok) {
            setOllamaStatus("connected");
            return true;
        }
    } catch (e) {}
    setOllamaStatus("disconnected");
    return false;
}

function setStatus(text) {
  statusText.textContent = text;
}

function scrollToBottom() {
  chat.scrollTop = chat.scrollHeight;
}

function renderMessage(role, content, stats = null) {
  const element = document.createElement("div");
  element.className = `message ${role}`;
  
  let statsHtml = "";
  if (stats) {
    const timeSec = (stats.responseTime / 1000).toFixed(1);
    statsHtml = `<div class="message-stats">Response time: ${timeSec}s | Tokens: ${stats.tokens}</div>`;
  }
  
  if (role === "ai") {
    element.innerHTML = `
      <div class="message-content">${parseMarkdown(content)}</div>
      ${statsHtml}
      <button class="copy-btn" aria-label="Copy response">Copy</button>
    `;
    element.querySelectorAll(".code-block code").forEach(block => {
      hljs.highlightElement(block);
    });
  } else {
    element.textContent = content;
  }
  
  chat.appendChild(element);
  scrollToBottom();
  return element;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function parseMarkdown(text) {
  let html = escapeHtml(text);
  
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : "";
    return `<pre class="code-block"><button class="copy-code-btn" data-code="${code.trim().replace(/"/g, '&quot;')}">Copy</button>${langLabel}<code>${code.trim()}</code></pre>`;
  });

  html = html.replace(/`([^`]+)`/g, "<code class=\"inline-code\">$1</code>");
  
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_]+)_/g, "<em>$1</em>");

  const lines = html.split("\n");
  let inList = false;
  let listType = "";
  let result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.match(/^[-*]\s/)) {
      if (!inList || listType !== "ul") {
        if (inList) result.push(`</${listType}>`);
        result.push("<ul>");
        inList = true;
        listType = "ul";
      }
      result.push(`<li>${trimmed.slice(2)}</li>`);
    } else if (trimmed.match(/^\d+\.\s/)) {
      if (!inList || listType !== "ol") {
        if (inList) result.push(`</${listType}>`);
        result.push("<ol>");
        inList = true;
        listType = "ol";
      }
      result.push(`<li>${trimmed.replace(/^\d+\.\s/, "")}</li>`);
    } else {
      if (inList) {
        result.push(`</${listType}>`);
        inList = false;
        listType = "";
      }
      if (trimmed === "") {
        // skip empty lines
      } else {
        result.push(`<p>${trimmed}</p>`);
      }
    }
  }

  if (inList) {
    result.push(`</${listType}>`);
  }

  return result.join("\n");
}

function createTypingIndicator() {
  const wrapper = document.createElement("div");
  wrapper.className = "message ai";
  wrapper.innerHTML = `
    <span class="message-content">
      <span class="typing" aria-label="AI is thinking">
        <span></span>
        <span></span>
        <span></span>
      </span>
    </span>
  `;
  chat.appendChild(wrapper);
  scrollToBottom();
  return wrapper;
}

function buildRequestMessages() {
  const systemPrompt = systemPromptInput.value.trim();

  if (!systemPrompt) {
    return [...messages];
  }

  return [{ role: "system", content: systemPrompt }, ...messages];
}

function setLoadingState(loading) {
  isLoading = loading;
  sendButton.disabled = loading;
  promptInput.disabled = loading;
  systemPromptInput.disabled = loading;
  modelInput.disabled = loading;
  sendButton.textContent = loading ? "Thinking..." : "Send";
  sendButton.classList.toggle("sending", loading);
}

async function askAI() {
  const prompt = promptInput.value.trim();
  const model = modelInput.value.trim();
  const systemPrompt = systemPromptInput.value.trim();

  if (!prompt || !model || isLoading) {
    return;
  }

  if (prompt.length > MAX_PROMPT_LENGTH) {
    setStatus(`Prompt exceeds ${MAX_PROMPT_LENGTH.toLocaleString()} character limit.`);
    return;
  }

  if (systemPrompt.length > MAX_SYSTEM_PROMPT_LENGTH) {
    setStatus(`System prompt exceeds ${MAX_SYSTEM_PROMPT_LENGTH.toLocaleString()} character limit.`);
    return;
  }

  if (prompt.length > MAX_MESSAGE_LENGTH) {
    setStatus(`Message too long (max ${MAX_MESSAGE_LENGTH.toLocaleString()} chars).`);
    return;
  }

  messages.push({ role: "user", content: prompt });
  renderMessage("user", prompt);
  promptInput.value = "";
  setLoadingState(true);
  setStatus(`Asking model "${model}"...`);
  requestStartTime = Date.now();

  let aiBubble;
  let fullResponse = "";
  let responseStats = null;

  try {
    aiBubble = createTypingIndicator();
    const messageContent = aiBubble.querySelector(".message-content");

    let response;
    let streamingWorked = false;

    try {
      response = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          stream: true,
          messages: buildRequestMessages(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}.`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            const content = data.message?.content || "";
            if (content) {
              fullResponse += content;
              messageContent.innerHTML = parseMarkdown(fullResponse);
              scrollToBottom();
            }
            if (data.done) {
              responseStats = {
                responseTime: Date.now() - requestStartTime,
                tokens: data.eval_count || 0
              };
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
      streamingWorked = true;
    } catch (streamError) {
      if (response && response.body) {
        response.body.cancel();
      }
      setStatus("Streaming not supported, trying standard mode...");
      await new Promise(r => setTimeout(r, 500));

      const fallbackResponse = await fetch("http://localhost:11434/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          stream: false,
          messages: buildRequestMessages(),
        }),
      });

      if (!fallbackResponse.ok) {
        throw new Error(`Request failed with status ${fallbackResponse.status}.`);
      }

      const fallbackData = await fallbackResponse.json();
      fullResponse = fallbackData.message?.content || "";
      messageContent.innerHTML = parseMarkdown(fullResponse);
      
      responseStats = {
        responseTime: Date.now() - requestStartTime,
        tokens: fallbackData.eval_count || 0
      };
    }

    const reply = fullResponse.trim();

    if (!reply) {
      throw new Error("The AI returned an empty response.");
    }

    if (reply.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`AI response exceeds ${MAX_MESSAGE_LENGTH.toLocaleString()} character limit.`);
    }

    messages.push({ role: "assistant", content: reply, stats: responseStats });
    aiBubble.innerHTML = `
      <div class="message-content">${parseMarkdown(reply)}</div>
      ${responseStats ? `<div class="message-stats">Response time: ${(responseStats.responseTime / 1000).toFixed(1)}s | Tokens: ${responseStats.tokens}</div>` : ''}
      <button class="copy-btn" aria-label="Copy response">Copy</button>
    `;
    aiBubble.querySelectorAll(".code-block code").forEach(block => {
      hljs.highlightElement(block);
    });
    setStatus("Reply received.");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Something went wrong while contacting the AI.";

    if (aiBubble) {
      aiBubble.textContent =
        "I couldn't reach the AI. Make sure Ollama is running on localhost:11434 and that the selected model is installed.\n if the model itn't instaled go to https://ollama.com/ to install it.\n try tiping into cmd this: ollama run "  + modelInput.value.trim();
    } else {
      renderMessage(
        "system",
        "I couldn't reach the AI. Make sure Ollama is running on localhost:11434 and that the selected model is installed.\n if the model itn't instaled go to https://ollama.com/ to install it.\n try tiping into cmd this: ollama run " + modelInput.value.trim()
      );
    }

    setStatus(message);
  } finally {
    setLoadingState(false);
promptInput.focus();
checkOllamaConnection();
  }
}

function clearChat() {
  messages.length = 0;
  chat.innerHTML = "";
  renderMessage(
    "system",
    "Chat cleared. Ask a new question whenever you're ready."
  );
  setStatus("Conversation reset.");
}

sendButton.addEventListener("click", async () => {
    await checkOllamaConnection();
    askAI();
});
clearButton.addEventListener("click", clearChat);
exportButton.addEventListener("click", exportChat);
importButton.addEventListener("click", () => document.getElementById("importInput").click());
document.getElementById("importInput").addEventListener("change", importChat);

modelInput.addEventListener("blur", checkOllamaConnection);

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    if (!isLoading) askAI();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
    event.preventDefault();
    if (!isLoading) clearChat();
  }
  if (event.key === "Escape") {
    document.activeElement?.blur();
  }
});

promptInput.focus();

const PROMPT_FILES = [
  "prompt_like_10_years_old.txt",
  "prompt_pros_and_cons.txt",
  "prompt_summarize.txt",
  "the_code_architect.txt",
  "the_creative_visionary.txt",
  "the_empathic_companion.txt",
  "the_precision_analyst.txt",
  "the_socratic_tutor.txt"
];

function getPromptLabel(filename) {
  return filename
    .replace("prompt_", "")
    .replace(".txt", "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

async function initPromptChips() {
  promptChips.innerHTML = "";
  
  for (const filename of PROMPT_FILES) {
    const button = document.createElement("button");
    button.className = "chip";
    button.dataset.prompt = filename;
    button.textContent = getPromptLabel(filename);
    promptChips.appendChild(button);
  }
}

initPromptChips();

async function loadPromptFile(filename) {
  try {
    const response = await fetch(`./prompts/${filename}`);
    if (!response.ok) throw new Error("Failed to load prompt");
    const text = await response.text();
    return text;
  } catch (err) {
    console.error("Error loading prompt:", err);
    return null;
  }
}

promptChips.addEventListener("click", async (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;

  const promptFile = chip.dataset.prompt;
  console.log("Clicked chip, filename:", promptFile);
  
  if (!promptFile) return;

  const promptContent = await loadPromptFile(promptFile);
  console.log("Loaded content:", promptContent ? "yes" : "no");
  
  if (promptContent) {
    console.log("Setting system prompt...");
    systemPromptInput.value = promptContent;
    systemPromptInput.focus();
    console.log("Done! Value length:", systemPromptInput.value.length);
  } else {
    console.error("Failed to load prompt file");
  }
});

const savedTheme = localStorage.getItem("theme") || "dark";
document.documentElement.setAttribute("data-theme", savedTheme);
updateThemeIcon();

themeToggle.addEventListener("click", () => {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const newTheme = currentTheme === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("theme", newTheme);
  updateThemeIcon();
});

function updateThemeIcon() {
  const theme = document.documentElement.getAttribute("data-theme");
  const svg = themeToggle.querySelector(".theme-icon");
  if (theme === "light") {
    svg.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
  } else {
    svg.innerHTML = `<circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
  }
}

chat.addEventListener("click", async (event) => {
  const copyCodeBtn = event.target.closest(".copy-code-btn");
  if (copyCodeBtn) {
    const code = copyCodeBtn.dataset.code;
    try {
      await navigator.clipboard.writeText(code);
      copyCodeBtn.textContent = "Copied!";
      setTimeout(() => {
        copyCodeBtn.textContent = "Copy";
      }, 1500);
    } catch (err) {
      setStatus("Failed to copy code");
    }
    return;
  }

  const copyBtn = event.target.closest(".copy-btn");
  if (!copyBtn) return;

  const messageEl = copyBtn.closest(".message");
  const content = messageEl.querySelector(".message-content")?.textContent;

  if (!content) return;

  try {
    await navigator.clipboard.writeText(content);
    copyBtn.textContent = "Copied!";
    copyBtn.classList.add("copied");
    setTimeout(() => {
      copyBtn.textContent = "Copy";
      copyBtn.classList.remove("copied");
    }, 1500);
  } catch (err) {
    setStatus("Failed to copy to clipboard");
  }
});

function exportChat() {
  const exportData = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    model: modelInput.value.trim() || "qwen3.5",
    systemPrompt: systemPromptInput.value.trim(),
    messages: messages.map((msg, idx) => {
      const base = {
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp || new Date().toISOString()
      };
      if (msg.stats) base.stats = msg.stats;
      return base;
    })
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().split("T")[0];
  a.href = url;
  a.download = `chat-export-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus("Chat exported successfully.");
}

function importChat(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      
      if (!data.version || !data.messages || !Array.isArray(data.messages)) {
        throw new Error("Invalid file format");
      }

      messages.length = 0;
      chat.innerHTML = "";

      if (data.model) modelInput.value = data.model;
      if (data.systemPrompt) systemPromptInput.value = data.systemPrompt;

      for (const msg of data.messages) {
        if (!msg.content) continue;
        
        const messageObj = {
          role: msg.role === "assistant" ? "assistant" : msg.role,
          content: msg.content,
          timestamp: msg.timestamp
        };
        
        if (msg.stats) messageObj.stats = msg.stats;
        
        messages.push(messageObj);
        renderMessage(messageObj.role === "assistant" ? "ai" : messageObj.role, messageObj.content, messageObj.stats);
      }

      if (messages.length === 0) {
        renderMessage("system", "No messages found in import file.");
      }

      setStatus(`Imported ${messages.length} messages.`);
    } catch (err) {
      setStatus("Failed to import: Invalid file format.");
      console.error("Import error:", err);
    }
  };
  
  reader.readAsText(file);
  event.target.value = "";
}
