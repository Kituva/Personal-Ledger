import React from "react";

/* ============================================================
   Icons

   Drawn rather than typed. A text "<" sits on the font's math axis and
   "⋯" on the baseline, so neither lands in the optical centre of a round
   button no matter how it's centred — the browser centres the glyph's
   box, not the mark inside it.
   ============================================================ */
const svg = (props) => ({
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.1,
  strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, ...props,
});

export const Chevron = ({ dir, size = 17 }) => (
  <svg {...svg({ width: size, height: size })}>
    <polyline points={
      dir === "left" ? "15 5 9 12 15 19"
        : dir === "down" ? "5 9 12 15 19 9"
        : dir === "up" ? "5 15 12 9 19 15"
        : "9 5 15 12 9 19"} />
  </svg>
);

export const Arrow = ({ up }) => (
  <svg {...svg({ width: 13, height: 13, strokeWidth: 2.6 })}>
    {up ? <><line x1="12" y1="19.5" x2="12" y2="5" /><polyline points="7 10.5 12 5 17 10.5" /></>
      : <><line x1="12" y1="4.5" x2="12" y2="19" /><polyline points="7 13.5 12 19 17 13.5" /></>}
  </svg>
);

export const Plus = () => (
  <svg {...svg({ width: 24, height: 24, strokeWidth: 2.4 })}>
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const PieIcon = () => (
  <svg {...svg({ width: 19, height: 19 })}>
    <path d="M21 15.6A9 9 0 1 1 8.4 3v9h9a9 9 0 0 1 3.6 3.6z" /><path d="M21.5 10A9 9 0 0 0 14 2.5V10z" />
  </svg>
);

export const ListIcon = () => (
  <svg {...svg({ width: 19, height: 19 })}>
    <rect x="4" y="3" width="16" height="18" rx="2.5" />
    <line x1="8" y1="9" x2="16" y2="9" /><line x1="8" y1="14" x2="13" y2="14" />
  </svg>
);

export const GearIcon = () => (
  <svg {...svg({ width: 19, height: 19 })}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.9 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 3.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 21 9a2 2 0 1 1 0 4z" />
  </svg>
);

export const Backspace = () => (
  <svg {...svg({ width: 19, height: 19, strokeWidth: 1.9 })}>
    <path d="M21 5H8.5L2 12l6.5 7H21a1.6 1.6 0 0 0 1.6-1.6V6.6A1.6 1.6 0 0 0 21 5z" />
    <line x1="12" y1="9.5" x2="17" y2="14.5" /><line x1="17" y1="9.5" x2="12" y2="14.5" />
  </svg>
);

export const GridIcon = () => (
  <svg {...svg({ width: 19, height: 19, strokeWidth: 2.4 })}>
    <circle cx="8.5" cy="8.5" r="2" /><circle cx="15.5" cy="8.5" r="2" />
    <circle cx="8.5" cy="15.5" r="2" /><circle cx="15.5" cy="15.5" r="2" />
  </svg>
);

export const Reset = () => (
  <svg {...svg({ width: 18, height: 18 })}>
    <polyline points="20 6 20 11 15 11" />
    <path d="M19.4 15a8 8 0 1 1-1.6-8.4L20 9" />
  </svg>
);

export const Check = () => (
  <svg {...svg({ width: 20, height: 20, strokeWidth: 2.6 })}><polyline points="4 12.5 9.5 18 20 6.5" /></svg>
);

export const Trash = () => (
  <svg {...svg({ width: 18, height: 18 })}>
    <polyline points="4 6.5 20 6.5" /><path d="M9 6.5V4.5h6v2" />
    <path d="M6.5 6.5 7.4 20a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-13.5" />
    <line x1="10" y1="10.5" x2="10" y2="17.5" /><line x1="14" y1="10.5" x2="14" y2="17.5" />
  </svg>
);

export const Close = () => (
  <svg {...svg({ width: 18, height: 18, strokeWidth: 2.4 })}>
    <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);

export const More = () => (
  <svg {...svg({ width: 18, height: 18 })}>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);
