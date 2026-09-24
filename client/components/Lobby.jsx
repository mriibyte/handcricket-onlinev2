import React, { useState } from "react";
import { IconBack, IconCopy, IconCheck } from "./icons.jsx";
import { Logo } from "./Logo.jsx";

export default function Lobby({ code, onLeave }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="lobby">
      <header className="top">
        <button className="icon-btn ghosty" onClick={onLeave}>
          <IconBack />
        </button>
        <Logo />
        <span className="chip gold-chip">LOBBY</span>
      </header>

      <div className="lobby-body">
        <div className="lobby-kicker">SHARE THIS CODE</div>
        <div className="code-card">
          <div className="code-digits">{code || "·····"}</div>
        </div>
        <button className="btn btn-ghost" onClick={copy}>
          {copied ? (<><IconCheck /> Copied!</>) : (<><IconCopy /> Copy code</>)}
        </button>

        <div className="waiting">
          <span className="pulse-dot" />
          <span className="pulse-dot" style={{ animationDelay: "0.2s" }} />
          <span className="pulse-dot" style={{ animationDelay: "0.4s" }} />
          <span className="waiting-text">Waiting for your friend to join…</span>
        </div>

        <p className="lobby-hint">They open the same site, pick “Join a room”, and type the code. No link needed.</p>
      </div>
    </div>
  );
}
