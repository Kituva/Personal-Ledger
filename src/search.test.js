import { describe, it, expect } from "vitest";
import { readQuery, searchEntries, totalsOf } from "./search.js";

const labels = (q, o) => readQuery(q, o).map((w) => w.label);

describe("readQuery", () => {
  it("lowercases text and quotes it in the label", () => {
    const [w] = readQuery("Petrol");
    expect(w.tokens[0]).toEqual({ text: "petrol", amount: null, date: null });
    expect(w.label).toBe('"petrol"');
  });

  it("reads numbers as amounts, with or without ₹ and commas", () => {
    expect(readQuery("500")[0].tokens[0].amount).toBe(500);
    expect(readQuery("₹1,200")[0].tokens[0].amount).toBe(1200);
    expect(readQuery("499.50")[0].tokens[0].amount).toBe(499.5);
    expect(labels("₹1,200")).toEqual(["₹1,200"]);
  });

  it("reads month names of three letters or more, in any year", () => {
    expect(readQuery("oct")[0].tokens[0].date).toEqual({ m: 10 });
    expect(readQuery("sept")[0].tokens[0].date).toEqual({ m: 9 });
    expect(readQuery("October")[0].tokens[0].date).toEqual({ m: 10 });
    expect(readQuery("ma")[0].tokens[0].date).toBe(null);
    expect(labels("oct")).toEqual(["📅 any October"]);
  });

  it("joins a day written either side of a month", () => {
    for (const q of ["12 oct", "oct 12"]) {
      const ws = readQuery(q);
      expect(ws).toHaveLength(1);
      expect(ws[0].date).toEqual({ m: 10, d: 12 });
      expect(ws[0].label).toBe("📅 12 October");
    }
  });

  it("joins a year after a month, with or without a day", () => {
    const years = new Set([2025]);
    expect(readQuery("oct 2025", { years })[0].date).toEqual({ y: 2025, m: 10 });
    expect(labels("oct 2025", { years })).toEqual(["📅 October 2025"]);
    expect(readQuery("12 oct 2025", { years })[0].date).toEqual({ y: 2025, m: 10, d: 12 });
    expect(labels("oct, 2025", { years })).toEqual(["📅 October 2025"]);
  });

  it("reads a number after a month as a year only for years with entries", () => {
    expect(labels("oct 2000", { years: new Set([2025]) })).toEqual(["📅 any October", "₹2,000"]);
  });

  it("leaves a number that cannot be a day as its own word", () => {
    expect(labels("oct 500")).toEqual(["📅 any October", "₹500"]);
  });

  it("reads dates written in numbers, day first", () => {
    const full = { y: 2025, m: 10, d: 12 };
    expect(readQuery("12/10/2025")[0].tokens[0].date).toEqual(full);
    expect(readQuery("12-10-2025")[0].tokens[0].date).toEqual(full);
    expect(readQuery("2025-10-12")[0].tokens[0].date).toEqual(full);
    expect(readQuery("12/10")[0].tokens[0].date).toEqual({ m: 10, d: 12 });
    expect(labels("12/10/2025")).toEqual(["📅 12 October 2025"]);
  });

  it("reads a bare year as the year or the amount, only for years with entries", () => {
    const years = new Set([2025, 2026]);
    const [t] = readQuery("2025", { years })[0].tokens;
    expect(t.date).toEqual({ y: 2025 });
    expect(t.amount).toBe(2025);
    expect(labels("2025", { years })).toEqual(["📅 2025 or ₹2,025"]);
    expect(readQuery("2000", { years })[0].tokens[0].date).toBe(null);
    expect(labels("2000", { years })).toEqual(["₹2,000"]);
  });

  it("survives half-typed input", () => {
    expect(readQuery("   ")).toEqual([]);
    expect(readQuery(",")).toEqual([]);
    expect(readQuery("₹")[0].tokens[0]).toEqual({ text: "₹", amount: null, date: null });
    expect(readQuery("12/")[0].tokens[0].date).toBe(null);
  });
});

const CATS = {
  groc: { name: "Groceries" }, trans: { name: "Transportation" }, subs: { name: "Subscriptions" },
  personal: { name: "Personal" }, dining: { name: "Dining Out" }, sal: { name: "Salary" },
};
const t = (id, o) => ({ id, type: "expense", note: "", ...o });
const TXNS = [
  t("p1", { cat: "trans", note: "Petrol", amount: 500, date: "2026-10-14" }),
  t("d1", { cat: "personal", note: "Decathlon socks", amount: 2025, date: "2026-03-03" }),
  t("s1", { type: "income", cat: "sal", amount: 60000, date: "2025-12-01" }),
  t("n1", { cat: "subs", note: "Netflix 199 plan", amount: 649, date: "2025-11-02" }),
  t("g1", { cat: "groc", amount: 500, date: "2025-10-06" }),
  t("o25", { cat: "dining", note: "Tea", amount: 25, date: "2025-10-03" }),
  t("x1", { cat: "gone", note: "Plumber", amount: 499.5, date: "2025-09-09" }),
  t("p2", { cat: "trans", note: "Petrol", amount: 550, date: "2025-08-22" }),
];
const YEARS = new Set([2025, 2026]);
const run = (q) => searchEntries(TXNS, readQuery(q, { years: YEARS }), CATS);
const ids = (q) => run(q).list.map((x) => x.id);

