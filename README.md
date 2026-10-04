# CogniChess Arena ♟️🤖

> **Dual-Process AI Chess Arena: Benchmarking Frontier LLMs vs. System-1 Intuition Engines**

[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![LangGraph](https://img.shields.io/badge/LangGraph-23272f?style=for-the-badge&logo=langchain)](https://github.com/langchain-ai/langgraph)
[![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

---

## 📌 Overview

**CogniChess Arena** is an experimental evaluation platform designed to pit **System-2 reasoning models** (Large Language Models such as OpenAI GPT-4o, Anthropic Claude 3.5/4.5, Google Gemini 2.5, DeepSeek, and Llama) against **System-1 reflexive neural or heuristic models** on the chessboard.

Built with **FastAPI**, **LangGraph**, and **Next.js 14**, this arena provides real-time chess visualization, telemetry tracking (latency, token consumption, fallback rates, and exact match costs in USD), and audio feedback via Web Audio API.

---

## ✨ Features

- ⚡ **Dual-Process AI Framework**: Compare high-latency deliberative LLMs with ultra-fast intuitive System-1 policies.
- 🔄 **LangGraph Decision Pipeline**: Reliable multi-step workflow (`build_state` ➔ `call_model` ➔ `validate`).
- 🛡️ **Autonomous Fallback System**: Strict UCI move validation using `python-chess`. Automatically detects and handles illegal or malformed model responses with flagged legal fallbacks.
- 📊 **Real-Time Telemetry & Inspector**:
  - Live cost tracking (USD per move and cumulative).
  - Token usage breakdown (Prompt vs. Completion tokens).
  - Inference latency monitoring (milliseconds per move).
  - Full prompt inspection & raw model response preview.
- 🎮 **Modern Interactive UI**:
  - Polished dark-mode chess interface.
  - Interactive board with piece highlights and move indicators.
  - Captured pieces tally and algebraic notation move history.
  - Adjustable match speed (100ms - 2000ms delay) and step-by-step move mode.
  - Native Web Audio synthesized sounds for moves, captures, and checks (zero external audio files).
- 🌐 **Wide Model Coverage**:
  - **OpenAI**: GPT-4o, GPT-4o mini, GPT-4.1 mini, GPT-5
  - **Anthropic**: Claude Sonnet 4.5, Claude Opus 4.5, Claude Haiku 4.5
  - **Google**: Gemini 2.5 Flash, Gemini 2.5 Pro
  - **Open Models (via Euron Gateway)**: DeepSeek V3.2 / V4 Flash, Meta Llama 3.3 70B / 3.1 8B, Qwen QwQ 32B, Moonshot Kimi K3
  - **System-1 Policy**: Built-in 1-ply tactical evaluator or external CLM/Jev policy endpoint.

---

## 🏗️ Architecture

```mermaid
flowchart LR
    subgraph Frontend ["Frontend (Next.js 14)"]
        UI[Interactive Chessboard]
        Controls[Match Controls & Speed]
        Telemetry[Live Cost & Latency Inspector]
        Audio[Web Audio Synthesizer]
    end

    subgraph Backend ["Backend (FastAPI + LangGraph)"]
        API["/move API"]
        Graph["LangGraph Workflow"]
        State["build_state\n(FEN, Legal Choices, History)"]
        Call["call_model\n(LLM / Euron / System-1)"]
        Val["validate\n(python-chess legality check)"]
    end

    UI -->|POST /move| API
    API --> Graph
    Graph --> State --> Call --> Val --> API
    API -->|Move, FEN, Telemetry, Cost| UI
```

---

## 📁 Repository Structure

```text
cognichess-arena/
├── backend/
│   ├── main.py              # FastAPI server, LangGraph engine, and model routing
│   └── requirements.txt     # Python dependencies (fastapi, langgraph, chess, httpx)
├── frontend/
│   ├── app/
│   │   ├── globals.css      # Custom styles and responsive layouts
│   │   ├── layout.js        # Root layout and metadata
│   │   └── page.js          # Interactive arena dashboard & audio synthesizer
│   ├── public/              # Chess piece assets
│   └── package.json         # Next.js 14 and React dependencies
├── .env.example             # Template for API keys
├── .gitignore               # Excludes secrets, venvs, and build caches
├── CLAUDE.md                # System contract and prompt guidelines
└── README.md                # Project documentation
```

---

## 🚀 Getting Started

### Prerequisites

- **Python**: 3.10 or later
- **Node.js**: 18.x or later (tested on v22)
- **Git**

---

### 1. Clone & Setup Environment

```bash
git clone https://github.com/Ashishds/cognichess-arena.git
cd cognichess-arena

# Copy environment template
cp .env.example .env
```

Edit `.env` with your API keys (only configure the providers you plan to benchmark):

```env
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
EURON_API_KEY=your_euron_key_here
SYSTEM1_URL=       # Leave blank to use built-in simulated policy
SYSTEM1_API_KEY=
```

---

### 2. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv

# On Linux/macOS:
source .venv/bin/activate
# On Windows (PowerShell):
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Start FastAPI server
uvicorn main:app --reload --port 8000
```

Backend API will be accessible at: `http://localhost:8000` (docs at `http://localhost:8000/docs`).

---

### 3. Frontend Setup

In a new terminal:

```bash
cd frontend

# Install dependencies
npm install

# Start Next.js development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ⚙️ Configuration & Custom Models

You can easily register new models and configure pricing per 1M tokens by editing `MODELS` in [backend/main.py](file:///g:/chess-arena/backend/main.py):

```python
MODELS = {
    # id -> (label, provider, api model name, $/1M input, $/1M output)
    "gpt-4o-mini": ("OpenAI GPT-4o mini", "openai", "gpt-4o-mini", 0.15, 0.60),
    "my-custom-model": ("Custom LLM", "euron", "custom-model-id", 0.20, 0.50),
}
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the issues page or submit a pull request.

---

## 📄 License

Distributed under the [MIT](file:///g:/chess-arena/LICENSE) License.
