import { describe, it, expect } from "vitest";
import {
  toSheetRows, diffTags, dueForPush, summarise, confirmText,
  classify, makeCode, PUSH_INTERVAL_DAYS,
} from "./sync.js";

const CATS = {
  groc: { id: "groc", name: "Groceries" },
  sal: { id: "sal", name: "Salary" },
};

const txn = (o) => ({ id: "t1", amount: 100, type: "expense", cat: "groc", note: "", date: "2026-01-01", ...o });

describe("toSheetRows", () => {
  it("writes the seven columns in order", () => {
    const rows = toSheetRows([txn({ amount: 450.5, note: "Big Bazaar" })], CATS);
    expect(rows).toEqual([["2026-01-01", 450.5, "Groceries", "Big Bazaar", "January", 2026, "t1"]]);
  });

  it("writes income as a negative amount", () => {
    const rows = toSheetRows([txn({ type: "income", cat: "sal", amount: 60000 })], CATS);
    expect(rows[0][1]).toBe(-60000);
    expect(rows[0][2]).toBe("Salary");
  });

  it("rounds to two decimal places, as a number not a string", () => {
    const rows = toSheetRows([txn({ amount: 10.005 })], CATS);
    expect(rows[0][1]).toBe(10.01);
    expect(typeof rows[0][1]).toBe("number");
    expect(typeof rows[0][5]).toBe("number");
  });

  it("sorts oldest first", () => {
    const rows = toSheetRows([
      txn({ id: "c", date: "2026-03-01" }),
      txn({ id: "a", date: "2026-01-01" }),
      txn({ id: "b", date: "2026-02-01" }),
    ], CATS);
    expect(rows.map((r) => r[6])).toEqual(["a", "b", "c"]);
  });

  it("breaks a same-date tie on the tag, so the order never wobbles", () => {
    const a = [txn({ id: "t2" }), txn({ id: "t1" })];
    const b = [txn({ id: "t1" }), txn({ id: "t2" })];
    expect(toSheetRows(a, CATS)).toEqual(toSheetRows(b, CATS));
  });

  it("falls back to Miscellaneous when the category is gone", () => {
    expect(toSheetRows([txn({ cat: "deleted" })], CATS)[0][2]).toBe("Miscellaneous");
  });

  it("writes an empty description rather than undefined", () => {
    expect(toSheetRows([txn({ note: undefined })], CATS)[0][3]).toBe("");
  });

  it("returns nothing for no entries", () => {
    expect(toSheetRows([], CATS)).toEqual([]);
  });
});

describe("diffTags", () => {
  it("finds entries the sheet has never seen", () => {
    expect(diffTags(["a", "b", "c"], ["a"])).toEqual({ added: ["b", "c"], removed: [] });
  });

  it("finds rows the app no longer has", () => {
    expect(diffTags(["a"], ["a", "b"])).toEqual({ added: [], removed: ["b"] });
  });

  it("finds both at once", () => {
    expect(diffTags(["a", "c"], ["a", "b"])).toEqual({ added: ["c"], removed: ["b"] });
  });

  it("reports nothing when they match, whatever the order", () => {
    expect(diffTags(["b", "a"], ["a", "b"])).toEqual({ added: [], removed: [] });
  });

  it("treats an empty sheet as every entry being new", () => {
    expect(diffTags(["a", "b"], [])).toEqual({ added: ["a", "b"], removed: [] });
  });

  it("treats an empty app against a full sheet as a total wipe", () => {
    expect(diffTags([], ["a", "b"])).toEqual({ added: [], removed: ["a", "b"] });
  });

  it("counts an untagged sheet row as a removal", () => {
    expect(diffTags(["a"], ["a", ""]).removed).toEqual([""]);
  });
});

describe("dueForPush", () => {
  const day = 864e5;
  const now = Date.parse("2026-09-10T09:00:00Z");

  it("is due when it has never pushed", () => {
    expect(dueForPush(null, now)).toBe(true);
  });

  it("is not due after nine days", () => {
    expect(dueForPush(now - 9 * day, now)).toBe(false);
  });

  it("is due at exactly ten days", () => {
    expect(dueForPush(now - PUSH_INTERVAL_DAYS * day, now)).toBe(true);
  });

  it("is due after eleven days", () => {
    expect(dueForPush(now - 11 * day, now)).toBe(true);
  });

  it("is due when the clock has moved backwards", () => {
    expect(dueForPush(now + day, now)).toBe(true);
  });
});

describe("summarise", () => {
  it("says only that it wrote when the tags already matched", () => {
    expect(summarise({ added: [], removed: [] })).toBe("Sheet updated.");
  });

  it("counts additions", () => {
    expect(summarise({ added: ["a", "b"], removed: [] })).toBe("Sheet updated. 2 entries added.");
  });

  it("says entry, not entries, for one", () => {
    expect(summarise({ added: ["a"], removed: [] })).toBe("Sheet updated. 1 entry added.");
  });

  it("counts removals", () => {
    expect(summarise({ added: [], removed: ["a"] })).toBe("Sheet updated. 1 entry removed.");
  });

  it("counts both", () => {
    expect(summarise({ added: ["a"], removed: ["b", "c"] })).toBe("Sheet updated. 1 added, 2 removed.");
  });
});

describe("confirmText", () => {
  it("names the count so a wipe cannot happen quietly", () => {
    expect(confirmText(1167)).toBe("1,167 entries will be removed from the sheet. Push anyway?");
  });

  it("says entry, not entries, for one", () => {
    expect(confirmText(1)).toBe("1 entry will be removed from the sheet. Push anyway?");
  });
});

describe("classify", () => {
  it("passes a good reply through", () => {
    expect(classify(200, '{"ok":true,"tags":["a"]}')).toEqual({ ok: true, data: { ok: true, tags: ["a"] } });
  });

  it("names the code when the script rejects it", () => {
    expect(classify(200, '{"ok":false,"error":"bad code"}'))
      .toEqual({ ok: false, message: "The sheet rejected the push. Check the code in Settings." });
  });

  it("reports a sign-in page as unreachable, since that is the usual setup mistake", () => {
    const r = classify(200, "<!DOCTYPE html><html>Sign in</html>");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Couldn't reach the sheet/);
    expect(r.message).toMatch(/Anyone/);
  });

  it("reports a non-200 as unreachable", () => {
    expect(classify(404, "Not found").ok).toBe(false);
  });

  it("reports a script error that is not about the code", () => {
    expect(classify(200, '{"ok":false,"error":"no such sheet"}'))
      .toEqual({ ok: false, message: "The sheet reported a problem: no such sheet" });
  });
});

describe("makeCode", () => {
  it("is long enough not to be guessed", () => {
    expect(makeCode().length).toBeGreaterThanOrEqual(24);
  });

  it("differs every time", () => {
    expect(makeCode()).not.toBe(makeCode());
  });

  it("carries nothing that would break a paste into a script", () => {
    expect(makeCode()).toMatch(/^[A-Za-z0-9]+$/);
  });
});
