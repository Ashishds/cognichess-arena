import os, re, time, random
from typing import TypedDict, Optional
import chess, httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from langgraph.graph import StateGraph, END

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv()

# id -> (label, provider, api model name, $/1M input, $/1M output). EDIT FREELY.
MODELS = {
    "system1":                  ("System-1 (Simulated / Jev)", "system1", "", 0, 0),
    # OpenAI (via Euron or direct)
    "gpt-4o-mini":              ("OpenAI GPT-4o mini", "openai", "gpt-4o-mini", 0.15, 0.60),
    "gpt-4o":                   ("OpenAI GPT-4o", "openai", "gpt-4o", 2.50, 10.0),
    "gpt-4.1-mini":             ("OpenAI GPT-4.1 mini", "openai", "gpt-4.1-mini", 0.20, 0.80),
    "gpt-5":                    ("OpenAI GPT-5", "openai", "gpt-5", 1.25, 10.0),
    # Anthropic (via Euron or direct)
    "claude-sonnet-4-5":        ("Anthropic Claude Sonnet 4.5", "anthropic", "claude-sonnet-4-5", 3.0, 15.0),
    "claude-opus-4-5":          ("Anthropic Claude Opus 4.5", "anthropic", "claude-opus-4-5", 5.0, 25.0),
    "claude-haiku-4-5":         ("Anthropic Claude Haiku 4.5", "anthropic", "claude-haiku-4-5", 1.0, 5.0),
    # Google (via Euron or direct)
    "gemini-2.5-flash":         ("Google Gemini 2.5 Flash", "gemini", "gemini-2.5-flash", 0.30, 2.5),
    "gemini-2.5-pro":           ("Google Gemini 2.5 Pro", "gemini", "gemini-2.5-pro", 1.25, 5.0),
    # Meta / Llama (via Euron)
    "llama-3.3-70b":            ("Meta Llama 3.3 70B", "euron", "llama-3.3-70b-versatile", 0.50, 0.80),
    "llama-3.1-8b":             ("Meta Llama 3.1 8B Instant", "euron", "llama-3.1-8b-instant", 0.10, 0.10),
    # DeepSeek (via Euron)
    "deepseek-v3.2":            ("DeepSeek V3.2", "euron", "deepseek-ai/DeepSeek-V3.2", 0.25, 0.50),
    "deepseek-v4-flash":        ("DeepSeek V4 Flash", "euron", "deepseek-ai/DeepSeek-V4-Flash", 0.15, 0.30),
    # Alibaba / Qwen (via Euron)
    "qwen-qwq-32b":             ("Alibaba Qwen QwQ 32B", "euron", "qwen-qwq-32b", 0.20, 0.50),
    # Moonshot / Kimi (via Euron)
    "kimi-k3":                  ("Moonshot Kimi K3", "euron", "kimi-k3", 0.30, 0.60),
}
SYSTEM = ("You are a chess engine. Given the position (FEN) and the list of legal moves, "
          "pick the best move for the side to move. Reply with ONLY one move in UCI format "
          "from the choices, e.g. e2e4. No explanation.")

class S(TypedDict, total=False):
    fen: str; player: str; history: list
    legal: list; system: str; user: str
    raw: str; tin: int; tout: int; latency: float
    uci: str; fallback: bool; note: str

def build_state(s: S) -> S:
    b = chess.Board(s["fen"])
    legal = [m.uci() for m in b.legal_moves]
    user = (f"FEN: {s['fen']}\nSide to move: {'white' if b.turn else 'black'}\n"
            f"Last moves: {' '.join(s.get('history', [])[-8:])}\nChoices: {' '.join(legal)}")
    return {"legal": legal, "system": SYSTEM, "user": user}

def _post(url, **kw):
    r = httpx.post(url, timeout=120, **kw); r.raise_for_status(); return r.json()

def _call_euron(model: str, system_prompt: str, user_prompt: str):
    endpoint = os.getenv("EURON_BASE_URL", "https://api.euron.one/api/v1/euri/chat/completions")
    key = os.getenv("EURON_API_KEY") or os.getenv("EURI_API_KEY", "")
    d = _post(endpoint,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"model": model, "max_tokens": 1500,
              "messages": [{"role": "system", "content": system_prompt},
                           {"role": "user", "content": user_prompt}]})
    raw = (d.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    usage = d.get("usage") or {}
    return raw, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)

