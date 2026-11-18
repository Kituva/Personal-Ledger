# Paste a Bank Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasting an HDFC UPI "Sent" text message into the description box of a new entry fills in the amount, date, Spent, the payee as description, and the category last used for that payee, and warns when that payment is already logged.

**Architecture:** The rules go in a new pure module, `src/bankmsg.js`, with no React in it, tested with vitest like `search.js`. It reads a message (`readBankMessage`), finds a payee's remembered category (`rememberedCat`) and finds an entry already carrying a reference (`findByRef`). `EntrySheet` in `src/App.jsx` catches the paste and fills its own state. It saves `payee` and `ref` as two extra fields on a new entry. Entries are stored whole in IndexedDB, so no database version change is needed. The Sheet push and the CSV export map named fields only, so neither sees the new ones.

**Tech Stack:** React 18, Vite, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-18-paste-bank-message-design.md`

## Global Constraints

- No new dependencies.
- `src/sync.js`, `toCsv` and the CSV importer in `src/App.jsx` don't change. `payee` and `ref` never reach the Google Sheet or a CSV file.
- The account number (`From HDFC Bank A/C *…`) is never kept.
- **Tests and the manual check use made-up names, amounts, account digits and reference numbers.** The repo is public on GitHub. The user's real messages never go into it.
- Warning copy, verbatim: `Already logged on {D} {Mon} as {description}`, for example `Already logged on 14 Nov as KPN FARM FRESH`. When the entry isn't from the current year, add ` {YYYY}` after the month.
- Colours come only from the existing tokens in `src/styles.css`.
- Commit messages follow the repo's style: a plain sentence with no `feat:` prefix, a body that explains why, and the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` line.
- Work on the `paste-bank-message` branch, never directly on `main`. Pushing `main` deploys.

## Review Focus

1. **A real paste from the iPhone Messages app** can carry blank lines, spaces at the ends of lines, or non-breaking spaces. It must still be read. Tested in Task 1.
2. **A message pasted over something already entered** (an amount, a description or a category) replaces all of them. The category becomes the remembered one, or empty. Checked in Task 3, step 4.
3. **Switching to Received after a paste** clears the category as it does today, and a Received entry never feeds the payee memory. Tested in Task 2, checked in Task 3.
4. **Closing and reopening the app** keeps the memory and the repeat check working, because `payee` and `ref` are saved with the entry. Checked in Task 3, step 4.
5. **Pasting a message while editing an existing entry** goes in as plain text and changes nothing else. Checked in Task 3, step 4.

---

### Task 1: Read an HDFC "Sent" message

**Files:**
- Create: `src/bankmsg.js`
- Test: `src/bankmsg.test.js`

**Interfaces:**
- Produces: `readBankMessage(text: string): { amount: number, date: string, payee: string, ref: string | null } | null`. `date` is `YYYY-MM-DD`. It returns `null` for anything that isn't the message.

- [ ] **Step 1: Create the branch and commit the spec and this plan**

```bash
git checkout -b paste-bank-message
git add docs/superpowers/specs/2026-11-18-paste-bank-message-design.md docs/superpowers/plans/2026-11-18-paste-bank-message.md
git commit -m "Design pasting a bank message into a new entry" -m "Most spending goes out by UPI from one HDFC account, and each payment already arrives as a text with the amount, date and payee. The design and plan for letting that text fill in the entry." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Write the failing tests**

```js
import { describe, it, expect } from "vitest";
import { readBankMessage } from "./bankmsg.js";

/* HDFC's UPI "Sent" layout, with made-up details. */
const msg = ({ amount = "225.00", to = "GREEN LEAF STORES", on = "14/11/26", ref = "600000000001" } = {}) =>
  [
    `Sent Rs.${amount}`,
    "From HDFC Bank A/C *1234",
    `To ${to}`,
    `On ${on}`,
    ...(ref === null ? [] : [`Ref ${ref}`]),
    "Not You?",
    "Call 18002586161/SMS BLOCK UPI to 7308080808",
  ].join("\n");

const READ = { amount: 225, date: "2026-11-14", payee: "GREEN LEAF STORES", ref: "600000000001" };

