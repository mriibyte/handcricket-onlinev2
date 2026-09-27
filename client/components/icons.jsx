import React from "react";

const S = { display: "block", flexShrink: 0 };

export const IconBot = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={S} aria-hidden>
    <rect x="4" y="8" width="16" height="11" rx="3.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 8V4.5M12 4.5h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="12" cy="3.5" r="1.4" fill="currentColor" />
    <circle cx="9" cy="13" r="1.4" fill="currentColor" />
    <circle cx="15" cy="13" r="1.4" fill="currentColor" />
    <path d="M9.5 16.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const IconUsers = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={S} aria-hidden>
    <circle cx="9" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M3.5 19c.7-3 3-4.5 5.5-4.5S13.8 16 14.5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M15.5 5.4a3.2 3.2 0 1 1 .8 6.3M17 14.6c2 .4 3.3 1.8 3.9 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const IconLogin = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={S} aria-hidden>
    <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M15 8l4 4-4 4M19 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconTrophy = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={S} aria-hidden>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M7 6H4.5a3 3 0 0 0 3 4M17 6h2.5a3 3 0 0 1-3 4M12 14v3M8.5 20h7M10 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const IconBack = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={S} aria-hidden>
    <path d="M14.5 6 8.5 12l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconCopy = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={S} aria-hidden>
    <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const IconCheck = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={S} aria-hidden>
    <path d="m5 12.5 4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconBat = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={S} aria-hidden>
    <path
      d="M14.2 3.6c2.6-1.4 5.6-1 6.9.3 1.3 1.3 1.7 4.3.3 6.9-1.2 2.2-5.4 6.4-8.1 8.4l-3.9-3.9c2-2.7 6.6-10.2 4.8-11.7Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
    <path d="m8.4 16.2-4.6 4.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <circle cx="19" cy="19.5" r="2.4" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);

export const IconCoin = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={S} aria-hidden>
    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 7.5v9M9.3 9.6c.4-.9 1.5-1.4 2.7-1.4 1.5 0 2.7.8 2.7 2 0 2.5-5.4 1.5-5.4 4 0 1.2 1.2 2 2.7 2 1.2 0 2.3-.5 2.7-1.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const IconShield = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={S} aria-hidden>
    <path d="M12 3 5 5.8v5.4c0 4.4 3 8 7 9.8 4-1.8 7-5.4 7-9.8V5.8L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="m9 11.5 2.2 2.2L15.5 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconLogout = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={S} aria-hidden>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M9 8l-4 4 4 4M5 12h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconMic = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={S} aria-hidden>
    <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const IconMicOff = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={S} aria-hidden>
    <path d="M15 5v6.2a3 3 0 0 1-5.2 2M9 6.2V6a3 3 0 0 1 5.9-.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 10.3 5.3M18.5 11.5c0 .8-.1 1.5-.4 2.2M12 18v3M8.5 21h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="m4 4 16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const IconSettings = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={S} aria-hidden>
    <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" stroke="currentColor" strokeWidth="1.7" />
    <path d="m19 13.2 1.2 1-.1 1.8-1.6.8-.4 1.1.6 1.6-1.3 1.3-1.6-.6-1.1.4-.8 1.6-1.8.1-1-1.2-1.2-.3-1.5.7-1.4-1.2.5-1.7-.5-1.1-1.7-.6-.1-1.8 1.5-.9.3-1.2-.7-1.5 1.3-1.3 1.7.5 1.1-.5.6-1.6 1.8-.1.9 1.5 1.2.3 1.5-.7 1.3 1.3-.5 1.6.4 1.2 1.6.7.1 1.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

export const IconFlame = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={S} aria-hidden>
    <path
      d="M12 3s1 2.4-.8 4.6C9.5 9.6 7 10.6 7 14a5 5 0 0 0 10 0c0-1.8-.8-3-1.6-4-.3 1-.9 1.7-1.7 2 .5-2.8-.4-6.6-1.7-9Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  </svg>
);
