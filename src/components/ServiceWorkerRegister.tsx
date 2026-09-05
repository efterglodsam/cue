"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ofarligt om registreringen misslyckas (t.ex. i dev utan https) —
      // appen fungerar ändå, bara utan offline-fallback.
    });
  }, []);

  return null;
}
