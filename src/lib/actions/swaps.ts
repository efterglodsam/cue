"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { canCancel, canConfirm, canDecline, canRespond } from "@/lib/validation/swap";
import type { ActionResult } from "./shifts";
import type { SwapType } from "@/lib/supabase/types";

async function loadRequest(requestId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("swap_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (error || !data) return null;
  return data;
}

export async function createSwapRequest(shiftId: string): Promise<ActionResult> {
  const { userId } = await requireProfile();
  if (!shiftId) return { ok: false, error: "Inget pass valt." };

  const supabase = await createClient();

  // Kontrollera att passet faktiskt tillhör den som lägger ut det
  const { data: shift } = await supabase
    .from("shifts")
    .select("assigned_to")
    .eq("id", shiftId)
    .single();
  if (!shift || shift.assigned_to !== userId) {
    return { ok: false, error: "Du kan bara lägga ut dina egna pass för byte." };
  }

  // Undvik dubbletter: max en öppen förfrågan per pass
  const { data: existing } = await supabase
    .from("swap_requests")
    .select("id")
    .eq("shift_id", shiftId)
    .in("status", ["oppen", "vantar_bekraftelse"])
    .maybeSingle();
  if (existing) {
    return { ok: false, error: "Det finns redan en öppen bytesförfrågan för det här passet." };
  }

  const { error } = await supabase.from("swap_requests").insert({
    shift_id: shiftId,
    requested_by: userId,
    status: "oppen",
  });

  if (error) return { ok: false, error: "Kunde inte lägga ut passet för byte." };

  revalidatePath("/byten");
  revalidatePath("/schema");
  return { ok: true };
}

export async function respondToSwap(
  requestId: string,
  type: SwapType,
  offeredShiftId: string | null,
): Promise<ActionResult> {
  const { userId } = await requireProfile();
  const request = await loadRequest(requestId);
  if (!request) return { ok: false, error: "Bytesförfrågan hittades inte." };

  const guard = canRespond(
    {
      status: request.status,
      type: request.type,
      requestedBy: request.requested_by,
      responderId: request.responder_id,
      offeredShiftId: request.offered_shift_id,
      currentUserId: userId,
    },
    { type, offeredShiftId },
  );
  if (!guard.allowed) return { ok: false, error: guard.reason ?? "Det gick inte att svara." };

  const supabase = await createClient();

  if (type === "direkt_byte" && offeredShiftId) {
    const { data: offered } = await supabase
      .from("shifts")
      .select("assigned_to")
      .eq("id", offeredShiftId)
      .single();
    if (!offered || offered.assigned_to !== userId) {
      return { ok: false, error: "Du kan bara erbjuda ett eget pass." };
    }
  }

  const { error } = await supabase
    .from("swap_requests")
    .update({
      status: "vantar_bekraftelse",
      responder_id: userId,
      type,
      offered_shift_id: type === "direkt_byte" ? offeredShiftId : null,
      responded_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("status", "oppen");

  if (error) return { ok: false, error: "Kunde inte skicka ditt svar. Försök igen." };

  revalidatePath("/byten");
  return { ok: true };
}

export async function confirmSwap(requestId: string): Promise<ActionResult> {
  const { userId } = await requireProfile();
  const request = await loadRequest(requestId);
  if (!request) return { ok: false, error: "Bytesförfrågan hittades inte." };

  const guard = canConfirm({
    status: request.status,
    type: request.type,
    requestedBy: request.requested_by,
    responderId: request.responder_id,
    offeredShiftId: request.offered_shift_id,
    currentUserId: userId,
  });
  if (!guard.allowed) return { ok: false, error: guard.reason ?? "Bytet kan inte bekräftas." };

  const supabase = await createClient();
  // Atomisk uppdatering via SQL-funktion, se supabase/schema.sql
  const { error } = await supabase.rpc("confirm_swap", {
    p_request_id: requestId,
    p_confirmer: userId,
  });

  if (error) {
    return { ok: false, error: "Kunde inte bekräfta bytet. Försök igen." };
  }

  revalidatePath("/byten");
  revalidatePath("/schema");
  return { ok: true };
}

export async function declineSwapResponse(requestId: string): Promise<ActionResult> {
  const { userId } = await requireProfile();
  const request = await loadRequest(requestId);
  if (!request) return { ok: false, error: "Bytesförfrågan hittades inte." };

  const guard = canDecline({
    status: request.status,
    type: request.type,
    requestedBy: request.requested_by,
    responderId: request.responder_id,
    offeredShiftId: request.offered_shift_id,
    currentUserId: userId,
  });
  if (!guard.allowed) return { ok: false, error: guard.reason ?? "Kan inte avböja." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("swap_requests")
    .update({ status: "oppen", responder_id: null, responded_at: null, type: null, offered_shift_id: null })
    .eq("id", requestId);

  if (error) return { ok: false, error: "Kunde inte avböja svaret." };

  revalidatePath("/byten");
  return { ok: true };
}

export async function cancelSwap(requestId: string): Promise<ActionResult> {
  const { userId } = await requireProfile();
  const request = await loadRequest(requestId);
  if (!request) return { ok: false, error: "Bytesförfrågan hittades inte." };

  const guard = canCancel({
    status: request.status,
    type: request.type,
    requestedBy: request.requested_by,
    responderId: request.responder_id,
    offeredShiftId: request.offered_shift_id,
    currentUserId: userId,
  });
  if (!guard.allowed) return { ok: false, error: guard.reason ?? "Kan inte avbryta bytet." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("swap_requests")
    .update({ status: "avbruten" })
    .eq("id", requestId);

  if (error) return { ok: false, error: "Kunde inte avbryta bytet." };

  revalidatePath("/byten");
  return { ok: true };
}
