import { describe, expect, it } from "vitest";
import { applyRealtimeEvent } from "./useRealtimeList";

type Row = { id: string; value: string };

describe("applyRealtimeEvent", () => {
  it("INSERT lägger till en ny rad", () => {
    const current: Row[] = [{ id: "1", value: "a" }];
    const next = applyRealtimeEvent(current, {
      eventType: "INSERT",
      new: { id: "2", value: "b" },
      old: {} as Row,
    });
    expect(next).toEqual([
      { id: "1", value: "a" },
      { id: "2", value: "b" },
    ]);
  });

  it("INSERT av en redan känd rad (dubblett) är en no-op", () => {
    const current: Row[] = [{ id: "1", value: "a" }];
    const next = applyRealtimeEvent(current, {
      eventType: "INSERT",
      new: { id: "1", value: "a-igen" },
      old: {} as Row,
    });
    expect(next).toBe(current);
  });

  it("UPDATE ersätter rätt rad och lämnar övriga orörda", () => {
    const current: Row[] = [
      { id: "1", value: "a" },
      { id: "2", value: "b" },
    ];
    const next = applyRealtimeEvent(current, {
      eventType: "UPDATE",
      new: { id: "2", value: "b-uppdaterad" },
      old: { id: "2", value: "b" },
    });
    expect(next).toEqual([
      { id: "1", value: "a" },
      { id: "2", value: "b-uppdaterad" },
    ]);
  });

  it("UPDATE av en okänd rad lämnar listan orörd", () => {
    const current: Row[] = [{ id: "1", value: "a" }];
    const next = applyRealtimeEvent(current, {
      eventType: "UPDATE",
      new: { id: "does-not-exist", value: "x" },
      old: {} as Row,
    });
    expect(next).toEqual(current);
  });

  it("DELETE tar bort rätt rad", () => {
    const current: Row[] = [
      { id: "1", value: "a" },
      { id: "2", value: "b" },
    ];
    const next = applyRealtimeEvent(current, {
      eventType: "DELETE",
      new: {} as Row,
      old: { id: "1", value: "a" },
    });
    expect(next).toEqual([{ id: "2", value: "b" }]);
  });

  it("ett okänt eventType är en no-op", () => {
    const current: Row[] = [{ id: "1", value: "a" }];
    const next = applyRealtimeEvent(current, {
      eventType: "TRUNCATE",
      new: {} as Row,
      old: {} as Row,
    });
    expect(next).toBe(current);
  });
});
