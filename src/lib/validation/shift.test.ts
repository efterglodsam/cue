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

  // Regression: tiderna skrevs tidigare bort som lokal tid i den miljö
  // Server Action:en råkar köra i (ofta UTC på servern) istället för svensk
  // tid, så "09:00" i schemat kunde sparas som 09:00 UTC = 11:00 svensk
  // sommartid. parseShiftInput ska alltid tolka klockslag som svensk tid,
  // oavsett vilken tidszon testmiljön/servern själv kör i.
  it("tolkar tiden som svensk sommartid (UTC+2), inte serverns egen tidszon", () => {
    const result = parseShiftInput({
      ...base,
      start_time: "2026-09-09T09:00",
      end_time: "2026-09-09T17:00",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.start_time).toBe("2026-09-09T07:00:00.000Z");
      expect(result.data.end_time).toBe("2026-09-09T15:00:00.000Z");
    }
  });

  it("tolkar tiden som svensk vintertid (UTC+1)", () => {
    const result = parseShiftInput({
      ...base,
      start_time: "2026-01-05T08:00",
      end_time: "2026-01-06T08:00",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.start_time).toBe("2026-01-05T07:00:00.000Z");
      expect(result.data.end_time).toBe("2026-01-06T07:00:00.000Z");
    }
  });

  it("hanterar ett 24-timmarspass över sommartidsskiftet (slutet av mars) korrekt", () => {
    // Natten 2026-03-29 flyttas klockan fram en timme i Sverige (02:00 → 03:00).
    const result = parseShiftInput({
      ...base,
      start_time: "2026-03-28T08:00",
      end_time: "2026-03-29T08:00",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 28:e är fortfarande vintertid (UTC+1), 29:e är redan sommartid (UTC+2).
      expect(result.data.start_time).toBe("2026-03-28T07:00:00.000Z");
      expect(result.data.end_time).toBe("2026-03-29T06:00:00.000Z");
    }
  });
});
