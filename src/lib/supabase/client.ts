"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function createClient() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase är inte konfigurerat. Fyll i .env.local och starta om dev-servern.");
  }

  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