def call_model(s: S) -> S:
    _, prov, model, *_ = MODELS[s["player"]]
    t = time.time(); raw, tin, tout = "", 0, 0
    euron_key = os.getenv("EURON_API_KEY") or os.getenv("EURI_API_KEY", "")
    try:
        if prov == "system1":
            raw = system1(s)
        elif prov == "openai" and os.getenv("OPENAI_API_KEY"):
            d = _post("https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}"},
                json={"model": model, "max_completion_tokens": 2500,
                      "messages": [{"role": "system", "content": s["system"]},
                                   {"role": "user", "content": s["user"]}]})
            raw = d["choices"][0]["message"].get("content") or ""
            tin, tout = d["usage"]["prompt_tokens"], d["usage"]["completion_tokens"]
        elif prov == "anthropic" and os.getenv("ANTHROPIC_API_KEY"):
            d = _post("https://api.anthropic.com/v1/messages",
                headers={"x-api-key": os.getenv("ANTHROPIC_API_KEY", ""), "anthropic-version": "2023-06-01"},
                json={"model": model, "max_tokens": 50,
                      "system": [{"type": "text", "text": s["system"], "cache_control": {"type": "ephemeral"}}],
                      "messages": [{"role": "user", "content": s["user"]}]})
            raw = "".join(c.get("text", "") for c in d["content"])
            tin, tout = d["usage"]["input_tokens"], d["usage"]["output_tokens"]
        elif prov == "gemini" and os.getenv("GEMINI_API_KEY"):
            d = _post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                params={"key": os.getenv("GEMINI_API_KEY", "")},
                json={"systemInstruction": {"parts": [{"text": s["system"]}]},
                      "contents": [{"parts": [{"text": s["user"]}]}],
                      "generationConfig": {"maxOutputTokens": 2500}})
            raw = d["candidates"][0]["content"]["parts"][0].get("text", "")
            u = d.get("usageMetadata", {}); tin, tout = u.get("promptTokenCount", 0), u.get("candidatesTokenCount", 0)
        elif euron_key:
            # Route all other models (or providers without specific keys) through Euron
            raw, tin, tout = _call_euron(model, s["system"], s["user"])
        else:
            raw = system1(s)
    except Exception as e:
        return {"raw": "", "note": f"API error: {str(e)[:150]}", "latency": (time.time() - t) * 1000}
    return {"raw": raw, "tin": tin, "tout": tout, "latency": (time.time() - t) * 1000}

VAL = {"p": 1, "n": 3, "b": 3, "r": 5, "q": 9, "k": 0}
def system1(s: S) -> str:
    """Real System-1 endpoint if SYSTEM1_URL set; else a simulated 1-ply material scorer."""
    url = os.getenv("SYSTEM1_URL")
    if url:
        h = {"Authorization": f"Bearer {os.getenv('SYSTEM1_API_KEY', '')}"}
        d = _post(url, headers=h, json={"state": s["fen"], "choices": s["legal"], "history": s.get("history", [])})
        if "scores" in d: return s["legal"][max(range(len(d["scores"])), key=d["scores"].__getitem__)]
        return d.get("move", "")
    b = chess.Board(s["fen"]); best, bs = None, -1e9
    for m in b.legal_moves:
        sc = random.random() * 0.3
        if b.is_capture(m):
            v = b.piece_at(m.to_square); sc += VAL[v.symbol().lower()] if v else 1
        b.push(m)
        if b.is_checkmate(): sc += 100
        elif b.is_check(): sc += 0.5
        b.pop()
        if sc > bs: best, bs = m.uci(), sc
    return best

def validate(s: S) -> S:
    found = [m for m in re.findall(r"[a-h][1-8][a-h][1-8][qrbn]?", s.get("raw", "").lower()) if m in s["legal"]]
    if found: return {"uci": found[0], "fallback": False}
    return {"uci": random.choice(s["legal"]), "fallback": True,
            "note": s.get("note") or "Empty/illegal reply -> random legal move"}

g = StateGraph(S)
g.add_node("build_state", build_state); g.add_node("call_model", call_model); g.add_node("validate", validate)
g.set_entry_point("build_state"); g.add_edge("build_state", "call_model")
g.add_edge("call_model", "validate"); g.add_edge("validate", END)
graph = g.compile()

app = FastAPI(title="CogniChess Arena (LLMs vs System-1)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class Req(BaseModel):
    fen: str = chess.STARTING_FEN
    player: str
    history: list[str] = []

@app.get("/models")
def models():
    return [
        {"id": k, "label": v[0], "provider": v[1], "pin": v[3], "pout": v[4]}
        for k, v in MODELS.items()
    ]

@app.post("/move")
def move(r: Req):
    s = graph.invoke({"fen": r.fen, "player": r.player, "history": r.history})
    _, _, _, pin, pout = MODELS[r.player]
    b = chess.Board(r.fen); m = chess.Move.from_uci(s["uci"]); san = b.san(m); b.push(m)
    res = b.result() if b.is_game_over() else None
    return {"uci": s["uci"], "san": san, "fen": b.fen(), "check": b.is_check(), "mate": b.is_checkmate(),
            "over": b.is_game_over(), "result": res, "fallback": s["fallback"], "note": s.get("note", ""),
            "latency": round(s.get("latency", 0)), "tin": s.get("tin", 0), "tout": s.get("tout", 0),
            "cost": (s.get("tin", 0) * pin + s.get("tout", 0) * pout) / 1e6,
            "sent": {"system": s["system"], "user": s["user"]}, "raw": s.get("raw", "")}