describe("readBankMessage", () => {
  it("reads the amount, date, payee and reference", () => {
    expect(readBankMessage(msg())).toEqual(READ);
  });

  it("keeps paise and drops commas", () => {
    expect(readBankMessage(msg({ amount: "99.50" })).amount).toBe(99.5);
    expect(readBankMessage(msg({ amount: "1,250.00" })).amount).toBe(1250);
  });

  it("tidies the payee's spaces but keeps its capitals and the bank's cut-off", () => {
    expect(readBankMessage(msg({ to: "RAVI  K " })).payee).toBe("RAVI K");
    expect(readBankMessage(msg({ to: "RAVI  K" })).payee).toBe("RAVI K");
    expect(readBankMessage(msg({ to: "Sri ganesh provision st" })).payee).toBe("Sri ganesh provision st");
  });

  it("reads Windows line breaks, blank lines and spaces around lines", () => {
    expect(readBankMessage(msg().replace(/\n/g, "\r\n"))).toEqual(READ);
    expect(readBankMessage("\n  " + msg().replace(/\n/g, "  \n ") + "\n\n")).toEqual(READ);
  });

  it("reads a four-digit year", () => {
    expect(readBankMessage(msg({ on: "14/11/2026" })).date).toBe("2026-11-14");
  });

  it("still reads a message with no Ref line", () => {
    expect(readBankMessage(msg({ ref: null }))).toEqual({ ...READ, ref: null });
  });

  it("turns down a date that doesn't exist", () => {
    for (const on of ["31/02/26", "14/13/26", "0/11/26"]) {
      expect(readBankMessage(msg({ on }))).toBe(null);
    }
  });

  it("turns down a message missing its amount, payee or date", () => {
    expect(readBankMessage(msg({ amount: "0.00" }))).toBe(null);
    expect(readBankMessage(msg({ to: "" }))).toBe(null);
    expect(readBankMessage(msg().replace(/^To .*$/m, ""))).toBe(null);
    expect(readBankMessage(msg().replace(/^On .*$/m, ""))).toBe(null);
  });

  it("turns down ordinary text, a flattened message and other kinds of message", () => {
    expect(readBankMessage("")).toBe(null);
    expect(readBankMessage("Petrol")).toBe(null);
    expect(readBankMessage(msg().replace(/\n/g, ""))).toBe(null);
    expect(readBankMessage("Received Rs.500.00\nIn HDFC Bank A/C *1234\nFrom SOMEONE\nOn 14/11/26")).toBe(null);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/bankmsg.test.js`
Expected: FAIL, because `./bankmsg.js` doesn't exist.

- [ ] **Step 4: Implement `readBankMessage` in `src/bankmsg.js`**

Open the file with a doc comment in the voice of `search.js`'s: what the message looks like and why a wrong guess is worse than no guess. Split on `/\r?\n/`, trim each line and drop empty ones. Keywords match case-insensitively.

- The **first** line must be `Sent Rs` with an optional `.` and spaces, then `\d[\d,]*` with up to two decimals, and nothing after it. The amount, with commas removed, must be greater than 0.
- `To <payee>`: whitespace runs (`\s+`, which covers non-breaking spaces) become one space, then trim. The payee must not be empty.
- `On DD/MM/YY` or `On DD/MM/YYYY`. A two-digit year means 20YY. Build a local `Date` and reject it unless its day, month and year come back unchanged.
- `Ref <digits>`: the digits as a string, or `null` when the line is missing.

Any missing or unreadable required part returns `null`. The account number line is never read.

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/bankmsg.test.js`
Expected: PASS, 9 tests.

- [ ] **Step 6: Commit**

```bash
git add src/bankmsg.js src/bankmsg.test.js
git commit -m "Read an HDFC UPI message into an amount, date, payee and reference" -m "<body: the layout it reads; why anything uncertain returns null instead of a guess>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Remember a payee's category, and find a payment already logged

**Files:**
- Modify: `src/bankmsg.js`
- Test: `src/bankmsg.test.js`

**Interfaces:**
- Consumes: entries shaped `{ id, amount, type, cat, note, date, payee?, ref? }`. An entry whose `type` isn't `"income"` counts as Spent, matching `src/sync.js`.
- Produces:
  - `rememberedCat(txns: Txn[], payee: string): string | null`, the `cat` of the Spent entry with the latest `date` whose `payee` matches. Payees are compared lowercased with whitespace runs collapsed and trimmed. On a tie in `date`, the earlier entry in `txns` wins, which is the one added most recently. It returns `null` when nothing matches.
  - `findByRef(txns: Txn[], ref: string | null): Txn | null`, the first entry whose `ref` equals `ref`. It returns `null` when `ref` is empty or nothing matches.

- [ ] **Step 1: Write the failing tests** (append to `src/bankmsg.test.js` and extend the import)

```js
const e = (o) => ({ id: "t1", amount: 100, type: "expense", cat: "food", note: "x", date: "2026-11-10", ...o });

describe("rememberedCat", () => {
  it("uses the newest Spent entry pasted from the same payee", () => {
    const txns = [
      e({ id: "a", payee: "GREEN LEAF STORES", cat: "food", date: "2026-11-10" }),
      e({ id: "b", payee: "GREEN LEAF STORES", cat: "groceries", date: "2026-11-14" }),
      e({ id: "c", payee: "RAVI K", cat: "transport", date: "2026-11-16" }),
    ];
    expect(rememberedCat(txns, "GREEN LEAF STORES")).toBe("groceries");
  });

  it("matches payees ignoring capitals and extra spaces", () => {
    expect(rememberedCat([e({ payee: "Ravi  K", cat: "transport" })], "RAVI K")).toBe("transport");
  });

  it("ignores renamed descriptions, hand-typed entries and money received", () => {
    const txns = [
      e({ id: "a", payee: "GREEN LEAF STORES", note: "Vegetables", cat: "groceries", date: "2026-11-01" }),
      e({ id: "b", note: "GREEN LEAF STORES", cat: "food", date: "2026-11-12" }),
      e({ id: "c", payee: "GREEN LEAF STORES", type: "income", cat: "salary", date: "2026-11-14" }),
    ];
    expect(rememberedCat(txns, "GREEN LEAF STORES")).toBe("groceries");
  });

  it("is null for a payee never pasted before", () => {
    expect(rememberedCat([], "GREEN LEAF STORES")).toBe(null);
    expect(rememberedCat([e({ payee: "RAVI K" })], "GREEN LEAF STORES")).toBe(null);
  });
});

describe("findByRef", () => {
  const txns = [e({ id: "a", ref: "600000000001" }), e({ id: "b" })];

  it("finds the entry already carrying a reference", () => {
    expect(findByRef(txns, "600000000001").id).toBe("a");
  });

  it("is null with no reference or no match", () => {
    expect(findByRef(txns, null)).toBe(null);
    expect(findByRef(txns, "600000000999")).toBe(null);
  });
});
```

- [ ] **Step 2: Run the tests to see the new ones fail**

Run: `npx vitest run src/bankmsg.test.js`
Expected: FAIL, because `rememberedCat` and `findByRef` aren't exported.

- [ ] **Step 3: Implement `rememberedCat` and `findByRef` in `src/bankmsg.js`**

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS, every file, including the 6 new tests.

- [ ] **Step 5: Commit**

```bash
git add src/bankmsg.js src/bankmsg.test.js
git commit -m "Remember each payee's category, and spot a payment already logged" -m "<body: memory follows the newest Spent entry from that payee, not its description, so renaming is safe; the reference makes the repeat check exact>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Fill the Add screen from a pasted message

**Files:**
- Modify: `src/App.jsx`: imports (lines 1–12); a `shortDay` helper beside `relDay` (~line 42); `EntrySheet` (~line 1304); the `<EntrySheet>` render in `App` (~line 1742)
- Modify: `src/styles.css`: `.amountwarn` after `.amounthint` (~line 880)
- Modify: `README.md`: a Files row after `src/search.js`, and a `## Pasting a bank message` section after `## Search`

**Interfaces:**
- Consumes: `readBankMessage`, `rememberedCat` and `findByRef` from Tasks 1–2.
- Produces: `EntrySheet({ txn, txns, onSave, onDelete, onClose })`, which gains `txns`. `App` passes its `txns`. `shortDay(dstr: string): string` returns `"14 Nov"`, or `"14 Nov 2025"` outside the current year.

**Behaviour to build** (spec section "What changes for you"):

- `EntrySheet` gains `bank` state, `{ payee, ref } | null`, starting `null`.
- The description `<input>` gets `onPaste`. When `isEdit` is true it does nothing, so the browser pastes as normal. Otherwise it reads `e.clipboardData.getData("text/plain")`. A single-line input strips line breaks, so the text must be read here, not from the box afterwards. If `readBankMessage` returns `null`, it does nothing. Otherwise it calls `e.preventDefault()` and then:
  - sets `amt` to `String(amount)`, `type` to `"expense"`, `date`, `note` to `payee`, and `cat` to `rememberedCat(txns, payee)`, which may be `null`
  - sets `bank` to `{ payee, ref }`
  - closes the category grid and the calendar
  - blurs the input so the keyboard closes
- `submit` on a new entry with `bank` set adds `payee: bank.payee` and, when `bank.ref` isn't null, `ref: bank.ref`. Edits keep spreading `txn`, which already carries both.
- The repeat warning shows when `!isEdit && bank?.ref` and `findByRef(txns, bank.ref)` finds an entry. It goes in `.amount`, below `.amounthint`, as `<span className="amountwarn">`, using the Global Constraints copy with `shortDay(found.date)` and `found.note`. It never disables ✓.
- `.amountwarn`: the same size and weight as `.amounthint` (12.5px, 500), `color: var(--neg)`. The hint and the warning are both visible at once.

- [ ] **Step 1: Add `.amountwarn`, `shortDay`, and the `EntrySheet` and `App` changes**

- [ ] **Step 2: Verify the tests and the build**

Run: `npm test && npm run build`
Expected: all tests pass, and `vite build` finishes writing `dist/` with no errors.

- [ ] **Step 3: Update `README.md`**

Add the Files row `src/bankmsg.js | Reading a pasted HDFC UPI message, and remembering each payee's category.`. Add a `## Pasting a bank message` section of 2–3 short paragraphs in the README's voice. Cover which message it reads, the payee memory, that `payee` and `ref` stay on the device and out of the Sheet and CSV (so a CSV restore starts the memory fresh), and the repeat warning.

- [ ] **Step 4: Check it in the running app**

Run `npm run dev` and open `http://localhost:5173/Personal-Ledger/` at a 390×844 viewport. Paste by focusing the description box, writing the text with `navigator.clipboard.writeText` and pressing Control+V. If clipboard access is refused, dispatch a `paste` `ClipboardEvent` carrying a `DataTransfer` instead. Use made-up messages in the Task 1 layout, dated 14/11/26. Check each of these:

- + then paste a `GREEN LEAF STORES` message for Rs.225.00, ref 600000000001. The sheet shows ₹225, Spent, the date chip `November 14`, the description `GREEN LEAF STORES`, an empty category and the hint `Pick a category`. The box no longer has focus.
- Pick a category and save. Then + and paste a message for `Green leaf  stores` (different capitals and spacing) with a new ref. The same category is already picked and ✓ is enabled.
- + then paste the first message again. `Already logged on 14 Nov as GREEN LEAF STORES` shows in red under the amount, and ✓ still saves.
- Open the first saved entry, rename it to `Vegetables` and save. Paste the first message on a new entry. The warning now says `as Vegetables`, and the category is still remembered.
- On a new entry, type an amount and a description and pick a different category, then paste a message. All three are replaced (Review Focus 2).
- After a paste, switch to Received. The category clears, and ✓ needs a Received category (Review Focus 3).
- Reload the page, then + and paste a `GREEN LEAF STORES` message with a new ref. The category is still remembered (Review Focus 4).
- Paste `Petrol` on a new entry. It lands as text and nothing else changes.
- Open an existing entry and paste a message into its description. It goes in as text, and the amount, date and category are unchanged (Review Focus 5).

Expected: every check holds. Take a screenshot of the filled sheet with the warning for the hand-off. A real copy from the iPhone Messages app can't be checked here. Say so in the hand-off; the user will try it on the installed app once it's deployed.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/styles.css README.md
git commit -m "Fill in a new entry from a pasted bank message" -m "<body: paste into the description box; what fills in; payee and reference kept on the entry but never sent to the Sheet or CSV; why editing an entry pastes as plain text>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
