// Hjälpfunktioner för att visa en användares profil i UI:t.

/**
 * Plockar ut förnamnet ur `profiles.full_name`, för att aldrig visa en hel
 * mejladress-liknande sträng i gränssnittet.
 *
 * Om en kollega bjuds in utan att fältet "Namn" fylls i faller
 * `full_name` tillbaka till e-postens lokal-del (se `handle_new_user()` i
 * `supabase/schema.sql`), t.ex. "anton.e.hiller95" för
 * anton.e.hiller95@gmail.com. Den här funktionen hanterar båda fallen:
 *
 * - "Anton Hiller" (vanligt för- och efternamn) -> "Anton"
 * - "anton.e.hiller95" (e-postens lokal-del) -> "Anton"
 * - "Anna-Lena" (ett riktigt förnamn utan mellanslag) -> "Anna-Lena"
 *
 * Returnerar "Okänd" om inget namn finns.
 */
export function getFirstName(fullName: string | null | undefined): string {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return "Okänd";

  const spaceParts = trimmed.split(/\s+/);
  if (spaceParts.length > 1) return spaceParts[0];

  // Ett enda "ord". Om det innehåller tecken som inte hör hemma i ett
  // vanligt namn (punkt, plustecken, understreck, siffror, @) är det
  // sannolikt e-postens lokal-del snarare än ett riktigt namn — plocka ut
  // den inledande bokstavsdelen och gör om den till ett namn med stor
  // bokstav. Ett riktigt namn utan sådana tecken (t.ex. "Anna-Lena" eller
  // "Madonna") lämnas orört.
  if (/[.\d+_@]/.test(trimmed)) {
    const match = /^[^\s.\d+_@]+/.exec(trimmed);
    const namePart = match?.[0] || trimmed;
    return namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase();
  }

  return trimmed;
}
