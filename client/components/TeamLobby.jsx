import React, { useEffect, useState } from "react";
import { getToken } from "../api.js";
import { api } from "../api.js";
import { IconBack, IconUsers } from "./icons.jsx";

export default function TeamLobby({ state, socket, onLeave }) {
  const [friends, setFriends] = useState([]);
  const [error, setError] = useState("");
  const me = state.you;
  const isHost = me?.playerId === state.hostPlayerId;
  const action = (event, data = {}) => socket.emit("team_action", { event, data }, (result) => result?.ok === false && setError(result.error));

  useEffect(() => {
    if (!getToken()) return;
    api("/friends").then((data) => setFriends((data.friends || []).filter((friend) => friend.status === "accepted"))).catch(() => {});
  }, []);

  const invite = (friend, teamId) => {
    socket.emit("team_invite", { userId: friend.id, teamId }, (result) => {
      if (!result?.ok) setError(result?.error || "Could not send invite.");
    });
  };

  return (
    <div className="team-lobby">
      <header className="top">
        <button className="icon-btn ghosty" onClick={onLeave} title="Leave room"><IconBack /></button>
        <div className="page-title">Team room · {state.code}</div>
        <span className="chip">{state.overs} OV</span>
      </header>

      <section className="team-lobby-hero">
        <div className="hero-kicker">UP TO {state.maxTeamSize} PER SIDE</div>
        <h1 className="stage-title">Pick your side.</h1>
        <p className="stage-sub">Choose a team, ready up, then let the captain start the toss.</p>
      </section>

      <div className="team-columns">
        {state.teams.map((team) => (
          <section className={`team-column ${me?.teamId === team.id ? "is-yours" : ""}`} key={team.id}>
            <div className="team-column-head">
              <div><span className="settings-label">TEAM {team.id}</span><h2>{team.name}</h2></div>
              <span className="chip">{team.players.length}/{state.maxTeamSize}</span>
            </div>
            <div className="team-player-list">
              {team.players.map((player) => (
                <div className="team-player" key={player.playerId}>
                  <span className={`presence-dot ${player.connected ? "is-online" : ""}`} />
                  <span className="team-player-name">{player.name}</span>
                  {player.isCaptain && <span className="mini-tag">CAPTAIN</span>}
                  {player.ready && <span className="mini-tag ready-tag">READY</span>}
                </div>
              ))}
              {!team.players.length && <div className="team-empty">Waiting for players…</div>}
            </div>
            {me && me.teamId !== team.id && team.players.length < state.maxTeamSize && (
              <button className="btn btn-ghost btn-sm btn-block" onClick={() => action("team_select", { teamId: team.id })}>Join Team {team.id}</button>
            )}
            {isHost && friends.length > 0 && team.players.length < state.maxTeamSize && (
              <select className="input team-invite-select" defaultValue="" onChange={(event) => { const friend = friends.find((item) => String(item.id) === event.target.value); if (friend) invite(friend, team.id); event.target.value = ""; }}>
                <option value="">Invite a friend…</option>
                {friends.map((friend) => <option key={friend.id} value={friend.id}>{friend.name} (@{friend.username})</option>)}
              </select>
            )}
          </section>
        ))}
      </div>

      <section className="card team-lobby-actions">
        <div className="waiting"><span className="pulse-dot" /><span className="waiting-text">Room code: {state.code}</span></div>
        <p className="lobby-hint"><IconUsers size={14} /> Share the code or invite friends. Wickets rotate the batter; every over rotates the bowler.</p>
        <div className="row">
          <button className="btn btn-ghost btn-block" onClick={() => action("lobby_ready", { ready: !me?.ready })}>{me?.ready ? "Unready" : "Ready up"}</button>
          {isHost && <button className="btn btn-primary btn-block" onClick={() => action("start_match")}>Start match</button>}
        </div>
        {error && <div className="error shake">{error}</div>}
      </section>
    </div>
  );
}
