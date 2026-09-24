import React, { useEffect, useRef, useState } from "react";
import { Modal, Confetti, Spinner } from "./ui.jsx";
import { IconBack, IconBat, IconTrophy, IconMic, IconMicOff } from "./icons.jsx";
import useVoice from "../useVoice.js";

const range = (n) => Array.from({ length: n }, (_, i) => i + 1);

/* ---------------------------------------------------------------- pieces */

function ScoreBar({ state }) {
  const cur = state.current;
  const runs = cur ? cur.runs : 0;
  const out = state.wickets - (cur ? cur.wicketsLeft : state.wickets);
  const balls = cur ? cur.ballsPlayed : 0;
  const overs = `${Math.floor(balls / 6)}.${balls % 6}`;
  const chasing = state.target !== null && cur;
  const need = chasing ? Math.max(0, state.target + 1 - cur.runs) : 0;

  return (
    <div className="scorebar">
      <div className="score-main">
        <div className="score-runs">
          {runs}
          <span className="score-wkts">/{out}</span>
        </div>
        <div className="score-overs mono">{overs} · {state.overs} OV</div>
      </div>
      <div className="score-side">
        <div className={`role-tag ${cur && cur.battingSide === "you" ? "is-bat" : ""}`}>
          {cur ? (cur.battingSide === "you" ? "YOU · BATTING" : "YOU · BOWLING") : "TOSS TIME"}
        </div>
        {state.target !== null && (
          <div className="target-tag mono">
            {chasing ? `TARGET ${state.target + 1} · NEED ${need}` : `TARGET ${state.target + 1}`}
          </div>
        )}
      </div>
    </div>
  );
}

