import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { IconBack, IconBot, IconUsers } from "./icons.jsx";

const fmtDate = (iso) => {
  const d = new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z"));
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  return isToday
    ? `Today · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : d.toLocaleDateString([], { day: "numeric", month: "short" }) +
        ` · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

const OutcomeBadge = ({ outcome }) => (
  <span className={`mh-outcome ${outcome}`}>{outcome === "win" ? "W" : outcome === "loss" ? "L" : "T"}</span>
);

/** "won by 3 wickets" / "lost by 12 runs" — falls back to a bare score on ties and old rows */
const fmtMargin = (m) => {
  if (!m || !m.margin || !m.marginType) return null;
  const word = m.margin === 1 ? m.marginType.slice(0, -1) : m.marginType; // 1 run / 3 runs, 1 wicket / 2 wickets
  return `${m.margin} ${word}`;
};

export default function HistoryPage({ onBack, signedIn, onSignIn }) {
  const [matches, setMatches] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!signedIn) return;
    api("/matches?limit=50")
      .then((d) => setMatches(d.matches))
      .catch((e) => setError(e.message));
  }, [signedIn]);

  return (
    <div className="history">
      <header className="top">
        <button className="icon-btn ghosty" onClick={onBack}>
          <IconBack />
        </button>
        <div className="page-title">Match history</div>
        <span className="chip gold-chip">{matches ? matches.length : "…"}</span>
      </header>

      {!signedIn ? (
        <div className="card history-empty">
          <h3>Track every match</h3>
          <p>Sign in and your games — vs bot or vs friends — are recorded here with scores and results.</p>
          <button className="btn btn-primary" onClick={onSignIn}>
            Sign in to start tracking
          </button>
        </div>
      ) : error ? (
        <div className="card history-empty">
          <p>{error}</p>
        </div>
      ) : !matches ? (
        <div className="history-loading">Loading…</div>
      ) : matches.length === 0 ? (
        <div className="card history-empty">
          <h3>No matches yet</h3>
          <p>Play a game and it'll show up here — opponent, score, and result.</p>
        </div>
      ) : (
        <div className="mh-list">
          {matches.map((m) => (
            <div key={m.id} className={`mh-row ${m.outcome}`}>
              <OutcomeBadge outcome={m.outcome} />
              <div className="mh-main">
                <div className="mh-opp">
                  {m.opponent}
                  {m.vsBot && (
                    <span className="mh-tag">
                      <IconBot size={12} /> BOT{m.difficulty ? ` · ${m.difficulty.toUpperCase()}` : ""}
                    </span>
                  )}
                  {!m.vsBot && (
                    <span className="mh-tag live-tag">
                      <IconUsers size={12} /> PVP
                    </span>
                  )}
                </div>
                <div className="mh-date">{fmtDate(m.playedAt)}</div>
              </div>
              <div className="mh-right">
                <div className="mh-score mono">
                  <b className={m.outcome === "win" ? "win-text" : m.outcome === "loss" ? "lose-text" : ""}>
                    {m.youRuns}
                  </b>
                  <span>–</span>
                  <b>{m.oppRuns}</b>
                </div>
                {fmtMargin(m) && <div className={`mh-margin ${m.outcome === "win" ? "win-text" : m.outcome === "loss" ? "lose-text" : ""}`}>{fmtMargin(m)}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
