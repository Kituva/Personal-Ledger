import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { DEFAULT_CATS } from "./categories.js";

/* Each test needs its own database and its own module instance, because db.js
   memoises the open connection in a module-level promise. */
async function freshDb() {
  globalThis.indexedDB = new IDBFactory();
  return import(/* @vite-ignore */ `./db.js?bust=${Math.random()}`);
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

/** Writes a v2 database by hand — transactions and categories, no meta — to
    stand in for an install that predates the sheet push. */
function seedV2(rows, cats) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("ledger", 2);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      const store = database.createObjectStore("transactions", { keyPath: "id" });
      store.createIndex("date", "date");
      database.createObjectStore("categories", { keyPath: "id" });
    };
    req.onsuccess = () => {
      const database = req.result;
      const tx = database.transaction(["transactions", "categories"], "readwrite");
      rows.forEach((r) => tx.objectStore("transactions").put(r));
      cats.forEach((c) => tx.objectStore("categories").put(c));
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

    const db = await import(/* @vite-ignore */ `./db.js?bust=${Math.random()}`);
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

    const again = await import(/* @vite-ignore */ `./db.js?bust=${Math.random()}`);
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

describe("sheet connection", () => {
  beforeEach(() => { globalThis.indexedDB = new IDBFactory(); });

  it("has nothing to say before you connect a sheet", async () => {
    const db = await freshDb();
    expect(await db.getMeta("sheetUrl")).toBeUndefined();
  });

  it("round-trips the address, the code and the clock", async () => {
    const db = await freshDb();
    await db.setMeta("sheetUrl", "https://script.google.com/macros/s/abc/exec");
    await db.setMeta("sheetCode", "Zq7");
    await db.setMeta("lastPushAt", 1757500000000);

    expect(await db.getMeta("sheetUrl")).toBe("https://script.google.com/macros/s/abc/exec");
    expect(await db.getMeta("sheetCode")).toBe("Zq7");
    expect(await db.getMeta("lastPushAt")).toBe(1757500000000);
  });

  it("overwrites rather than accumulating", async () => {
    const db = await freshDb();
    await db.setMeta("sheetUrl", "https://one/exec");
    await db.setMeta("sheetUrl", "https://two/exec");
    expect(await db.getMeta("sheetUrl")).toBe("https://two/exec");
  });

  it("upgrades a v2 install without touching entries or categories", async () => {
    globalThis.indexedDB = new IDBFactory();
    await seedV2(
      [{ id: "t1", amount: 260, type: "expense", cat: "dining", note: "Swiggy", date: "2026-09-01" }],
      [{ id: "dining", name: "Eating Out", e: "🍽️", c: "#f4555f", side: "expense", pos: 0 }],
    );

    const db = await import(/* @vite-ignore */ `./db.js?bust=${Math.random()}`);

    expect(await db.getAll()).toHaveLength(1);
    expect((await db.getAllCats()).find((c) => c.id === "dining").name).toBe("Eating Out");
    expect(await db.getMeta("sheetUrl")).toBeUndefined();
  });

  it("stays connected when the user starts fresh", async () => {
    const db = await freshDb();
    await db.setMeta("sheetUrl", "https://script.google.com/macros/s/abc/exec");
    await db.put({ id: "t1", amount: 10, type: "expense", cat: "dining", note: "x", date: "2026-09-01" });

    await db.clear();

    expect(await db.getAll()).toHaveLength(0);
    expect(await db.getMeta("sheetUrl")).toBe("https://script.google.com/macros/s/abc/exec");
  });
});
