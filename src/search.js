/**
 * Search, as rules.
 *
 * One box takes whatever you remember about an entry — the date, the amount,
 * the category or a word from the description — without asking which it is.
 * That means guessing what each word is, and the guesses are where this goes
 * quietly wrong: is "12" an amount or a day, is "2025" a year or ₹2,025. So
 * the rules live here, pure, where each of those cases can be tested on its
 * own. Nothing in this file touches React or the database.
 *
 * A query reads into Words. A Word is usually one Token, but a date phrase —
 * "12 oct", "oct 2025", "12 oct 2025" — is one Word of several Tokens that
 * also carries the date they make together.
 *
 *   Token    = { text, amount, date }   text lowercased; amount and date null
 *                                       when the token can't be read as one
 *   Word     = { tokens, date, label }  date set only for a date phrase
 *   DateSpec = { y?, m?, d? }           m is 1–12; absent parts match anything
 */

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_LC = MONTHS.map((m) => m.toLowerCase());

const AMOUNT = /^₹?\d[\d,]*(\.\d+)?$/;
const DMY = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?$/;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

const rupees = (n) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** 1–12 for "oct", "sept", "october"; null for anything shorter than three
    letters or not the start of a month's name. */
function monthOf(s) {
  if (s.length < 3) return null;
  const i = MONTHS_LC.findIndex((m) => m.startsWith(s));
  return i < 0 ? null : i + 1;
}

const validDM = (d, m) => d >= 1 && d <= 31 && m >= 1 && m <= 12;

/** Written-out dates, day first like the CSV importer: 12/10, 12-10-2025,
    and the ISO 2025-10-12. */
function numericDate(s) {
  let r = YMD.exec(s);
  if (r) {
    const [y, m, d] = r.slice(1).map(Number);
    return validDM(d, m) ? { y, m, d } : null;
  }
  r = DMY.exec(s);
  if (r) {
    const d = Number(r[1]); const m = Number(r[2]);
    if (!validDM(d, m)) return null;
    return r[3] ? { y: Number(r[3]), m, d } : { m, d };
  }
  return null;
}

function readToken(text, years) {
  const amount = AMOUNT.test(text) ? Number(text.replace(/[₹,]/g, "")) : null;
  let date = null;
  const m = monthOf(text);
  if (m) date = { m };
  else if (/^\d{4}$/.test(text) && years.has(Number(text))) date = { y: Number(text) };
  else date = numericDate(text);
  return { text, amount, date };
}

/* Only for joining tokens into a date phrase. A day is a bare whole number,
   so "₹12" next to a month stays an amount. */
const isDay = (t) => !!t && /^\d{1,2}$/.test(t.text) && Number(t.text) >= 1 && Number(t.text) <= 31;
const isYear = (t) => !!t && /^\d{4}$/.test(t.text) && Number(t.text) >= 1900 && Number(t.text) <= 2099;
const isMonth = (t) => !!t && monthOf(t.text) !== null;

function dateLabel({ y, m, d }) {
  if (m && !d && !y) return `📅 any ${MONTHS[m - 1]}`;
  if (!m) return `📅 ${y}`;
  return `📅 ${[d, MONTHS[m - 1], y].filter(Boolean).join(" ")}`;
}

function tokenLabel(t) {
  if (t.date && t.amount !== null) return `${dateLabel(t.date)} or ${rupees(t.amount)}`;
  if (t.date) return dateLabel(t.date);
  if (t.amount !== null) return rupees(t.amount);
  return `"${t.text}"`;
}

/**
 * What you typed, as Words.
 *
 * `years` is the set of years you have entries in. A bare four-digit number is
 * read as a year only when it is one of them, so "2000" means ₹2,000 rather
 * than a year with nothing in it.
 */
export function readQuery(text, { years = new Set() } = {}) {
  const t = String(text)
    .toLowerCase()
    .split(/\s+/)
    .map((s) => s.replace(/[,.]+$/, ""))
    .filter(Boolean)
    .map((s) => readToken(s, years));

  const words = [];
  let i = 0;
  while (i < t.length) {
    let j = i + 1;
    let date = null;
    if (isDay(t[i]) && isMonth(t[i + 1])) {
      date = { m: monthOf(t[i + 1].text), d: Number(t[i].text) };
      j = i + 2;
      if (isYear(t[j])) date.y = Number(t[j++].text);
    } else if (isMonth(t[i])) {
      date = { m: monthOf(t[i].text) };
      if (isDay(t[j])) date.d = Number(t[j++].text);
      if (isYear(t[j])) date.y = Number(t[j++].text);
    }
    const tokens = t.slice(i, j);
    if (tokens.length > 1) words.push({ tokens, date, label: dateLabel(date) });
    else words.push({ tokens, date: null, label: tokenLabel(tokens[0]) });
    i = j;
  }
  return words;
}

/* ============================================================
   Matching
   ============================================================ */

function dateMatches(spec, iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return (spec.y === undefined || spec.y === y)
    && (spec.m === undefined || spec.m === m)
    && (spec.d === undefined || spec.d === d);
}

/* `loose` widens an amount to within 10% either side — the second pass, run
   only when the exact one found nothing. */
function tokenMatches(tok, t, byId, loose) {
  const name = (byId[t.cat]?.name ?? "").toLowerCase();
  const note = (t.note ?? "").toLowerCase();
  if (name.includes(tok.text) || note.includes(tok.text)) return true;
  if (tok.amount !== null) {
    const off = Math.abs(t.amount - tok.amount);
    if (loose ? off <= tok.amount * 0.1 : off < 0.005) return true;
  }
  return tok.date !== null && dateMatches(tok.date, t.date);
}

/* A date phrase is tried as the date it makes and, failing that, word by
   word. "oct 25" is the 25th of October — and also an October entry of ₹25,
   which reading it only as a date would hide. */
const wordMatches = (w, t, byId, loose) =>
  (w.date !== null && dateMatches(w.date, t.date))
  || w.tokens.every((tok) => tokenMatches(tok, t, byId, loose));

const run = (txns, words, byId, loose) =>
  txns.filter((t) => words.every((w) => wordMatches(w, t, byId, loose)));

/**
 * The entries every word matches, in the order given.
 *
 * When that is nothing and the search had an amount in it, the amount is
 * loosened to the nearest ones — remembering ₹520 for a ₹500 entry is the
 * common miss. `near` says which amount was loosened, so the screen can say
 * the results aren't exact. Exact always wins: nothing is loosened while
 * anything matches as typed.
 */
export function searchEntries(txns, words, byId) {
  if (!words.length) return { list: [], near: null };
  const list = run(txns, words, byId, false);
  if (list.length) return { list, near: null };
  const amt = words.flatMap((w) => w.tokens).find((tok) => tok.amount !== null);
  if (!amt) return { list, near: null };
  const nearest = run(txns, words, byId, true);
  return { list: nearest, near: nearest.length ? amt.amount : null };
}

/** Money out and money in, kept apart — added together they mean nothing. */
export function totalsOf(list) {
  let spent = 0;
  let received = 0;
  list.forEach((t) => { if (t.type === "income") received += t.amount; else spent += t.amount; });
  return { spent, received };
}
