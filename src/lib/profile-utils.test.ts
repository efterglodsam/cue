import { describe, expect, it } from "vitest";
import { getFirstName } from "./profile-utils";

describe("getFirstName", () => {
  it("plockar ut förnamnet ur ett vanligt för- och efternamn", () => {
    expect(getFirstName("Anton Hiller")).toBe("Anton");
  });

  it("hanterar flera efternamn/mellannamn", () => {
    expect(getFirstName("Anna Karin Svensson")).toBe("Anna");
  });

  // Regression: om en kollega bjuds in utan ifyllt namn faller
  // profiles.full_name tillbaka till e-postens lokal-del (se
  // handle_new_user() i supabase/schema.sql) — den ska aldrig visas rå.
  it("plockar ut ett namn ur en e-posts lokal-del istället för att visa den rakt av", () => {
    expect(getFirstName("anton.e.hiller95")).toBe("Anton");
  });

  it("hanterar lokal-delar med plustecken", () => {
    expect(getFirstName("anton.hiller+team")).toBe("Anton");
  });

  it("hanterar lokal-delar med understreck", () => {
    expect(getFirstName("anton_hiller")).toBe("Anton");
  });

  it("lämnar ett riktigt förnamn utan mellanslag orört", () => {
    expect(getFirstName("Anna-Lena")).toBe("Anna-Lena");
  });

  it("lämnar ett ensamt namn orört", () => {
    expect(getFirstName("Madonna")).toBe("Madonna");
  });

  it("returnerar 'Okänd' för null, undefined eller tomt namn", () => {
    expect(getFirstName(null)).toBe("Okänd");
    expect(getFirstName(undefined)).toBe("Okänd");
    expect(getFirstName("   ")).toBe("Okänd");
  });
});
