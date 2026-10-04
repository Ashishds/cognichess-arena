# CogniChess Arena
LLMs vs System-1 model playing chess. Backend: FastAPI + LangGraph (backend/main.py). Frontend: Next.js (frontend/app).
- Edit MODELS in backend/main.py to add models/prices (USD per 1M tokens).
- Graph: build_state -> call_model -> validate (illegal/empty reply => random legal fallback, flagged in UI).
- System-1 contract: POST {state: FEN, choices: [uci...], history: [san...]} -> {scores: [...]} (one per choice) or {move: "e2e4"}.
- Keep prompts minimal; token cost is shown per move.
