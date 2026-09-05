import { requireProfile } from "@/lib/auth";
import NavShell from "@/components/NavShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();

  return (
    <NavShell userName={profile.full_name} isAdmin={profile.is_admin}>
      {children}
    </NavShell>
  );
}