function Timeline({ balls }) {
  return (
    <div className="timeline-wrap">
      <div className="tl-label">THIS INNINGS</div>
      <div className="timeline">
        {balls.length === 0 ? (
          <span className="tl-empty">No balls yet — step up.</span>
        ) : (
          balls.map((b, i) => (
            <span key={i} className={`tl-chip ${b.type === "wicket" ? "tl-w" : b.runsAdded >= 4 ? "tl-hot" : ""}`}>
              {b.type === "wicket" ? "W" : b.runsAdded}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function Pad({ count, disabled, onPick, pickedNum }) {
  return (
    <div className={`pad pad-${count}`}>
      {range(count).map((n) => (
        <button
          key={n}
          className={`num ${pickedNum === n ? "is-picked" : ""}`}
          disabled={disabled}
          onClick={() => onPick(n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

const Wait = ({ text }) => (
  <div className="wait-badge">
    <Spinner />
    <span>{text}</span>
  </div>
);

const Kicker = ({ children }) => <div className="stage-kicker">{children}</div>;

/* ---------------------------------------------------------------- screen */

export default function Match({ state, onLeave, onStatsRefresh, socket, user }) {
  const [reveal, setReveal] = useState(null);
  const [modal, setModal] = useState(null);
  const [confetti, setConfetti] = useState(false);
  const [localPick, setLocalPick] = useState(null);
  const [, force] = useState(0);

  const processed = useRef(0);
  const feed = useRef({ innings: null, balls: [] });
  const oppName = state.opponent ? state.opponent.name : "Opponent";

  const emit = (event, data) => socket.emit(event, data);
  const voice = useVoice(socket, !state.vsBot); // push-to-talk, multiplayer only

  // one-shot event processing: reveal overlay + timeline feed + wicket modal
  useEffect(() => {
    const ev = state.lastEvent;
    if (!ev) return;
    const seq = state.lastEventSeq || 0;
    if (seq <= processed.current) return;
    processed.current = seq;

    if (feed.current.innings !== state.inningsNo) feed.current = { innings: state.inningsNo, balls: [] };
    feed.current.balls.push(ev);

    const youBatted = ev.isYou;
    setReveal({
      youNum: youBatted ? ev.batterNum : ev.bowlerNum,
      oppNum: youBatted ? ev.bowlerNum : ev.batterNum,
      verdict: ev.type === "wicket" ? "WICKET!" : ev.reachedTarget ? "TARGET DOWN" : `+${ev.runsAdded}`,
      tone: ev.type === "wicket" ? "bad" : ev.reachedTarget ? "gold" : "good",
    });

    const t1 = setTimeout(() => setReveal(null), 1400);
    let t2;
    if (ev.type === "wicket") {
      t2 = setTimeout(
        () =>
          setModal({
            icon: "🎯",
            title: ev.allOut ? "ALL OUT!" : "WICKET!",
            body: `${youBatted ? "You" : oppName} played ${ev.batterNum} into the bowler's ${ev.bowlerNum}.${
              ev.allOut ? " That's the last wicket." : ""
            }`,
          }),
        1550
      );
    } else if (ev.reachedTarget) {
      t2 = setTimeout(
        () =>
          setModal({
            icon: "🏁",
            title: "TARGET CHASED",
            body: `${youBatted ? "You" : oppName} raced past the target. Innings over.`,
          }),
        1550
      );
    }
    force((n) => n + 1);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [state.lastEventSeq]);

  // fresh match (rematch) → clear the feed and one-shot bookkeeping
  useEffect(() => {
    if (state.phase === "toss_call") {
      feed.current = { innings: null, balls: [] };
      processed.current = 0;
      setLocalPick(null);
      setConfetti(false);
      setModal(null);
      force((n) => n + 1);
    }
  }, [state.phase]);

  // win → confetti + stats refresh
  useEffect(() => {
    if (state.phase === "result" && state.result && state.result.winner === state.you.role) {
      setConfetti(true);
      onStatsRefresh && onStatsRefresh();
    }
    if (state.phase === "result") onStatsRefresh && onStatsRefresh();
  }, [state.phase]);

  // reset local pick when the ball resets
  const ballsPlayed = state.current ? state.current.ballsPlayed : -1;
  useEffect(() => setLocalPick(null), [ballsPlayed]);

  /* ---------------------------------------------------------- stage content */
  let stage = null;
  const cur = state.current;

  if (state.opponent && !state.opponent.connected && state.phase !== "result") {
    stage = (
      <>
        <Kicker>CONNECTION</Kicker>
        <h2 className="stage-title">{oppName} dropped off</h2>
        <Wait text="Waiting for them to reconnect…" />
      </>
    );
  } else if (state.phase === "toss_call") {
    stage = state.tossCallerIsYou ? (
      <>
        <Kicker>THE TOSS</Kicker>
        <h2 className="stage-title">Call it in the air</h2>
        <p className="stage-sub">Both of you will lock a secret number — the sum decides.</p>
        <div className="choice-row">
          <button className="choice-card" onClick={() => emit("toss_call", { call: "e" })}>
            <b>EVEN</b>
            <span className="mono">2 · 4 · 6 · 8 · 10</span>
          </button>
          <button className="choice-card" onClick={() => emit("toss_call", { call: "o" })}>
            <b>ODD</b>
            <span className="mono">1 · 3 · 5 · 7 · 9</span>
          </button>
        </div>
      </>
    ) : (
      <>
        <Kicker>THE TOSS</Kicker>
        <h2 className="stage-title">{oppName} is calling it…</h2>
        <Wait text="Hang tight" />
      </>
    );
  } else if (state.phase === "toss_number") {
    const callText = state.toss.call === "e" ? "EVEN" : "ODD";
    stage = (
      <>
        <Kicker>TOSS · {callText} WAS CALLED</Kicker>
        <h2 className="stage-title">Lock a secret number</h2>
        <p className="stage-sub">Pick 1–10. Added together, the sum's parity wins the toss.</p>
        <Pad
          count={10}
          disabled={state.toss.youSubmitted}
          pickedNum={localPick}
          onPick={(n) => {
            setLocalPick(n);
            emit("toss_number", { num: n });
          }}
        />
        {state.toss.youSubmitted ? (
          <Wait text={state.toss.youAutoPicked ? `Auto-picked — waiting for ${oppName}…` : `Locked — waiting for ${oppName}…`} />
        ) : state.toss.oppSubmitted ? (
          <Wait text={`${oppName} has locked in. Your move.`} />
        ) : null}
      </>
    );
  } else if (state.phase === "bat_bowl_choice") {
    stage = state.canChooseBatBowl ? (
      <>
        <Kicker>YOU WON THE TOSS</Kicker>
        <h2 className="stage-title">Bat or bowl first?</h2>
        <div className="choice-row">
          <button className="choice-card" onClick={() => emit("bat_bowl_choice", { choice: "bat" })}>
            <span className="cc-icon gold"><IconBat /></span>
            <b>BAT FIRST</b>
            <span>Set the target</span>
          </button>
          <button className="choice-card" onClick={() => emit("bat_bowl_choice", { choice: "bowl" })}>
            <span className="cc-icon teal">●</span>
            <b>BOWL FIRST</b>
            <span>Chase it down</span>
          </button>
        </div>
      </>
    ) : (
      <>
        <Kicker>TOSS DECIDED</Kicker>
        <h2 className="stage-title">{oppName} won the toss</h2>
        <Wait text="Choosing to bat or bowl…" />
      </>
    );
  } else if (state.phase === "innings") {
    const youBat = cur.battingSide === "you";
    stage = (
      <>
        <Kicker>INNINGS {state.inningsNo}</Kicker>
        <h2 className="stage-title">{youBat ? "Your bat in hand" : "You're bowling"}</h2>
        <p className="stage-sub">
          {youBat
            ? "Pick a shot — match the bowler's number and you're out."
            : "Pick a delivery — match the batter's number for a wicket."}
        </p>
        <Pad
          count={6}
          disabled={cur.youPicked}
          pickedNum={localPick}
          onPick={(n) => {
            setLocalPick(n);
            emit("ball_pick", { num: n });
          }}
        />
        {!cur.youPicked && !state.vsBot && (
          <div className="afk-hint">Too slow? A random number is auto-picked for you after ~6s.</div>
        )}
        {cur.youPicked ? (
          <Wait text={cur.youAutoPicked ? `Auto-picked — waiting for ${oppName}…` : `Locked — waiting for ${oppName}…`} />
        ) : cur.oppPicked ? (
          <Wait text={`${oppName} is ready. Your move.`} />
        ) : null}
      </>
    );
  } else if (state.phase === "innings_break") {
    const s = state.firstInningsSummary;
    const who = s.isYou ? "You" : oppName;
    stage = (
      <>
        <Kicker>INNINGS BREAK</Kicker>
        <h2 className="stage-title">{who === "You" ? "You set" : `${oppName} set`} the total</h2>
        <div className="break-nums">
          <div>
            <span>{who}</span>
            <b className="mono">{s.runs}</b>
          </div>
          <div className="break-arrow">→</div>
          <div>
            <span>Target</span>
            <b className="mono gold-text">{s.runs + 1}</b>
          </div>
        </div>
        <button className="btn btn-primary btn-block" onClick={() => emit("start_second_innings")}>
          Start innings 2
        </button>
      </>
    );
  } else if (state.phase === "result") {
    const r = state.result;
    const myRuns = state.you.role === "p1" ? r.p1Runs : r.p2Runs;
    const oppRuns = state.you.role === "p1" ? r.p2Runs : r.p1Runs;
    const won = r.winner === state.you.role;
    const tie = !r.winner;
    stage = (
      <>
        <div className={`result-badge ${won ? "win" : tie ? "tie" : "lose"}`}>
          {won ? "VICTORY" : tie ? "A TIE" : "DEFEAT"}
        </div>
        <div className="result-nums">
          <div>
            <span>You</span>
            <b className="mono">{myRuns}</b>
          </div>
          <div className="break-arrow">vs</div>
          <div>
            <span>{oppName}</span>
            <b className="mono">{oppRuns}</b>
          </div>
        </div>
        <p className="stage-sub">
          {tie
            ? "Dead even. Settle it with a rematch."
            : won
              ? state.firstInningsSummary?.isYou
                ? `${oppName} fell ${myRuns - oppRuns} short.`
                : `You won with ${state.current?.wicketsLeft ?? 0} wicket${state.current?.wicketsLeft === 1 ? "" : "s"} in hand.`
              : `You fell ${oppRuns - myRuns} short.`}
        </p>
        {state.rematch?.pending && !state.rematch.requestIsMine && !state.rematch.declinedByMe ? (
          // opponent asked for a rematch — get permission before it starts
          <>
            <Kicker>REMATCH?</Kicker>
            <div className="choice-row">
              <button className="choice-card" onClick={() => emit("rematch_response", { accept: true })}>
                <b>ACCEPT</b>
                <span className="mono">same room · same settings</span>
              </button>
              <button className="choice-card" onClick={() => emit("rematch_response", { accept: false })}>
                <b>DECLINE</b>
                <span className="mono">maybe later</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="row">
              <button className="btn btn-ghost" onClick={onLeave}>
                Menu
              </button>
              {state.rematch?.pending && state.rematch.requestIsMine ? (
                <span className="wait-badge">
                  <Spinner />
                  <span>Asked {oppName} — waiting…</span>
                </span>
              ) : (
                <button className="btn btn-primary" onClick={() => emit("rematch")}>
                  <IconTrophy /> Play again
                </button>
              )}
            </div>
            {state.rematch?.declinedByOpponent && <p className="rematch-note">{oppName} declined the last rematch.</p>}
          </>
        )}
      </>
    );
  }

  const balls = feed.current.innings === state.inningsNo ? feed.current.balls : [];

  return (
    <div className="match">
      <header className="match-top">
        <button className="icon-btn ghosty" onClick={onLeave} title="Leave match">
          <IconBack />
        </button>
        <div className="names">
          <span className={`n-you ${cur && cur.battingSide === "you" ? "is-live" : ""}`}>{state.you.name}</span>
          <em>vs</em>
          <span className={`n-opp ${cur && cur.battingSide === "opponent" ? "is-live" : ""}`}>{oppName}</span>
        </div>
        <div className="match-top-right">
          {!state.vsBot && (
            <>
              {(voice.talking || voice.peerTalking) && (
                <span className={`talk-pill ${voice.talking ? "mine" : ""}`}>
                  <span className="pulse-dot" />
                  {voice.talking ? "YOU" : oppName.toUpperCase()}
                </span>
              )}
              <button
                className={`icon-btn ptt ${voice.talking ? "is-live" : ""}`}
                title={voice.talking ? "Release to mute" : "Hold to talk"}
                onMouseDown={voice.requestTalk}
                onMouseUp={voice.releaseTalk}
                onMouseLeave={voice.talking ? voice.releaseTalk : undefined}
                onTouchStart={voice.requestTalk}
                onTouchEnd={voice.releaseTalk}
                onContextMenu={(e) => e.preventDefault()}
              >
                {voice.talking ? <IconMic /> : <IconMicOff />}
              </button>
            </>
          )}
          <span className="chip mono">{state.vsBot ? `SOLO` : state.code}</span>
        </div>
      </header>

      <ScoreBar state={state} />
      <Timeline balls={balls} />

      <div className="stage card">{stage}</div>

      {reveal && (
        <div className="reveal-veil">
          <div className="reveal-duel">
            <div className="reveal-card slide-left">
              <small>YOU</small>
              <b className="mono">{reveal.youNum}</b>
            </div>
            <div className="reveal-vs">VS</div>
            <div className="reveal-card slide-right">
              <small>{oppName.toUpperCase()}</small>
              <b className="mono">{reveal.oppNum}</b>
            </div>
          </div>
          <div className={`reveal-verdict ${reveal.tone}`}>{reveal.verdict}</div>
        </div>
      )}

      <Modal
        open={!!modal}
        icon={modal?.icon}
        title={modal?.title}
        body={modal?.body}
        onClose={() => setModal(null)}
      />
      <Confetti fire={confetti} />
    </div>
  );
}
