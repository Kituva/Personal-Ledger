import { describe, it, expect } from "vitest";
import {
  DEFAULT_CATS, PALETTE, makeCategory, nextColour, bySide,
  nameAvailable, canDelete, canChangeSide, resolveImportCategory, lastGrapheme,
} from "./categories.js";
import { parseCsv } from "./App.jsx";

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

  it("keeps the original fourteen expense names, exactly", () => {
    expect(expenseSide().map((c) => c.name)).toEqual([
      "Dining Out", "Groceries", "Transportation", "Subscriptions",
      "Utilities", "Home", "Entertainment", "Health/medical", "Travel",
      "Personal", "Gifts/Donations", "Investments", "Debt", "Miscellaneous",
    ]);
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

describe("lastGrapheme", () => {
  it("keeps a plain emoji", () => {
    expect(lastGrapheme("💼")).toBe("💼");
  });

  it("keeps a flag whole rather than one regional indicator", () => {
    expect(lastGrapheme("🇺🇸")).toBe("🇺🇸");
  });

  it("keeps a skin-tone modifier attached to its base", () => {
    expect(lastGrapheme("👍🏽")).toBe("👍🏽");
  });

  it("keeps a zero-width-joined family whole", () => {
    expect(lastGrapheme("👨‍👩‍👧‍👦")).toBe("👨‍👩‍👧‍👦");
  });

  it("keeps a trailing variation selector attached, as two defaults carry", () => {
    expect(lastGrapheme("🍽️")).toBe("🍽️");
    expect(lastGrapheme("↩️")).toBe("↩️");
  });

  it("takes only the last when the keyboard has appended", () => {
    expect(lastGrapheme("💼🏦")).toBe("🏦");
  });

  it("returns empty for a blank field", () => {
    expect(lastGrapheme("")).toBe("");
    expect(lastGrapheme("   ")).toBe("");
  });

  it("stays bounded when Intl.Segmenter is unavailable", () => {
    const real = Intl.Segmenter;
    Intl.Segmenter = undefined;
    try {
      expect(lastGrapheme("💼🏦")).toBe("🏦");
      expect(lastGrapheme("")).toBe("");
      // The point of the fallback is that it cannot grow, even where it
      // cannot keep a multi-code-point emoji whole.
      expect([...lastGrapheme("💼🏦🍽️")].length).toBeLessThanOrEqual(2);
    } finally {
      Intl.Segmenter = real;
    }
  });
});

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
