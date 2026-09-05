// Handskrivna databas-typer (motsvarar supabase/schema.sql).
// Om schemat ändras, uppdatera typerna här.

export type ShiftStatus = "schemalagt" | "pagaende" | "avslutat";
export type SwapType = "ta_over" | "direkt_byte";
export type SwapStatus =
  | "oppen"
  | "vantar_bekraftelse"
  | "bekraftad"
  | "avbojd"
  | "avbruten";
export type PlacementChangeType = "skapad" | "andrad" | "borttagen";

export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  is_admin: boolean;
  created_at: string;
}

export type Client = {
  id: string;
  name: string;
  address: string | null;
  created_by: string | null;
  created_at: string;
}

export type Shift = {
  id: string;
  start_time: string;
  end_time: string;
  assigned_to: string;
  client_id: string | null;
  status: ShiftStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type SwapRequest = {
  id: string;
  shift_id: string;
  requested_by: string;
  type: SwapType | null;
  offered_shift_id: string | null;
  status: SwapStatus;
  responder_id: string | null;
  responded_at: string | null;
  confirmed_at: string | null;
  created_at: string;
}

export type Note = {
  id: string;
  title: string | null;
  body: string;
  author_id: string;
  category: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export type PlacementItem = {
  id: string;
  client_id: string;
  name: string;
  location_description: string;
  photo_url: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PlacementConfirmation = {
  id: string;
  item_id: string;
  confirmed_by: string;
  confirmed_at: string;
}

export type PlacementItemHistory = {
  id: string;
  item_id: string;
  changed_by: string | null;
  change_type: PlacementChangeType;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

type TableDef<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };

export type Database = {
  public: {
    Tables: {
      profiles: TableDef<Profile>;
      clients: TableDef<Client>;
      shifts: TableDef<Shift>;
      swap_requests: TableDef<SwapRequest>;
      notes: TableDef<Note>;
      placement_items: TableDef<PlacementItem>;
      placement_confirmations: TableDef<PlacementConfirmation>;
      placement_item_history: TableDef<PlacementItemHistory>;
    };
    Views: { [_ in never]: never };
    Functions: {
      confirm_swap: {
        Args: { p_request_id: string; p_confirmer: string };
        Returns: undefined;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
