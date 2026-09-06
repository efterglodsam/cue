# Cue – schema- & samarbetsapp för personliga assistenter

Cue är en enkel, mobilanpassad PWA för små team (2–15 personer) av personliga
assistenter inom hemtjänst/hemvård som jobbar 24-timmarspass och avlöser
varandra. Appen samlar:

- **Gemensamt schema** – vecko- och månadsvy över alla pass i teamet
- **Passbyten** – lägg ut ett pass för byte, erbjud dig att ta över eller byta,
  och bekräfta bytet innan det blir definitivt
- **Anslagstavla** – en snabb, kombinerad anslagstavla/chatt för teamet
- **"Samma sak, samma plats"-checklista** – per brukare/hem, så alla lägger
  tillbaka nycklar, medicinlistor och hjälpmedel på exakt samma ställe

Allt gränssnitt är på svenska.

## Teknisk stack

- **Next.js 16** (App Router, TypeScript, Server Actions)
- **Supabase** – Postgres, autentisering (magic link), Realtime och
  filbagring (foton till checklistan)
- **Tailwind CSS 4** – mobil-först styling
- **PWA** – manifest + service worker, installerbar på hemskärmen, visar
  senast hämtad data om nätet ligger nere
- **Vitest** – enhetstester för kritisk logik (särskilt bytesflödet)

## Kom igång lokalt

### 1. Skapa ett Supabase-projekt

1. Gå till [supabase.com](https://supabase.com) och skapa ett nytt projekt
   (gratisnivån räcker gott för ett litet team).
2. Öppna **SQL Editor** i Supabase-dashboarden, klistra in hela innehållet i
   [`supabase/schema.sql`](./supabase/schema.sql) och kör det. Detta skapar
   alla tabeller, policys (Row Level Security), en SQL-funktion för att
   bekräfta byten atomiskt, samt en storage-bucket för foton.
3. Under **Authentication → Providers**, se till att **Email** är aktiverat.
   Appen använder e-post med engångskod/magic link (OTP) – inget lösenord
   krävs.
4. Under **Authentication → URL Configuration**, lägg till din lokala och
   publicerade URL i "Redirect URLs", t.ex.:
   - `http://localhost:3000/auth/callback`
   - `https://ditt-projekt.vercel.app/auth/callback`
5. Hämta **Project URL**, **anon public key** och **service_role key** under
   **Project Settings → API**.

> **Första användaren blir automatiskt admin.** Så snart du loggar in en
> gång skapas en profilrad, och den allra första personen i systemet blir
> admin (kan bjuda in/ta bort kollegor och byta admin-status på andra).

### 2. Konfigurera miljövariabler

```bash
cp .env.example .env.local
```

Fyll i `.env.local` med värdena från Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=https://ditt-projekt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=din-anon-key
SUPABASE_SERVICE_ROLE_KEY=din-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` används endast server-side (i Server Actions) för
att skicka inbjudningar och ta bort kollegor. Den får aldrig committas eller
skickas till klienten.

### 3. Installera och kör

```bash
npm install
npm run dev
```

Öppna [http://localhost:3000](http://localhost:3000). Logga in med din
e-post – du får ett mejl med en inloggningslänk (magic link).

### 4. Kör tester

```bash
npm run test      # enhets- och Server Action-tester (Vitest, inga beroenden)
npm run test:db   # tester mot en riktig Postgres-instans (RLS + confirm_swap)
npm run test:all  # båda
```

`npm run test` täcker valideringen av pass (start/sluttid), hela
bytes-tillståndsmaskinen (`src/lib/validation/`), Server Actions
(`src/lib/actions/`, med en mockad Supabase-klient), `date-utils.ts` och
realtime-reducern.

`npm run test:db` kräver en Postgres-instans (`DATABASE_URL`, default
`postgres://postgres:postgres@127.0.0.1:5432/postgres` – i CI startas den
som en service-container, se `.github/workflows/ci.yml`). Den kör
`supabase/schema.sql` mot en engångsdatabas (se `db-tests/fixtures/` för de
minimala auth/storage-stubbar som gör det möjligt utan Docker eller ett
riktigt Supabase-projekt) och testar den faktiska
atomiciteten i `confirm_swap` – inklusive ett race-test som verifierar att
radlåset (`for update`) faktiskt blockerar en samtidig bekräftelse – samt
RLS-policyerna på `profiles` och `notes`. Det är detta lager, inte
applikationslagrets validering, som faktiskt garanterar att ett pass aldrig
kan hamna i ett inkonsekvent tillstånd (t.ex. två personer tilldelade samma
pass).

