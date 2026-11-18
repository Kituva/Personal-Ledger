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
