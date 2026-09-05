import { describe, expect, it } from "vitest";
import { parseShiftInput } from "./shift";

const base = {
  start_time: "2026-01-01T08:00",
  end_time: "2026-01-02T08:00",
  assigned_to: "user-1",
};

describe("parseShiftInput", () => {
  it("godkänner ett giltigt pass", () => {
    const result = parseShiftInput(base);
    expect(result.ok).toBe(true);
  });

  it("nekar om sluttid inte är efter starttid", () => {
    const result = parseShiftInput({ ...base, end_time: base.start_time });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Sluttiden/);
  });

  it("nekar om sluttid är före starttid", () => {
    const result = parseShiftInput({ ...base, start_time: "2026-01-02T08:00", end_time: "2026-01-01T08:00" });
    expect(result.ok).toBe(false);
  });

  it("kräver att någon är tilldelad passet", () => {
    const result = parseShiftInput({ ...base, assigned_to: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/tilldelad|Välj/);
  });

  it("kräver start- och sluttid", () => {
    const result = parseShiftInput({ ...base, start_time: "" });
    expect(result.ok).toBe(false);
  });

  it("nekar ogiltigt datumformat", () => {
    const result = parseShiftInput({ ...base, start_time: "inte-ett-datum" });
    expect(result.ok).toBe(false);
  });

  it("client_id och notes är valfria", () => {
    const result = parseShiftInput(base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.client_id).toBeNull();
      expect(result.data.notes).toBeNull();
    }
  });
});
