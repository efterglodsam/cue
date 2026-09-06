"use client";

import { startTransition, useEffect, useState } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const callbackError = new URLSearchParams(window.location.search).get("error");
    if (callbackError) {
      startTransition(() => {
        setStatus("error");
        setError("Inloggningen misslyckades. Försök igen.");
      });
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured()) {
      setStatus("error");
      setError("Supabase är inte konfigurerat ännu. Lägg in värdena i .env.local och starta om appen.");
      return;
    }
    setStatus("loading");
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setError("Kunde inte skicka inloggningslänk. Kontrollera e-postadressen och försök igen.");
      return;
    }

    setStatus("sent");
  }

  async function handleOAuth(provider: "google") {
    if (!isSupabaseConfigured()) {
      setStatus("error");
      setError("Supabase är inte konfigurerat ännu. Lägg in värdena i .env.local och starta om appen.");
      return;
    }
    setStatus("loading");
    setError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus("error");
      setError("Kunde inte starta OAuth-inloggningen. Försök igen.");
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-6 shadow-sm ring-1 ring-slate-700">
        <h1 className="text-xl font-semibold text-slate-100">Logga in på Cue</h1>
        <p className="mt-1 text-sm text-slate-400">
          Schema, byten och anslagstavla för teamet — skriv in din e-post så skickar vi en
          inloggningslänk.
        </p>

        {status === "sent" ? (
          <div className="mt-6 rounded-lg bg-emerald-950 p-4 text-sm text-emerald-300">
            Vi har skickat en inloggningslänk till <strong>{email}</strong>. Öppna e-posten på
            den här enheten och klicka på länken.
          </div>
        ) : (
          <div>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                  E-postadress
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2.5 text-base text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-900"
                  placeholder="namn@exempel.se"
                />
              </div>

              {status === "error" && (
                <p className="text-sm text-red-400" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-base font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {status === "loading" ? "Skickar länk…" : "Skicka inloggningslänk"}
              </button>
            </form>
            <div className="mt-4 border-t border-slate-700 pt-4">
              <button
                type="button"
                onClick={() => void handleOAuth("google")}
                disabled={status === "loading"}
                className="w-full rounded-lg border border-slate-600 px-4 py-2.5 text-base font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-60"
              >
                {status === "loading" ? "Ansluter…" : "Fortsätt med Google"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
