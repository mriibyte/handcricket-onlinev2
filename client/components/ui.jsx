import React, { useEffect, useMemo, useRef, useState } from "react";

export function Modal({ open, icon, title, body, onClose, cta = "Continue" }) {
  if (!open) return null;
  return (
    <div className="modal-veil" onClick={onClose}>
      <div className="modal-card pop" onClick={(e) => e.stopPropagation()}>
        {icon && <div className="modal-icon">{icon}</div>}
        <h3 className="modal-title">{title}</h3>
        {body && <div className="modal-body">{body}</div>}
        <button className="btn btn-primary modal-btn" onClick={onClose}>
          {cta}
        </button>
      </div>
    </div>
  );
}

export function Confetti({ fire }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.9,
        dur: 1.9 + Math.random() * 1.6,
        size: 5 + Math.random() * 6,
        color: ["#ffd166", "#06d6a0", "#ef476f", "#ffffff", "#7c5cff", "#4cc9f0"][i % 6],
        rot: Math.random() * 360,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fire]
  );
  if (!fire) return null;
  return (
    <div className="confetti-layer" aria-hidden>
      {pieces.map((p, i) => (
        <i
          key={i}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.6,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}

export function Stepper({ label, value, onChange, min = 1, max = 20 }) {
  const clamp = (v) => Math.max(min, Math.min(max, v));
  return (
    <div className="field">
      {label && <div className="field-label">{label}</div>}
      <div className="stepper">
        <button type="button" className="step-btn" onClick={() => onChange(clamp(value - 1))} disabled={value <= min}>
          −
        </button>
        <span className="step-val">{value}</span>
        <button type="button" className="step-btn" onClick={() => onChange(clamp(value + 1))} disabled={value >= max}>
          +
        </button>
      </div>
    </div>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`seg-opt ${value === o.value ? "is-on" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.hint && <small>{o.hint}</small>}
        </button>
      ))}
    </div>
  );
}

export function Spinner({ size = 22 }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-label="loading" />;
}

/** Once-mounted "seen" helper — useful for one-shot animations keyed by seq. */
export function usePrevious(value) {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}
