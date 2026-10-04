"use client";
import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API || "http://localhost:8000";
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const PIECES = {
  P: "/pieces/neo/wp.png",
  N: "/pieces/neo/wn.png",
  B: "/pieces/neo/wb.png",
  R: "/pieces/neo/wr.png",
  Q: "/pieces/neo/wq.png",
  K: "/pieces/neo/wk.png",
  p: "/pieces/neo/bp.png",
  n: "/pieces/neo/bn.png",
  b: "/pieces/neo/bb.png",
  r: "/pieces/neo/br.png",
  q: "/pieces/neo/bq.png",
  k: "/pieces/neo/bk.png",
};

const freshStats = () => ({ cost: 0, lat: 0, n: 0, tok: 0, fb: 0 });

// Web Audio API synthesized chess sounds (no external files needed)
function playSound(type = "move", muted = false) {
  if (muted || typeof window === "undefined") return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (type === "capture") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.45, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } else if (type === "check") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(520, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(820, ctx.currentTime + 0.14);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.14);
    } else {
      // standard move
      osc.type = "sine";
      osc.frequency.setValueAtTime(260, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    }
  } catch (e) {
    // ignore audio block before user interaction
  }
}

// Calculate captured pieces by counting missing pieces from starting position
function getCapturedPieces(fen) {
  const counts = { P: 0, N: 0, B: 0, R: 0, Q: 0, p: 0, n: 0, b: 0, r: 0, q: 0 };
  const pieceStr = fen.split(" ")[0];
  for (const c of pieceStr) {
    if (counts[c] !== undefined) counts[c]++;
  }

  const initialWhite = { P: 8, N: 2, B: 2, R: 2, Q: 1 };
  const initialBlack = { p: 8, n: 2, b: 2, r: 2, q: 1 };

  // White pieces lost (captured by Black)
  const lostWhite = [];
  for (const [k, init] of Object.entries(initialWhite)) {
    const diff = init - counts[k];
    for (let i = 0; i < diff; i++) lostWhite.push(k);
  }

  // Black pieces lost (captured by White)
  const lostBlack = [];
  for (const [k, init] of Object.entries(initialBlack)) {
    const diff = init - counts[k];
    for (let i = 0; i < diff; i++) lostBlack.push(k);
  }

  return { lostWhite, lostBlack };
}

