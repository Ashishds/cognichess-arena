# CogniChess Arena — Developer & Agent Guide

This document outlines the core architecture, operational contracts, and guidelines for developing and extending the **CogniChess Arena** platform.

---

## 🏛️ System Architecture

CogniChess Arena benchmarks **System-2 reasoning models** (Large Language Models) against **System-1 intuitive models** (fast heuristic or neural policy networks) playing standard chess.

```
[ Next.js Frontend ] 
        │ (POST /move)
        ▼
[ FastAPI Backend ] 
        │
        ▼
[ LangGraph State Machine ]
  ├── 1. build_state : FEN parser, legal move generator, context builder
  ├── 2. call_model  : Provider router (OpenAI, Anthropic, Gemini, Euron, System-1)
  └── 3. validate    : Legality validator via python-chess & fallback assigner
```

- **Backend**: Python 3.10+, FastAPI, LangGraph, `python-chess`, HTTPX, Uvicorn (`backend/main.py`).
- **Frontend**: Next.js 14 (App Router), React 18, Web Audio API, Vanilla CSS (`frontend/app/page.js`).

---

## 🔄 LangGraph Execution Pipeline

The core decision loop in `backend/main.py` is compiled into a `StateGraph`:

1. **`build_state`**:
   - Parses incoming board FEN via `chess.Board`.
   - Generates list of all legal moves in UCI format (e.g., `e2e4`, `g1f3`).
   - Prepares compact system instructions and context-constrained user prompt containing FEN, turn, choice pool, and recent move history.
2. **`call_model`**:
   - Resolves active player configuration from `MODELS`.
   - Dispatches inference request to appropriate provider SDK or HTTP gateway with latency and token telemetry tracking.
3. **`validate`**:
   - Regex-extracts UCI move tokens from model output (`[a-h][1-8][a-h][1-8][qrbn]?`).
   - Verifies whether the move exists in `legal_moves`.
   - **Fallback Policy**: If the model outputs an illegal move, empty response, or hallucinates, a random legal move is selected, and `fallback: true` is tagged alongside the error note for telemetry auditing.

---

## 🔌 System-1 Service Contract

System-1 represents the fast, reflexive player (e.g., Jev, CLM, or distilled policy network).

- If `SYSTEM1_URL` is configured in `.env`, the backend dispatches an HTTP POST request to that endpoint.
- If `SYSTEM1_URL` is empty, the backend automatically runs the built-in simulated 1-ply tactical material scorer.

### Request Payload

```json
{
  "state": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "choices": ["g1h3", "g1f3", "b1c3", "e2e4", "d2d4"],
  "history": ["e4", "e5", "Nf3"]
}
```

### Expected Response Format

The endpoint should return either score distributions across all choices or an explicit chosen move:

```json
{
  "scores": [0.01, 0.45, 0.23, 0.89, 0.72]
}
```
*(The engine picks the choice with the maximum score index)*

**OR**

```json
{
  "move": "e2e4"
}
```

---

## ⚙️ Model Registry & Pricing Configuration

Models, providers, and per-token pricing are centrally managed in `MODELS` inside `backend/main.py`:

```python
MODELS = {
    # id -> (Display Label, Provider, API Model Identifier, $/1M Input Tokens, $/1M Output Tokens)
    "system1": ("System-1 (Simulated / Jev)", "system1", "", 0.0, 0.0),
    "gpt-4o-mini": ("OpenAI GPT-4o mini", "openai", "gpt-4o-mini", 0.15, 0.60),
    "claude-sonnet-4-5": ("Anthropic Claude Sonnet 4.5", "anthropic", "claude-sonnet-4-5", 3.0, 15.0),
    "deepseek-v3.2": ("DeepSeek V3.2", "euron", "deepseek-ai/DeepSeek-V3.2", 0.25, 0.50),
}
```

Supported provider identifiers:
- `"system1"`: System-1 endpoint or local heuristic.
- `"openai"`: Direct OpenAI API (`OPENAI_API_KEY`).
- `"anthropic"`: Direct Anthropic API (`ANTHROPIC_API_KEY`).
- `"gemini"`: Direct Google Gemini API (`GEMINI_API_KEY`).
- `"euron"`: Euron / Euri AI Gateway (`EURON_API_KEY`) for open-source & multi-provider routing.

---

## 🎯 Prompting Best Practices

- **Minimalist & Zero-Shot**: Prompts must be concise to reduce token overhead, minimize per-move latency, and avoid polluting model context.
- **Strict Format Constraints**: Require **UCI format only** (e.g., `e2e4`). Do not encourage natural language reasoning or markdown wrapping in move responses during fast arena play.
- **Telemetry Transparency**: The UI inspects both raw responses and calculated costs per move for benchmark accuracy.

---

## 🛠️ Development & Operational Commands

### Backend Service
```bash
cd backend
python -m venv .venv
# Activate venv:
source .venv/bin/activate        # Linux / macOS
.\.venv\Scripts\Activate.ps1    # Windows PowerShell

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend Client
```bash
cd frontend
npm install
npm run dev
```

### Smoke Test API
```bash
# Verify available models
curl http://localhost:8000/models

# Request test move
curl -X POST http://localhost:8000/move \
  -H "Content-Type: application/json" \
  -d '{"player": "system1", "history": []}'
```
