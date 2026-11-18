/**
 * Bank messages, as rules.
 *
 * Every UPI payment from the HDFC account arrives as a text like this:
 *
 *   Sent Rs.225.00
 *   From HDFC Bank A/C *1234
 *   To SOME PAYEE
 *   On 14/11/26
 *   Ref 600000000001
 *   Not You?
 *   Call 18002586161/SMS BLOCK UPI to 7308080808
 *
 * Pasted into a new entry, it fills in the amount, the date and the payee.
 * A wrong guess here is worse than no guess: an amount or date that is
 * quietly off gets saved without anyone looking twice, while a paste that
 * isn't recognised just lands in the box as text. So anything uncertain
 * reads as "not a bank message", and the account number is never read at
 * all. Nothing in this file touches React or the database.
 */

const SENT = /^sent\s+rs\.?\s*(\d[\d,]*(?:\.\d{1,2})?)$/i;
const TO = /^to\s+(.+)$/i;
const ON = /^on\s+(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/i;
const REF = /^ref\s+(\d+)$/i;

const pad = (n) => String(n).padStart(2, "0");

/** YYYY-MM-DD for a day that exists on the calendar, else null. */
function realDate(d, m, y) {
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** The first line matching `re`, as its match, or null. */
const find = (lines, re) => lines.map((l) => re.exec(l)).find(Boolean) || null;

/** HDFC's UPI "Sent" message as { amount, date, payee, ref }, or null for
    anything else. `ref` is null when the message has no Ref line. */
export function readBankMessage(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const sent = SENT.exec(lines[0]);
  if (!sent) return null;
  const amount = Number(sent[1].replace(/,/g, ""));
  if (!(amount > 0)) return null;

  const to = find(lines, TO);
  const payee = to ? to[1].replace(/\s+/g, " ").trim() : "";
  if (!payee) return null;

  const on = find(lines, ON);
  if (!on) return null;
  const y = Number(on[3].length === 2 ? `20${on[3]}` : on[3]);
  const date = realDate(Number(on[1]), Number(on[2]), y);
  if (!date) return null;

  const ref = find(lines, REF);
  return { amount, date, payee, ref: ref ? ref[1] : null };
}

/** How payee names are compared: capitals and spacing don't count. The bank
    cuts long names at the same place every time, so no fuzzier match is
    needed. */
const payeeKey = (s) => String(s).replace(/\s+/g, " ").trim().toLowerCase();

/** The category of the newest Spent entry pasted from this payee, or null.
    Entries are compared by the bank's payee name, kept out of sight on each
    pasted entry, never by the description, so renaming an entry doesn't
    break the memory. On a tie in date, the entry earlier in the list wins:
    the app keeps the most recently added first. */
export function rememberedCat(txns, payee) {
  const key = payeeKey(payee);
  let best = null;
  for (const t of txns) {
    if (!t.payee || t.type === "income" || payeeKey(t.payee) !== key) continue;
    if (!best || t.date > best.date) best = t;
  }
  return best ? best.cat : null;
}

/** The entry already carrying this bank reference, or null. Every payment
    has its own reference, so a match means the payment is already logged. */
export function findByRef(txns, ref) {
  if (!ref) return null;
  return txns.find((t) => t.ref === ref) || null;
}
