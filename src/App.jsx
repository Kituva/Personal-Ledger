import React, { useState, useEffect, useMemo, useRef } from "react";
import * as db from "./db.js";

/* ============================================================
   Categories

   The ids and names are load-bearing: db.js stores `cat: <id>` on every
   transaction and the CSV importer matches on the name. Only the colour
   and the emoji are new.
   ============================================================ */
export const CATS = [
  { id: "dining", name: "Dining Out", e: "🍽️", c: "#22a7ff" },
  { id: "groceries", name: "Groceries", e: "🛒", c: "#f4555f" },
  { id: "transport", name: "Transportation", e: "🚗", c: "#7c5cff" },
  { id: "subs", name: "Subscriptions", e: "🔁", c: "#a855f7" },
  { id: "utilities", name: "Utilities", e: "💡", c: "#f7c948" },
  { id: "home", name: "Home", e: "🏠", c: "#ff5fa2" },
  { id: "ent", name: "Entertainment", e: "🎬", c: "#f08a4b" },
  { id: "health", name: "Health/medical", e: "💊", c: "#2ecc9b" },
  { id: "travel", name: "Travel", e: "✈️", c: "#38bdf8" },
  { id: "personal", name: "Personal", e: "🧴", c: "#c084fc" },
  { id: "gifts", name: "Gifts/Donations", e: "🎁", c: "#fb7185" },
  { id: "invest", name: "Investments", e: "📈", c: "#4ade80" },
  { id: "debt", name: "Debt", e: "💳", c: "#ef4444" },
  { id: "misc", name: "Miscellaneous", e: "📦", c: "#94a3b8" },
];
const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
const BY_NAME = Object.fromEntries(CATS.map((c) => [c.name.toLowerCase(), c.id]));