describe("searchEntries", () => {
  it("matches part of a category name, in any case", () => {
    expect(ids("GRO")).toEqual(["g1"]);
  });
  it("matches the description", () => {
    expect(ids("petrol")).toEqual(["p1", "p2"]);
  });
  it("needs every word to match the same entry", () => {
    expect(ids("petrol oct")).toEqual(["p1"]);
  });
  it("matches an amount as its row shows it, decimals included", () => {
    expect(ids("500")).toEqual(["p1", "g1", "x1"]);
    expect(ids("499.5")).toEqual(["x1"]);
  });
  it("matches a number inside a description", () => {
    expect(ids("199")).toEqual(["n1"]);
  });
  it("matches a month in any year, and the same letters as text", () => {
    expect(ids("dec")).toEqual(["d1", "s1"]);
  });
  it("matches a day and month in any year", () => {
    expect(ids("14 oct")).toEqual(["p1"]);
  });
  it("never lets the date reading hide the other one", () => {
    expect(ids("oct 25")).toEqual(["o25"]);
  });
  it("matches a bare year as the year, the amount or the text", () => {
    expect(ids("2025")).toEqual(["d1", "s1", "n1", "g1", "o25", "x1", "p2"]);
  });
  it("still matches an entry whose category was deleted", () => {
    expect(ids("plumber")).toEqual(["x1"]);
    expect(ids("gro")).toEqual(["g1"]);
  });
  it("falls back to amounts within 10% when nothing is exact", () => {
    expect(run("petrol 520")).toEqual({ list: [TXNS[0], TXNS[7]], near: 520 });
  });
  it("does not loosen when something is exact", () => {
    expect(run("petrol 500")).toEqual({ list: [TXNS[0]], near: null });
  });
  it("says nothing about nearest amounts when there are none", () => {
    expect(run("zzz 520")).toEqual({ list: [], near: null });
  });
  it("does not loosen without a number", () => {
    expect(run("zzz")).toEqual({ list: [], near: null });
  });
  it("matches nothing for no words", () => {
    expect(searchEntries(TXNS, [], CATS)).toEqual({ list: [], near: null });
  });
});

describe("totalsOf", () => {
  it("keeps money spent and money received apart", () => {
    expect(totalsOf([TXNS[0], TXNS[4], TXNS[2]])).toEqual({ spent: 1000, received: 60000 });
  });
});

describe("searchEntries, cases the review found", () => {
  const Y = { years: new Set([2025, 2026]) };
  const find = (txns, q) => searchEntries(txns, readQuery(q, Y), CATS);

  it("names the amount you typed when it loosens, not a day", () => {
    const rent = t("r", { cat: "groc", note: "Rent", amount: 18000, date: "2025-10-12" });
    expect(find([rent], "12 oct 17500")).toEqual({ list: [rent], near: 17500 });
  });
  it("names the amount you typed when it loosens, not a year", () => {
    const fuel = t("f", { cat: "trans", note: "Petrol", amount: 500, date: "2025-10-05" });
    expect(find([fuel], "oct 2025 520")).toEqual({ list: [fuel], near: 520 });
  });
  it("does not take a four-digit amount after a date for a year", () => {
    const bb = t("bb", { cat: "groc", note: "Big basket", amount: 2000, date: "2025-10-12" });
    expect(find([bb], "12 oct 2000")).toEqual({ list: [bb], near: null });
  });
  it("finds the amount even when it is also a year you have entries in", () => {
    const shoes = t("sh", { cat: "personal", note: "Shoes", amount: 2026, date: "2025-10-12" });
    expect(find([shoes], "12 oct 2026")).toEqual({ list: [shoes], near: null });
  });
  it("finds an amount with paise by the rupees its row shows", () => {
    const oil = t("io", { cat: "trans", note: "Indian Oil", amount: 1999.6, date: "2025-07-01" });
    expect(find([oil], "2000")).toEqual({ list: [oil], near: null });
  });
  it("matches a month's letters only at the start of a word", () => {
    const doc = t("dr", { cat: "health", note: "Doctor visit", amount: 500, date: "2025-03-10" });
    const socks = t("so", { cat: "personal", note: "Decathlon socks", amount: 900, date: "2025-03-11" });
    expect(find([doc, socks], "oct").list).toEqual([]);
    expect(find([doc, socks], "dec").list).toEqual([socks]);
  });
});
