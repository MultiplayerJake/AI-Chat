const chat = document.getElementById("chat");
const promptInput = document.getElementById("prompt");
const systemPromptInput = document.getElementById("systemPrompt");
const modelInput = document.getElementById("modelInput");
const sendButton = document.getElementById("sendButton");
const clearButton = document.getElementById("clearButton");
const statusText = document.getElementById("status");
const promptChips = document.getElementById("promptChips");
const themeToggle = document.getElementById("themeToggle");


const MAX_PROMPT_LENGTH = 30000;
const MAX_SYSTEM_PROMPT_LENGTH = 5000;
const MAX_MESSAGE_LENGTH = 30000;

const messages = [];
let isLoading = false;

function setStatus(text) {
  statusText.textContent = text;
}

function scrollToBottom() {
  chat.scrollTop = chat.scrollHeight;
}

function renderMessage(role, content) {
  const element = document.createElement("div");
  element.className = `message ${role}`;
  
  if (role === "ai") {
    element.innerHTML = `
      <div class="message-content">${parseMarkdown(content)}</div>
      <button class="copy-btn" aria-label="Copy response">Copy</button>
    `;
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
        result.push("<br>");
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

  let aiBubble;
  let fullResponse = "";

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
    }

    const reply = fullResponse.trim();

    if (!reply) {
      throw new Error("The AI returned an empty response.");
    }

    if (reply.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`AI response exceeds ${MAX_MESSAGE_LENGTH.toLocaleString()} character limit.`);
    }

    messages.push({ role: "assistant", content: reply });
    aiBubble.innerHTML = `
      <div class="message-content">${parseMarkdown(reply)}</div>
      <button class="copy-btn" aria-label="Copy response">Copy</button>
    `;
    setStatus("Reply received.");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Something went wrong while contacting the AI.";

    if (aiBubble) {
      aiBubble.textContent =
        "I couldn't reach the AI. Make sure Ollama is running on localhost:11434 and that the selected model is installed.\n try tiping this: ollama run qwen3.5";
    } else {
      renderMessage(
        "system",
        "I couldn't reach the AI. Make sure Ollama is running on localhost:11434 and that the selected model is installed.\n try tiping this: ollama run qwen3.5"
      );
    }

    setStatus(message);
  } finally {
    setLoadingState(false);
    promptInput.focus();
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

sendButton.addEventListener("click", askAI);
clearButton.addEventListener("click", clearChat);

promptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    askAI();
  }
});

promptInput.focus();

promptChips.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;

  const promptTemplate = chip.dataset.prompt;
  systemPromptInput.value = promptTemplate;
  systemPromptInput.focus();
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
  const icon = themeToggle.querySelector(".theme-icon");
  icon.innerHTML = theme === "light" ? "&#9790;" : "&#9728;";
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
