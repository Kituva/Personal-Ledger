import React, { useState, useEffect, useMemo, useRef } from "react";
import * as db from "./db.js";

/* ============================================================
   Categories
   ============================================================ */
export const CATS = [
  { id: "dining", name: "Dining Out", c: "#C89B3C" },
  { id: "groceries", name: "Groceries", c: "#7FA05A" },
  { id: "transport", name: "Transportation", c: "#5B8FB0" },
  { id: "subs", name: "Subscriptions", c: "#9B7BB5" },
  { id: "utilities", name: "Utilities", c: "#C2795A" },
  { id: "home", name: "Home", c: "#6F7690" },
  { id: "ent", name: "Entertainment", c: "#CE7F9E" },
  { id: "health", name: "Health/medical", c: "#5FA394" },
  { id: "travel", name: "Travel", c: "#D9A441" },
  { id: "personal", name: "Personal", c: "#A88BC7" },
  { id: "gifts", name: "Gifts/Donations", c: "#C96A6A" },
  { id: "invest", name: "Investments", c: "#4E9D7B" },
  { id: "debt", name: "Debt", c: "#B5563F" },
  { id: "misc", name: "Miscellaneous", c: "#7C8296" },
];
const CAT = Object.fromEntries(CATS.map((c) => [c.id, c]));
const BY_NAME = Object.fromEntries(CATS.map((c) => [c.name.toLowerCase(), c.id]));

