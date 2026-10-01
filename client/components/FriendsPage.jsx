import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { IconBack, IconUsers } from "./icons.jsx";

export default function FriendsPage({ onBack, onChallenge, onJoinChallenge, userId, socket }) {
  const [friends, setFriends] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [requests, setRequests] = useState([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");

  const refresh = async () => {
    try {
      const [friendData, challengeData] = await Promise.all([api("/friends"), api("/challenges")]);
      const rows = friendData.friends || [];
      setFriends(rows.filter((row) => row.status === "accepted"));
      setRequests(rows.filter((row) => row.status === "pending" && Number(row.requestedBy) !== Number(userId)));
      setChallenges(challengeData.challenges || []);
    } catch (err) { setError(err.message); }
  };

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!socket) return undefined;
    const onChallengeReceived = () => refresh();
    const onFriendRequestReceived = () => refresh();
    socket.on("challenge_received", onChallengeReceived);
    socket.on("friend_request_received", onFriendRequestReceived);
    return () => { socket.off("challenge_received", onChallengeReceived); socket.off("friend_request_received", onFriendRequestReceived); };
  }, [socket]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length < 2) return setResults([]);
      api(`/users/search?q=${encodeURIComponent(query)}`).then((data) => setResults(data.users || [])).catch(() => setResults([]));
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  const sendRequest = async (userId) => {
    try { await api("/friends/requests", { method: "POST", body: { userId } }); await refresh(); setQuery(""); setResults([]); }
    catch (err) { setError(err.message); }
  };
  const respond = async (id, accept) => {
    try { await api(`/friends/requests/${id}/${accept ? "accept" : "decline"}`, { method: "POST" }); await refresh(); }
    catch (err) { setError(err.message); }
  };
  const respondChallenge = async (challenge, accept) => {
    try {
      if (accept) {
        const data = await api(`/challenges/${challenge.id}/accept`, { method: "POST" });
        onJoinChallenge?.(data, challenge);
      } else await api(`/challenges/${challenge.id}/decline`, { method: "POST" });
      await refresh();
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="friends-page">
      <header className="top">
        <button className="icon-btn ghosty" onClick={onBack}><IconBack /></button>
        <div className="page-title">Friends & challenges</div>
        <span className="chip"><IconUsers size={13} /> {friends.length}</span>
      </header>
      <section className="friends-hero">
        <div className="hero-kicker">SOCIAL / ARENA</div>
        <h1 className="stage-title">Find your five.</h1>
        <p className="stage-sub">Search by username, build your roster, and challenge friends into a team room.</p>
      </section>

      <section className="card friends-search">
        <div className="settings-label">SEARCH PLAYERS</div>
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="username or display name" />
        {results.length > 0 && <div className="search-results">{results.map((result) => <div className="social-row" key={result.id}><div><b>{result.name}</b><span>@{result.username}</span></div><button className="btn btn-ghost btn-sm" onClick={() => sendRequest(result.id)}>Add</button></div>)}</div>}
      </section>

      {requests.length > 0 && <section className="social-section"><div className="settings-label">PENDING FRIEND REQUESTS</div>{requests.map((request) => <div className="card social-row" key={request.friendshipId}><div><b>Friend request</b><span>{request.name} · @{request.username}</span></div><div className="row"><button className="btn btn-primary btn-sm" onClick={() => respond(request.friendshipId, true)}>Accept</button><button className="btn btn-ghost btn-sm" onClick={() => respond(request.friendshipId, false)}>Decline</button></div></div>)}</section>}

      {challenges.filter((challenge) => challenge.incoming).length > 0 && <section className="social-section"><div className="settings-label">TEAM CHALLENGES</div>{challenges.filter((challenge) => challenge.incoming).map((challenge) => <div className="card social-row" key={challenge.id}><div><b>{challenge.challenger.name} challenged you</b><span>Room {challenge.roomCode} · Team {challenge.teamId}</span></div><div className="row"><button className="btn btn-primary btn-sm" onClick={() => respondChallenge(challenge, true)}>Join</button><button className="btn btn-ghost btn-sm" onClick={() => respondChallenge(challenge, false)}>Decline</button></div></div>)}</section>}

      <section className="social-section"><div className="settings-label">YOUR FRIENDS</div>{friends.length === 0 ? <div className="card friends-empty">No friends yet. Search for a username above.</div> : friends.map((friend) => <div className="card social-row" key={friend.id}><div><b>{friend.name}</b><span>@{friend.username}</span></div><button className="btn btn-primary btn-sm" onClick={() => onChallenge?.(friend)}>Challenge</button></div>)}</section>
      {error && <div className="error shake">{error}</div>}
    </div>
  );
}
