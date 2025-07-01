# Manus Replica

A full-stack AI agent platform that allows users to interact with a virtual machine via natural language. The agent can execute shell commands, manage files, and run code in a sandboxed environment, with a modern React frontend and robust backend.

## Features
- Chat with an AI agent that can:
  - Execute shell commands
  - Read, write, create, and delete files and directories
  - Run Python, JavaScript, and Bash code
- Real-time streaming responses
- Tool calling with OpenAI function-calling API
- E2B sandbox integration for secure code execution
- Modern, markdown-friendly chat UI
- Robust error handling and recovery (reset, reconnect, stop, etc.)

## Prerequisites
- Node.js (v18+ recommended)
- npm (v9+ recommended)
- An [OpenAI API key](https://platform.openai.com/account/api-keys)
- An [E2B API key](https://e2b.dev/)

## Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/lleyi0606/manus-replica.git
cd manus-replica
```

### 2. Install dependencies
```bash
npm install
cd backend && npm install
cd ../frontend && npm install
cd ../shared && npm install
```

### 3. Set up environment variables
Create a `.env` file in the `backend` directory:
```env
OPENAI_API_KEY=your_openai_api_key
E2B_API_KEY=your_e2b_api_key
PORT=3001
```

### 4. Build the shared package
```bash
cd shared
npm run build
```

### 5. Run the app
In the project root, run:
```bash
npm run dev
```
This will start both the backend and frontend in development mode.

- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend: [http://localhost:3001](http://localhost:3001)

Or, run them separately:
```bash
cd backend && npm run dev
cd frontend && npm run dev
```

## Development
- **Frontend:** React + Vite + TailwindCSS (`frontend/`)
- **Backend:** Node.js + TypeScript + OpenAI SDK + E2B (`backend/`)
- **Shared:** TypeScript types and utilities (`shared/`)

### Building shared after changes
```bash
cd shared
npm run build
```

## Common Issues & Troubleshooting
- **E2B session timeout:** The backend will automatically recreate the sandbox and retry if the session times out.
- **OpenAI tool_call errors:** Use the "Reconnect" or "Clear Chat" buttons to recover from invalid tool call history.
- **File/directory creation:** The agent is instructed to check for and create directories (ending with `/`) before creating files inside them.
- **Markdown rendering:** Both chat and thinking bubbles support markdown, including code blocks.

## Scripts
- `npm run dev` — Run both backend and frontend in dev mode (root)
- `npm run dev` — Run backend or frontend in dev mode (in respective folder)
- `npm run build` — Build the shared package (in `shared/`)

## License
MIT 