/** A category's colour at low alpha, for the tile behind its emoji. */
const tint = (hex, a = 0.16) => {
  const n = parseInt(String(hex).slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/* --neg and --pos again, in hex. The calendar shades its cells at a dozen
   alphas per screen, and `tint` needs a number to do that — a CSS variable
   can't be read from here. Keep these in step with styles.css. */
const NEG = "#ff5a5f";
const POS = "#2ecc71";

/* ============================================================
   Dates and formatting
   ============================================================ */
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MON = MONTHS.map((m) => m.slice(0, 3));
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const money = (n) => Math.round(Math.abs(n)).toLocaleString("en-IN");
const uid = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Axis labels, in the units people actually say here: k, L, Cr. */
function compact(n) {
  n = Math.round(Math.abs(n));
  if (n >= 1e7) return (n / 1e7).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, "") + "Cr";
  if (n >= 1e5) return (n / 1e5).toFixed(n >= 1e6 ? 0 : 1).replace(/\.0$/, "") + "L";
  if (n >= 1000) return Math.round(n / 1000) + "k";
  return String(n);
}

function relDay(dstr) {
  const t = iso(new Date());
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (dstr === t) return "Today";
  if (dstr === iso(y)) return "Yesterday";
  const d = parseISO(dstr);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${sameYear ? "" : ", " + d.getFullYear()}`;
}

/* ============================================================
   Periods

   One range function drives every screen. The filter pill picks the
   grain, the chevrons step through it, and both charts and totals read
   from the same window — so Summary and Entries can never disagree.
   ============================================================ */
const PERIODS = [["d","Daily"],["w","Weekly"],["m","Monthly"],["q","Quarterly"],["y","Yearly"]];

const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

function startOfWeek(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // weeks start Monday
  return x;
}

function periodRange(p, off) {
  const now = new Date();

  if (p === "d") {
    const s = new Date(now.getFullYear(), now.getMonth(), now.getDate() + off);
    const ps = new Date(s); ps.setDate(ps.getDate() - 1);
    const name = relDay(iso(s));
    return {
      start: s, end: endOfDay(s), prevStart: ps, prevEnd: endOfDay(ps),
      title: name,
      label: off === 0 || off === -1 ? name.toLowerCase() : `on ${name}`,
      from: "yesterday",
    };
  }

  if (p === "w") {
    const s = startOfWeek(now); s.setDate(s.getDate() + off * 7);
    const e = new Date(s); e.setDate(e.getDate() + 6);
    const ps = new Date(s); ps.setDate(ps.getDate() - 7);
    const pe = new Date(s); pe.setDate(pe.getDate() - 1);
    return {
      start: s, end: endOfDay(e), prevStart: ps, prevEnd: endOfDay(pe),
      title: off === 0 ? "This week" : `${s.getDate()} ${MON[s.getMonth()]} – ${e.getDate()} ${MON[e.getMonth()]}`,
      label: off === 0 ? "this week" : "that week",
      from: "last week",
    };
  }

  if (p === "m") {
    const s = new Date(now.getFullYear(), now.getMonth() + off, 1);
    const e = new Date(s.getFullYear(), s.getMonth() + 1, 0);
    const ps = new Date(s.getFullYear(), s.getMonth() - 1, 1);
    const pe = new Date(s.getFullYear(), s.getMonth(), 0);
    return {
      start: s, end: endOfDay(e), prevStart: ps, prevEnd: endOfDay(pe),
      title: `${MONTHS[s.getMonth()]} ${s.getFullYear()}`,
      label: off === 0 ? "this month" : `in ${MON[s.getMonth()]}`,
      from: MON[ps.getMonth()],
    };
  }

  if (p === "q") {
    const s = new Date(now.getFullYear(), (Math.floor(now.getMonth() / 3) + off) * 3, 1);
    const e = new Date(s.getFullYear(), s.getMonth() + 3, 0);
    const ps = new Date(s.getFullYear(), s.getMonth() - 3, 1);
    const pe = new Date(s.getFullYear(), s.getMonth(), 0);
    return {
      start: s, end: endOfDay(e), prevStart: ps, prevEnd: endOfDay(pe),
      title: `Q${Math.floor(s.getMonth() / 3) + 1} ${s.getFullYear()}`,
      label: off === 0 ? "this quarter" : `in Q${Math.floor(s.getMonth() / 3) + 1}`,
      from: `Q${Math.floor(ps.getMonth() / 3) + 1}`,
    };
  }

  const s = new Date(now.getFullYear() + off, 0, 1);
  return {
    start: s, end: endOfDay(new Date(s.getFullYear(), 11, 31)),
    prevStart: new Date(s.getFullYear() - 1, 0, 1),
    prevEnd: endOfDay(new Date(s.getFullYear() - 1, 11, 31)),
    title: String(s.getFullYear()),
    label: off === 0 ? "this year" : `in ${s.getFullYear()}`,
    from: String(s.getFullYear() - 1),
  };
}

/**
 * Buckets a period into chart columns, each carrying the ISO range it
 * covers so tapping a bar can filter the list underneath it.
 */
function bucketize(p, range, list) {
  const { start, end } = range;
  const out = [];

  // A day has no columns. Entries record a date and never a time, so there
  // is nothing to divide one into — the Daily screen draws no chart at all.
  if (p === "d") return out;

  if (p === "w" || p === "m") {
    const n = p === "w" ? 7 : end.getDate();
    for (let i = 0; i < n; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const k = iso(d);
      out.push({ v: 0, from: k, to: k,
        label: p === "w" ? DOW[d.getDay()][0]
          : [1, 7, 14, 21, 28, n].includes(i + 1) ? String(i + 1) : "" });
    }
    const first = iso(start);
    list.forEach((t) => {
      const i = Math.round((parseISO(t.date) - parseISO(first)) / 864e5);
      if (i >= 0 && i < n) out[i].v += t.amount;
    });
    return out;
  }

  if (p === "q") {
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
      const a = new Date(d);
      const b = new Date(d); b.setDate(b.getDate() + 6);
      out.push({ v: 0, from: iso(a), to: iso(b > end ? end : b),
        label: a.getDate() <= 7 ? MON[a.getMonth()] : "" });
    }
    list.forEach((t) => {
      const b = out.find((x) => t.date >= x.from && t.date <= x.to);
      if (b) b.v += t.amount;
    });
    return out;
  }

  for (let m = 0; m < 12; m++) {
    const a = new Date(start.getFullYear(), m, 1);
    const b = new Date(start.getFullYear(), m + 1, 0);
    out.push({ v: 0, from: iso(a), to: iso(b), label: m % 2 === 0 ? MON[m] : "" });
  }
  list.forEach((t) => { out[parseISO(t.date).getMonth()].v += t.amount; });
  return out;
}

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

const Chevron = ({ dir, size = 17 }) => (
  <svg {...svg({ width: size, height: size })}>
    <polyline points={
      dir === "left" ? "15 5 9 12 15 19"
        : dir === "down" ? "5 9 12 15 19 9"
        : dir === "up" ? "5 15 12 9 19 15"
        : "9 5 15 12 9 19"} />
  </svg>
);

const Arrow = ({ up }) => (
  <svg {...svg({ width: 13, height: 13, strokeWidth: 2.6 })}>
    {up ? <><line x1="12" y1="19.5" x2="12" y2="5" /><polyline points="7 10.5 12 5 17 10.5" /></>
      : <><line x1="12" y1="4.5" x2="12" y2="19" /><polyline points="7 13.5 12 19 17 13.5" /></>}
  </svg>
);

const Plus = () => (
  <svg {...svg({ width: 24, height: 24, strokeWidth: 2.4 })}>
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const PieIcon = () => (
  <svg {...svg({ width: 19, height: 19 })}>
    <path d="M21 15.6A9 9 0 1 1 8.4 3v9h9a9 9 0 0 1 3.6 3.6z" /><path d="M21.5 10A9 9 0 0 0 14 2.5V10z" />
  </svg>
);

const ListIcon = () => (
  <svg {...svg({ width: 19, height: 19 })}>
    <rect x="4" y="3" width="16" height="18" rx="2.5" />
    <line x1="8" y1="9" x2="16" y2="9" /><line x1="8" y1="14" x2="13" y2="14" />
  </svg>
);

const GearIcon = () => (
  <svg {...svg({ width: 19, height: 19 })}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.9 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 3.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 21 9a2 2 0 1 1 0 4z" />
  </svg>
);

const Backspace = () => (
  <svg {...svg({ width: 19, height: 19, strokeWidth: 1.9 })}>
    <path d="M21 5H8.5L2 12l6.5 7H21a1.6 1.6 0 0 0 1.6-1.6V6.6A1.6 1.6 0 0 0 21 5z" />
    <line x1="12" y1="9.5" x2="17" y2="14.5" /><line x1="17" y1="9.5" x2="12" y2="14.5" />
  </svg>
);

const GridIcon = () => (
  <svg {...svg({ width: 19, height: 19, strokeWidth: 2.4 })}>
    <circle cx="8.5" cy="8.5" r="2" /><circle cx="15.5" cy="8.5" r="2" />
    <circle cx="8.5" cy="15.5" r="2" /><circle cx="15.5" cy="15.5" r="2" />
  </svg>
);

const Reset = () => (
  <svg {...svg({ width: 18, height: 18 })}>
    <polyline points="20 6 20 11 15 11" />
    <path d="M19.4 15a8 8 0 1 1-1.6-8.4L20 9" />
  </svg>
);

const Check = () => (
  <svg {...svg({ width: 20, height: 20, strokeWidth: 2.6 })}><polyline points="4 12.5 9.5 18 20 6.5" /></svg>
);

const Trash = () => (
  <svg {...svg({ width: 18, height: 18 })}>
    <polyline points="4 6.5 20 6.5" /><path d="M9 6.5V4.5h6v2" />
    <path d="M6.5 6.5 7.4 20a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-13.5" />
    <line x1="10" y1="10.5" x2="10" y2="17.5" /><line x1="14" y1="10.5" x2="14" y2="17.5" />
  </svg>
);

const Close = () => (
  <svg {...svg({ width: 18, height: 18, strokeWidth: 2.4 })}>
    <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);

/* ============================================================
   Count-up

   Eases a number toward its target so the total rolls instead of
   snapping when you page between months. Reduced-motion jumps straight
   to the value.
   ============================================================ */
function useCountUp(target, ms = 450) {
  const [val, setVal] = useState(target);
  const from = useRef(target);
  const raf = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce || from.current === target) {
      from.current = target;
      setVal(target);
      return;
    }
    const start = performance.now();
    const a = from.current;
    const step = (now) => {
      // rAF hands back the frame's start time, which can predate `start`.
      // Without the lower clamp p goes negative and the ease overshoots
      // past the value it began from.
      const p = Math.min(1, Math.max(0, (now - start) / ms));
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(a + (target - a) * eased);
      if (p < 1) raf.current = requestAnimationFrame(step);
      else from.current = target;
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);

  return val;
}

/**
 * False on the first paint, true from the next frame on.
 *
 * Anything that should grow into place needs to be laid out at its start
 * value once before the transition can run — set the end value in the same
 * frame and the browser never sees a change to animate.
 */
function useGrown() {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return grown;
}

/* ============================================================
   CSV
   ============================================================ */
function splitCsvLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** Accepts DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD. Returns ISO or null. */
function readDate(s) {
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = String(2000 + Number(y));
    return `${y}-${pad(Number(mo))}-${pad(Number(d))}`;
  }
  const parsed = new Date(s);
  return isNaN(parsed) ? null : iso(parsed);
}

/**
 * Reads the Expenses001 column order: Date, Amount, Category, Description.
 * A negative amount is treated as income. Rows without a usable date or
 * amount are counted as skipped rather than silently dropped.
 */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], skipped: 0 };

  let start = 0;
  const head = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  if (head.includes("date") || head.includes("amount")) start = 1;

  const rows = [];
  let skipped = 0;
  for (let i = start; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]);
    const date = readDate(c[0]);
    const raw = parseFloat((c[1] || "").replace(/[₹,\s]/g, ""));
    if (!date || !isFinite(raw) || raw === 0) { skipped++; continue; }
    const catName = (c[2] || "").toLowerCase().trim();
    rows.push({
      id: uid(),
      amount: Math.abs(raw),
      type: raw < 0 ? "income" : "expense",
      cat: BY_NAME[catName] || "misc",
      note: c[3] || "",
      date,
    });
  }
  return { rows, skipped };
}

function toCsv(txns) {
  const rows = [["Date", "Amount", "Category", "Description", "Month", "Year"]];
  [...txns].sort((a, b) => a.date.localeCompare(b.date)).forEach((t) => {
    const d = parseISO(t.date);
    rows.push([
      `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`,
      (t.type === "income" ? -t.amount : t.amount).toFixed(2),
      CAT[t.cat]?.name || "Miscellaneous",
      t.note || "",
      MONTHS[d.getMonth()],
      d.getFullYear(),
    ]);
  });
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

/* ============================================================
   Sample data — only ever loaded on request, from Settings
   ============================================================ */
const SAMPLE = {
  dining: [["Swiggy",260,720],["Zomato",210,640],["Third Wave Coffee",180,420],["Saravana Bhavan",140,380]],
  groceries: [["BigBasket",900,2600],["Zepto",240,780],["Nilgiris",400,1400]],
  transport: [["Uber",120,460],["Metro recharge",100,300],["Fuel",1000,2400],["Rapido",60,180]],
  subs: [["Netflix",649,649],["Spotify",119,119],["iCloud",219,219]],
  utilities: [["Airtel",999,999],["Electricity",1100,2400],["Broadband",799,799]],
  home: [["Rent",28000,28000],["Maid",3000,3000],["Repairs",400,2200]],
  ent: [["PVR",320,780],["Books",400,1200]],
  health: [["Apollo Pharmacy",180,900],["Gym",1800,1800]],
  travel: [["IRCTC",800,2400],["Hotel",2400,6000]],
  personal: [["Salon",300,900],["Clothes",900,3200]],
  gifts: [["Birthday gift",800,2500]],
  invest: [["SIP",10000,10000]],
  debt: [["Card payment",4000,12000]],
  misc: [["Amazon",300,1800],["Courier",80,250]],
};
const WEIGHTS = { dining:26, groceries:12, transport:16, subs:3, utilities:3, home:2, ent:5, health:4, travel:2, personal:7, gifts:3, invest:2, debt:2, misc:13 };

function sample() {
  const pool = [];
  Object.entries(WEIGHTS).forEach(([k, w]) => { for (let i = 0; i < w; i++) pool.push(k); });
  const out = []; const now = new Date();
  for (let back = 104; back >= 0; back--) {
    const d = new Date(now); d.setDate(d.getDate() - back);
    const we = d.getDay() === 0 || d.getDay() === 6;
    let n = Math.random() < (we ? 0.82 : 0.66) ? 1 : 0;
    if (Math.random() < (we ? 0.5 : 0.28)) n++;
    for (let i = 0; i < n; i++) {
      const cat = pool[Math.floor(Math.random() * pool.length)];
      const [name, lo, hi] = SAMPLE[cat][Math.floor(Math.random() * SAMPLE[cat].length)];
      out.push({ id: uid(), amount: Math.round((lo + Math.random() * (hi - lo)) / 10) * 10, type: "expense", cat, note: name, date: iso(d) });
    }
    if (d.getDate() === 3) out.push({ id: uid(), amount: 28000, type: "expense", cat: "home", note: "Rent", date: iso(d) });
    if (d.getDate() === 5) out.push({ id: uid(), amount: 10000, type: "expense", cat: "invest", note: "SIP", date: iso(d) });
    if (d.getDate() === 1) out.push({ id: uid(), amount: 132000, type: "income", cat: "misc", note: "Salary", date: iso(d) });
  }
  return out;
}

/* ============================================================
   Bar chart

   The ghost track behind each bar keeps the shape of the period
   visible — without it a half-spent month reads as a ragged skyline
   with no sense of how much of it is still to come.
   ============================================================ */
function Bars({ buckets, avg, colour = "var(--text)", sel, onSel, height = 150 }) {
  const peak = Math.max(...buckets.map((b) => b.v), 1);
  const avgY = avg > 0 ? Math.min(height, (avg / peak) * height) : null;

  return (
    <>
      <div className="chart" style={{ height }}>
        <div className="bars">
          {buckets.map((b, i) => (
            <button key={b.from}
              className={`slot ${sel === i ? "sel" : ""} ${sel !== null && sel !== i ? "dim" : ""}`}
              onClick={() => onSel?.(sel === i ? null : i)}
              aria-label={`${b.from}, ${money(b.v)} rupees`}>
              <span className="bar" style={{
                height: b.v ? Math.max(4, (b.v / peak) * height) : 0,
                background: colour,
                transitionDelay: `${Math.min(i * 8, 220)}ms`,
              }} />
            </button>
          ))}
        </div>
        {avgY !== null && <div className="avgline" style={{ bottom: avgY }} />}
        <div className="yaxis">
          <span style={{ top: 0 }} className="num">{compact(peak)}</span>
          {avgY !== null && avgY > 18 && avgY < height - 18 && (
            <span className="mid num" style={{ bottom: avgY }}>{compact(avg)}</span>
          )}
          <span style={{ bottom: 0 }} className="num">0</span>
        </div>
      </div>
      <div className="xaxis">
        {buckets.map((b) => <span key={b.from}>{b.label}</span>)}
      </div>
    </>
  );
}

/* ============================================================
   Spending calendar

   The bar chart answers "how much, and when". This answers "which
   days" — the same daily totals arranged by weekday, so a heavy
   Saturday habit or a first-of-the-month rent reads as a column
   instead of a spike you have to count along the axis to place.

   Past a month a cell is too small for a number and too small to aim
   at, so the month becomes both the mark and the target.
   ============================================================ */

/** Daily totals, keyed by ISO date. */
function dayTotals(list) {
  const m = {};
  list.forEach((t) => { m[t.date] = (m[t.date] || 0) + t.amount; });
  return m;
}

/* One rent day is forty times an ordinary one. On a straight scale that
   leaves every other day at the same invisible tint — one red square and
   thirty blanks. The root keeps rent darkest and still separates a ₹400
   day from a ₹2,000 one. */
const weight = (v, peak) => Math.sqrt(v / peak);

/* A cell is about 47px across on a phone, which holds "9,999" at the base
   size. Rather than round the number away or let it spill, the longer ones
   step the type down — a rent day is one cell a month, and reading ₹56,000
   a shade smaller beats reading "56k". */
const amtSize = (s) => (s.length > 7 ? "xs" : s.length > 5 ? "sm" : "");

/**
 * Days as cells, weeks as rows.
 *
 * `days` is what to draw and `totals` is what to draw in it. They are
 * separate because on a Daily window the grid shows a whole month while
 * the screen behind it is one day of that month.
 */
function SpendCalendar({ days, totals, colour, sel, onSel }) {
  const today = iso(new Date());
  const peak = Math.max(...days.map((k) => totals[k] || 0), 1);
  const lead = (parseISO(days[0]).getDay() + 6) % 7;

  return (
    <div className="spendcal">
      <div className="caldow">
        {[1, 2, 3, 4, 5, 6, 0].map((i) => <span key={i}>{DOW[i].slice(0, 2)}</span>)}
      </div>
      <div className="scgrid">
        {Array.from({ length: lead }, (_, i) => <span key={`p${i}`} className="scday pad" />)}
        {days.map((k) => {
          const v = totals[k] || 0;
          const future = k > today;
          const w = weight(v, peak);
          const on = sel === k;
          return (
            <button key={k} disabled={future} onClick={() => onSel(k)}
              className={`scday${on ? " sel" : ""}${sel && !on ? " dim" : ""}`
                + `${future ? " fut" : ""}${k === today && !on ? " now" : ""}`}
              style={on || !v ? undefined : { background: tint(colour, 0.05 + 0.26 * w) }}
              aria-label={`${relDay(k)}, ${money(v)} rupees`}>
              <span className="scdate">{parseISO(k).getDate()}</span>
              {v ? (
                <span className={`scamt num ${amtSize(money(v))}`}
                  style={on ? undefined : { color: colour, opacity: 0.58 + 0.42 * w }}>
                  {money(v)}
                </span>
              ) : (
                <span className="scnil">{future ? "" : "·"}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The same grid, small: colour alone, and the month is the tap target. */
function MiniMonths({ months, totals, colour, onOpen }) {
  const today = iso(new Date());

  // Every month gets six rows whether it needs them or not. Four rows next
  // to six leaves twelve labels at nine different heights, and the thing
  // stops reading as a grid.
  const grids = months.map(({ y, m }) => {
    const cells = Array((new Date(y, m, 1).getDay() + 6) % 7).fill(null);
    for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) cells.push(iso(new Date(y, m, d)));
    while (cells.length < 42) cells.push(null);
    return { y, m, cells };
  });

  // One scale across the whole window, so a dark March and a dark July mean
  // the same rupees and the months can be read against each other.
  const peak = Math.max(...grids.flatMap((g) => g.cells.map((k) => (k ? totals[k] || 0 : 0))), 1);

  return (
    <div className="scmonths">
      {grids.map(({ y, m, cells }) => (
        <button key={`${y}-${m}`} className="scmini" onClick={() => onOpen(y, m)}
          aria-label={`Open ${MONTHS[m]} ${y}`}>
          <span className="scmlabel">{MON[m]}</span>
          <span className="scmgrid">
            {cells.map((k, i) => {
              const v = k && k <= today ? totals[k] || 0 : 0;
              return <span key={k || `p${i}`} className={`scmday${!k || k > today ? " pad" : ""}`}
                style={v ? { background: tint(colour, 0.10 + 0.55 * weight(v, peak)) } : undefined} />;
            })}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Picks the calendar that fits the window: days with numbers in them up to
 * a month, small months beyond that.
 *
 * `pool` is every transaction the screen cares about, narrowed by kind and
 * category but not by date — the Daily grid reaches outside its own window
 * and needs the days either side of it.
 */
function SpendGrid({ f, pool, buckets, sel, onSel, colour, onOpenMonth }) {
  const totals = useMemo(() => dayTotals(pool), [pool]);
  const { period, range } = f;

  if (period === "d") {
    // The one place the grid shows more than the window. A single day is a
    // single cell, so it draws the month around it and dims the rest —
    // those days are context, and they are there to be tapped.
    const s = range.start;
    const days = [];
    for (let d = 1; d <= new Date(s.getFullYear(), s.getMonth() + 1, 0).getDate(); d++) {
      days.push(iso(new Date(s.getFullYear(), s.getMonth(), d)));
    }
    return <SpendCalendar days={days} totals={totals} colour={colour}
      sel={iso(s)} onSel={f.openDay} />;
  }

  if (period === "w" || period === "m") {
    const days = buckets.map((b) => b.from);
    return <SpendCalendar days={days} totals={totals} colour={colour}
      sel={sel === null ? null : days[sel]}
      onSel={(k) => onSel(days.indexOf(k) === sel ? null : days.indexOf(k))} />;
  }

  const months = [];
  for (let d = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    d <= range.end; d.setMonth(d.getMonth() + 1)) {
    months.push({ y: d.getFullYear(), m: d.getMonth() });
  }
  return <MiniMonths months={months} totals={totals} colour={colour} onOpen={onOpenMonth} />;
}

/* ============================================================
   Filter pills
   ============================================================ */
function Filters({ f, onPick, showCat = true }) {
  const cat = f.catFilter ? CAT[f.catFilter] : null;
  return (
    <div className="pills">
      <button className="pill" onClick={() => f.setKind(f.kind === "expense" ? "income" : "expense")}>
        {f.kind === "expense" ? "Expenses" : "Income"}
      </button>
      <button className="pill" onClick={() => onPick("period")}>
        {PERIODS.find(([k]) => k === f.period)[1]}
        <span className="pchev"><Chevron dir="down" size={14} /></span>
      </button>
      {showCat && (
        <button className={`pill ${cat ? "on" : ""}`} onClick={() => onPick("cat")}>
          {cat ? `${cat.e} ${cat.name}` : "All categories"}
          <span className="pchev"><Chevron dir="down" size={14} /></span>
        </button>
      )}
    </div>
  );
}

/** A bottom sheet of options — what each filter pill opens. */
function PickerSheet({ title, options, value, onPick, onClose }) {
  useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="sheet" style={{ top: "auto", maxHeight: "72vh" }}>
      <div className="grab" />
      <div className="sheettop" style={{ paddingBottom: 12 }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>{title}</span>
        <button className="iconbtn" onClick={onClose} aria-label="Close"><Close /></button>
      </div>
      <div style={{ overflowY: "auto", padding: "0 16px calc(20px + env(safe-area-inset-bottom))" }}>
        <div className="setcard">
          {options.map((o) => (
            <button key={String(o.id)} className="row" onClick={() => { onPick(o.id); onClose(); }}>
              <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
                {o.e && (
                  <span className="tile sm" style={{ color: o.c, background: tint(o.c) }}>{o.e}</span>
                )}
                {o.name}
              </span>
              {o.id === value && <Check />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Rows
   ============================================================ */
function Delta({ pct, from, goodDown = true }) {
  if (pct === null || pct === 0) return null;
  const good = goodDown ? pct < 0 : pct > 0;
  const c = good ? "var(--pos)" : "var(--neg)";
  return (
    <div className="delta" style={{ color: c }}>
      <span className="darrow" style={{ background: c }}><Arrow up={pct > 0} /></span>
      <span className="num">{Math.abs(pct)}%</span>
      <span className="dfrom">from {from}</span>
    </div>
  );
}

/**
 * One category: icon, name, its bar, and the money.
 *
 * The bar is the chart — there is no separate one. `share` is this
 * category's length as a percentage of the longest bar on screen, so the
 * row carries the comparison the ring used to, at the size of the whole
 * row rather than the width of a stroke.
 */
function CatRow({ id, v, n, pct, share, grown, onTap }) {
  const c = CAT[id];
  return (
    <button className="catrow" onClick={() => onTap?.(id)}>
      <span className="tile" style={{ color: c?.c, background: tint(c?.c) }}>{c?.e}</span>
      <span className="catmid">
        <span className="catline">
          <span className="catname">{c?.name}</span>
          <span className="count num">{n}</span>
        </span>
        <span className="track">
          <span className="fill" style={{ width: grown ? `${share}%` : 0, background: c?.c }} />
        </span>
      </span>
      <span className="catval">
        <span className="catamt num">₹{money(v)}</span>
        <span className="pct num">{pct}%</span>
      </span>
    </button>
  );
}

function TxnRow({ t, onTap, hideCat }) {
  const c = CAT[t.cat];
  return (
    <button className="txn" onClick={() => onTap?.(t)}>
      <span className="tile sm" style={{ color: c?.c, background: tint(c?.c) }}>{c?.e}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="txnname" style={{ display: "block" }}>{t.note || c?.name}</span>
        {t.note && !hideCat ? <span className="txnsub" style={{ display: "block" }}>{c?.name}</span> : null}
      </span>
      <span className="txnamt num" style={{ color: t.type === "income" ? "var(--pos)" : "var(--text)" }}>
        {t.type === "income" ? "+" : ""}₹{money(t.amount)}
      </span>
    </button>
  );
}

function DayGroups({ list, onTap, hideCat, limit = 120, empty = "Nothing here yet." }) {
  const groups = useMemo(() => {
    const m = {};
    list.forEach((t) => { (m[t.date] ||= []).push(t); });
    return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0])).slice(0, limit);
  }, [list, limit]);

  if (!groups.length) return <div className="empty">{empty}</div>;

  return (
    <>
      {groups.map(([date, rows]) => (
        <div key={date}>
          <div className="dayhead">
            <span>{relDay(date)}</span>
            <span className="num">₹{money(rows.reduce((s, t) => s + t.amount, 0))}</span>
          </div>
          <div className="daycard">
            {rows.map((t) => <TxnRow key={t.id} t={t} onTap={onTap} hideCat={hideCat} />)}
          </div>
        </div>
      ))}
    </>
  );
}

/** ‹ March 2026 › — the period stepper every screen shares. */
function PeriodNav({ f, right }) {
  return (
    <div className="navrow">
      <button className="iconbtn" onClick={() => f.setOff(f.off - 1)} aria-label="Previous period">
        <Chevron dir="left" />
      </button>
      <span className="navtitle">{f.range.title}</span>
      <span style={{ display: "flex", gap: 8 }}>
        <button className="iconbtn" disabled={f.off >= 0} onClick={() => f.off < 0 && f.setOff(f.off + 1)}
          aria-label="Next period">
          <Chevron dir="right" />
        </button>
        {right}
      </span>
    </div>
  );
}

/* ============================================================
   Summary
   ============================================================ */
function Summary({ f, cur, prevTotal, onPick, onDrill }) {
  const total = cur.reduce((s, t) => s + t.amount, 0);
  const shown = useCountUp(total);
  const grown = useGrown();
  const delta = prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;

  const byCat = useMemo(() => {
    const m = {};
    cur.forEach((t) => {
      const e = (m[t.cat] ||= { v: 0, n: 0 });
      e.v += t.amount; e.n++;
    });
    return Object.entries(m).sort((a, b) => b[1].v - a[1].v);
  }, [cur]);

  // Bars are measured against the biggest category, not against the total.
  // A top share of a quarter is normal, and scaling by the total would
  // leave three quarters of every row empty — throwing away the width that
  // makes two lengths worth comparing. Exact share is on the row already.
  const peak = byCat.length ? byCat[0][1].v : 0;
  const noun = f.kind === "expense" ? "Expenses" : "Income";

  return (
    <div className="scroll">
      <PeriodNav f={f} />

      <div className="shead">
        <div className="slabel">{noun} {f.range.label}</div>
        <div className="stotal num">₹{money(shown)}</div>
        <Delta pct={delta} from={f.range.from} goodDown={f.kind === "expense"} />
      </div>

      <Filters f={f} onPick={onPick} />

      {byCat.length === 0 ? (
        <div className="empty">
          Nothing logged {f.range.label}.<br />
          Tap + to add your first entry, or import a CSV from Settings.
        </div>
      ) : (
        byCat.map(([id, x]) => (
          <CatRow key={id} id={id} v={x.v} n={x.n} grown={grown}
            share={(x.v / peak) * 100}
            pct={((x.v / total) * 100).toFixed(2)} onTap={onDrill} />
        ))
      )}
    </div>
  );
}

/* ============================================================
   Entries
   ============================================================ */
function Entries({ f, txns, cur, onPick, onTap }) {
  const [sel, setSel] = useState(null);
  const buckets = useMemo(() => bucketize(f.period, f.range, cur), [f.period, f.range, cur]);

  // The calendar's supply: the same narrowing the window uses, minus the
  // dates, because on Daily the grid draws the month around the chosen day.
  const pool = useMemo(
    () => txns.filter((t) => t.type === f.kind && (!f.catFilter || t.cat === f.catFilter)),
    [txns, f.kind, f.catFilter],
  );

  // Reset the bar selection whenever the window underneath it changes.
  useEffect(() => { setSel(null); }, [f.period, f.off, f.kind, f.catFilter]);

  const total = cur.reduce((s, t) => s + t.amount, 0);
  const shown = useCountUp(total);

  // Mean across elapsed buckets only — counting days that haven't happened
  // yet would drag the line down and make every month look thrifty.
  const today = iso(new Date());
  const elapsed = buckets.filter((b) => b.from <= today);
  const avg = elapsed.length ? elapsed.reduce((s, b) => s + b.v, 0) / elapsed.length : 0;

  const list = sel === null
    ? cur
    : cur.filter((t) => t.date >= buckets[sel].from && t.date <= buckets[sel].to);

  return (
    <div className="scroll">
      <PeriodNav f={f} />

      <div className="shead">
        <div className="slabel">{f.kind === "expense" ? "Expenses" : "Income"} {f.range.label}</div>
        <div className="stotal num">₹{money(shown)}</div>
      </div>

      {f.period !== "d" && <Bars buckets={buckets} avg={avg} sel={sel} onSel={setSel} />}

      <SpendGrid f={f} pool={pool} buckets={buckets} sel={sel} onSel={setSel}
        colour={f.kind === "expense" ? NEG : POS} onOpenMonth={f.openMonth} />

      <Filters f={f} onPick={onPick} />

      {sel !== null && (
        <button className="pill on" style={{ marginBottom: 16 }} onClick={() => setSel(null)}>
          {buckets[sel].from === buckets[sel].to
            ? relDay(buckets[sel].from)
            : `${relDay(buckets[sel].from)} – ${relDay(buckets[sel].to)}`}
          <span className="pchev"><Close /></span>
        </button>
      )}

      <DayGroups list={list} onTap={onTap}
        empty={sel !== null ? "Nothing logged in that stretch." : `Nothing logged ${f.range.label}.`} />
    </div>
  );
}

/* ============================================================
   Category detail
   ============================================================ */
function CategoryDetail({ f, txns, id, onBack, onTap, onPick }) {
  const c = CAT[id];

  const cur = useMemo(() => txns.filter((t) => {
    const d = parseISO(t.date);
    return t.cat === id && t.type === f.kind && d >= f.range.start && d <= f.range.end;
  }), [txns, id, f.kind, f.range]);

  const prevTotal = useMemo(() => txns.filter((t) => {
    const d = parseISO(t.date);
    return t.cat === id && t.type === f.kind && d >= f.range.prevStart && d <= f.range.prevEnd;
  }).reduce((s, t) => s + t.amount, 0), [txns, id, f.kind, f.range]);

  const total = cur.reduce((s, t) => s + t.amount, 0);
  const shown = useCountUp(total);
  const delta = prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
  const buckets = useMemo(() => bucketize(f.period, f.range, cur), [f.period, f.range, cur]);

  const today = iso(new Date());
  const elapsed = buckets.filter((b) => b.from <= today);
  const avg = elapsed.length ? elapsed.reduce((s, b) => s + b.v, 0) / elapsed.length : 0;

  const pool = useMemo(
    () => txns.filter((t) => t.cat === id && t.type === f.kind),
    [txns, id, f.kind],
  );

  return (
    <div className="scroll">
      <div className="navrow">
        <button className="iconbtn" onClick={onBack} aria-label="Back"><Chevron dir="left" /></button>
        <span className="navtitle" style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span className="tile sm" style={{ color: c?.c, background: tint(c?.c) }}>{c?.e}</span>
          {c?.name}
        </span>
        <span style={{ width: 40 }} />
      </div>

      <div className="shead">
        <div className="slabel">{f.range.title}</div>
        <div className="stotal num">₹{money(shown)}</div>
        <Delta pct={delta} from={f.range.from} goodDown={f.kind === "expense"} />
      </div>

      {f.period !== "d" && <Bars buckets={buckets} avg={avg} colour={c?.c} sel={null} />}

      <SpendGrid f={f} pool={pool} buckets={buckets} sel={null} onSel={() => {}}
        colour={c?.c} onOpenMonth={f.openMonth} />

      <Filters f={f} onPick={onPick} showCat={false} />

      <DayGroups list={cur} onTap={onTap} hideCat empty={`No ${c?.name.toLowerCase()} ${f.range.label}.`} />
    </div>
  );
}

/* ============================================================
   Settings
   ============================================================ */
function SettingsScreen({ txns, onReplace, onAdd }) {
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);

  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(txns)], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Expenses-${iso(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { rows, skipped } = parseCsv(await file.text());
      if (!rows.length) { setMsg("No usable rows found. Expected Date, Amount, Category, Description."); return; }
      await onAdd(rows);
      setMsg(`Imported ${rows.length} entries${skipped ? `, skipped ${skipped}` : ""}.`);
    } catch {
      setMsg("Couldn't read that file.");
    } finally {
      e.target.value = "";
    }
  };

  const spent = txns.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const oldest = txns.length ? txns[txns.length - 1].date : null;

  return (
    <div className="scroll">
      <div className="navrow" style={{ marginBottom: 16 }}>
        <span className="navtitle">Settings</span>
      </div>

      <div className="setcard" style={{ padding: 16 }}>
        <div className="num" style={{ fontSize: 30, fontWeight: 700 }}>{txns.length}</div>
        <div style={{ fontSize: 13.5, color: "var(--text2)", marginTop: 3 }}>
          entries · ₹{money(spent)} logged{oldest ? ` · since ${relDay(oldest)}` : ""}
        </div>
      </div>

      {msg && <div style={{ padding: "0 4px 14px", fontSize: 13.5, color: "var(--pos)" }}>{msg}</div>}

      <div className="sect">Your data</div>
      <div className="setcard">
        <button className="row" onClick={() => fileRef.current?.click()}>
          <span>
            Import CSV
            <span className="rowsub" style={{ display: "block" }}>
              Adds to what's here. Negative amounts import as income.
            </span>
          </span>
          <Chevron dir="right" size={16} />
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: "none" }} />

        <button className="row" onClick={download}>
          <span>
            Export CSV
            <span className="rowsub" style={{ display: "block" }}>
              Date, Amount, Category, Description, Month, Year
            </span>
          </span>
          <Chevron dir="right" size={16} />
        </button>

        <button className="row" onClick={() => { onAdd(sample()); setMsg("Sample data loaded."); }}>
          <span>
            Load sample data
            <span className="rowsub" style={{ display: "block" }}>
              Three months of made-up spending, to see how it looks.
            </span>
          </span>
          <Chevron dir="right" size={16} />
        </button>

        <button className="row"
          style={{ color: confirm ? "var(--neg)" : "var(--text)" }}
          onClick={() => (confirm ? (onReplace([]), setConfirm(false), setMsg("Everything erased.")) : setConfirm(true))}>
          <span>
            {confirm ? "Tap again to erase everything" : "Start fresh"}
            <span className="rowsub" style={{ display: "block" }}>
              Deletes every entry. Export first if you want it.
            </span>
          </span>
          <Chevron dir="right" size={16} />
        </button>
      </div>

      <div style={{ padding: "10px 4px 20px", fontSize: 12.5, color: "var(--text3)", lineHeight: 1.65 }}>
        Everything lives on this device and never leaves it. Nothing is synced,
        so exporting now and then is your only backup — and deleting the app
        takes the data with it.
      </div>
    </div>
  );
}

/* ============================================================
   Calendar — the date picker, in place of the keypad

   The browser's own <input type="date"> panel is native chrome: a light
   card that ignores every token in this file and can't be restyled. This
   is the same month grid in the app's own language, and it swaps with the
   keypad exactly the way the category grid does.
   ============================================================ */
function Calendar({ value, onPick }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const sel = parseISO(value);
  const [month, setMonth] = useState(new Date(sel.getFullYear(), sel.getMonth(), 1));

  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const offset = (month.getDay() + 6) % 7;        // days from Monday to the 1st
  const rows = Math.ceil((offset + last) / 7);
  const start = startOfWeek(month);

  const days = [];
  for (let i = 0; i < rows * 7; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    days.push(d);
  }

  const step = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  // Nothing is logged in the future, so there is nowhere to step forward to.
  const atNow = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();

  return (
    <div className="cal">
      <div className="calhead">
        <button className="iconbtn" onClick={() => step(-1)} aria-label="Previous month">
          <Chevron dir="left" size={16} />
        </button>
        <span className="calmonth">{MONTHS[month.getMonth()]} {month.getFullYear()}</span>
        <button className="iconbtn" onClick={() => step(1)} disabled={atNow} aria-label="Next month">
          <Chevron size={16} />
        </button>
      </div>

      <div className="caldow">
        {[1, 2, 3, 4, 5, 6, 0].map((i) => <span key={i}>{DOW[i].slice(0, 2)}</span>)}
      </div>

      <div className="calgrid">
        {days.map((d) => {
          const k = iso(d);
          return (
            <button key={k} disabled={d > today} onClick={() => onPick(k)}
              className={`calday ${d.getMonth() !== month.getMonth() ? "out" : ""}` +
                `${k === iso(today) ? " now" : ""}${k === value ? " on" : ""}`}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   Entry sheet — add and edit
   ============================================================ */
function EntrySheet({ txn, onSave, onDelete, onClose }) {
  const isEdit = Boolean(txn.id);
  const [amt, setAmt] = useState(isEdit ? String(txn.amount) : "");
  const [type, setType] = useState(txn.type || "expense");
  const [cat, setCat] = useState(txn.cat || null);
  const [note, setNote] = useState(txn.note || "");
  const [date, setDate] = useState(txn.date || iso(new Date()));
  const [grid, setGrid] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [cal, setCal] = useState(false);

  const tap = (k) => {
    if (k === "del") return setAmt((a) => a.slice(0, -1));
    if (k === "." && amt.includes(".")) return;
    if (amt.includes(".") && amt.split(".")[1]?.length >= 2) return;
    if (amt.replace(".", "").length >= 8) return;
    setAmt((a) => (a === "0" && k !== "." ? k : a + k));
  };

  // Every field has to be filled in before the entry can be saved. The one
  // that is still missing names itself under the amount, in the order the
  // sheet asks for them, so the greyed-out tick is never a mystery.
  const missing =
    !(parseFloat(amt) > 0) ? "Enter an amount"
    : !cat ? "Pick a category"
    : !note.trim() ? "Add a description"
    : null;
  const valid = !missing;

  const submit = () => {
    if (!valid) return;
    onSave({ ...(isEdit ? txn : {}), amount: parseFloat(amt), type, cat, note: note.trim(), date });
  };

  const dates = [0, 1].map((o) => { const d = new Date(); d.setDate(d.getDate() - o); return iso(d); });
  const sel = cat ? CAT[cat] : null;

  return (
    <div className="sheet">
      <div className="grab" />

      <div className="sheettop">
        <button className="iconbtn" onClick={onClose} aria-label="Cancel"><Close /></button>
        <div className="seg" style={{ maxWidth: 210 }}>
          <button className={`segbtn ${type === "expense" ? "on" : ""}`} onClick={() => setType("expense")}>Spent</button>
          <button className={`segbtn ${type === "income" ? "on" : ""}`} onClick={() => setType("income")}>Received</button>
        </div>
        <button className="iconbtn" onClick={submit} disabled={!valid}
          aria-label={missing || "Save"} title={missing || "Save"}
          style={valid ? { background: "var(--text)", color: "var(--bg)" } : undefined}>
          <Check />
        </button>
      </div>

      <div className={`amount ${grid || cal ? "compact" : ""}`}>
        <span className={`amountval num ${amt ? "" : "zero"}`}>
          <span className="rupee">₹</span>{amt || "0"}
        </span>
        <span className="amounthint">{missing}</span>
      </div>

      <div className="metarow">
        <div className="chiprow">
          {dates.map((d) => (
            <button key={d} className={`chip ${date === d ? "on" : ""}`}
              onClick={() => { setDate(d); setCal(false); }}>
              📅 {relDay(d)}
            </button>
          ))}
          <button className={`chip ${!dates.includes(date) ? "on" : ""}`}
            onClick={() => { setCal((v) => !v); setGrid(false); }} aria-expanded={cal}
            aria-label={dates.includes(date) ? "Pick another date" : `Date: ${relDay(date)}`}>
            {dates.includes(date) ? "📅" : `📅 ${relDay(date)}`}
          </button>
        </div>
        {isEdit && (
          <button className={`delbtn ${confirmDel ? "armed" : ""}`}
            onClick={() => (confirmDel ? onDelete(txn.id) : setConfirmDel(true))}
            aria-label={confirmDel ? "Tap again to delete" : "Delete"}
            title={confirmDel ? "Tap again to delete" : "Delete"}>
            <Trash />
          </button>
        )}
      </div>

      <div style={{ padding: "0 16px 12px" }}>
        <input className="inp" placeholder="What was it for?" value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      </div>

      <div className="catstrip">
        <button className={`catbtn ${sel ? "filled" : ""} ${grid ? "on" : ""}`}
          onClick={() => { setGrid((v) => !v); setCal(false); }} aria-expanded={grid}
          aria-label={sel ? `Category: ${sel.name}` : "Choose a category"}>
          {sel ? (
            <>
              <span className="tile sm" style={{ color: sel.c, background: tint(sel.c) }}>{sel.e}</span>
              <span className="catbtnname">{sel.name}</span>
            </>
          ) : (
            <>
              <span className="tile sm catbtnempty"><GridIcon /></span>
              <span className="catbtnname">Choose a category</span>
            </>
          )}
          <Chevron dir={grid ? "up" : "down"} size={16} />
        </button>
      </div>

      {grid && (
        <div className="catgrid">
          {CATS.map((c) => (
            <button key={c.id} className={`gopt ${c.id === cat ? "on" : ""}`}
              onClick={() => { setCat(c.id); setGrid(false); }}>
              <span className="tile sm" style={{ color: c.c, background: tint(c.c) }}>{c.e}</span>
              <span className="gname">{c.name}</span>
            </button>
          ))}
        </div>
      )}

      {cal && <Calendar value={date} onPick={(d) => { setDate(d); setCal(false); }} />}

      {!grid && !cal && (
        <div className="keypad">
          {["1","2","3","4","5","6","7","8","9",".","0","del"].map((k) => (
            <button key={k} className="key" onClick={() => tap(k)}
              aria-label={k === "del" ? "Backspace" : k}>
              {k === "del" ? <Backspace /> : k}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   App
   ============================================================ */
export default function App() {
  const [txns, setTxns] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("summary");
  const [editing, setEditing] = useState(null);
  const [drill, setDrill] = useState(null);
  const [picker, setPicker] = useState(null);

  const [period, setPeriod] = useState("m");
  const [off, setOff] = useState(0);
  const [kind, setKind] = useState("expense");
  const [catFilter, setCatFilter] = useState(null);

  // Any change to what's on screen returns you to the top of it — the
  // content below a stale scroll offset is never the content you left.
  useEffect(() => { window.scrollTo(0, 0); }, [tab, drill, period, off, kind, catFilter]);

  useEffect(() => {
    db.getAll()
      .then((rows) => {
        rows.sort((a, b) => b.date.localeCompare(a.date));
        setTxns(rows);
      })
      .catch((e) => setError(e.message || "Couldn't open the database."))
      .finally(() => setReady(true));
  }, []);

  // Stepping to a different grain restarts at the current one — landing on
  // "3 quarters ago" because you were 3 months back is never what you meant.
  const changePeriod = (p) => { setPeriod(p); setOff(0); };

  // Opening a cell from a calendar has to set the grain and the offset in
  // one go — changePeriod would reset you to today's month or today's date,
  // which is never where you just tapped.
  const openMonth = (y, m) => {
    const n = new Date();
    setPeriod("m");
    setOff((y - n.getFullYear()) * 12 + (m - n.getMonth()));
  };

  const openDay = (k) => {
    const n = new Date(); n.setHours(0, 0, 0, 0);
    setPeriod("d");
    setOff(Math.round((parseISO(k) - n) / 864e5));
  };

  const range = useMemo(() => periodRange(period, off), [period, off]);
  const f = { period, setPeriod: changePeriod, off, setOff, kind, setKind, catFilter, setCatFilter,
    range, openMonth, openDay };

  const cur = useMemo(() => txns.filter((t) => {
    const d = parseISO(t.date);
    return t.type === kind && (!catFilter || t.cat === catFilter) && d >= range.start && d <= range.end;
  }), [txns, kind, catFilter, range]);

  const prevTotal = useMemo(() => txns.filter((t) => {
    const d = parseISO(t.date);
    return t.type === kind && (!catFilter || t.cat === catFilter) && d >= range.prevStart && d <= range.prevEnd;
  }).reduce((s, t) => s + t.amount, 0), [txns, kind, catFilter, range]);

  const save = async (t) => {
    const rec = t.id ? t : { ...t, id: uid() };
    setTxns((p) => {
      const next = t.id ? p.map((x) => (x.id === t.id ? rec : x)) : [rec, ...p];
      return next.sort((a, b) => b.date.localeCompare(a.date));
    });
    setEditing(null);
    try { await db.put(rec); } catch { setError("Save failed. Your change may not survive a reload."); }
  };

  const remove = async (id) => {
    setTxns((p) => p.filter((t) => t.id !== id));
    setEditing(null);
    try { await db.remove(id); } catch { setError("Delete failed."); }
  };

  const replaceAll = async (rows) => {
    setTxns([...rows].sort((a, b) => b.date.localeCompare(a.date)));
    try { await db.clear(); if (rows.length) await db.bulkPut(rows); }
    catch { setError("Couldn't write to the database."); }
  };

  const addMany = async (rows) => {
    setTxns((p) => [...p, ...rows].sort((a, b) => b.date.localeCompare(a.date)));
    try { await db.bulkPut(rows); } catch { setError("Import didn't fully save."); }
  };

  if (!ready) {
    return <div className="lg"><div className="scroll"><div className="empty">Loading…</div></div></div>;
  }

  const TABS = [["summary", "Summary", PieIcon], ["entries", "Entries", ListIcon], ["settings", "Settings", GearIcon]];

  return (
    <div className="lg">
      {error && (
        <div style={{ background: "var(--neg)", color: "#10141A", padding: "11px 16px", fontSize: 13.5, fontWeight: 500 }}
          onClick={() => setError(null)} role="alert">
          {error} — tap to dismiss
        </div>
      )}

      {drill ? (
        <CategoryDetail f={f} txns={txns} id={drill} onBack={() => setDrill(null)}
          onTap={setEditing} onPick={setPicker} />
      ) : (
        <>
          {tab === "summary" && (
            <Summary f={f} cur={cur} prevTotal={prevTotal} onPick={setPicker} onDrill={setDrill} />
          )}
          {tab === "entries" && <Entries f={f} txns={txns} cur={cur} onPick={setPicker} onTap={setEditing} />}
          {tab === "settings" && <SettingsScreen txns={txns} onReplace={replaceAll} onAdd={addMany} />}
        </>
      )}

      <nav className="navwrap">
        <div className="navpill">
          {TABS.map(([k, name, Icon]) => (
            <button key={k} className={`navbtn ${!drill && tab === k ? "on" : ""}`}
              onClick={() => { setDrill(null); setTab(k); }}
              aria-current={!drill && tab === k ? "page" : undefined}>
              <Icon />
              {name}
            </button>
          ))}
        </div>
        <button className="fab" onClick={() => setEditing({})} aria-label="Add transaction"><Plus /></button>
      </nav>

      {picker === "period" && (
        <PickerSheet title="Period" value={period} onClose={() => setPicker(null)}
          onPick={changePeriod}
          options={PERIODS.map(([id, name]) => ({ id, name }))} />
      )}
      {picker === "cat" && (
        <PickerSheet title="Category" value={catFilter} onClose={() => setPicker(null)}
          onPick={setCatFilter}
          options={[{ id: null, name: "All categories" }, ...CATS]} />
      )}

      {editing && (
        <EntrySheet txn={editing} onSave={save}
          onDelete={remove} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
