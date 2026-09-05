export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center">
      <p className="text-4xl">📡</p>
      <h1 className="text-xl font-semibold text-slate-900">Ingen internetanslutning</h1>
      <p className="max-w-sm text-sm text-slate-500">
        Vi kunde inte hämta senaste informationen just nu. Kontrollera din anslutning och försök
        igen — tidigare hämtad data visas när sidan öppnas nästa gång du har nät.
      </p>
    </main>
  );
}
