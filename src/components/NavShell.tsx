"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { href: "/schema", label: "Schema", icon: "📅" },
  { href: "/byten", label: "Byten", icon: "🔁" },
  { href: "/anslagstavla", label: "Anslagstavla", icon: "📌" },
  { href: "/brukare", label: "Brukare", icon: "🏠" },
];

export default function NavShell({
  children,
  userName,
  isAdmin,
}: {
  children: React.ReactNode;
  userName: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 md:flex-row">
      {/* Sidonav på större skärmar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 md:flex">
        <div className="mb-6 px-2">
          <p className="text-lg font-bold text-slate-900">Cue</p>
          <p className="text-xs text-slate-500">Inloggad som {userName}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                pathname.startsWith(item.href)
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          ))}
          {isAdmin && (
            <Link
              href="/installningar"
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                pathname.startsWith("/installningar")
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <span aria-hidden>⚙️</span>
              Inställningar
            </Link>
          )}
        </nav>
        <button
          onClick={handleSignOut}
          className="mt-auto rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-500 hover:bg-slate-100"
        >
          Logga ut
        </button>
      </aside>

      {/* Mobilt: enkel topplist */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <p className="text-lg font-bold text-slate-900">Cue</p>
        <button onClick={handleSignOut} className="text-sm font-medium text-slate-500">
          Logga ut
        </button>
      </header>

      <main className="flex-1 pb-20 md:pb-0">{children}</main>

      {/* Mobilt: bottennav */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white md:hidden">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
              pathname.startsWith(item.href) ? "text-blue-700" : "text-slate-500"
            }`}
          >
            <span className="text-lg" aria-hidden>
              {item.icon}
            </span>
            {item.label}
          </Link>
        ))}
        {isAdmin && (
          <Link
            href="/installningar"
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
              pathname.startsWith("/installningar") ? "text-blue-700" : "text-slate-500"
            }`}
          >
            <span className="text-lg" aria-hidden>
              ⚙️
            </span>
            Mer
          </Link>
        )}
      </nav>
    </div>
  );
}