## Deploy till Vercel + Supabase (gratisnivå)

1. **Supabase**: följ steg 1 ovan om du inte redan gjort det. Notera
   Project URL, anon key och service role key.
2. **Vercel**:
   - Pusha repot till GitHub/GitLab/Bitbucket.
   - Gå till [vercel.com](https://vercel.com) → **Add New Project** → välj
     repot.
   - Under **Environment Variables**, lägg till samma tre variabler som i
     `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`).
   - Klicka **Deploy**.
3. När sidan är publicerad, gå tillbaka till Supabase →
   **Authentication → URL Configuration** och lägg till din Vercel-URL
   (`https://ditt-projekt.vercel.app/auth/callback`) i redirect-listan.
4. Testa genom att logga in på den publicerade sidan.

Både Vercel och Supabase har generösa gratisnivåer som räcker gott för ett
team på 2–15 personer.

## Bjuda in kollegor

Som admin, gå till **Inställningar** i appen och skicka en inbjudan via
e-post. Personen får ett mejl med en inloggningslänk och blir automatiskt
medlem i teamet (skapar sin profilrad vid första inloggningen).

## Installera som app på mobilen

- **iPhone (Safari)**: öppna sidan → dela-ikonen → "Lägg till på hemskärmen"
- **Android (Chrome)**: öppna sidan → meny (⋮) → "Installera app" /
  "Lägg till på startskärmen"

## Projektstruktur

```
src/
├── app/
│   ├── (app)/            # Skyddade sidor (kräver inloggning)
│   │   ├── schema/       # Gemensamt schema
│   │   ├── byten/        # Passbyten
│   │   ├── anslagstavla/ # Anslagstavla
│   │   ├── brukare/      # Brukare + placeringschecklista
│   │   └── installningar/# Admin: bjud in/ta bort kollegor
│   ├── login/            # Inloggning (magic link)
│   ├── auth/callback/    # OAuth/OTP-callback
│   └── offline/          # Offline-fallback för service worker
├── components/           # UI-komponenter per feature
├── lib/
│   ├── actions/          # Server Actions (skapa/uppdatera/ta bort)
│   ├── validation/       # Ren, testbar valideringslogik
│   ├── hooks/            # useRealtimeList m.fl.
│   └── supabase/         # Supabase-klienter + handskrivna databastyper
supabase/
└── schema.sql            # Hela databasschemat, RLS-policys och funktioner
```

## Databasmodell

Se [`supabase/schema.sql`](./supabase/schema.sql) för fullständig
definition. I korthet:

- `profiles` – en rad per användare, kopplad till Supabase Auth
- `clients` – brukare/hem
- `shifts` – pass (start, slut, tilldelad person, ev. brukare, status)
- `swap_requests` – bytesförfrågningar med tillstånden `oppen` →
  `vantar_bekraftelse` → `bekraftad`/`avbojd`/`avbruten`
- `notes` – anslagstavlans inlägg
- `placement_items` + `placement_confirmations` + `placement_item_history` –
  "samma sak, samma plats"-checklistan med bekräftelser och ändringshistorik

Alla tabeller har Row Level Security aktiverat. Eftersom alla i teamet ska se
samma schema/anslagstavla finns ingen multi-tenant-uppdelning – policyerna
säkerställer bara att man måste vara inloggad, samt att vissa åtgärder (t.ex.
redigera/ta bort en anteckning) endast får göras av den som skapade den.
Ett undantag: `profiles.is_admin` är särskilt skyddad – en användare får
uppdatera sin egen profil men aldrig sin egen admin-status, och endast en
admin får ändra någon annans (se `public.is_admin()` och policyn på
`profiles` i `supabase/schema.sql`, samt `db-tests/rls-profiles.test.ts`).

Bekräftelse av ett pass-byte görs via SQL-funktionen `confirm_swap`, som
uppdaterar bytesförfrågan och flyttar pass-ägarskapet i en och samma
transaktion – detta garanterar att ett pass aldrig kan hamna i ett
inkonsekvent tillstånd (t.ex. två personer tilldelade samma pass, eller ett
"bekräftat" byte som inte faktiskt genomfördes).

## Realtid

Schema, byten, anslagstavla och checklistan uppdateras direkt för alla i
teamet via Supabase Realtime (Postgres-ändringar strömmas till klienterna) –
ingen omladdning krävs.
