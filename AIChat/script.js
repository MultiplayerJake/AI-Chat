const chat = document.getElementById("chat");
const promptInput = document.getElementById("prompt");
const systemPromptInput = document.getElementById("systemPrompt");
const modelInput = document.getElementById("modelInput");
const sendButton = document.getElementById("sendButton");
const clearButton = document.getElementById("clearButton");
const statusText = document.getElementById("status");


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
  element.textContent = content;
  chat.appendChild(element);
  scrollToBottom();
  return element;
}

function createTypingIndicator() {
  const wrapper = document.createElement("div");
  wrapper.className = "message ai";
  wrapper.innerHTML = `
    <div class="typing" aria-label="AI is thinking">
      <span></span>
      <span></span>
      <span></span>
    </div>
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

  if (!prompt || !model || isLoading) {
    return;
  }

  messages.push({ role: "user", content: prompt });
  renderMessage("user", prompt);
  promptInput.value = "";
  setLoadingState(true);
  setStatus(`Asking model "${model}"...`);

  let aiBubble;

  try {
    aiBubble = createTypingIndicator();

    const response = await fetch("http://localhost:11434/api/chat", {
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

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`);
    }

    const data = await response.json();
    const reply = data.message?.content?.trim();

    if (!reply) {
      throw new Error("The AI returned an empty response.");
    }

    messages.push({ role: "assistant", content: reply });
    aiBubble.textContent = reply;
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
