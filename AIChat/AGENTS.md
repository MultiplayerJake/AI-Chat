# AIChat Agent Guidelines

## Project Overview
Vanilla HTML/CSS/JS web application for chatting with local AI models via Ollama. No build system or dependencies - static files only.

---

## Commands

### Running the Application
```bash
python -m http.server 8000
npx serve .
php -S localhost:8000
```

### Manual Testing
- Open `index.html` in browser or serve locally
- Test Ollama: `curl http://localhost:11434/api/tags`
- List models: `ollama list`

### Linting (if configured)
```bash
npx html-validate index.html
npx stylelint style.css
npx eslint script.js
```

---

## Code Style Guidelines

### General Principles
- Keep code simple and readable
- Use semantic HTML elements
- Write CSS with CSS custom properties for theming
- Vanilla JavaScript only - no frameworks

### HTML
- Use semantic elements (`<main>`, `<header>`, `<section>`, `<button>`)
- Include ARIA attributes for accessibility
- Always include `lang` attribute on `<html>`
- Include meta viewport for responsive design
- Add Content-Security-Policy meta tag

### CSS
- Define all colors as CSS custom properties in `:root`
- Use flexbox and CSS Grid for layouts
- Use `clamp()` for responsive typography
- Include `box-sizing: border-box` reset
- Use logical property names (`--accent`, `--bg`, `--text`)
- Add transitions for interactive elements
- Include mobile-responsive styles with `@media` queries (640px breakpoint)
- Support both dark and light themes via `[data-theme="light"]`

### JavaScript
- Use `const` and `let` - avoid `var`
- Use meaningful variable and function names (camelCase)
- Use template literals for string concatenation
- Use async/await for async operations
- Keep functions focused and small
- Include error handling with try/catch/finally
- Handle loading states explicitly

### Naming Conventions
| Element | Convention | Example |
|---------|-----------|---------|
| HTML IDs | kebab-case | `id="chat-container"` |
| CSS custom properties | kebab-case | `--accent-color` |
| JavaScript variables | camelCase | `chatMessages` |
| JavaScript functions | camelCase | `renderMessage()` |
| CSS classes | kebab-case | `class="send-button"` |

### Error Handling
- Wrap async operations in try/catch blocks
- Provide meaningful error messages to users
- Validate API responses before using data
- Implement streaming fallback for non-streaming models

---

## File Structure
```
AIChat/
├── index.html    # Main HTML structure
├── style.css     # All styles with CSS variables
├── script.js     # All JavaScript
└── prompts/      # Prompt templates
```

---

## Features

### Theme System
- Dark mode: Teal/ocean palette (`#005461`, `#0C7779`, `#3BC1A8`)
- Light mode: Blue/mint palette (`#A8FBD3`, `#4FB7B3`, `#00F381`)
- Theme stored in localStorage, toggle in hero section

### Streaming Support
- Uses Ollama streaming API (`stream: true`)
- Falls back to non-streaming if stream fails
- Real-time character-by-character display

### Markdown Rendering
- Bullet points (`-`, `*`) and numbered lists
- Bold (`**text**`) and italic (`*text*`)
- Inline code and code blocks with language detection
- Copy button on code blocks

### Input Validation
- Max prompt: 30,000 chars
- Max system prompt: 5,000 chars
- Max message: 30,000 chars

### Security
- Model validation against allowed list
- CSP restricts scripts to same origin
- Connect only to localhost:11434

---

## API Integration

### Ollama API
- Base URL: `http://localhost:11434`
- Endpoint: `POST /api/chat`
- Default model: `qwen3.5`

### Allowed Models
`qwen3.5`, `llama3.1`, `llama3`, `mistral`, `codellama`, `phi3`, `gemma3`

### Response Handling
- Check `response.ok` before parsing
- Access AI response via `data.message?.content`
- Handle empty responses gracefully