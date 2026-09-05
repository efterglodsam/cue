// Ren logik för bytesflödets tillståndsmaskin. Hålls fri från Supabase-
// beroenden så den kan enhetstestas isolerat — detta är den mest kritiska
// logiken i appen (ett pass får ALDRIG hamna i ett inkonsekvent tillstånd,
// t.ex. två personer tilldelade samma pass).

import type { SwapStatus, SwapType } from "@/lib/supabase/types";

export interface SwapGuardInput {
  status: SwapStatus;
  type: SwapType | null;
  requestedBy: string;
  responderId: string | null;
  offeredShiftId: string | null;
  currentUserId: string;
}

export interface GuardResult {
  allowed: boolean;
  reason?: string;
}

// Får man svara (ta över / erbjuda direktbyte) på det här passet?
export function canRespond(
  input: SwapGuardInput,
  response: { type: SwapType; offeredShiftId: string | null },
): GuardResult {
  if (input.status !== "oppen") {
    return { allowed: false, reason: "Bytet är inte längre öppet." };
  }
  if (input.requestedBy === input.currentUserId) {
    return { allowed: false, reason: "Man kan inte svara på sin egen förfrågan." };
  }
  if (response.type === "direkt_byte" && !response.offeredShiftId) {
    return { allowed: false, reason: "Välj vilket eget pass du vill erbjuda i bytet." };
  }
  return { allowed: true };
}

// Får personen som lade ut passet bekräfta bytet?
export function canConfirm(input: SwapGuardInput): GuardResult {
  if (input.status !== "vantar_bekraftelse") {
    return { allowed: false, reason: "Bytet väntar inte på bekräftelse." };
  }
  if (input.requestedBy !== input.currentUserId) {
    return { allowed: false, reason: "Endast den som lade ut passet kan bekräfta bytet." };
  }
  if (!input.responderId) {
    return { allowed: false, reason: "Ingen har erbjudit sig än." };
  }
  return { allowed: true };
}

// Får personen som lade ut passet avböja ett svar (och öppna för nya svar)?
export function canDecline(input: SwapGuardInput): GuardResult {
  if (input.status !== "vantar_bekraftelse") {
    return { allowed: false, reason: "Det finns inget svar att avböja." };
  }
  if (input.requestedBy !== input.currentUserId) {
    return { allowed: false, reason: "Endast den som lade ut passet kan avböja." };
  }
  return { allowed: true };
}

// Får personen som lade ut förfrågan avbryta hela bytet?
export function canCancel(input: SwapGuardInput): GuardResult {
  if (input.status !== "oppen" && input.status !== "vantar_bekraftelse") {
    return { allowed: false, reason: "Bytet kan inte avbrytas i sitt nuvarande läge." };
  }
  if (input.requestedBy !== input.currentUserId) {
    return { allowed: false, reason: "Endast den som lade ut passet kan avbryta." };
  }
  return { allowed: true };
}

// Nästa status när passets ägare avböjer ett inkommet svar — tillbaka till
// öppen så att andra kollegor kan erbjuda sig igen.
export function statusAfterDecline(): SwapStatus {
  return "oppen";
}
