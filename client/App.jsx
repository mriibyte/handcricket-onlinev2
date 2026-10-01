import React, { useCallback, useEffect, useRef, useState } from "react";
import { socket } from "./socket.js";
import { api, getToken, setToken } from "./api.js";
import AuthPage from "./components/AuthPage.jsx";
import HomePage from "./components/HomePage.jsx";
import MenuPage from "./components/MenuPage.jsx";
import Lobby from "./components/Lobby.jsx";
import Match from "./components/Match.jsx";
import HistoryPage from "./components/HistoryPage.jsx";
import FriendsPage from "./components/FriendsPage.jsx";
import TeamLobby from "./components/TeamLobby.jsx";
import TeamMatch from "./components/TeamMatch.jsx";
import { Logo } from "./components/Logo.jsx";
import { playUiSound } from "./sound.js";
import { useSettings } from "./settings.js";

export default function App() {
  const [user, setUser] = useState(null); // { id, username, name } | { name: 'Guest' }
  const [stats, setStats] = useState(null);
  const [view, setView] = useState("auth"); // auth | home | menu | lobby | match | history | friends | teamLobby | teamMatch
  const [roomCode, setRoomCode] = useState(null);
  const [matchState, setMatchState] = useState(null);
  const [booted, setBooted] = useState(false);
  const [settings] = useSettings();

  const statsRef = useRef(stats);
  statsRef.current = stats;

  useEffect(() => {
    document.documentElement.classList.toggle("reduced-motion", settings.reducedMotion);
  }, [settings.reducedMotion]);

  // One quiet interaction tone for navigation and controls. The setting is
  // read at event time, so toggling sounds takes effect immediately.
  useEffect(() => {
    const onClick = (event) => {
      const control = event.target.closest?.("button, a");
      if (control && !control.disabled) playUiSound(control.dataset.sound || "tap");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  const refreshStats = useCallback(async () => {
    if (!getToken()) return;
    try {
      const d = await api("/me");
      setUser(d.user);
      setStats(d.stats);
    } catch {
      /* session may have expired — ignore */
    }
  }, []);

  // restore session on boot
  useEffect(() => {
    const token = getToken();
    if (!token) return setBooted(true);
    api("/me")
      .then((d) => {
        setUser(d.user);
        setStats(d.stats);
        setView("home");
      })
      .catch(() => setToken(null))
      .finally(() => setBooted(true));
  }, []);

  // socket: server pushes full room state
  useEffect(() => {
    const onState = (s) => {
      setMatchState(s);
      if (s.mode === "team") {
        setRoomCode(s.code);
        setView(s.phase === "lobby" ? "teamLobby" : "teamMatch");
      } else if (!s.opponent) {
        setRoomCode(s.code);
        setView("lobby");
      } else {
        setView("match");
      }
    };
    socket.on("state", onState);
    return () => socket.off("state", onState);
  }, []);

  // identify this socket to the server whenever the signed-in user changes
  useEffect(() => {
    socket.emit("hello", { token: getToken() });
  }, [user?.id]);

  const leave = useCallback(() => {
    socket.emit("leave_room");
    setMatchState(null);
    setRoomCode(null);
    setView("menu");
    refreshStats();
  }, [refreshStats]);

  const signOut = useCallback(async () => {
    try {
      await api("/logout", { method: "POST", body: { token: getToken() } });
    } catch {
      /* ignore */
    }
    setToken(null);
    setUser(null);
    setStats(null);
    setView("auth");
  }, []);

  const createTeamRoom = useCallback((friend) => {
    socket.emit("create_room", {
      mode: "team", name: user?.name, overs: 2, wickets: 5, maxTeamSize: 5,
      invitedUserIds: friend ? [friend.id] : [], token: getToken(),
    }, (result) => { if (!result?.ok) window.alert(result?.error || "Could not create team room."); });
  }, [user?.name]);

  if (!booted) {
    return (
      <div className="boot">
        <Logo big />
      </div>
    );
  }

  if (view === "auth") {
    return (
      <AuthPage
        onAuthed={(d) => {
          setToken(d.token);
          setUser(d.user);
          setStats(null);
          refreshStats();
          setView("home");
        }}
        onGuest={() => {
          setUser({ name: "Guest" });
          setView("home");
        }}
      />
    );
  }

  if (view === "home") {
    return (
      <HomePage
        user={user}
        stats={user?.id ? stats : null}
        onEnter={() => setView("menu")}
        onSignOut={signOut}
        onSignIn={() => setView("auth")}
        onHistory={() => setView("history")}
        onFriends={() => setView("friends")}
      />
    );
  }

  if (view === "menu") {
    return <MenuPage user={user} onBack={() => setView("home")} onSignOut={signOut} stats={user?.id ? stats : null} />;
  }

  if (view === "lobby") {
    return <Lobby code={roomCode || matchState?.code} onLeave={leave} />;
  }

  if (view === "history") {
    return <HistoryPage onBack={() => setView("home")} signedIn={!!user?.id} onSignIn={() => setView("auth")} />;
  }

  if (view === "friends") {
    return <FriendsPage userId={user?.id} socket={socket} onBack={() => setView("home")} onChallenge={createTeamRoom} onJoinChallenge={(data, challenge) => socket.emit("join_room", { code: data.roomCode, teamId: data.teamId, token: getToken() })} />;
  }

  if (view === "match") {
    return <Match state={matchState} onLeave={leave} onStatsRefresh={refreshStats} socket={socket} user={user} />;
  }

  if (view === "teamLobby") {
    return <TeamLobby state={matchState} socket={socket} onLeave={leave} />;
  }

  if (view === "teamMatch") {
    return <TeamMatch state={matchState} socket={socket} onLeave={leave} onStatsRefresh={refreshStats} />;
  }

  return null;
}
