import { describe, expect, it } from "vitest";
import { canCancel, canConfirm, canDecline, canRespond } from "./swap";
import type { SwapGuardInput } from "./swap";

const REQUESTER = "alice";
const RESPONDER = "bob";
const OTHER = "carl";

function makeInput(overrides: Partial<SwapGuardInput> = {}): SwapGuardInput {
  return {
    status: "oppen",
    type: null,
    requestedBy: REQUESTER,
    responderId: null,
    offeredShiftId: null,
    currentUserId: RESPONDER,
    ...overrides,
  };
}

describe("canRespond", () => {
  it("tillåter att ta över ett öppet pass", () => {
    const result = canRespond(makeInput(), { type: "ta_over", offeredShiftId: null });
    expect(result.allowed).toBe(true);
  });

  it("nekar den som lade ut passet att svara på sin egen förfrågan", () => {
    const result = canRespond(makeInput({ currentUserId: REQUESTER }), {
      type: "ta_over",
      offeredShiftId: null,
    });
    expect(result.allowed).toBe(false);
  });

  it("nekar om passet inte längre är öppet", () => {
    const result = canRespond(makeInput({ status: "vantar_bekraftelse" }), {
      type: "ta_over",
      offeredShiftId: null,
    });
    expect(result.allowed).toBe(false);
  });

  it("kräver ett erbjudet pass vid direktbyte", () => {
    const result = canRespond(makeInput(), { type: "direkt_byte", offeredShiftId: null });
    expect(result.allowed).toBe(false);
  });

  it("tillåter direktbyte med erbjudet pass", () => {
    const result = canRespond(makeInput(), { type: "direkt_byte", offeredShiftId: "shift-99" });
    expect(result.allowed).toBe(true);
  });
});

describe("canConfirm", () => {
  it("tillåter den som lade ut passet att bekräfta ett väntande svar", () => {
    const result = canConfirm(
      makeInput({ status: "vantar_bekraftelse", responderId: RESPONDER, currentUserId: REQUESTER }),
    );
    expect(result.allowed).toBe(true);
  });

  it("nekar bekräftelse från någon annan än den som lade ut passet", () => {
    const result = canConfirm(
      makeInput({ status: "vantar_bekraftelse", responderId: RESPONDER, currentUserId: OTHER }),
    );
    expect(result.allowed).toBe(false);
  });

  it("nekar bekräftelse om ingen svarat än", () => {
    const result = canConfirm(
      makeInput({ status: "vantar_bekraftelse", responderId: null, currentUserId: REQUESTER }),
    );
    expect(result.allowed).toBe(false);
  });

  it("nekar bekräftelse av ett redan bekräftat byte (skydd mot dubbel-bekräftelse)", () => {
    const result = canConfirm(
      makeInput({ status: "bekraftad", responderId: RESPONDER, currentUserId: REQUESTER }),
    );
    expect(result.allowed).toBe(false);
  });
});

describe("canDecline", () => {
  it("tillåter den som lade ut passet att avböja ett svar", () => {
    const result = canDecline(
      makeInput({ status: "vantar_bekraftelse", responderId: RESPONDER, currentUserId: REQUESTER }),
    );
    expect(result.allowed).toBe(true);
  });

  it("nekar avböjning från responder", () => {
    const result = canDecline(
      makeInput({ status: "vantar_bekraftelse", responderId: RESPONDER, currentUserId: RESPONDER }),
    );
    expect(result.allowed).toBe(false);
  });
});

describe("canCancel", () => {
  it("tillåter avbrytande av ett öppet byte av den som lade ut det", () => {
    const result = canCancel(makeInput({ currentUserId: REQUESTER }));
    expect(result.allowed).toBe(true);
  });

  it("nekar avbrytande av ett redan bekräftat byte", () => {
    const result = canCancel(makeInput({ status: "bekraftad", currentUserId: REQUESTER }));
    expect(result.allowed).toBe(false);
  });

  it("nekar avbrytande från någon annan än den som lade ut passet", () => {
    const result = canCancel(makeInput({ currentUserId: OTHER }));
    expect(result.allowed).toBe(false);
  });
});
