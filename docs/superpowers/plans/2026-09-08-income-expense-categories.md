# Income and Expense Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give money coming in its own categories, and give the user a page in Settings where they can add, rename, re-icon and delete categories on either side.

**Architecture:** Categories move from a hardcoded `CATS` array in `src/App.jsx` to a second IndexedDB store seeded with nineteen defaults on a v1→v2 upgrade. A React context replaces the module-level `CATS`/`CAT`/`BY_NAME` constants that nine call sites read today. Two new components — a Categories screen and an add/edit sheet — are added as their own files rather than growing `App.jsx` further. All the rules that are easy to get quietly wrong (delete blocking, side changes, name uniqueness, CSV resolution) live in a pure module with unit tests.

**Tech Stack:** React 18, Vite 5, plain IndexedDB (no wrapper library), Vitest + fake-indexeddb for tests. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-08-income-expense-categories-design.md`

## Global Constraints

- **Category record shape is `{ id, name, e, c, side, pos }`.** `e` is the emoji, `c` is the hex colour. These two short names are deliberate: nine existing call sites already read `c?.e` and `c?.c`, and renaming them would balloon the diff for no gain.
- **`side` is the string `"income"` or `"expense"`** — the same two values `transaction.type` already uses.
- **`pos` orders categories within their own side**, ascending. New categories get `max(pos) + 1` on their side. Never sort by name.
- **Transactions are not touched.** They keep referencing a category by id through `transaction.cat`. No migration of transaction records anywhere in this plan.
- **The fourteen existing expense categories keep their exact ids, names, emoji, colours and relative order.** `dining, groceries, transport, subs, utilities, home, ent, health, travel, personal, gifts, invest, debt, misc`.
- **Income defaults are exactly five:** Salary 💼, Interest 🏦, Refunds ↩️, Gifts 🎁, Other income 💰.
- **"Start fresh" in Settings still clears transactions only.** Categories survive it. Do not add categories to `db.clear()`.
- **No new runtime dependencies.** Vitest and fake-indexeddb are `devDependencies` only.
- **Every commit message ends with:**
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01FaZuKYZ4hZdQVK2DmXTUcg
  ```

---

### Task 1: Test setup and the pure category module

Everything in this task is a pure function with no React and no IndexedDB, which is why it comes first — the rules it encodes are the parts most likely to be got quietly wrong, and every later task depends on them.

**Files:**
- Modify: `package.json`
- Create: `src/categories.js`
- Test: `src/categories.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `DEFAULT_CATS: Array<{id, name, e, c, side, pos}>` — 19 records, 14 expense + 5 income
  - `PALETTE: string[]` — hex colours for auto-assignment
  - `catId(): string` — a fresh unique category id
  - `nextColour(cats: Cat[]): string` — least-used palette colour
  - `makeCategory({name, side, cats, e}): Cat`
  - `bySide(cats: Cat[], side: string): Cat[]` — filtered, sorted by `pos`
  - `nameAvailable(name: string, side: string, cats: Cat[], exceptId?: string): boolean`
  - `canDelete(cat: Cat, cats: Cat[], txns: Txn[]): {ok: boolean, reason?: string}`
  - `canChangeSide(cat: Cat, txns: Txn[]): {ok: boolean, reason?: string}`
  - `resolveImportCategory(rawName: string, side: string, work: Cat[]): {cat: Cat, created: Cat|null}`
  - `tint(hex: string, a?: number): string` — a category colour at low alpha, moved here from `App.jsx`
  - `CatsContext` (React context object), `useCats()` hook

- [ ] **Step 1: Add the test runner**

Vitest reads Vite's config, so no separate test config file is needed.

```bash
npm install -D vitest fake-indexeddb
```

Then add to the `"scripts"` block in `package.json`, after `"preview"`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 2: Write the failing tests**

Create `src/categories.test.js`:

```js
import { describe, it, expect } from "vitest";
import {
  DEFAULT_CATS, PALETTE, makeCategory, nextColour, bySide,
  nameAvailable, canDelete, canChangeSide, resolveImportCategory,
} from "./categories.js";

const expenseSide = () => DEFAULT_CATS.filter((c) => c.side === "expense");
const incomeSide = () => DEFAULT_CATS.filter((c) => c.side === "income");

