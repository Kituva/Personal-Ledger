/**
 * Add or edit one category.
 *
 * Built from the entry sheet's own header — ✕, the type control, ✓ — so it
 * reads as the same app rather than a dialog bolted on. The name and emoji are
 * yours; the colour is assigned, because picking one that works against
 * thirteen others is a job nobody wants.
 */

import React, { useState } from "react";
import { useCats, makeCategory, nameAvailable, canChangeSide, tint, lastGrapheme } from "./categories.js";
import { Check, Close } from "./icons.jsx";

/* Money and daily life, roughly in that order. Anything not here is typed
   into the field below the grid. */
const EMOJI = [
  "💼", "💰", "🏦", "📈", "🪙", "💵",
  "💳", "🧾", "↩️", "🎁", "🎉", "🧧",
  "🤝", "🏠", "🏡", "🔑", "📊", "💎",
  "🍀", "⭐", "🎯", "🏆", "📦", "🏷️",
  "🛒", "🍽️", "☕", "🍕", "🚗", "🚌",
  "⛽", "✈️", "🏥", "💊", "💪", "🎬",
  "🎮", "📚", "🎵", "👕", "🧴", "✂️",
  "🐾", "🌱", "🔧", "📱", "💡", "🔁",
];

export default function CategorySheet({ cat, side, txns, onSave, onClose }) {
  const { cats } = useCats();
  const isEdit = Boolean(cat);

  const [name, setName] = useState(cat?.name || "");
  const [emoji, setEmoji] = useState(cat?.e || "💼");
  const [type, setType] = useState(cat?.side || side || "expense");

  /* An existing category's colour is its own; a new one is previewed with the
     colour it will be given, so the tile above is never a lie. */
  const colour = isEdit
    ? cat.c
    : makeCategory({ name: name || "x", side: type, cats, e: emoji }).c;

  const sideLock = isEdit ? canChangeSide(cat, txns) : { ok: true };

  const missing =
    !name.trim() ? "Give it a name"
    : !nameAvailable(name, type, cats, cat?.id) ? `You already have an ${type} category called that`
    : !emoji ? "Pick an icon"
    : null;
  const valid = !missing;

  const submit = () => {
    if (!valid) return;
    onSave(
      isEdit
        ? { ...cat, name: name.trim(), e: emoji, side: type }
        : makeCategory({ name, side: type, cats, e: emoji })
    );
  };

  return (
    <div className="sheet">
      <div className="grab" />

      <div className="sheettop">
        <button className="iconbtn" onClick={onClose} aria-label="Cancel"><Close /></button>
        <div className="seg" style={{ maxWidth: 210 }}>
          <button className={`segbtn ${type === "income" ? "on" : ""}`}
            disabled={!sideLock.ok}
            onClick={() => sideLock.ok && setType("income")}>Income</button>
          <button className={`segbtn ${type === "expense" ? "on" : ""}`}
            disabled={!sideLock.ok}
            onClick={() => sideLock.ok && setType("expense")}>Expense</button>
        </div>
        <button className="iconbtn" onClick={submit} disabled={!valid}
          aria-label={missing || "Save"} title={missing || "Save"}
          style={valid ? { background: "var(--text)", color: "var(--bg)" } : undefined}><Check /></button>
      </div>

      <div className="catpreview">
        <span className="bigtile" style={{ color: colour, background: tint(colour) }}>{emoji}</span>
        <span style={{ fontSize: 12.5, color: "var(--text3)" }}>
          {missing || sideLock.reason || (isEdit ? "" : "Colour picked for you")}
        </span>
      </div>

      <div style={{ padding: "0 16px 14px" }}>
        <input className="inp" placeholder="Category name" value={name} autoFocus={!isEdit}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      </div>

      <div className="sect" style={{ padding: "0 18px 8px" }}>Icon</div>
      <div className="egrid">
        {EMOJI.map((e) => (
          <button key={e} className={`ekey ${e === emoji ? "on" : ""}`}
            onClick={() => setEmoji(e)} aria-label={`Icon ${e}`}>{e}</button>
        ))}
      </div>

      <div style={{ padding: "0 16px calc(20px + env(safe-area-inset-bottom))" }}>
        <input className="inp" placeholder="…or type any emoji" value={emoji}
          onChange={(e) => setEmoji(lastGrapheme(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      </div>
    </div>
  );
}
