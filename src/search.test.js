import { describe, it, expect } from "vitest";
import { readQuery } from "./search.js";

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
    expect(readQuery("oct 2025")[0].date).toEqual({ y: 2025, m: 10 });
    expect(labels("oct 2025")).toEqual(["📅 October 2025"]);
    expect(readQuery("12 oct 2025")[0].date).toEqual({ y: 2025, m: 10, d: 12 });
    expect(labels("oct, 2025")).toEqual(["📅 October 2025"]);
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