/* ============================================================
   Dates and formatting
   ============================================================ */
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const money = (n) => Math.round(Math.abs(n)).toLocaleString("en-IN");
const uid = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function relDay(dstr) {
  const t = iso(new Date());
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (dstr === t) return "Today";
  if (dstr === iso(y)) return "Yesterday";
  const d = parseISO(dstr);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${DOW[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}${sameYear ? "" : " " + d.getFullYear()}`;
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
   App
   ============================================================ */
export default function App() {
  const [txns, setTxns] = useState([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("home");
  const [editing, setEditing] = useState(null);
  const [settings, setSettings] = useState(false);
  const [monthOff, setMonthOff] = useState(0);
  const [selDay, setSelDay] = useState(null);

  useEffect(() => {
    db.getAll()
      .then((rows) => {
        rows.sort((a, b) => b.date.localeCompare(a.date));
        setTxns(rows);
      })
      .catch((e) => setError(e.message || "Couldn't open the database."))
      .finally(() => setReady(true));
  }, []);

  // Categories ranked by how often you use them — most of the speed of
  // manual entry is the picker already showing your usual few.
  const catOrder = useMemo(() => {
    const n = {};
    txns.forEach((t) => { n[t.cat] = (n[t.cat] || 0) + 1; });
    return [...CATS].sort((a, b) => (n[b.id] || 0) - (n[a.id] || 0));
  }, [txns]);

  const save = async (t) => {
    const rec = t.id ? t : { ...t, id: uid() };
    setTxns((p) => {
      const next = t.id ? p.map((x) => (x.id === t.id ? rec : x)) : [rec, ...p];
      return next.sort((a, b) => b.date.localeCompare(a.date));
    });
    setEditing(null);
    try { await db.put(rec); } catch (e) { setError("Save failed. Your change may not survive a reload."); }
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
    return <div className="lg"><div className="scroll"><div className="eyebrow">Loading</div></div></div>;
  }

  return (
    <div className="lg">
      {error && (
        <div style={{ background: "var(--rust)", color: "#14161F", padding: "10px 18px", fontSize: 13 }}
          onClick={() => setError(null)} role="alert">
          {error} — tap to dismiss
        </div>
      )}

      {tab === "home" && <Home txns={txns} off={monthOff} setOff={setMonthOff} selDay={selDay}
        setSelDay={setSelDay} onTap={setEditing} onSettings={() => setSettings(true)} />}
      {tab === "insights" && <Insights txns={txns} />}
      {tab === "log" && <Log txns={txns} onTap={setEditing} />}

      <nav className="tabbar">
        <button className={`tab ${tab === "home" ? "on" : ""}`} onClick={() => setTab("home")}>Month</button>
        <button className={`tab ${tab === "insights" ? "on" : ""}`} onClick={() => setTab("insights")}>Insights</button>
        <button className="fab" onClick={() => setEditing({})} aria-label="Add transaction">+</button>
        <button className={`tab ${tab === "log" ? "on" : ""}`} onClick={() => setTab("log")}>Log</button>
        <div className="tab" style={{ opacity: 0, pointerEvents: "none" }} aria-hidden>·</div>
      </nav>

      {editing && <EntrySheet txn={editing} cats={catOrder} onSave={save}
        onDelete={remove} onClose={() => setEditing(null)} />}
      {settings && <Settings txns={txns} onClose={() => setSettings(false)}
        onReplace={replaceAll} onAdd={addMany} />}
    </div>
  );
}

/* ============================================================
   Month
   ============================================================ */
function Home({ txns, off, setOff, selDay, setSelDay, onTap, onSettings }) {
  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + off);
  const yr = base.getFullYear(), mo = base.getMonth();
  const days = new Date(yr, mo + 1, 0).getDate();
  const todayIso = iso(new Date());

  const inMonth = useMemo(() => txns.filter((t) => {
    const d = parseISO(t.date); return d.getFullYear() === yr && d.getMonth() === mo;
  }), [txns, yr, mo]);

  const spent = inMonth.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const earned = inMonth.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);

  const prev = useMemo(() => {
    const p = new Date(yr, mo - 1, 1);
    return txns.filter((t) => { const d = parseISO(t.date);
      return t.type === "expense" && d.getFullYear() === p.getFullYear() && d.getMonth() === p.getMonth();
    }).reduce((s, t) => s + t.amount, 0);
  }, [txns, yr, mo]);
  const delta = prev ? Math.round(((spent - prev) / prev) * 100) : null;

  const byDay = useMemo(() => {
    const m = Array(days).fill(0);
    inMonth.filter((t) => t.type === "expense")
      .forEach((t) => { m[parseISO(t.date).getDate() - 1] += t.amount; });
    return m;
  }, [inMonth, days]);
  const peak = Math.max(...byDay, 1);

  const byCat = useMemo(() => {
    const m = {};
    inMonth.filter((t) => t.type === "expense").forEach((t) => { m[t.cat] = (m[t.cat] || 0) + t.amount; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [inMonth]);

  const dayTxns = selDay ? inMonth.filter((t) => t.date === selDay) : [];

  return (
    <div className="scroll">
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
        <button className="eyebrow" onClick={() => { setOff(off - 1); setSelDay(null); }}
          style={{ padding: "6px 10px 6px 0" }} aria-label="Previous month">←</button>
        <div className="eyebrow">{MONTHS[mo]} {yr}</div>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="eyebrow" onClick={() => { if (off < 0) { setOff(off + 1); setSelDay(null); } }}
            style={{ padding: "6px 8px", opacity: off < 0 ? 1 : 0.25 }} aria-label="Next month">→</button>
          <button className="eyebrow" onClick={onSettings} style={{ padding: "6px 0 6px 6px" }} aria-label="Settings">⋯</button>
        </div>
      </header>

      {txns.length === 0 ? (
        <div style={{ padding: "70px 0", textAlign: "center" }}>
          <div className="mono" style={{ fontSize: 34, color: "var(--dim)" }}><span className="rupee">₹</span>0</div>
          <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 14, lineHeight: 1.6 }}>
            Nothing logged yet.<br />Tap + to add your first spend, or import a CSV from Settings.
          </div>
        </div>
      ) : (
        <>
          <div className="mono" style={{ fontSize: 42, letterSpacing: "-.02em", lineHeight: 1 }}>
            <span className="rupee">₹</span>{money(spent)}
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "baseline", marginTop: 8, marginBottom: 26, fontSize: 12.5, color: "var(--muted)" }}>
            {delta !== null && (
              <span style={{ color: delta > 0 ? "var(--rust)" : "var(--teal)" }}>
                {delta > 0 ? "↑" : "↓"} {Math.abs(delta)}% vs {MONTHS[(mo + 11) % 12].slice(0, 3)}
              </span>
            )}
            {earned > 0 && <span>in <span className="mono" style={{ color: "var(--teal)" }}>₹{money(earned)}</span></span>}
          </div>

          <section style={{ marginBottom: 30 }}>
            <div className="eyebrow" style={{ marginBottom: 11 }}>Daily rhythm</div>
            <div className="rhythm">
              {byDay.map((v, i) => {
                const dIso = `${yr}-${pad(mo + 1)}-${pad(i + 1)}`;
                const dow = new Date(yr, mo, i + 1).getDay();
                const we = dow === 0 || dow === 6;
                return (
                  <button key={i}
                    className={`rbar ${we ? "we" : ""} ${dIso === todayIso ? "today" : ""} ${selDay === dIso ? "sel" : ""} ${dIso > todayIso ? "future" : ""}`}
                    style={{ height: v ? Math.max(4, (v / peak) * 76) : 2 }}
                    onClick={() => setSelDay(selDay === dIso ? null : dIso)}
                    aria-label={`${i + 1} ${MONTHS[mo]}, ${money(v)} rupees`} />
                );
              })}
            </div>
            <div className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "var(--dim)", marginTop: 7 }}>
              <span>1</span><span>{Math.round(days / 2)}</span><span>{days}</span>
            </div>
            <div style={{ marginTop: 9, fontSize: 11, color: "var(--dim)" }}>Brass bars are weekends · tap any day</div>
          </section>

          {selDay && (
            <section className="card" style={{ padding: "13px 15px", marginBottom: 26 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <div className="eyebrow">{relDay(selDay)}</div>
                <button className="eyebrow" onClick={() => setSelDay(null)}>close</button>
              </div>
              {dayTxns.length === 0
                ? <div style={{ fontSize: 13, color: "var(--dim)", padding: "6px 0" }}>Nothing logged.</div>
                : dayTxns.map((t) => <TxnRow key={t.id} t={t} onTap={onTap} />)}
            </section>
          )}

          <section style={{ marginBottom: 30 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Where it went</div>
            {byCat.length === 0
              ? <div style={{ fontSize: 13, color: "var(--dim)" }}>No spending this month yet.</div>
              : byCat.slice(0, 7).map(([id, v]) => <CatBar key={id} id={id} v={v} max={byCat[0][1]} />)}
          </section>

          <section>
            <div className="eyebrow" style={{ marginBottom: 4 }}>Recent</div>
            {inMonth.slice(0, 8).map((t) => <TxnRow key={t.id} t={t} onTap={onTap} showDate />)}
          </section>
        </>
      )}
    </div>
  );
}

function CatBar({ id, v, max, pct }) {
  return (
    <div className="catrow">
      <div style={{ width: 108, fontSize: 12.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{CAT[id]?.name}</div>
      <div className="cattrack"><div className="catfill" style={{ width: `${(v / max) * 100}%`, background: CAT[id]?.c }} /></div>
      <div className="mono" style={{ width: pct !== undefined ? 46 : 62, textAlign: "right", fontSize: 12.5 }}>{money(v)}</div>
      {pct !== undefined && <div className="mono" style={{ width: 32, textAlign: "right", fontSize: 11, color: "var(--dim)" }}>{pct}%</div>}
    </div>
  );
}

function TxnRow({ t, onTap, showDate }) {
  const c = CAT[t.cat];
  return (
    <div className="txn" onClick={() => onTap && onTap(t)} style={{ cursor: onTap ? "pointer" : "default" }}>
      <div className="dot" style={{ background: t.type === "income" ? "var(--teal)" : c?.c }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.note || c?.name}</div>
        <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>
          {c?.name}{showDate ? ` · ${relDay(t.date)}` : ""}
        </div>
      </div>
      <div className="mono" style={{ fontSize: 14, color: t.type === "income" ? "var(--teal)" : "var(--paper)" }}>
        {t.type === "income" ? "+" : ""}{money(t.amount)}
      </div>
    </div>
  );
}

/* ============================================================
   Insights
   ============================================================ */
const PERIODS = [["w","Week"],["m","Month"],["q","Quarter"],["y","Year"]];

function Insights({ txns }) {
  const [p, setP] = useState("m");

  const { cur, prev, buckets, label, span } = useMemo(() => {
    const now = new Date();
    const span = { w: 7, m: 30, q: 91, y: 365 }[p];
    const start = new Date(now); start.setDate(start.getDate() - span + 1);
    const pStart = new Date(start); pStart.setDate(pStart.getDate() - span);
    const exp = txns.filter((t) => t.type === "expense");
    const between = (t, a, b) => { const d = parseISO(t.date); return d >= a && d <= b; };
    const cur = exp.filter((t) => between(t, start, now));
    const prev = exp.filter((t) => between(t, pStart, start));
    const nB = { w: 7, m: 10, q: 13, y: 12 }[p];
    const per = span / nB;
    const buckets = Array(nB).fill(0);
    cur.forEach((t) => {
      const off = Math.floor((parseISO(t.date) - start) / 86400000);
      buckets[Math.min(nB - 1, Math.max(0, Math.floor(off / per)))] += t.amount;
    });
    return { cur, prev, buckets, span,
      label: { w: "last 7 days", m: "last 30 days", q: "last 13 weeks", y: "last 12 months" }[p] };
  }, [txns, p]);

  const total = cur.reduce((s, t) => s + t.amount, 0);
  const pTotal = prev.reduce((s, t) => s + t.amount, 0);
  const delta = pTotal ? Math.round(((total - pTotal) / pTotal) * 100) : null;
  const peak = Math.max(...buckets, 1);

  const byCat = useMemo(() => {
    const m = {};
    cur.forEach((t) => { m[t.cat] = (m[t.cat] || 0) + t.amount; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [cur]);

  return (
    <div className="scroll">
      <div className="eyebrow" style={{ marginBottom: 14 }}>Insights</div>
      <div className="seg" style={{ marginBottom: 24 }}>
        {PERIODS.map(([k, n]) => (
          <button key={k} className={`segbtn ${p === k ? "on" : ""}`} onClick={() => setP(k)}>{n}</button>
        ))}
      </div>

      <div className="mono" style={{ fontSize: 38, letterSpacing: "-.02em", lineHeight: 1 }}>
        <span className="rupee">₹</span>{money(total)}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 8, marginBottom: 26, fontSize: 12.5, color: "var(--muted)" }}>
        <span>{label}</span>
        {delta !== null && <span style={{ color: delta > 0 ? "var(--rust)" : "var(--teal)" }}>{delta > 0 ? "↑" : "↓"} {Math.abs(delta)}%</span>}
        <span><span className="mono">₹{money(Math.round(total / span))}</span>/day</span>
      </div>

      <section style={{ marginBottom: 32 }}>
        <div className="eyebrow" style={{ marginBottom: 11 }}>Trend</div>
        <div className="rhythm" style={{ height: 90, gap: 4 }}>
          {buckets.map((v, i) => (
            <div key={i} className="rbar" style={{ height: Math.max(3, (v / peak) * 90),
              background: i === buckets.length - 1 ? "var(--brass)" : "var(--dim)" }} />
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>By category</div>
        {byCat.length === 0
          ? <div style={{ fontSize: 13, color: "var(--dim)" }}>Nothing in this period.</div>
          : byCat.map(([id, v]) => <CatBar key={id} id={id} v={v} max={byCat[0][1]} pct={Math.round((v / total) * 100)} />)}
      </section>

      <section>
        <div className="eyebrow" style={{ marginBottom: 4 }}>Biggest single spends</div>
        {[...cur].sort((a, b) => b.amount - a.amount).slice(0, 5).map((t) => (
          <TxnRow key={t.id} t={t} showDate />
        ))}
      </section>
    </div>
  );
}

/* ============================================================
   Log
   ============================================================ */
function Log({ txns, onTap }) {
  const [q, setQ] = useState("");
  const [cats, setCats] = useState([]);

  const grouped = useMemo(() => {
    const s = q.trim().toLowerCase();
    const f = txns.filter((t) =>
      (!s || (t.note || "").toLowerCase().includes(s) || CAT[t.cat]?.name.toLowerCase().includes(s)) &&
      (cats.length === 0 || cats.includes(t.cat)));
    const m = {};
    f.forEach((t) => { (m[t.date] ||= []).push(t); });
    return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 120);
  }, [txns, q, cats]);

  const toggle = (id) => setCats((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  return (
    <div className="scroll">
      <div className="eyebrow" style={{ marginBottom: 14 }}>Log</div>
      <input className="inp" placeholder="Search notes and categories" value={q}
        onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
      <div className="hscroll" style={{ paddingBottom: 4, marginBottom: 20 }}>
        {CATS.map((c) => (
          <button key={c.id} className={`chip ${cats.includes(c.id) ? "on" : ""}`}
            style={{ color: cats.includes(c.id) ? c.c : "var(--muted)" }} onClick={() => toggle(c.id)}>
            {c.name}
          </button>
        ))}
      </div>
      {grouped.length === 0 && <div style={{ fontSize: 13, color: "var(--dim)" }}>Nothing matches. Try a different search.</div>}
      {grouped.map(([date, list]) => (
        <section key={date} style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
            <div className="eyebrow">{relDay(date)}</div>
            <div className="mono eyebrow">₹{money(list.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0))}</div>
          </div>
          {list.map((t) => <TxnRow key={t.id} t={t} onTap={onTap} />)}
        </section>
      ))}
    </div>
  );
}

/* ============================================================
   Category picker

   A closed field that opens into a two-column grid of all fourteen.
   Deliberately not a native <select>: on iOS that's a wheel picker,
   which costs a scroll and a Done tap. This stays one tap.
   ============================================================ */
function CategorySelect({ cats, value, onChange }) {
  const [open, setOpen] = useState(false);
  const sel = CAT[value];

  useEffect(() => {
    if (!open) return;
    const esc = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  return (
    <div className="selwrap">
      {open && <div className="backdrop" onClick={() => setOpen(false)} />}

      <button className={`select ${open ? "open" : ""}`} onClick={() => setOpen(!open)}
        aria-haspopup="listbox" aria-expanded={open}>
        <span className="dot" style={{ background: sel?.c, width: 9, height: 9 }} />
        <span>{sel?.name}</span>
        <span className="chev">▼</span>
      </button>

      {open && (
        <div className="dropdown" role="listbox">
          {cats.map((c) => (
            <button key={c.id} className={`opt ${c.id === value ? "on" : ""}`}
              role="option" aria-selected={c.id === value}
              onClick={() => { onChange(c.id); setOpen(false); }}>
              <span className="dot" style={{ background: c.c, width: 8, height: 8 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Entry sheet — add and edit
   ============================================================ */
function EntrySheet({ txn, cats, onSave, onDelete, onClose }) {
  const isEdit = Boolean(txn.id);
  const [amt, setAmt] = useState(isEdit ? String(txn.amount) : "");
  const [type, setType] = useState(txn.type || "expense");
  const [cat, setCat] = useState(txn.cat || cats[0]?.id || "dining");
  const [note, setNote] = useState(txn.note || "");
  const [date, setDate] = useState(txn.date || iso(new Date()));
  const [confirmDel, setConfirmDel] = useState(false);

  const tap = (k) => {
    if (k === "del") return setAmt((a) => a.slice(0, -1));
    if (k === "." && amt.includes(".")) return;
    if (amt.includes(".") && amt.split(".")[1]?.length >= 2) return;
    if (amt.replace(".", "").length >= 8) return;
    setAmt((a) => (a === "0" && k !== "." ? k : a + k));
  };

  const valid = parseFloat(amt) > 0;
  const submit = () => {
    if (!valid) return;
    onSave({ ...(isEdit ? txn : {}), amount: parseFloat(amt), type, cat, note: note.trim(), date });
  };

  const chips = [0, 1, 2].map((o) => { const d = new Date(); d.setDate(d.getDate() - o); return iso(d); });
  if (!chips.includes(date)) chips.push(date);

  return (
    <div className="sheet">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px 6px" }}>
        <button className="eyebrow" onClick={onClose}>Cancel</button>
        <div className="seg" style={{ width: 168 }}>
          <button className={`segbtn ${type === "expense" ? "on" : ""}`} onClick={() => setType("expense")}>Spent</button>
          <button className={`segbtn ${type === "income" ? "on" : ""}`} onClick={() => setType("income")}>Received</button>
        </div>
        <button className="eyebrow" onClick={submit} style={{ color: valid ? "var(--brass)" : "var(--dim)" }}>Save</button>
      </div>

      <div style={{ padding: "24px 18px 12px", textAlign: "center" }}>
        <div className="mono" style={{ fontSize: 48, letterSpacing: "-.03em", lineHeight: 1, color: amt ? "var(--paper)" : "var(--dim)" }}>
          <span className="rupee">₹</span>{amt || "0"}
        </div>
      </div>

      <div className="hscroll" style={{ padding: "0 18px 10px" }}>
        {chips.map((d) => (
          <button key={d} className={`chip ${date === d ? "on" : ""}`}
            style={{ color: date === d ? "var(--brass)" : "var(--muted)" }} onClick={() => setDate(d)}>
            {relDay(d)}
          </button>
        ))}
        <label className={`chip ${!chips.includes(date) ? "on" : ""}`} style={{ color: "var(--muted)", position: "relative" }}>
          Pick date
          <input type="date" value={date} max={iso(new Date())}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            style={{ position: "absolute", inset: 0, opacity: 0, width: "100%" }} />
        </label>
      </div>

      <div style={{ padding: "0 18px 10px" }}>
        <CategorySelect cats={cats} value={cat} onChange={setCat} />
      </div>

      <div style={{ padding: "0 18px 10px" }}>
        <input className="inp" placeholder="What was it for?" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {isEdit && (
        <div style={{ padding: "0 18px 8px", textAlign: "center" }}>
          <button className="eyebrow" onClick={() => (confirmDel ? onDelete(txn.id) : setConfirmDel(true))}
            style={{ color: "var(--rust)", padding: 8 }}>
            {confirmDel ? "Tap again to delete" : "Delete"}
          </button>
        </div>
      )}

      <div style={{ marginTop: "auto", padding: "0 14px calc(14px + env(safe-area-inset-bottom))",
        display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        {["1","2","3","4","5","6","7","8","9",".","0","del"].map((k) => (
          <button key={k} className="key" onClick={() => tap(k)} aria-label={k === "del" ? "Backspace" : k}>
            {k === "del" ? "⌫" : k}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   Settings
   ============================================================ */
function Settings({ txns, onClose, onReplace, onAdd }) {
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
    <div className="sheet">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px" }}>
        <div className="eyebrow">Settings</div>
        <button className="eyebrow" onClick={onClose}>Done</button>
      </div>

      <div style={{ padding: "0 18px", overflowY: "auto" }}>
        <div style={{ padding: "18px 0 24px", borderBottom: "1px solid var(--line)" }}>
          <div className="mono" style={{ fontSize: 26 }}>{txns.length}</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>
            entries · <span className="mono">₹{money(spent)}</span> logged
            {oldest && <> · since {relDay(oldest)}</>}
          </div>
        </div>

        {msg && (
          <div style={{ padding: "12px 0", fontSize: 13, color: "var(--brass)" }}>{msg}</div>
        )}

        <button className="row" onClick={() => fileRef.current?.click()}>
          <div>
            <div>Import CSV</div>
            <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 3 }}>
              Adds to what's here. Negative amounts import as income.
            </div>
          </div>
          <span className="eyebrow">↑</span>
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: "none" }} />

        <button className="row" onClick={download}>
          <div>
            <div>Export CSV</div>
            <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 3 }}>
              Date, Amount, Category, Description, Month, Year
            </div>
          </div>
          <span className="eyebrow">↓</span>
        </button>

        <button className="row" onClick={() => { onAdd(sample()); setMsg("Sample data loaded."); }}>
          <div>
            <div>Load sample data</div>
            <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 3 }}>
              Three months of made-up spending, to see how it looks.
            </div>
          </div>
          <span className="eyebrow">+</span>
        </button>

        <button className="row" onClick={() => (confirm ? (onReplace([]), setConfirm(false), setMsg("Everything erased.")) : setConfirm(true))}
          style={{ color: confirm ? "var(--rust)" : "var(--paper)" }}>
          <div>
            <div>{confirm ? "Tap again to erase everything" : "Start fresh"}</div>
            <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 3 }}>
              Deletes every entry. Export first if you want it.
            </div>
          </div>
          <span className="eyebrow">✕</span>
        </button>

        <div style={{ padding: "26px 0 40px", fontSize: 11.5, color: "var(--dim)", lineHeight: 1.65 }}>
          Everything lives on this device and never leaves it. Nothing is synced,
          so exporting now and then is your only backup — and deleting the app
          takes the data with it.
        </div>
      </div>
    </div>
  );
}