describe("DEFAULT_CATS", () => {
  it("keeps the original fourteen expense categories, in order", () => {
    expect(expenseSide().map((c) => c.id)).toEqual([
      "dining", "groceries", "transport", "subs", "utilities", "home", "ent",
      "health", "travel", "personal", "gifts", "invest", "debt", "misc",
    ]);
  });

  it("ships exactly five income categories", () => {
    expect(incomeSide().map((c) => c.name)).toEqual([
      "Salary", "Interest", "Refunds", "Gifts", "Other income",
    ]);
  });

  it("numbers pos from zero within each side", () => {
    expect(expenseSide().map((c) => c.pos)).toEqual([...Array(14).keys()]);
    expect(incomeSide().map((c) => c.pos)).toEqual([0, 1, 2, 3, 4]);
  });

  it("gives every category an emoji and a hex colour", () => {
    DEFAULT_CATS.forEach((c) => {
      expect(c.e).toBeTruthy();
      expect(c.c).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  it("allows the same name on both sides", () => {
    const names = DEFAULT_CATS.filter((c) => c.name === "Gifts").map((c) => c.side);
    expect(names.sort()).toEqual(["expense", "income"]);
  });
});

describe("bySide", () => {
  it("returns only that side, sorted by pos", () => {
    const cats = [
      { id: "b", side: "income", pos: 1 },
      { id: "a", side: "income", pos: 0 },
      { id: "x", side: "expense", pos: 0 },
    ];
    expect(bySide(cats, "income").map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("nextColour", () => {
  it("returns an unused palette colour when one is free", () => {
    const used = PALETTE.slice(0, 3).map((c, i) => ({ id: String(i), c }));
    expect(PALETTE.slice(0, 3)).not.toContain(nextColour(used));
  });

  it("falls back to the least-used colour once the palette is exhausted", () => {
    const used = PALETTE.map((c, i) => ({ id: String(i), c }));
    used.push({ id: "extra", c: PALETTE[0] });
    expect(nextColour(used)).toBe(PALETTE[1]);
  });
});

describe("makeCategory", () => {
  it("appends to the end of its own side", () => {
    const made = makeCategory({ name: "Bonus", side: "income", cats: DEFAULT_CATS });
    expect(made.pos).toBe(5);
    expect(made.side).toBe("income");
  });

  it("does not let an expense category's pos affect an income one", () => {
    const made = makeCategory({ name: "Bonus", side: "income", cats: DEFAULT_CATS });
    const expenseMade = makeCategory({ name: "Pets", side: "expense", cats: DEFAULT_CATS });
    expect(made.pos).toBe(5);
    expect(expenseMade.pos).toBe(14);
  });

  it("trims the name and assigns an id and a colour", () => {
    const made = makeCategory({ name: "  Bonus  ", side: "income", cats: DEFAULT_CATS });
    expect(made.name).toBe("Bonus");
    expect(made.id).toBeTruthy();
    expect(PALETTE).toContain(made.c);
  });

  it("takes the given emoji, and falls back to a default", () => {
    expect(makeCategory({ name: "A", side: "income", cats: [], e: "🐖" }).e).toBe("🐖");
    expect(makeCategory({ name: "A", side: "income", cats: [] }).e).toBe("🏷️");
  });
});

describe("nameAvailable", () => {
  it("rejects a duplicate on the same side, ignoring case and padding", () => {
    expect(nameAvailable("  salary ", "income", DEFAULT_CATS)).toBe(false);
  });

  it("allows the same name on the other side", () => {
    expect(nameAvailable("Salary", "expense", DEFAULT_CATS)).toBe(true);
  });

  it("rejects a blank name", () => {
    expect(nameAvailable("   ", "income", DEFAULT_CATS)).toBe(false);
  });

  it("lets a category keep its own name while being edited", () => {
    expect(nameAvailable("Salary", "income", DEFAULT_CATS, "salary")).toBe(true);
  });
});

describe("canDelete", () => {
  const cat = { id: "dining", name: "Dining Out", side: "expense", pos: 0 };

  it("blocks when entries point at it, and counts them", () => {
    const txns = [{ cat: "dining" }, { cat: "dining" }, { cat: "home" }];
    const r = canDelete(cat, DEFAULT_CATS, txns);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("2 entries use this category. Move or remove them first.");
  });

  it("says entry, not entries, when there is one", () => {
    const r = canDelete(cat, DEFAULT_CATS, [{ cat: "dining" }]);
    expect(r.reason).toBe("1 entry uses this category. Move or remove them first.");
  });

  it("blocks deleting the last category on a side", () => {
    const only = { id: "solo", name: "Solo", side: "income", pos: 0 };
    const r = canDelete(only, [only, ...DEFAULT_CATS.filter((c) => c.side === "expense")], []);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("This is your last income category. Add another one first.");
  });

  it("allows it otherwise", () => {
    expect(canDelete(cat, DEFAULT_CATS, []).ok).toBe(true);
  });
});

describe("canChangeSide", () => {
  const cat = { id: "salary", name: "Salary", side: "income", pos: 0 };

  it("blocks once entries use the category", () => {
    const r = canChangeSide(cat, [{ cat: "salary" }]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("1 entry uses this category, so its type is fixed.");
  });

  it("allows it while the category is unused", () => {
    expect(canChangeSide(cat, [{ cat: "dining" }]).ok).toBe(true);
  });
});

describe("resolveImportCategory", () => {
  it("matches an existing category on the right side, ignoring case", () => {
    const work = [...DEFAULT_CATS];
    const r = resolveImportCategory("dining out", "expense", work);
    expect(r.cat.id).toBe("dining");
    expect(r.created).toBe(null);
    expect(work).toHaveLength(19);
  });

  it("does not match across sides", () => {
    const work = [...DEFAULT_CATS];
    const r = resolveImportCategory("Salary", "expense", work);
    expect(r.created).not.toBe(null);
    expect(r.cat.side).toBe("expense");
  });

  it("creates an unrecognised category and appends it to work", () => {
    const work = [...DEFAULT_CATS];
    const r = resolveImportCategory("Freelance", "income", work);
    expect(r.created.name).toBe("Freelance");
    expect(r.created.side).toBe("income");
    expect(work).toHaveLength(20);
  });

  it("creates a name only once across repeated rows", () => {
    const work = [...DEFAULT_CATS];
    const a = resolveImportCategory("Freelance", "income", work);
    const b = resolveImportCategory("freelance", "income", work);
    expect(b.created).toBe(null);
    expect(b.cat.id).toBe(a.cat.id);
    expect(work).toHaveLength(20);
  });

  it("falls back to Miscellaneous for a blank expense name", () => {
    const work = [...DEFAULT_CATS];
    expect(resolveImportCategory("", "expense", work).cat.id).toBe("misc");
    expect(work).toHaveLength(19);
  });

  it("falls back to Other income for a blank income name", () => {
    const work = [...DEFAULT_CATS];
    expect(resolveImportCategory("   ", "income", work).cat.name).toBe("Other income");
  });

  it("falls back to the first remaining category when the usual one is gone", () => {
    const work = DEFAULT_CATS.filter((c) => c.id !== "misc");
    const r = resolveImportCategory("", "expense", work);
    expect(r.cat.id).toBe("dining");
    expect(r.created).toBe(null);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "./categories.js"`.

- [ ] **Step 4: Write the module**

Create `src/categories.js`:

```js
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests in `src/categories.test.js` green.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/categories.js src/categories.test.js
git commit -m "$(cat <<'EOF'
Make categories data, with the rules that guard them

Every rule that is easy to get quietly wrong lives here as a pure
function: what may be deleted, when a category's side is fixed, and what
a CSV row's category name resolves to. Vitest arrives with them, since
the project had no test runner at all.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FaZuKYZ4hZdQVK2DmXTUcg
EOF
)"
```

---

### Task 2: The categories store, and the upgrade to it

The riskiest task in the plan — it runs against a database that already holds the user's real transactions. The tests exist to prove that upgrade is safe.

**Files:**
- Modify: `src/db.js`
- Test: `src/db.test.js`

**Interfaces:**
- Consumes: `DEFAULT_CATS` from Task 1.
- Produces:
  - `getAllCats(): Promise<Cat[]>`
  - `putCat(cat: Cat): Promise<void>`
  - `removeCat(id: string): Promise<void>`
  - `bulkPutCats(list: Cat[]): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `src/db.test.js`:

```js
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { DEFAULT_CATS } from "./categories.js";

/* Each test needs its own database and its own module instance, because db.js
   memoises the open connection in a module-level promise. */
async function freshDb() {
  globalThis.indexedDB = new IDBFactory();
  return import(`./db.js?bust=${Math.random()}`);
}

/** Writes a v1 database by hand — one transactions store, no categories —
    to stand in for an install that predates this feature. */
function seedV1(rows) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("ledger", 1);
    req.onupgradeneeded = (e) => {
      const store = e.target.result.createObjectStore("transactions", { keyPath: "id" });
      store.createIndex("date", "date");
    };
    req.onsuccess = () => {
      const database = req.result;
      const tx = database.transaction("transactions", "readwrite");
      rows.forEach((r) => tx.objectStore("transactions").put(r));
      tx.oncomplete = () => { database.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

describe("categories store", () => {
  beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

  it("seeds the nineteen defaults on a fresh install", async () => {
    const db = await freshDb();
    const cats = await db.getAllCats();
    expect(cats).toHaveLength(19);
    expect(cats.filter((c) => c.side === "income")).toHaveLength(5);
  });

  it("seeds them on an upgrade, leaving existing transactions intact", async () => {
    globalThis.indexedDB = new IDBFactory();
    await seedV1([
      { id: "t1", amount: 260, type: "expense", cat: "dining", note: "Swiggy", date: "2026-09-01" },
      { id: "t2", amount: 900, type: "expense", cat: "groceries", note: "BigBasket", date: "2026-09-02" },
    ]);

    const db = await import(`./db.js?bust=${Math.random()}`);
    const txns = await db.getAll();
    const cats = await db.getAllCats();

    expect(txns.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
    expect(cats).toHaveLength(19);
    expect(cats.find((c) => c.id === "dining").name).toBe("Dining Out");
  });

  it("does not re-seed over edits made after the upgrade", async () => {
    const db = await freshDb();
    const dining = (await db.getAllCats()).find((c) => c.id === "dining");
    await db.putCat({ ...dining, name: "Eating Out" });

    const again = await import(`./db.js?bust=${Math.random()}`);
    expect((await again.getAllCats()).find((c) => c.id === "dining").name).toBe("Eating Out");
  });

  it("writes, updates and removes a category", async () => {
    const db = await freshDb();
    const made = { id: "cX", name: "Freelance", e: "💻", c: "#22a7ff", side: "income", pos: 5 };

    await db.putCat(made);
    expect((await db.getAllCats()).find((c) => c.id === "cX").name).toBe("Freelance");

    await db.putCat({ ...made, name: "Consulting" });
    expect((await db.getAllCats()).find((c) => c.id === "cX").name).toBe("Consulting");

    await db.removeCat("cX");
    expect((await db.getAllCats()).find((c) => c.id === "cX")).toBeUndefined();
  });

  it("bulk-writes categories", async () => {
    const db = await freshDb();
    await db.bulkPutCats([
      { id: "cA", name: "A", e: "🏷️", c: "#22a7ff", side: "income", pos: 5 },
      { id: "cB", name: "B", e: "🏷️", c: "#f4555f", side: "income", pos: 6 },
    ]);
    expect(await db.getAllCats()).toHaveLength(21);
  });

  it("leaves categories alone when the user starts fresh", async () => {
    const db = await freshDb();
    await db.put({ id: "t1", amount: 10, type: "expense", cat: "dining", note: "x", date: "2026-09-01" });

    await db.clear();

    expect(await db.getAll()).toHaveLength(0);
    expect(await db.getAllCats()).toHaveLength(19);
  });

  it("matches the defaults exactly on a fresh install", async () => {
    const db = await freshDb();
    const cats = await db.getAllCats();
    DEFAULT_CATS.forEach((want) => {
      expect(cats.find((c) => c.id === want.id)).toEqual(want);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test src/db.test.js`
Expected: FAIL — `db.getAllCats is not a function`.

- [ ] **Step 3: Add the store to db.js**

In `src/db.js`, replace the three constants near the top:

```js
const DB_NAME = "ledger";
const DB_VERSION = 1;
const STORE = "transactions";
```

with:

```js
import { DEFAULT_CATS } from "./categories.js";

const DB_NAME = "ledger";
/* v2 added the categories store. The upgrade only creates and seeds it —
   transactions are not read, rewritten or migrated, so an existing install
   comes through with every entry exactly as it was. */
const DB_VERSION = 2;
const STORE = "transactions";
const CATS = "categories";
```

Then replace the body of `req.onupgradeneeded`:

```js
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("date", "date");
      }
      /* Seeded inside the upgrade transaction, so a fresh install and an
         upgrade from v1 land in exactly the same state. Guarded by the store's
         own absence, so a later version bump can never re-seed over edits. */
      if (!db.objectStoreNames.contains(CATS)) {
        const store = db.createObjectStore(CATS, { keyPath: "id" });
        DEFAULT_CATS.forEach((c) => store.add(c));
      }
    };
```

- [ ] **Step 4: Generalise `run` and add the category operations**

`run` is hardcoded to the transactions store. Give it a store parameter. Replace:

```js
function run(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
```

with:

```js
function run(mode, fn, name = STORE) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(name, mode);
        const store = tx.objectStore(name);
```

The rest of `run` is unchanged. Then add, directly below the existing `bulkPut` export:

```js
export const getAllCats = () => run("readonly", (s) => s.getAll(), CATS);

export const putCat = (cat) => run("readwrite", (s) => s.put(cat), CATS);

export const removeCat = (id) => run("readwrite", (s) => s.delete(id), CATS);

export const bulkPutCats = (list) =>
  run("readwrite", (s) => { list.forEach((c) => s.put(c)); }, CATS);
```

Leave `clear()` alone — it names no store, so it keeps defaulting to
`transactions`, which is what "Start fresh" should erase.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — both test files green.

- [ ] **Step 6: Commit**

```bash
git add src/db.js src/db.test.js
git commit -m "$(cat <<'EOF'
Store categories in the database, seeded on upgrade

The upgrade to v2 only creates and seeds the new store; it never reads
or rewrites a transaction, so an existing install comes through with
every entry as it was. Tests cover the v1 upgrade path directly, since
that path runs against real data exactly once and cannot be retried.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FaZuKYZ4hZdQVK2DmXTUcg
EOF
)"
```

---

### Task 3: Serve categories from context, with no visible change

Pure plumbing. When this task is done the app must look and behave exactly as it does today — the payoff arrives in later tasks. Doing it on its own means that if something does shift, the cause is unambiguous.

**Files:**
- Modify: `src/App.jsx` (lines 11–28, and the nine call sites listed below)

**Interfaces:**
- Consumes: `useCats`, `CatsContext`, `bySide` from Task 1; `getAllCats`, `putCat`, `removeCat` from Task 2.
- Produces: a context value of
  `{ cats, byId, income, expense, addCat, updateCat, deleteCat }`, where
  `income`/`expense` are arrays sorted by `pos`, `byId` is a plain object keyed
  by category id, and the three mutators are
  `addCat(cat): Promise<void>`, `updateCat(cat): Promise<void>`,
  `deleteCat(id): Promise<void>`.

- [ ] **Step 1: Replace the constants with imports**

In `src/App.jsx`, delete the whole `export const CATS = [...]` block along with
the two lines under it (`const CAT = ...` and `const BY_NAME = ...`), lines
11–28, and its section comment. Replace the import at the top:

```js
import React, { useState, useEffect, useMemo, useRef } from "react";
import * as db from "./db.js";
```

with:

```js
import React, { useState, useEffect, useMemo, useRef } from "react";
import * as db from "./db.js";
import { CatsContext, useCats, bySide, tint } from "./categories.js";
```

Also delete `App.jsx`'s own `const tint = ...` (with its comment, just below the
deleted `CATS` block) — it now comes from the import above, so the three files
that draw a category tile share one copy. Keep `NEG` and `POS` where they are;
they are chart colours, not category data.

- [ ] **Step 2: Hold the category state in App**

In the `App` component, add below `const [txns, setTxns] = useState([]);`:

```js
  const [cats, setCats] = useState([]);
```

Replace the boot effect:

```js
  useEffect(() => {
    db.getAll()
      .then((rows) => {
        rows.sort((a, b) => b.date.localeCompare(a.date));
        setTxns(rows);
      })
      .catch((e) => setError(e.message || "Couldn't open the database."))
      .finally(() => setReady(true));
  }, []);
```

with one that loads both stores together, so the app never renders with
transactions but no categories to draw them with:

```js
  useEffect(() => {
    Promise.all([db.getAll(), db.getAllCats()])
      .then(([rows, catRows]) => {
        rows.sort((a, b) => b.date.localeCompare(a.date));
        setTxns(rows);
        setCats(catRows);
      })
      .catch((e) => setError(e.message || "Couldn't open the database."))
      .finally(() => setReady(true));
  }, []);
```

- [ ] **Step 3: Build the context value and the mutators**

Add above the existing `const save = async (t) => {`:

```js
  const addCat = async (cat) => {
    setCats((p) => [...p, cat]);
    try { await db.putCat(cat); } catch { setError("Couldn't save that category."); }
  };

  const updateCat = async (cat) => {
    setCats((p) => p.map((c) => (c.id === cat.id ? cat : c)));
    try { await db.putCat(cat); } catch { setError("Couldn't save that category."); }
  };

  const deleteCat = async (id) => {
    setCats((p) => p.filter((c) => c.id !== id));
    try { await db.removeCat(id); } catch { setError("Couldn't delete that category."); }
  };

  const catsValue = useMemo(() => ({
    cats,
    byId: Object.fromEntries(cats.map((c) => [c.id, c])),
    income: bySide(cats, "income"),
    expense: bySide(cats, "expense"),
    addCat, updateCat, deleteCat,
  }), [cats]);
```

- [ ] **Step 4: Wrap the tree in the provider**

In `App`'s returned JSX, wrap the outermost `<div className="lg">` — including
the early `if (!ready)` return, so the loading state sits inside the same
provider. Change the early return to:

```js
  if (!ready) {
    return <div className="lg"><div className="scroll"><div className="empty">Loading…</div></div></div>;
  }
```

(unchanged — it renders no category), and wrap only the main return:

```js
  return (
    <CatsContext.Provider value={catsValue}>
      <div className="lg">
        {/* …everything already inside, unchanged… */}
      </div>
    </CatsContext.Provider>
  );
```

- [ ] **Step 5: Point the nine call sites at the context**

Each of these read the deleted constants. Change only the lookup line in each;
leave the surrounding markup alone.

`Filters` — was `const cat = f.catFilter ? CAT[f.catFilter] : null;`:

```js
function Filters({ f, onPick, showCat = true }) {
  const { byId } = useCats();
  const cat = f.catFilter ? byId[f.catFilter] : null;
```

`CatRow` — was `const c = CAT[id];`:

```js
function CatRow({ id, v, n, pct, share, grown, onTap }) {
  const { byId } = useCats();
  const c = byId[id];
```

`TxnRow` — was `const c = CAT[t.cat];`:

```js
function TxnRow({ t, onTap, hideCat }) {
  const { byId } = useCats();
  const c = byId[t.cat];
```

`CategoryDetail` — was `const c = CAT[id];`:

```js
function CategoryDetail({ f, txns, id, onBack, onTap, onPick }) {
  const { byId } = useCats();
  const c = byId[id];
```

`EntrySheet` — was `const sel = cat ? CAT[cat] : null;`. Add the hook at the top
of the component, beside the other state:

```js
  const { expense, income } = useCats();
```

and replace the `sel` line with:

```js
  const sel = cat ? [...expense, ...income].find((c) => c.id === cat) : null;
```

`EntrySheet`'s grid — was `{CATS.map((c) => (`. Leave it rendering every
category for now; Task 4 filters it:

```js
          {[...expense, ...income].map((c) => (
```

`toCsv` and `parseCsv` are module-level functions and cannot call a hook. Give
each a parameter instead. `toCsv(txns)` becomes `toCsv(txns, byId)`, and inside,
`CAT[t.cat]?.name || "Miscellaneous"` becomes `byId[t.cat]?.name || "Miscellaneous"`.
`parseCsv` is rewritten wholesale in Task 7 — for now change only its category
line, adding a `cats` parameter to the signature:

```js
function parseCsv(text, cats) {
```

```js
      cat: cats.find((c) => c.name.toLowerCase() === catName)?.id || "misc",
```

`SettingsScreen` calls both. Add the hook and pass the data through:

```js
function SettingsScreen({ txns, onReplace, onAdd }) {
  const { cats, byId } = useCats();
```

then `toCsv(txns)` becomes `toCsv(txns, byId)`, and
`parseCsv(await file.text())` becomes `parseCsv(await file.text(), cats)`.

The filter picker in `App` — was `options={[{ id: null, name: "All categories" }, ...CATS]}`:

```js
          options={[{ id: null, name: "All categories" }, ...cats]} />
```

- [ ] **Step 6: Verify nothing changed**

Run: `npm test` — Expected: PASS, both files still green.

Run: `npm run dev` and check in the browser:
- The Summary screen lists the same categories with the same colours and emoji.
- The Entries screen shows each entry's category as before.
- Tapping **+** opens the entry sheet; the category grid shows all nineteen
  (fourteen expense then five income — the filtering arrives next task).
- The category filter pill lists all nineteen plus "All categories".
- Settings → Export CSV downloads a file with the same category names as before.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "$(cat <<'EOF'
Read categories from context rather than a constant

No visible change: the same nineteen categories render the same way.
Done on its own so that if anything does shift, there is only one
possible cause.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FaZuKYZ4hZdQVK2DmXTUcg
EOF
)"
```

---

### Task 4: The entry sheet shows the right side's categories

The change that started all of this.

**Files:**
- Modify: `src/App.jsx` (`EntrySheet`)

**Interfaces:**
- Consumes: `useCats` context from Task 3.
- Produces: nothing new.

- [ ] **Step 1: Filter the grid to the chosen side**

In `EntrySheet`, add below the `useCats()` line from Task 3:

```js
  const choices = type === "income" ? income : expense;
```

Replace the `sel` lookup with one that searches only that side:

```js
  const sel = cat ? choices.find((c) => c.id === cat) : null;
```

and the grid's map:

```js
          {choices.map((c) => (
```

- [ ] **Step 2: Clear the category when the type flips**

A category belongs to one side, so the one already picked cannot survive a flip.
Replace the two segmented-control buttons in `EntrySheet`'s `sheettop`:

```js
          <button className={`segbtn ${type === "expense" ? "on" : ""}`} onClick={() => setType("expense")}>Spent</button>
          <button className={`segbtn ${type === "income" ? "on" : ""}`} onClick={() => setType("income")}>Received</button>
```

with:

```js
          <button className={`segbtn ${type === "expense" ? "on" : ""}`}
            onClick={() => { setType("expense"); setCat(null); }}>Spent</button>
          <button className={`segbtn ${type === "income" ? "on" : ""}`}
            onClick={() => { setType("income"); setCat(null); }}>Received</button>
```

The sheet already handles `cat === null`: the tick greys out and the hint under
the amount reads "Pick a category". Nothing else is needed.

- [ ] **Step 3: Guard against a stale category on an edited entry**

If a saved entry's category was deleted, `sel` is `undefined` and the button
falls back to its "Choose a category" state, which is correct. No change needed
— confirm it by reading the `sel ? ... : ...` branch already in the button.

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`
- Tap **+**, leave it on **Spent** — the grid shows the fourteen expense categories only.
- Tap **Received** — the grid shows the five income categories only, and any
  category already picked is cleared with the hint reading "Pick a category".
- Enter an amount, pick **Salary**, add a description, save. The entry appears
  with a green `+₹` amount and the 💼 tile.
- Open Summary, switch the pill to **Income** — the entry appears under Salary.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "$(cat <<'EOF'
Show income categories when an entry is money received

Tapping Received showed the fourteen expense categories, so a salary had
to be filed under Miscellaneous. The grid now follows the toggle, and
flipping it clears the category, which belonged to the side just left.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FaZuKYZ4hZdQVK2DmXTUcg
EOF
)"
```

---

### Task 5: The add/edit sheet

**Files:**
- Create: `src/icons.jsx`
- Create: `src/CategorySheet.jsx`
- Modify: `src/App.jsx` (Icons section, lines 206–301)
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `useCats`, `makeCategory`, `nameAvailable`, `canChangeSide`, `tint` from Tasks 1 and 3.
- Produces:
  - `src/icons.jsx` exporting `Chevron, Arrow, Plus, PieIcon, ListIcon, GearIcon, Backspace, GridIcon, Reset, Check, Trash, Close, More`
  - default export
    `CategorySheet({ cat, side, txns, onSave, onClose })` — `cat` is the category
    being edited or `null` when adding, `side` is the side to start on when
    adding, `onSave(cat)` receives the finished record.

- [ ] **Step 1: Move the icons into their own file**

The new components need `Close`, `Check` and `Chevron`, which live in `App.jsx`.
Importing them from there would be circular — `App.jsx` imports the components
back. So the Icons section moves out.

This is not cosmetic tidying. `src/App.jsx:206` states the reason those marks
are drawn rather than typed: a text `‹` sits on the font's math axis and `⋯` on
the baseline, so neither lands in the optical centre of a round button. Using
text glyphs in the new screens would visibly break that.

Create `src/icons.jsx` and move lines 206–301 of `App.jsx` into it verbatim —
the whole `/* Icons */` comment block through the `Close` component. Add
`export` to each of the twelve components (`Chevron`, `Arrow`, `Plus`,
`PieIcon`, `ListIcon`, `GearIcon`, `Backspace`, `GridIcon`, `Reset`, `Check`,
`Trash`, `Close`). Leave the `svg` helper unexported — it is used only inside
the file. Add the React import at the top:

```jsx
import React from "react";
```

The row menu needs a mark the app does not have yet. Add it at the end of
`src/icons.jsx`, drawn for the same reason as the rest:

```jsx
export const More = () => (
  <svg {...svg({ width: 18, height: 18 })}>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);
```

Then in `App.jsx`, replace the deleted section with an import beside the others:

```js
import {
  Chevron, Arrow, Plus, PieIcon, ListIcon, GearIcon,
  Backspace, GridIcon, Reset, Check, Trash, Close,
} from "./icons.jsx";
```

Verify before moving on — this touches every screen:

Run: `npm run build`
Expected: build succeeds. Then `npm run dev` and confirm the bottom bar's three
icons, the **+** button, the entry sheet's ✕ and ✓, and the chevrons on the
Settings rows all still render.

- [ ] **Step 2: Add the styles**

Append to `src/styles.css`:

```css
/* ============================================================
   Categories

   The emoji grid is the keypad's shape at a smaller gauge, and the row
   menu borrows the picker sheet's card. Selection is the same white
   ring used everywhere else a thing is chosen.
   ============================================================ */
.catsec {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text3);
  margin: 18px 6px 8px;
}
.catsec .n {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--surface3);
}

.catmanage {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 13px;
  width: 100%;
  padding: 8px 9px;
  border-radius: var(--r-card);
  text-align: left;
}
.catmanage.open {
  background: var(--surface);
}
.catdots {
  color: var(--text3);
  font-size: 18px;
  letter-spacing: 1px;
  padding: 0 6px;
}
.catmanage.open .catdots {
  color: var(--text);
}

.catmenu {
  margin: 4px 9px 8px 62px;
  background: var(--surface2);
  border: 1px solid var(--surface3);
  border-radius: 16px;
  overflow: hidden;
  animation: drop 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.catmenu button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 15px;
  font-size: 14.5px;
  font-weight: 500;
  text-align: left;
}
.catmenu button + button {
  border-top: 1px solid var(--surface3);
}
.catmenu button.del {
  color: var(--neg);
}
.catmenu button:disabled {
  color: var(--text3);
  cursor: default;
}
.catmenu .why {
  font-size: 11.5px;
  color: var(--text3);
  padding: 0 15px 12px;
  line-height: 1.45;
}

.addcat {
  display: flex;
  align-items: center;
  gap: 13px;
  width: 100%;
  padding: 8px 9px;
  color: var(--text2);
  font-size: 15px;
  font-weight: 500;
  text-align: left;
}
.addcat .plus {
  width: 36px;
  height: 36px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  border: 2px dashed var(--surface3);
  color: var(--text3);
  font-size: 19px;
  flex-shrink: 0;
}

/* The big tile above the name field: the icon and its auto-assigned colour
   together, so the result is visible before it is saved. */
.catpreview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  padding: 22px 0 16px;
}
.bigtile {
  width: 62px;
  height: 62px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  font-size: 30px;
  line-height: 1;
  border: 2px solid currentColor;
}

.egrid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
  padding: 0 16px 12px;
  max-height: 30vh;
  overflow-y: auto;
  scrollbar-width: none;
}
.egrid::-webkit-scrollbar {
  display: none;
}
.ekey {
  aspect-ratio: 1;
  border-radius: 13px;
  background: var(--surface);
  display: grid;
  place-items: center;
  font-size: 20px;
  border: 1.5px solid transparent;
  transition: 0.15s;
}
.ekey.on {
  background: var(--sel-wash);
  border-color: var(--sel);
}
```

- [ ] **Step 3: Write the sheet**

Create `src/CategorySheet.jsx`:

```jsx
/**
 * Add or edit one category.
 *
 * Built from the entry sheet's own header — ✕, the type control, ✓ — so it
 * reads as the same app rather than a dialog bolted on. The name and emoji are
 * yours; the colour is assigned, because picking one that works against
 * thirteen others is a job nobody wants.
 */

import React, { useState } from "react";
import { useCats, makeCategory, nameAvailable, canChangeSide, tint } from "./categories.js";
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
          onChange={(e) => setEmoji([...e.target.value].slice(-1)[0] || "")}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      </div>
    </div>
  );
}
```

The type-your-own field takes the **last** character typed rather than the whole
string, so a phone's emoji keyboard leaves one emoji behind instead of a
growing row. `[...string]` splits by code point, so a multi-byte emoji survives.

- [ ] **Step 4: Verify it renders**

The sheet has no route yet — Task 6 opens it. Confirm only that the app still
builds:

Run: `npm run build`
Expected: build succeeds with no unresolved imports.

- [ ] **Step 5: Commit**

```bash
git add src/icons.jsx src/CategorySheet.jsx src/App.jsx src/styles.css
git commit -m "$(cat <<'EOF'
Add the sheet for creating and editing a category

Reuses the entry sheet's header so it reads as the same app. The emoji
grid covers the common cases and the field beneath it covers everything
else; the colour is assigned rather than asked for.

The icons move to their own file on the way, because the new screens
need three of them and importing from App.jsx would be circular. They
stay drawn rather than typed, for the reason their own comment gives.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FaZuKYZ4hZdQVK2DmXTUcg
EOF
)"
```

---

### Task 6: The Categories screen, reached from Settings

**Files:**
- Create: `src/CategoriesScreen.jsx`
- Modify: `src/App.jsx` (`SettingsScreen`, and `App`'s screen routing)

**Interfaces:**
- Consumes: `useCats`, `canDelete`, `tint` from Tasks 1 and 3; `CategorySheet` and the icons from Task 5.
- Produces: default export
  `CategoriesScreen({ txns, onBack })`.

- [ ] **Step 1: Write the screen**

Create `src/CategoriesScreen.jsx`:

```jsx
/**
 * Every category, in two sections, with a ⋯ on each row.
 *
 * Income first, because it is the shorter list and the reason this screen
 * exists. Order within a section is `pos`, never name — the grid you pick from
 * every day is this same order, and it should not rearrange itself.
 */

import React, { useState } from "react";
import { useCats, canDelete, tint } from "./categories.js";
import { Chevron, More, Plus } from "./icons.jsx";
import CategorySheet from "./CategorySheet.jsx";

function Section({ side, label, list, txns, onEdit, onAdd }) {
  const { cats, deleteCat } = useCats();
  const [open, setOpen] = useState(null);

  return (
    <>
      <div className="catsec">{label} <span className="n">{list.length}</span></div>

      {list.map((c) => {
        const del = canDelete(c, cats, txns);
        const isOpen = open === c.id;
        return (
          <div key={c.id}>
            <button className={`catmanage ${isOpen ? "open" : ""}`}
              onClick={() => setOpen(isOpen ? null : c.id)}
              aria-expanded={isOpen} aria-label={`${c.name} options`}>
              <span className="tile sm" style={{ color: c.c, background: tint(c.c) }}>{c.e}</span>
              <span className="catname">{c.name}</span>
              <span className="catdots"><More /></span>
            </button>

            {isOpen && (
              <div className="catmenu">
                <button onClick={() => { setOpen(null); onEdit(c); }}>Rename or re-icon</button>
                <button className={del.ok ? "del" : ""} disabled={!del.ok}
                  onClick={() => { if (del.ok) { setOpen(null); deleteCat(c.id); } }}>
                  Delete
                </button>
                {!del.ok && <div className="why">{del.reason}</div>}
              </div>
            )}
          </div>
        );
      })}

      <button className="addcat" onClick={() => onAdd(side)}>
        <span className="plus"><Plus /></span>Add {label.toLowerCase()} category
      </button>
    </>
  );
}

export default function CategoriesScreen({ txns, onBack }) {
  const { income, expense, addCat, updateCat } = useCats();
  const [sheet, setSheet] = useState(null);

  const onEdit = (cat) => setSheet({ cat, side: cat.side });
  const onAdd = (side) => setSheet({ cat: null, side });

  const onSave = (cat) => {
    (sheet.cat ? updateCat : addCat)(cat);
    setSheet(null);
  };

  return (
    <div className="scroll">
      <div className="navrow">
        <button className="iconbtn" onClick={onBack} aria-label="Back"><Chevron dir="left" /></button>
        <span className="navtitle">Categories</span>
        <span style={{ width: 40 }} />
      </div>

      <Section side="income" label="Income" list={income}
        txns={txns} onEdit={onEdit} onAdd={onAdd} />
      <Section side="expense" label="Expenses" list={expense}
        txns={txns} onEdit={onEdit} onAdd={onAdd} />

      <div style={{ padding: "18px 4px 20px", fontSize: 12.5, color: "var(--text3)", lineHeight: 1.65 }}>
        A category belongs to one side or the other. Deleting one is blocked
        while entries still use it — change those entries first.
      </div>

      {sheet && (
        <CategorySheet cat={sheet.cat} side={sheet.side} txns={txns}
          onSave={onSave} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the Settings row that opens it**

In `src/App.jsx`, add the import beside the others:

```js
import CategoriesScreen from "./CategoriesScreen.jsx";
```

Give `SettingsScreen` a way to signal the jump. Change its signature:

```js
function SettingsScreen({ txns, onReplace, onAdd, onCategories }) {
```

and add a new section above the existing `<div className="sect">Your data</div>`:

```jsx
      <div className="sect">Setup</div>
      <div className="setcard">
        <button className="row" onClick={onCategories}>
          <span>
            Categories
            <span className="rowsub" style={{ display: "block" }}>
              Add, rename and delete the categories you file entries under.
            </span>
          </span>
          <Chevron dir="right" size={16} />
        </button>
      </div>
```

- [ ] **Step 3: Route to the screen**

In `App`, add the state beside the other screen state:

```js
  const [showCats, setShowCats] = useState(false);
```

Add `showCats` to the scroll-reset effect's dependency array, so opening and
closing the screen starts at the top:

```js
  useEffect(() => { window.scrollTo(0, 0); }, [tab, drill, period, off, kind, catFilter, showCats]);
```

Replace the screen-routing block:

```jsx
      {drill ? (
        <CategoryDetail f={f} txns={txns} id={drill} onBack={() => setDrill(null)}
          onTap={setEditing} onPick={setPicker} />
      ) : (
```

with one that puts the Categories screen ahead of the tabs:

```jsx
      {showCats ? (
        <CategoriesScreen txns={txns} onBack={() => setShowCats(false)} />
      ) : drill ? (
        <CategoryDetail f={f} txns={txns} id={drill} onBack={() => setDrill(null)}
          onTap={setEditing} onPick={setPicker} />
      ) : (
```

Pass the handler down:

```jsx
          {tab === "settings" && (
            <SettingsScreen txns={txns} onReplace={replaceAll} onAdd={addMany}
              onCategories={() => setShowCats(true)} />
          )}
```

And make the bottom-bar buttons leave the screen, so tapping a tab from
Categories goes where it says. In the `TABS.map` button's `onClick`:

```jsx
              onClick={() => { setDrill(null); setShowCats(false); setTab(k); }}
```

The `navbtn` `on` class should also account for the new screen, so no tab looks
selected while Categories is open:

```jsx
            <button key={k} className={`navbtn ${!drill && !showCats && tab === k ? "on" : ""}`}
              onClick={() => { setDrill(null); setShowCats(false); setTab(k); }}
              aria-current={!drill && !showCats && tab === k ? "page" : undefined}>
```

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`, then Settings → Categories:
- Income lists five, Expenses lists fourteen, each with a count in its header.
- Tapping a row opens the ⋯ menu; tapping it again closes it.
- **Delete** on a category with entries is greyed with the count spelled out.
- **Delete** on an unused category removes it, and it disappears from the entry
  sheet's grid too.
- **Rename or re-icon** opens the sheet with the current name and emoji filled
  in, and the type control disabled if the category has entries.
- Adding from the Income section opens the sheet already on Income; saving puts
  the new category at the bottom of the Income list, with a colour assigned.
- Naming a new category "Salary" on the Income side greys out the tick and the
  hint reads "You already have an income category called that".
- The back arrow returns to Settings, and tapping a bottom-bar tab leaves the
  screen entirely.

- [ ] **Step 5: Commit**

```bash
git add src/CategoriesScreen.jsx src/App.jsx
git commit -m "$(cat <<'EOF'
Add the Categories screen, reached from Settings

Income first, then expenses, each row carrying its own menu. Deleting is
blocked while entries point at a category and says how many, rather than
orphaning them or forcing a reassignment flow.

A row in Settings rather than a fourth tab: the bottom bar is the app's
most valuable space, and this is a screen used heavily for a week and
then rarely.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FaZuKYZ4hZdQVK2DmXTUcg
EOF
)"
```

---

### Task 7: CSV import creates categories it does not recognise

**Files:**
- Modify: `src/App.jsx` (`parseCsv`, `SettingsScreen`)
- Modify: `src/categories.test.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: `resolveImportCategory` from Task 1; `addCat` from Task 3.
- Produces: `parseCsv(text, cats): { rows, skipped, newCats }` — `newCats` is
  the list of categories that must be saved before `rows`.

- [ ] **Step 1: Write the failing test**

`parseCsv` lives in `App.jsx` and is not exported. Export it so it can be
tested — add `export` to its declaration:

```js
export function parseCsv(text, cats) {
```

Then append to `src/categories.test.js`:

```js
import { parseCsv } from "./App.jsx";

describe("parseCsv", () => {
  const header = "Date,Amount,Category,Description\n";

  it("routes a negative amount to the income side", () => {
    const { rows } = parseCsv(header + '"01-09-2026","-132000","Salary","September"', DEFAULT_CATS);
    expect(rows[0].type).toBe("income");
    expect(rows[0].cat).toBe("salary");
    expect(rows[0].amount).toBe(132000);
  });

  it("routes a positive amount to the expense side", () => {
    const { rows } = parseCsv(header + '"01-09-2026","260","Dining Out","Swiggy"', DEFAULT_CATS);
    expect(rows[0].type).toBe("expense");
    expect(rows[0].cat).toBe("dining");
  });

  it("creates a category the list does not have, and reports it", () => {
    const { rows, newCats } = parseCsv(
      header + '"01-09-2026","-5000","Freelance","Website"', DEFAULT_CATS);
    expect(newCats).toHaveLength(1);
    expect(newCats[0].name).toBe("Freelance");
    expect(newCats[0].side).toBe("income");
    expect(rows[0].cat).toBe(newCats[0].id);
  });

  it("creates a repeated new name only once", () => {
    const { rows, newCats } = parseCsv(
      header +
      '"01-09-2026","-5000","Freelance","Website"\n' +
      '"02-09-2026","-2000","freelance","Logo"', DEFAULT_CATS);
    expect(newCats).toHaveLength(1);
    expect(rows[0].cat).toBe(rows[1].cat);
  });

  it("falls back rather than creating when the name is blank", () => {
    const { rows, newCats } = parseCsv(header + '"01-09-2026","260","","Something"', DEFAULT_CATS);
    expect(newCats).toHaveLength(0);
    expect(rows[0].cat).toBe("misc");
  });

  it("still skips rows with no usable date or amount", () => {
    const { rows, skipped } = parseCsv(
      header +
      '"not a date","260","Dining Out","x"\n' +
      '"01-09-2026","0","Dining Out","y"\n' +
      '"01-09-2026","260","Dining Out","z"', DEFAULT_CATS);
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `newCats` is undefined, and the income row resolves to `misc`.

- [ ] **Step 3: Rewrite parseCsv**

Replace the body of `parseCsv` in `src/App.jsx`. Update its doc comment too —
the old one describes behaviour that is changing:

```js
/**
 * Reads the Expenses001 column order: Date, Amount, Category, Description.
 * A negative amount is treated as income. Rows without a usable date or
 * amount are counted as skipped rather than silently dropped.
 *
 * A category name the list does not have is created rather than collapsed
 * into a fallback — the exported CSV is this app's only backup, and an import
 * that could not restore your own categories would make that backup lossy.
 * Returned in `newCats`, which the caller must save before the rows.
 */
export function parseCsv(text, cats) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], skipped: 0, newCats: [] };

  let start = 0;
  const head = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  if (head.includes("date") || head.includes("amount")) start = 1;

  /* Mutated as categories are created, so two rows naming the same new
     category share one rather than creating it twice. */
  const work = [...cats];
  const newCats = [];

  const rows = [];
  let skipped = 0;
  for (let i = start; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]);
    const date = readDate(c[0]);
    const raw = parseFloat((c[1] || "").replace(/[₹,\s]/g, ""));
    if (!date || !isFinite(raw) || raw === 0) { skipped++; continue; }

    const side = raw < 0 ? "income" : "expense";
    const { cat, created } = resolveImportCategory(c[2], side, work);
    if (created) newCats.push(created);

    rows.push({
      id: uid(),
      amount: Math.abs(raw),
      type: side,
      cat: cat.id,
      note: c[3] || "",
      date,
    });
  }
  return { rows, skipped, newCats };
}
```

Add `resolveImportCategory` to the import from `./categories.js` at the top of
`App.jsx`:

```js
import { CatsContext, useCats, bySide, resolveImportCategory } from "./categories.js";
```

- [ ] **Step 4: Save the new categories before the rows**

In `SettingsScreen`, replace `onFile`:

```js
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { rows, skipped, newCats } = parseCsv(await file.text(), cats);
      if (!rows.length) { setMsg("No usable rows found. Expected Date, Amount, Category, Description."); return; }
      /* Categories first — a row saved before the category it points at would
         render with no name and no colour until the next reload. */
      for (const c of newCats) await onAddCat(c);
      await onAdd(rows);
      setMsg(
        `Imported ${rows.length} entries` +
        `${newCats.length ? `, added ${newCats.length} ${newCats.length === 1 ? "category" : "categories"}` : ""}` +
        `${skipped ? `, skipped ${skipped}` : ""}.`
      );
    } catch {
      setMsg("Couldn't read that file.");
    } finally {
      e.target.value = "";
    }
  };
```

`onAddCat` comes from the context rather than a prop — update the hook line at
the top of `SettingsScreen`:

```js
  const { cats, byId, addCat: onAddCat } = useCats();
```

Update the Import row's subtitle, which no longer tells the whole story:

```jsx
            <span className="rowsub" style={{ display: "block" }}>
              Adds to what's here. Negative amounts import as income, and
              unknown categories are created.
            </span>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all three files green.

- [ ] **Step 6: Update the README**

`README.md` describes the old matching behaviour under "The CSV format". Replace
this paragraph (lines 53–55):

```markdown
Dates in `DD-MM-YYYY`, `DD/MM/YYYY` or `YYYY-MM-DD` all work. A negative
amount imports as income. Category names are matched against the fourteen
below; anything unrecognised lands in Miscellaneous.
```

with:

```markdown
Dates in `DD-MM-YYYY`, `DD/MM/YYYY` or `YYYY-MM-DD` all work. A negative amount
imports as income, and that sign also decides which half of the category list
the name is matched against — an income row never matches an expense category.

A name that matches nothing on its side is **created** as a new category, and
the import summary says how many it made. That is deliberate: an export is the
only backup there is, so an import that couldn't restore your own categories
would quietly lose them. The cost is that a typo in a hand-edited sheet becomes
a category you have to go and delete. A blank category cell falls back to
Miscellaneous, or Other income on a negative amount.
```

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev`
- Settings → Export CSV, then Import that same file. It reports entries
  imported and no categories added, because every name already matches.
- Hand-edit the exported CSV: change one category name to `Freelance` and make
  its amount negative. Import it. The summary says one category was added,
  Categories shows Freelance at the bottom of Income, and the entry carries it.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx src/categories.test.js README.md
git commit -m "$(cat <<'EOF'
Create categories an import does not recognise

The exported CSV is this app's only backup. Now that categories are
yours to define, collapsing an unrecognised name into Miscellaneous
would make that backup lossy — export ten custom categories, reinstall,
get them all back as one. The import summary reports what it created, so
a typo in a hand-edited sheet is visible rather than silent.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FaZuKYZ4hZdQVK2DmXTUcg
EOF
)"
```

---

### Task 8: Sample data, and the filter picker

Two small loose ends that both stem from categories no longer being a fixed
list. Grouped because neither is worth its own review cycle.

**Files:**
- Modify: `src/App.jsx` (`sample`, and the `picker === "cat"` block)

**Interfaces:**
- Consumes: `bySide` from Task 1; the context from Task 3.
- Produces: `sample(cats): Txn[]` — was `sample()`.

- [ ] **Step 1: Make the generator respect the current categories**

`sample()` is keyed to the original fourteen ids and files its salary under
`misc`. If a category has been deleted it would produce entries pointing at
nothing. Replace the function:

```js
/**
 * Three months of plausible spending. Keyed to the default ids, so it filters
 * its pool to whatever still exists — a category you deleted must not come
 * back as an entry pointing at nothing.
 */
function sample(cats) {
  const has = new Set(cats.map((c) => c.id));
  const pool = [];
  Object.entries(WEIGHTS).forEach(([k, w]) => {
    if (!has.has(k)) return;
    for (let i = 0; i < w; i++) pool.push(k);
  });
  if (!pool.length) return [];

  /* Salary if it is still there, otherwise whatever the income side starts
     with — the demo should show money coming in either way. */
  const incomeCat = has.has("salary") ? "salary" : bySide(cats, "income")[0]?.id;

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
    if (d.getDate() === 3 && has.has("home")) out.push({ id: uid(), amount: 28000, type: "expense", cat: "home", note: "Rent", date: iso(d) });
    if (d.getDate() === 5 && has.has("invest")) out.push({ id: uid(), amount: 10000, type: "expense", cat: "invest", note: "SIP", date: iso(d) });
    if (d.getDate() === 1 && incomeCat) out.push({ id: uid(), amount: 132000, type: "income", cat: incomeCat, note: "Salary", date: iso(d) });
  }
  return out;
}
```

Update its one caller in `SettingsScreen`:

```jsx
        <button className="row" onClick={() => { onAdd(sample(cats)); setMsg("Sample data loaded."); }}>
```

- [ ] **Step 2: Filter the category picker to the current kind**

The filter sheet lists all nineteen, but the other side's categories can never
match anything while that kind is being viewed. In `App`, replace:

```jsx
      {picker === "cat" && (
        <PickerSheet title="Category" value={catFilter} onClose={() => setPicker(null)}
          onPick={setCatFilter}
          options={[{ id: null, name: "All categories" }, ...cats]} />
      )}
```

with:

```jsx
      {picker === "cat" && (
        <PickerSheet title="Category" value={catFilter} onClose={() => setPicker(null)}
          onPick={setCatFilter}
          options={[{ id: null, name: "All categories" }, ...bySide(cats, kind)]} />
      )}
```

A category filter set on one side has to be dropped when the kind flips, or the
screen silently shows nothing. In `Filters`, replace the kind pill's `onClick`:

```jsx
      <button className="pill" onClick={() => f.setKind(f.kind === "expense" ? "income" : "expense")}>
```

with:

```jsx
      <button className="pill" onClick={() => {
        f.setKind(f.kind === "expense" ? "income" : "expense");
        f.setCatFilter(null);
      }}>
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`
- Settings → Load sample data. Entries appear across three months, and the
  Summary's Income view shows a monthly salary under Salary rather than
  Miscellaneous.
- Delete an unused expense category, then load sample data again — no entry
  points at the deleted category and nothing renders blank.
- On Summary, open the category filter while viewing Expenses: only expense
  categories are listed. Switch the pill to Income: the filter resets to "All
  categories" and now lists only income ones.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "$(cat <<'EOF'
Keep sample data and the filter inside the categories that exist

The generator was keyed to the original fourteen ids and filed its
salary under Miscellaneous; it now skips any it no longer finds and uses
the income side. The category filter lists only the kind on screen, and
resets when that kind changes rather than silently matching nothing.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FaZuKYZ4hZdQVK2DmXTUcg
EOF
)"
```

---

### Task 9: Documentation and a full pass

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Bring the README in line**

Four edits, all in `README.md`.

**a. The command block (lines 6–10)** — add the test script:

```markdown
npm install
npm run dev        # http://localhost:5173/Personal-Ledger/
npm run build      # -> dist/
npm test           # the category rules and the CSV importer
```

**b. The Files table (lines 40–45)** — it lists four files and calls the
database single-store. Replace the table body with:

```markdown
| `src/App.jsx` | Most screens — Summary, Entries, Settings, category detail, entry sheet. |
| `src/categories.js` | Categories as data: the defaults, and the rules about what may be renamed, deleted or re-sided. |
| `src/CategoriesScreen.jsx` | The Categories screen, reached from Settings. |
| `src/CategorySheet.jsx` | Add or edit one category. |
| `src/icons.jsx` | The drawn icons, shared by every screen. |
| `src/db.js` | IndexedDB wrapper. Two stores, no dependencies. |
| `src/styles.css` | All styling. |
| `vite.config.js` | Manifest and service worker via `vite-plugin-pwa`. |
```

**c. The Categories section (lines 105–113)** — replace it entirely. Both of its
claims are now wrong: the set is not fixed, and the picker has never ordered by
frequency (it renders them in list order).

```markdown
## Categories

A category belongs to one side or the other. Expenses ship as:

Dining Out · Groceries · Transportation · Subscriptions · Utilities · Home ·
Entertainment · Health/medical · Travel · Personal · Gifts/Donations ·
Investments · Debt · Miscellaneous

and income as Salary · Interest · Refunds · Gifts · Other income.

Those nineteen are a starting point, not the set. Settings → **Categories** is
where you add your own, rename or re-icon any of them, and delete the ones you
don't want; the ⋯ on each row holds all three. The entry sheet shows one side
or the other depending on whether you tapped Spent or Received.

Deleting is blocked while entries still point at a category, and says how many
rather than orphaning them. A category's side is fixed for the same reason once
it has entries — flipping it would turn money received into money spent without
touching a single entry.

Order is the order you see, never alphabetical. The original fourteen keep the
positions they have always had and anything you add goes to the end of its
section, so the grid you pick from every day doesn't rearrange itself under you.
```

**d. The last paragraph (lines 155–157)** — `db.js` no longer exports five
functions, and naming a count is what let it drift. Replace:

```markdown
The seam is `src/db.js`. Every read and write goes through it, and `App.jsx`
never touches `indexedDB` directly. Swapping its exported functions for `fetch`
calls against an API is the whole migration.
```

- [ ] **Step 2: Run everything**

```bash
npm test
npm run build
```

Expected: all tests pass; build succeeds.

- [ ] **Step 3: Walk the whole feature once, in the browser**

Run `npm run dev` and confirm, in order:

1. **Upgrade is clean.** With the app's existing data in the browser, load it.
   Every entry is still there with the right category, colour and emoji.
2. **Salary works.** Tap **+**, tap **Received**, enter an amount, pick Salary,
   describe it, save. It shows a green `+₹` on the Entries screen.
3. **It reaches the Summary.** Switch the Summary pill to Income; the entry is
   under Salary, and the period stepper and calendar behave as before.
4. **Adding works.** Settings → Categories → Add income category. Name it, pick
   an emoji from the grid, save. It appears at the bottom of Income and in the
   entry sheet when Received is chosen.
5. **The typed emoji works.** Edit that category and type an emoji into the
   field under the grid using the system emoji picker. One emoji lands, not a
   string of them.
6. **Deleting is blocked.** Try to delete Salary now that it has an entry. The
   menu greys it out and names the count.
7. **Deleting works.** Delete the category made in step 4, which has no
   entries. It disappears from both the screen and the entry grid.
8. **Type is locked.** Open Salary's edit sheet; the Income/Expense control is
   disabled and the reason shows under the tile.
9. **Round trip.** Export CSV, then Start fresh, then import that file. Entries
   come back with their categories, and the summary line reports what happened.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
Document categories as something you manage

The README described a fixed fourteen-category list, all of them
expenses. Both halves of that stopped being true.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FaZuKYZ4hZdQVK2DmXTUcg
EOF
)"
```

---

## Notes for whoever executes this

**Two things that will bite.**

`db.js` memoises its open connection in a module-level `dbPromise`. Any test
that needs a fresh database must re-import the module with a cache-busting
query string, which is why `freshDb()` in Task 2 looks the way it does.

`parseCsv` is imported by `src/categories.test.js` from `App.jsx`, which pulls
in React and the whole component tree. That works under Vitest, but if it turns
slow or awkward, the right fix is moving `parseCsv`, `splitCsvLine`, `readDate`
and `toCsv` into their own `src/csv.js` — not deleting the tests.

**One piece of README drift left alone.** The "two charts" section still calls
Summary a donut, which stopped being true at commit `7c61882` ("Replace the
donut with a bar in every category row"). That predates this feature and has
nothing to do with categories, so it is not fixed here — flagged so the next
person to touch the README knows it is wrong rather than assuming it was
checked.

**What is deliberately not here.** Sub-categories nested below these,
hand-reordering, merging two categories, bulk-reassigning entries, and
per-category budget targets. The last of those has its own parked design.
