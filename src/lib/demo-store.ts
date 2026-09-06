import type { Client, PlacementConfirmation, PlacementItem, Profile } from "@/lib/supabase/types";

const globalStore = globalThis as typeof globalThis & {
  __cueDemoStore?: {
    clients: Client[];
    items: PlacementItem[];
    confirmations: PlacementConfirmation[];
  };
};

export const demoStore = (globalStore.__cueDemoStore ??= {
  clients: [],
  items: [],
  confirmations: [],
});

export const demoProfile: Profile = {
  id: "demo-user",
  full_name: "Demoanvändare",
  phone: null,
  is_admin: true,
  created_at: new Date(0).toISOString(),
};
