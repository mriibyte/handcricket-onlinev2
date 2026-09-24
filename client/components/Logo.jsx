import React from "react";

export function LogoMark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <circle cx="32" cy="32" r="30" fill="var(--accent)" />
      <path
        d="M20 6.5C31 15 31 49 20 57.5M44 6.5C33 15 33 49 44 57.5"
        stroke="#141204"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity=".8"
      />
      <circle cx="32" cy="32" r="7" fill="#141204" opacity=".18" />
    </svg>
  );
}

export function Logo({ big = false }) {
  if (big) {
    return (
      <div className="brand brand--big">
        <LogoMark size={86} />
        <div className="brand-word">
          HAND CRICKET <span>ARENA</span>
        </div>
      </div>
    );
  }
  return (
    <div className="brand">
      <LogoMark size={30} />
      <div className="brand-word">
        HAND CRICKET <span>ARENA</span>
      </div>
    </div>
  );
}
