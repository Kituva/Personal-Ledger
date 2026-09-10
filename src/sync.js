/**
 * Pushing every entry to a Google Sheet.
 *
 * A sheet's address is not permission to write to it, so the app talks to a
 * small script published from inside the sheet instead. That script runs as
 * you and does no thinking: it hands back the tag column, or it writes the
 * rows it is given. Everything worth getting wrong lives here, where it can
 * be tested without a network or a Google account.
 *
 * A push always rewrites the whole range. Additions and corrections need no
 * special handling once you do that, so the only thing read back is the tag
 * column — comparing dates and amounts across the round trip is exactly where
 * format and rounding mismatches would invent changes that never happened.
 * The diff exists to report what moved, and to catch a wipe before it lands.
 */

export const PUSH_INTERVAL_DAYS = 10;

export const SHEET_HEADERS = ["Date", "Amount", "Category", "Description", "Month", "Year", "Tag"];

/* The sheet's own copy of the month names. App.jsx has these for headings, but
   this is the CSV format's spelling and the two are free to diverge. */
const MONTHS = ["January","February","March","April","May","June","July","August",
  "September","October","November","December"];

const UNREACHABLE =
  "Couldn't reach the sheet. Check the address, and that the script is published to Anyone.";

const count = (n) => n.toLocaleString("en-IN");
const entries = (n) => `${count(n)} ${n === 1 ? "entry" : "entries"}`;

/**
 * Every entry as a sheet row: Date, Amount, Category, Description, Month, Year, Tag.
 *
 * Columns A–F match the CSV export exactly, down to income being negative and
 * the category written as its name rather than its id. The date goes over as
 * the app's own `YYYY-MM-DD` and the script turns it into a real date — pulling
 * it apart with `Date` here would drag a timezone into a value that has none.
 */
export function toSheetRows(txns, byId) {
  return [...txns]
    // Same-date entries are tie-broken on the tag so two pushes of the same
    // data produce the same sheet. Without it the rows shuffle on every write.
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((t) => {
      const [y, m] = t.date.split("-");
      const signed = t.type === "income" ? -t.amount : t.amount;
      return [
        t.date,
        Number(signed.toFixed(2)),
        byId[t.cat]?.name || "Miscellaneous",
        t.note || "",
        MONTHS[Number(m) - 1],
        Number(y),
        t.id,
      ];
    });
}

/**
 * What the push will change, by tag alone.
 *
 * Matching on date and amount instead would report a corrected amount as a
 * removal plus an addition, which would trip the removal guard every time you
 * fixed a typo. A row typed into the sheet by hand has no tag and counts as a
 * removal, which is right: the app is the record.
 */
export function diffTags(appTags, sheetTags) {
  const inSheet = new Set(sheetTags);
  const inApp = new Set(appTags);
  return {
    added: appTags.filter((t) => !inSheet.has(t)),
    removed: sheetTags.filter((t) => !inApp.has(t)),
  };
}

/**
 * Has it been ten days?
 *
 * Never having pushed counts as due, so a connection set up and then left alone
 * still reaches the sheet. A timestamp in the future means the clock has moved,
 * not that a push is pending — pushing is idempotent, so the safe reading is to
 * go now and reset the clock.
 */
export function dueForPush(lastPushAt, now, days = PUSH_INTERVAL_DAYS) {
  if (!lastPushAt) return true;
  const elapsed = now - lastPushAt;
  return elapsed >= days * 864e5 || elapsed < 0;
}

export function summarise({ added, removed }) {
  if (!added.length && !removed.length) return "Sheet updated.";
  if (!removed.length) return `Sheet updated. ${entries(added.length)} added.`;
  if (!added.length) return `Sheet updated. ${entries(removed.length)} removed.`;
  return `Sheet updated. ${count(added.length)} added, ${count(removed.length)} removed.`;
}

export function confirmText(n) {
  return `${entries(n)} will be removed from the sheet. Push anyway?`;
}

/**
 * Turn a reply into something worth showing.
 *
 * A body that isn't JSON is almost always Google's sign-in page, which is what
 * you get when the script is published to yourself rather than to Anyone. That
 * failure looks identical to a mistyped address, so one message covers both and
 * names the likelier cause.
 */
export function classify(status, bodyText) {
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
  if (status < 200 || status >= 300) return { ok: false, message: UNREACHABLE };
  if (data && data.ok) return { ok: true, data };

  const err = String(data?.error || "");
  if (/code/i.test(err)) {
    return { ok: false, message: "The sheet rejected the push. Check the code in Settings." };
  }
  return { ok: false, message: `The sheet reported a problem: ${err || "unknown"}` };
}

/**
 * The shared secret that stops anyone holding the published address from
 * rewriting the sheet. Generated here so setup is paste-forward: the app makes
 * it, you paste it into the script, and it is already saved on this side.
 */
export function makeCode() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(32);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

/* ============================================================
   The wire
   ============================================================ */

/* Sent as text/plain on purpose. A JSON content type makes the browser ask
   permission first with an OPTIONS request, and an Apps Script web app has no
   way to answer one — the push would fail before it left the device. */
async function call(url, code, payload, fetchImpl) {
  const f = fetchImpl || globalThis.fetch;
  let res;
  try {
    res = await f(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ code, ...payload }),
      redirect: "follow",
    });
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
  try {
    return classify(res.status, await res.text());
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

export const readSheet = (url, code, fetchImpl) =>
  call(url, code, { action: "read" }, fetchImpl);

export const writeSheet = (url, code, rows, fetchImpl) =>
  call(url, code, { action: "write", rows }, fetchImpl);
