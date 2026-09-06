import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockSupabaseClient } from "./test-utils/mock-supabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireProfile: vi.fn() }));

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { inviteColleague, removeColleague, setAdminStatus } from "./team";

const ADMIN = "admin-id";
const MEMBER = "member-id";

function asProfile(userId: string, isAdmin: boolean) {
  vi.mocked(requireProfile).mockResolvedValue({
    userId,
    profile: { id: userId, full_name: "", phone: null, is_admin: isAdmin, created_at: "" },
  });
}

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("team Server Actions", () => {
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  });

  afterEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  });

  describe("inviteColleague", () => {
    it("nekar för icke-admin", async () => {
      asProfile(MEMBER, false);

      const result = await inviteColleague(formData({ email: "ny@example.test" }));

      expect(result).toEqual({ ok: false, error: "Endast admin kan bjuda in nya kollegor." });
    });

    it("kräver en e-postadress", async () => {
      asProfile(ADMIN, true);

      const result = await inviteColleague(formData({ email: "" }));

      expect(result).toEqual({ ok: false, error: "Ange en e-postadress." });
    });

    it("nekar om SUPABASE_SERVICE_ROLE_KEY saknas på servern", async () => {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      asProfile(ADMIN, true);

      const result = await inviteColleague(formData({ email: "ny@example.test" }));

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    });

    it("skickar inbjudan för en admin med giltig e-post", async () => {
      asProfile(ADMIN, true);
      const inviteUserByEmail = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(createAdminClient).mockReturnValue({
        auth: { admin: { inviteUserByEmail } },
      } as never);

      const result = await inviteColleague(formData({ email: "ny@example.test", full_name: "Ny Person" }));

      expect(result).toEqual({ ok: true });
      expect(inviteUserByEmail).toHaveBeenCalledWith("ny@example.test", {
        data: { full_name: "Ny Person" },
      });
    });
  });

  describe("removeColleague", () => {
    it("nekar för icke-admin", async () => {
      asProfile(MEMBER, false);
      const result = await removeColleague("other-id");
      expect(result).toEqual({ ok: false, error: "Endast admin kan ta bort kollegor." });
    });

    it("hindrar en admin från att ta bort sig själv", async () => {
      asProfile(ADMIN, true);
      const result = await removeColleague(ADMIN);
      expect(result).toEqual({ ok: false, error: "Du kan inte ta bort dig själv." });
    });

    it("tar bort en kollega som admin", async () => {
      asProfile(ADMIN, true);
      const deleteUser = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(createAdminClient).mockReturnValue({ auth: { admin: { deleteUser } } } as never);

      const result = await removeColleague(MEMBER);

      expect(result).toEqual({ ok: true });
      expect(deleteUser).toHaveBeenCalledWith(MEMBER);
    });
  });

  describe("setAdminStatus", () => {
    it("nekar för icke-admin", async () => {
      asProfile(MEMBER, false);
      const result = await setAdminStatus("some-id", true);
      expect(result).toEqual({ ok: false, error: "Endast admin kan ändra admin-status." });
    });

    it("låter en admin ändra någon annans admin-status", async () => {
      asProfile(ADMIN, true);
      vi.mocked(createClient).mockResolvedValue(
        mockSupabaseClient({ from: { profiles: [{ data: null, error: null }] } }) as never,
      );

      const result = await setAdminStatus(MEMBER, true);

      expect(result).toEqual({ ok: true });
    });
  });
});
