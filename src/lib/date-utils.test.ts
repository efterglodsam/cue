import { describe, expect, it } from "vitest";
import { getMonthGrid, getWeekDays } from "./date-utils";

describe("getWeekDays", () => {
  it("börjar på måndag och ger 7 dagar", () => {
    // 2026-01-07 är en onsdag
    const days = getWeekDays(new Date(2026, 0, 7));
    expect(days).toHaveLength(7);
    expect(days[0].getDay()).toBe(1); // måndag
    expect(days[6].getDay()).toBe(0); // söndag
    expect(days[0].getDate()).toBe(5);
    expect(days[6].getDate()).toBe(11);
  });

  it("hanterar en anchor som redan är en måndag", () => {
    const monday = new Date(2026, 0, 5);
    const days = getWeekDays(monday);
    expect(days[0].getDate()).toBe(5);
  });

  it("hanterar veckor som spänner över ett årsskifte", () => {
    // 2025-12-31 är en onsdag
    const days = getWeekDays(new Date(2025, 11, 31));
    expect(days[0].getFullYear()).toBe(2025);
    expect(days[0].getDate()).toBe(29);
    expect(days[6].getFullYear()).toBe(2026);
    expect(days[6].getDate()).toBe(4);
  });
});

describe("getMonthGrid", () => {
  it("täcker hela månaden och varje vecka har exakt 7 dagar", () => {
    const weeks = getMonthGrid(new Date(2026, 1, 15)); // februari 2026

    for (const week of weeks) {
      expect(week).toHaveLength(7);
    }

    const allDays = weeks.flat();
    const daysInFebruary = allDays.filter(
      (d) => d.getMonth() === 1 && d.getFullYear() === 2026,
    );
    expect(daysInFebruary).toHaveLength(28); // 2026 är inte skottår
    expect(daysInFebruary[0].getDate()).toBe(1);
    expect(daysInFebruary[daysInFebruary.length - 1].getDate()).toBe(28);
  });

  it("inkluderar dagar från föregående/nästa månad för att fylla ut hela veckor", () => {
    const weeks = getMonthGrid(new Date(2026, 1, 1)); // februari 2026 börjar en söndag
    const firstWeek = weeks[0];
    const lastWeek = weeks[weeks.length - 1];

    expect(firstWeek.some((d) => d.getMonth() === 0)).toBe(true); // januari
    expect(lastWeek.some((d) => d.getMonth() === 2)).toBe(true); // mars
  });

  it("täcker en skottårsfebruari (2028) korrekt", () => {
    const weeks = getMonthGrid(new Date(2028, 1, 10));
    const daysInFebruary = weeks.flat().filter((d) => d.getMonth() === 1 && d.getFullYear() === 2028);
    expect(daysInFebruary).toHaveLength(29);
  });
});
