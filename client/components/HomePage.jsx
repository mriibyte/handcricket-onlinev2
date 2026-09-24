import React from "react";
import { Logo, LogoMark } from "./Logo.jsx";
import { IconTrophy, IconLogout, IconLogin } from "./icons.jsx";

function Stat({ big, small }) {
  return (
    <div className="stat">
      <div className="stat-b">{big}</div>
      <div className="stat-s">{small}</div>
    </div>
  );
}

export default function HomePage({ user, stats, onEnter, onSignOut, onSignIn, onHistory }) {
  const signedIn = !!user?.id;
  return (
    <div className="home">
      <header className="top">
        <Logo />
        {signedIn ? (
          <button className="icon-btn ghosty" onClick={onSignOut} title="Sign out">
            <IconLogout />
          </button>
        ) : (
          <button className="btn btn-ghost btn-sm" onClick={onSignIn}>
            <IconLogin /> Sign in
          </button>
        )}
      </header>

      <section className="hero">
        <div className="hero-kicker">REAL-TIME · 2 PLAYERS · VS BOT</div>
        <h1 className="hero-title">
          SIX BALLS.
          <br />
          <span className="grad-text">PURE MIND GAMES.</span>
        </h1>
        <p className="hero-sub">
          The gully classic, rebuilt. Lock a secret number every ball — match your opponent and you're out, beat them and the
          batter's number scores. Track your record. Face the bot. Beat your friends.
        </p>
        <div className="hero-cta">
          <button className="btn btn-primary btn-lg" onClick={onEnter}>
            Enter the arena
          </button>
          {signedIn && (
            <button className="btn btn-ghost btn-lg" onClick={onHistory}>
              Match history
            </button>
          )}
        </div>

        {signedIn && stats && (
          <div className="card home-stats">
            <div className="home-stats-head">
              <span className="avatar">{(user.name || user.username || "?").slice(0, 1).toUpperCase()}</span>
              <div>
                <div className="hs-name">{user.name}</div>
                <div className="hs-sub">@{user.username}</div>
              </div>
            </div>
            <div className="stat-row">
              <Stat big={stats.played} small="played" />
              <Stat big={stats.wins} small="wins" />
              <Stat big={stats.losses} small="losses" />
              <Stat big={stats.ties} small="ties" />
              <Stat big={stats.best} small="best" />
            </div>
            <div className="winrate">
              <div className="winrate-bar">
                <i style={{ width: `${stats.winRate}%` }} />
              </div>
              <span>{stats.winRate}% win rate</span>
            </div>
          </div>
        )}
      </section>

      <section className="steps">
        <div className="step">
          <div className="step-num">01</div>
          <div>
            <b>Call the toss</b>
            <span>Even or odd — a secret number each decides it.</span>
          </div>
        </div>
        <div className="step">
          <div className="step-num">02</div>
          <div>
            <b>Same number = OUT</b>
            <span>Otherwise the batter's pick scores runs.</span>
          </div>
        </div>
        <div className="step">
          <div className="step-num">03</div>
          <div>
            <b>Chase or defend</b>
            <span>Highest total after two innings takes it.</span>
          </div>
        </div>
      </section>

      <footer className="home-foot">HAND CRICKET ARENA · <span>EST. 2026</span></footer>
    </div>
  );
}
