"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-xl font-semibold text-slate-900">Logga in på Cue</h1>
        <p className="mt-1 text-sm text-slate-500">
          Schema, byten och anslagstavla för teamet — skriv in din e-post så skickar vi en
          inloggningslänk.
        </p>

        {status === "sent" ? (
          <div className="mt-6 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
            Vi har skickat en inloggningslänk till <strong>{email}</strong>. Öppna e-posten på
            den här enheten och klicka på länken.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                E-postadress
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                placeholder="namn@exempel.se"
              />
            </div>

            {status === "error" && (
              <p className="text-sm text-red-600" role="alert">
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
        )}
      </div>
    </main>
  );
}
