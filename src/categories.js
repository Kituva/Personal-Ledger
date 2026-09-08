/**
 * Categories, as data.
 *
 * Everything here is pure — no React state, no database — so the rules that
 * are easy to get quietly wrong (what may be deleted, what a CSV row resolves
 * to) can be tested directly. The context at the bottom is the only React in
 * the file, and it holds no logic of its own.
 *
 * A category is `{ id, name, e, c, side, pos }`: `e` is its emoji and `c` its
 * hex colour, short because nine call sites already read them that way. `pos`
 * orders categories within their own side, and nothing is ever sorted by name.
 */

import { createContext, useContext } from "react";

/* The fourteen expense categories are the app's original list, unchanged down
   to their ids — every transaction ever saved points at one of these. */
export const DEFAULT_CATS = [
  { id: "dining", name: "Dining Out", e: "🍽️", c: "#22a7ff", side: "expense", pos: 0 },
  { id: "groceries", name: "Groceries", e: "🛒", c: "#f4555f", side: "expense", pos: 1 },
  { id: "transport", name: "Transportation", e: "🚗", c: "#7c5cff", side: "expense", pos: 2 },
  { id: "subs", name: "Subscriptions", e: "🔁", c: "#a855f7", side: "expense", pos: 3 },
  { id: "utilities", name: "Utilities", e: "💡", c: "#f7c948", side: "expense", pos: 4 },
  { id: "home", name: "Home", e: "🏠", c: "#ff5fa2", side: "expense", pos: 5 },
  { id: "ent", name: "Entertainment", e: "🎬", c: "#f08a4b", side: "expense", pos: 6 },
  { id: "health", name: "Health/medical", e: "💊", c: "#2ecc9b", side: "expense", pos: 7 },
  { id: "travel", name: "Travel", e: "✈️", c: "#38bdf8", side: "expense", pos: 8 },
  { id: "personal", name: "Personal", e: "🧴", c: "#c084fc", side: "expense", pos: 9 },
  { id: "gifts", name: "Gifts/Donations", e: "🎁", c: "#fb7185", side: "expense", pos: 10 },
  { id: "invest", name: "Investments", e: "📈", c: "#4ade80", side: "expense", pos: 11 },
  { id: "debt", name: "Debt", e: "💳", c: "#ef4444", side: "expense", pos: 12 },
  { id: "misc", name: "Miscellaneous", e: "📦", c: "#94a3b8", side: "expense", pos: 13 },

  { id: "salary", name: "Salary", e: "💼", c: "#4ade80", side: "income", pos: 0 },
  { id: "interest", name: "Interest", e: "🏦", c: "#38bdf8", side: "income", pos: 1 },
  { id: "refunds", name: "Refunds", e: "↩️", c: "#a855f7", side: "income", pos: 2 },
  { id: "giftsin", name: "Gifts", e: "🎁", c: "#fb7185", side: "income", pos: 3 },
  { id: "otherin", name: "Other income", e: "💰", c: "#94a3b8", side: "income", pos: 4 },
];

/* Drawn from the fourteen original hues, so a category you add sits in the
   same world as the ones that shipped. */
export const PALETTE = [
  "#22a7ff", "#f4555f", "#7c5cff", "#a855f7", "#f7c948", "#ff5fa2", "#f08a4b",
  "#2ecc9b", "#38bdf8", "#c084fc", "#fb7185", "#4ade80", "#ef4444", "#94a3b8",
];

const DEFAULT_EMOJI = "🏷️";

/** A category's colour at low alpha, for the tile behind its emoji. Moved
    here from App.jsx so the three files that draw a category tile share one
    copy. The calendar also uses it, on --neg and --pos in hex. */
export const tint = (hex, a = 0.16) => {
  const n = parseInt(String(hex).slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/** Prefixed so a generated id can never collide with a default's. */
export const catId = () =>
  `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Whichever palette colour is in least use — free colours first, then the
    least repeated, so a long list keeps as much variety as it can. */
export function nextColour(cats) {
  const count = new Map(PALETTE.map((c) => [c, 0]));
  cats.forEach((c) => {
    if (count.has(c.c)) count.set(c.c, count.get(c.c) + 1);
  });
  let best = PALETTE[0];
  let low = Infinity;
  count.forEach((n, colour) => {
    if (n < low) { low = n; best = colour; }
  });
  return best;
}

export const bySide = (cats, side) =>
  cats.filter((c) => c.side === side).sort((a, b) => a.pos - b.pos);

export function makeCategory({ name, side, cats, e }) {
  const mine = bySide(cats, side);
  return {
    id: catId(),
    name: String(name).trim(),
    e: e || DEFAULT_EMOJI,
    c: nextColour(cats),
    side,
    pos: mine.length ? mine[mine.length - 1].pos + 1 : 0,
  };
}

export function nameAvailable(name, side, cats, exceptId) {
  const want = String(name || "").trim().toLowerCase();
  if (!want) return false;
  return !cats.some(
    (c) => c.side === side && c.id !== exceptId && c.name.toLowerCase() === want
  );
}

const entryCount = (id, txns) => txns.filter((t) => t.cat === id).length;
const plural = (n) => (n === 1 ? "1 entry" : `${n} entries`);

export function canDelete(cat, cats, txns) {
  const n = entryCount(cat.id, txns);
  if (n) {
    return {
      ok: false,
      reason: `${plural(n)} use${n === 1 ? "s" : ""} this category. Move or remove them first.`,
    };
  }
  if (bySide(cats, cat.side).length <= 1) {
    return { ok: false, reason: `This is your last ${cat.side} category. Add another one first.` };
  }
  return { ok: true };
}

/* Flipping a used category would turn money received into money spent without
   touching a single entry, and every total on the Summary screen with it. */
export function canChangeSide(cat, txns) {
  const n = entryCount(cat.id, txns);
  if (n) {
    return {
      ok: false,
      reason: `${plural(n)} use${n === 1 ? "s" : ""} this category, so its type is fixed.`,
    };
  }
  return { ok: true };
}

/**
 * What one CSV row's category name resolves to.
 *
 * `work` is the running category list for a single import — it is mutated as
 * new categories are created, so two rows naming the same new category share
 * one. An unrecognised name is created rather than collapsed into a fallback:
 * the exported CSV is the app's only backup, and an import that cannot restore
 * your own categories would make that backup lossy.
 */
export function resolveImportCategory(rawName, side, work) {
  const want = String(rawName || "").trim();
  const lower = want.toLowerCase();

  if (lower) {
    const hit = work.find((c) => c.side === side && c.name.toLowerCase() === lower);
    if (hit) return { cat: hit, created: null };
    const created = makeCategory({ name: want, side, cats: work });
    work.push(created);
    return { cat: created, created };
  }

  const fallbackName = side === "income" ? "other income" : "miscellaneous";
  const named = work.find((c) => c.side === side && c.name.toLowerCase() === fallbackName);
  return { cat: named || bySide(work, side)[0], created: null };
}

/* ------------------------------------------------------------------
   The context

   Holds no logic — App owns the state and the writes, this just spares
   nine call sites a prop each.
   ------------------------------------------------------------------ */
export const CatsContext = createContext(null);
export const useCats = () => useContext(CatsContext);
