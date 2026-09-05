import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Hanterar callback från magic link / OTP-inloggning via Supabase Auth.
//
// Viktigt: vi bygger omdirigeringssvaret (`response`) FÖRST och sätter alla
// sessionskakor direkt på det objektet, istället för att gå via next/headers
// `cookies()`. Med bara `cookies()` kunde kakorna i vissa fall inte hänga med
// på en `NextResponse.redirect(...)` som skapades separat efter — det gjorde
// att kodutbytet lyckades här, men sessionen var borta redan på nästa
// sidladdning (man skickades tillbaka till /login utan tydligt felmeddelande).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/schema";

  if (code) {
    const response = NextResponse.redirect(`${origin}${next}`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=Inloggningen misslyckades`);
}