export default function Page() {
  const [models, setModels] = useState([]);
  const [players, setPlayers] = useState(["system1", "system1"]);
  const [fen, setFen] = useState(START);
  const [moves, setMoves] = useState([]);
  const [moveRecords, setMoveRecords] = useState([]);
  const [lastMoveMeta, setLastMoveMeta] = useState(null);
  const [stats, setStats] = useState([freshStats(), freshStats()]);
  const [lastCall, setLastCall] = useState(null);
  const [status, setStatus] = useState("Select two models and press Play Match");
  const [turn, setTurn] = useState(0); // 0 = White, 1 = Black
  const [highlights, setHighlights] = useState([]);
  const [isCheck, setIsCheck] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(150); // ms delay between moves
  const [muted, setMuted] = useState(false);
  const [activeTab, setActiveTab] = useState("prompt");

  const runId = useRef(0);
  const movesEndRef = useRef(null);

  // Auto-scroll moves table
  useEffect(() => {
    if (movesEndRef.current) {
      movesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [moves]);

  // Load models from backend (keep Jev on top everywhere)
  useEffect(() => {
    fetch(`${API}/models`)
      .then((r) => r.json())
      .then((data) => {
        const sorted = [...data].sort((a, b) => (a.id === "system1" ? -1 : b.id === "system1" ? 1 : 0));
        setModels(sorted);
        if (sorted.length >= 2) {
          setPlayers((prev) => [
            sorted.some((m) => m.id === prev[0]) ? prev[0] : "system1",
            sorted.some((m) => m.id === prev[1]) ? prev[1] : "system1",
          ]);
        }
      })
      .catch(() => setStatus(`Backend not reachable on ${API}. Ensure FastAPI is running.`));
  }, []);

  // Request a single move from backend
  async function makeSingleMove(currentFen, currentHistory, currentRecords, currentTurn, currentStats) {
    const activePlayerId = players[currentTurn];
    const playerLabel = models.find((m) => m.id === activePlayerId)?.label || activePlayerId;

    setStatus(`${playerLabel} is calculating…`);

    let data;
    try {
      const res = await fetch(`${API}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fen: currentFen,
          player: activePlayerId,
          history: currentHistory,
        }),
      });
      data = await res.json();
    } catch (err) {
      setStatus("Error requesting move from backend");
      return null;
    }

    const updatedFen = data.fen;
    const updatedHistory = [...currentHistory, data.san];
    const moveRec = {
      san: data.san,
      uci: data.uci,
      cost: data.cost || 0,
      latency: data.latency || 0,
      tin: data.tin || 0,
      tout: data.tout || 0,
      fallback: data.fallback || false,
      turn: currentTurn,
      player: activePlayerId,
      playerLabel,
    };
    const updatedRecords = [...currentRecords, moveRec];
    const updatedStats = currentStats.map((st, i) =>
      i !== currentTurn
        ? st
        : {
            cost: st.cost + (data.cost || 0),
            lat: st.lat + (data.latency || 0),
            n: st.n + 1,
            tok: st.tok + (data.tin || 0) + (data.tout || 0),
            fb: st.fb + (data.fallback ? 1 : 0),
          }
    );

    setFen(updatedFen);
    setMoves(updatedHistory);
    setMoveRecords(updatedRecords);
    setLastMoveMeta(moveRec);
    setStats(updatedStats);
    setLastCall(data);
    setIsCheck(data.check);

    if (data.uci && data.uci.length >= 4) {
      setHighlights([data.uci.slice(0, 2), data.uci.slice(2, 4)]);
    }

    // Play synthesized sound
    if (data.mate || data.check) {
      playSound("check", muted);
    } else if (data.san.includes("x")) {
      playSound("capture", muted);
    } else {
      playSound("move", muted);
    }

    return { data, updatedFen, updatedHistory, updatedRecords, updatedStats };
  }

  // Play continuous match loop
  async function startPlaying() {
    const thisRun = ++runId.current;
    setIsPlaying(true);

    let curFen = fen;
    let curHistory = moves;
    let curRecords = moveRecords;
    let curStats = stats;
    let curTurn = turn;

    // If starting fresh game
    if (curFen === START && curHistory.length === 0) {
      setStats([freshStats(), freshStats()]);
      setMoveRecords([]);
      setLastMoveMeta(null);
      curStats = [freshStats(), freshStats()];
      curRecords = [];
    }

    while (runId.current === thisRun) {
      setTurn(curTurn);
      const result = await makeSingleMove(curFen, curHistory, curRecords, curTurn, curStats);
      if (!result || runId.current !== thisRun) {
        setIsPlaying(false);
        return;
      }

      const { data, updatedFen, updatedHistory, updatedRecords, updatedStats } = result;
      curFen = updatedFen;
      curHistory = updatedHistory;
      curRecords = updatedRecords;
      curStats = updatedStats;

      if (data.over) {
        setIsPlaying(false);
        if (data.mate) {
          setStatus(`CHECKMATE — ${curTurn === 0 ? "White" : "Black"} wins!`);
        } else {
          setStatus(`Game drawn: ${data.result || "Stalemate / Repetition"}`);
        }
        return;
      }

      if (data.check) {
        setStatus(`CHECK — ${curTurn === 0 ? "White" : "Black"} plays ${data.san}`);
      } else {
        setStatus(`${curTurn === 0 ? "White" : "Black"} played ${data.san}`);
      }

      curTurn = 1 - curTurn;
      setTurn(curTurn);

      // Delay between moves
      await new Promise((r) => setTimeout(r, speed));
    }

    setIsPlaying(false);
  }

  function pauseGame() {
    runId.current++;
    setIsPlaying(false);
    setStatus("Match paused");
  }

  function resetGame() {
    runId.current++;
    setIsPlaying(false);
    setFen(START);
    setMoves([]);
    setMoveRecords([]);
    setLastMoveMeta(null);
    setStats([freshStats(), freshStats()]);
    setLastCall(null);
    setHighlights([]);
    setIsCheck(false);
    setTurn(0);
    setStatus("Position reset. Select models and press Play Match.");
  }

  async function stepOneMove() {
    if (isPlaying) pauseGame();
    const result = await makeSingleMove(fen, moves, moveRecords, turn, stats);
    if (!result) return;
    const { data } = result;
    if (data.over) {
      if (data.mate) {
        setStatus(`CHECKMATE — ${turn === 0 ? "White" : "Black"} wins!`);
      } else {
        setStatus(`Game drawn: ${data.result}`);
      }
    } else {
      setTurn(1 - turn);
    }
  }

  // Board grid cells (64 squares)
  const cells = fen
    .split(" ")[0]
    .split("/")
    .flatMap((r) => [...r].flatMap((c) => (/\d/.test(c) ? Array(+c).fill("") : [c])));

  const { lostWhite, lostBlack } = getCapturedPieces(fen);

  // Group moves into pairs for table display with latency & cost
  const movePairs = [];
  for (let i = 0; i < moveRecords.length; i += 2) {
    movePairs.push({
      num: Math.floor(i / 2) + 1,
      white: moveRecords[i],
      black: moveRecords[i + 1] || null,
    });
  }

  // Render a player card above or below the board
  const renderPlayerBar = (sideIndex) => {
    const isWhite = sideIndex === 0;
    const st = stats[sideIndex];
    const isCurrentTurn = turn === sideIndex;
    const capturedPiecesList = isWhite ? lostBlack : lostWhite;

    return (
      <div className={`player-bar ${isCurrentTurn && isPlaying ? "active-turn" : ""}`}>
        <div className="player-meta">
          <div className={`player-avatar ${isWhite ? "white-side" : "black-side"}`}>
            {isWhite ? "♔" : "♚"}
          </div>
          <div className="player-info">
            <div className="player-title-row">
              <span className="player-side-name">{isWhite ? "White" : "Black"}</span>
              {isCurrentTurn && <span className="turn-pill">To Move</span>}
            </div>
            <select
              className="player-select"
              value={players[sideIndex]}
              disabled={isPlaying}
              onChange={(e) =>
                setPlayers(players.map((p, idx) => (idx === sideIndex ? e.target.value : p)))
              }
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="player-stats-right">
          <div className="player-captures">
            {capturedPiecesList.map((p, idx) => (
              <img
                key={idx}
                src={PIECES[p]}
                alt={p}
                className="mini-capture"
                draggable={false}
              />
            ))}
          </div>
          <div className="player-telemetry-chips">
            <span className="telemetry-chip chip-cost" title="Total cost for this side">
              ${st.cost.toFixed(5)}
            </span>
            <span className="telemetry-chip chip-lat" title="Average latency per move">
              {st.n ? Math.round(st.lat / st.n) : 0}ms avg
            </span>
            <span className="telemetry-chip chip-tok" title="Total tokens used">
              {st.tok}tok
            </span>
            {st.fb > 0 && (
              <span className="telemetry-chip chip-fb" title="Fallback moves triggered">
                {st.fb}fb
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Top Header */}
      <header className="top-header">
        <div className="logo-area">
          <div className="logo-icon">♟</div>
          <div className="logo-text-group">
            <h1 className="logo-title">CogniChess Arena</h1>
            <span className="logo-badge">LLMs vs System-1</span>
          </div>
        </div>
        <div className="header-status-pill">
          <div className={`status-dot ${isPlaying ? "active" : ""}`} />
          <span>{isPlaying ? "Live Battle in Progress" : "Arena Ready"}</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="app-container">
        {/* Left Column: Board and Player Cards */}
        <div className="board-column">
          {/* Top Player (Black) */}
          {renderPlayerBar(1)}

          {/* Authentic Chess.com Board */}
          <div className="chess-board-wrapper">
            <div className="chess-board">
              {cells.map((pieceChar, i) => {
                const row = Math.floor(i / 8); // 0 to 7
                const col = i % 8;             // 0 to 7
                const file = "abcdefgh"[col];
                const rank = 8 - row;
                const sqName = `${file}${rank}`;
                const isDark = (row + col) % 2 === 1;
                const isHighlighted = highlights.includes(sqName);

                // Highlight king if in check
                const activeSide = fen.split(" ")[1] || (turn === 0 ? "w" : "b");
                const isCheckedKing =
                  isCheck &&
                  ((activeSide === "w" && pieceChar === "K") ||
                    (activeSide === "b" && pieceChar === "k"));

                return (
                  <div
                    key={i}
                    className={`square ${isDark ? "dark-sq" : "light-sq"} ${
                      isHighlighted ? "highlight" : ""
                    } ${isCheckedKing ? "in-check" : ""}`}
                  >
                    {/* Rank coordinate in top-right (on file 'h', col === 7) */}
                    {col === 7 && (
                      <span
                        className={`coord-rank ${
                          isDark ? "coord-light-text" : "coord-dark-text"
                        }`}
                      >
                        {rank}
                      </span>
                    )}

                    {/* File coordinate in bottom-left (on rank 1, row === 7) */}
                    {row === 7 && (
                      <span
                        className={`coord-file ${
                          isDark ? "coord-light-text" : "coord-dark-text"
                        }`}
                      >
                        {file}
                      </span>
                    )}

                    {/* Resize grip in bottom-right corner of h1 */}
                    {row === 7 && col === 7 && (
                      <span className="coord-resize-grip" title="Resize">
                        <svg width="10" height="10" viewBox="0 0 10 10">
                          <line x1="9" y1="2" x2="2" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                          <line x1="9" y1="5" x2="5" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                          <line x1="9" y1="8" x2="8" y2="9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                        </svg>
                      </span>
                    )}

                    {/* Neo piece image */}
                    {pieceChar && PIECES[pieceChar] && (
                      <img
                        src={PIECES[pieceChar]}
                        alt={pieceChar}
                        className="piece-img"
                        draggable={false}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Player (White) */}
          {renderPlayerBar(0)}
        </div>

        {/* Right Column: Controls, Moves, Telemetry */}
        <div className="panel-column">
          {/* Status Banner */}
          <div className="banner-card">
            <div
              className={`banner-status-text ${
                status.startsWith("CHECKMATE")
                  ? "mate-alert"
                  : status.startsWith("CHECK")
                  ? "check-alert"
                  : ""
              }`}
            >
              <span className="banner-msg">{status}</span>
              {lastMoveMeta && (
                <div className="banner-badges">
                  <span className="banner-badge badge-lat" title="Last move latency">
                    ⏱ {lastMoveMeta.latency}ms
                  </span>
                  <span className="banner-badge badge-cost" title="Last move cost">
                    💰 ${(lastMoveMeta.cost || 0).toFixed(5)}
                  </span>
                  {lastMoveMeta.fallback && (
                    <span className="banner-badge badge-fb" title="Fallback triggered">
                      ⚠️ FB
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Controls Toolbar */}
          <div className="control-toolbar">
            <div className="button-row">
              {!isPlaying ? (
                <button
                  className="btn-primary"
                  onClick={startPlaying}
                  disabled={!models.length}
                >
                  ▶ Play Match
                </button>
              ) : (
                <button className="btn-primary" onClick={pauseGame}>
                  ⏸ Pause
                </button>
              )}
              <button
                className="btn-secondary"
                onClick={stepOneMove}
                disabled={isPlaying || !models.length}
              >
                ⏭ Step
              </button>
              <button
                className="btn-secondary"
                onClick={resetGame}
                disabled={isPlaying}
              >
                ⟲ Reset
              </button>
              <button
                className="btn-icon"
                title={muted ? "Unmute sounds" : "Mute sounds"}
                onClick={() => setMuted(!muted)}
              >
                {muted ? "🔇" : "🔊"}
              </button>
            </div>

            <div className="settings-row">
              <span className="settings-label">Move Delay / Speed:</span>
              <select
                className="speed-select"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                <option value={0}>⚡ Instant (0ms)</option>
                <option value={150}>Fast (150ms)</option>
                <option value={450}>Normal (450ms)</option>
                <option value={1000}>Deliberate (1s)</option>
              </select>
            </div>
          </div>

          {/* Move History Table */}
          <div className="moves-card">
            <div className="card-header">
              <span>Move History</span>
              <span>{moveRecords.length} moves</span>
            </div>
            <div className="moves-table-container">
              <table className="moves-table">
                <thead>
                  <tr>
                    <th style={{ width: "34px" }}>#</th>
                    <th>White Move (⏱ · 💰)</th>
                    <th>Black Move (⏱ · 💰)</th>
                  </tr>
                </thead>
                <tbody>
                  {movePairs.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ color: "#777", textAlign: "center", padding: "16px" }}>
                        Game not started
                      </td>
                    </tr>
                  ) : (
                    movePairs.map((pair, idx) => (
                      <tr
                        key={idx}
                        className={idx === movePairs.length - 1 ? "active-row" : ""}
                      >
                        <td className="move-num">{pair.num}.</td>
                        <td className="move-white">
                          {pair.white ? (
                            <div className="move-cell-content">
                              <span className="move-san">{pair.white.san}</span>
                              <div className="move-metrics">
                                <span className="move-metric-lat">{pair.white.latency}ms</span>
                                <span className="move-metric-cost">${pair.white.cost.toFixed(5)}</span>
                                {pair.white.fallback && (
                                  <span className="move-metric-fb" title="Fallback move">⚠️ fb</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="move-black">
                          {pair.black ? (
                            <div className="move-cell-content">
                              <span className="move-san">{pair.black.san}</span>
                              <div className="move-metrics">
                                <span className="move-metric-lat">{pair.black.latency}ms</span>
                                <span className="move-metric-cost">${pair.black.cost.toFixed(5)}</span>
                                {pair.black.fallback && (
                                  <span className="move-metric-fb" title="Fallback move">⚠️ fb</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            ""
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                  <tr ref={movesEndRef} />
                </tbody>
              </table>
            </div>
          </div>

          {/* LLM Inspector & Telemetry */}
          <div className="inspector-card">
            <div className="card-header">
              <span>Telemetry & LLM Inspector</span>
              {lastCall && (
                <span className="meta-badge">
                  {lastCall.latency}ms · ${(lastCall.cost || 0).toFixed(5)}
                </span>
              )}
            </div>

            <div className="tab-buttons">
              <button
                className={`tab-btn ${activeTab === "prompt" ? "active" : ""}`}
                onClick={() => setActiveTab("prompt")}
              >
                Prompt Sent
              </button>
              <button
                className={`tab-btn ${activeTab === "reply" ? "active" : ""}`}
                onClick={() => setActiveTab("reply")}
              >
                Raw Reply
              </button>
              <button
                className={`tab-btn ${activeTab === "info" ? "active" : ""}`}
                onClick={() => setActiveTab("info")}
              >
                Tokens & Fallback
              </button>
            </div>

            <div className="tab-content">
              {lastCall ? (
                <>
                  {activeTab === "prompt" && (
                    <div className="code-box">
                      {lastCall.sent?.system}
                      {"\n\n---\n"}
                      {lastCall.sent?.user}
                    </div>
                  )}

                  {activeTab === "reply" && (
                    <div className="code-box">
                      {lastCall.raw || "(Empty response or Simulated System-1)"}
                    </div>
                  )}

                  {activeTab === "info" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div className="meta-stats-row">
                        <span>Input tokens: {lastCall.tin}</span>
                        <span>Output tokens: {lastCall.tout}</span>
                      </div>
                      <div className="meta-stats-row">
                        <span>Decoded UCI: {lastCall.uci}</span>
                        <span>SAN: {lastCall.san}</span>
                      </div>
                      {lastCall.fallback && (
                        <div className="fallback-warning">
                          ⚠️ Fallback Triggered: {lastCall.note || "Random legal fallback"}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: "#777", fontSize: "12px", padding: "12px 0" }}>
                  Awaiting first move...
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
