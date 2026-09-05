-- Schema för "Cue" – schema- & samarbetsapp för personliga assistenter
-- Kör detta i Supabase SQL Editor (eller via `supabase db push`) på ett nytt projekt.

-- ============================================================
-- Tillägg
-- ============================================================
create extension if not exists "pgcrypto";

-- ============================================================
-- profiles: en rad per inloggad användare (kopplad till auth.users)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Skapa automatiskt en profilrad när en användare bjuds in / registrerar sig
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    -- Allra första användaren i systemet blir admin automatiskt
    (select count(*) from public.profiles) = 0
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- clients: brukare/hem
-- ============================================================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- shifts: pass
-- ============================================================
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  start_time timestamptz not null,
  end_time timestamptz not null,
  assigned_to uuid not null references public.profiles (id),
  client_id uuid references public.clients (id) on delete set null,
  status text not null default 'schemalagt'
    check (status in ('schemalagt', 'pagaende', 'avslutat')),
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shift_time_order check (end_time > start_time)
);

create index if not exists shifts_start_time_idx on public.shifts (start_time);
create index if not exists shifts_assigned_to_idx on public.shifts (assigned_to);

-- ============================================================
-- swap_requests: bytesförfrågningar
-- ============================================================
create table if not exists public.swap_requests (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id) on delete cascade,
  requested_by uuid not null references public.profiles (id),
  -- type/offered_shift_id sätts av den som SVARAR på förfrågan (ta över
  -- eller erbjuda ett eget pass i direktbyte) — inte av den som lägger ut passet.
  type text check (type in ('ta_over', 'direkt_byte')),
  offered_shift_id uuid references public.shifts (id) on delete cascade,
  status text not null default 'oppen'
    check (status in ('oppen', 'vantar_bekraftelse', 'bekraftad', 'avbojd', 'avbruten')),
  responder_id uuid references public.profiles (id),
  responded_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists swap_requests_shift_id_idx on public.swap_requests (shift_id);
create index if not exists swap_requests_status_idx on public.swap_requests (status);

-- ============================================================
-- notes: anslagstavla
-- ============================================================
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  title text,
  body text not null,
  author_id uuid not null references public.profiles (id),
  category text,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_pinned_created_idx on public.notes (pinned desc, created_at desc);

-- ============================================================
-- placement_items: "samma sak, samma plats"-checklista
-- ============================================================
create table if not exists public.placement_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  location_description text not null,
  photo_url text,
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists placement_items_client_id_idx on public.placement_items (client_id);

-- Bekräftelser: "jag har lagt tillbaka detta på rätt plats"
create table if not exists public.placement_confirmations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.placement_items (id) on delete cascade,
  confirmed_by uuid not null references public.profiles (id),
  confirmed_at timestamptz not null default now()
);

create index if not exists placement_confirmations_item_id_idx on public.placement_confirmations (item_id, confirmed_at desc);

-- Ändringshistorik för checklistan
create table if not exists public.placement_item_history (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.placement_items (id) on delete cascade,
  changed_by uuid references public.profiles (id),
  change_type text not null check (change_type in ('skapad', 'andrad', 'borttagen')),
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- confirm_swap: bekräftar ett byte atomiskt så att passet aldrig hamnar i
-- ett inkonsekvent tillstånd (t.ex. två personer på samma pass, eller
-- bytet "bekräftat" utan att passet faktiskt bytt ägare).
-- ============================================================
create or replace function public.confirm_swap(p_request_id uuid, p_confirmer uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_request public.swap_requests;
  v_shift public.shifts;
begin
  select * into v_request from public.swap_requests where id = p_request_id for update;

  if not found then
    raise exception 'Bytesförfrågan hittades inte';
  end if;

  if v_request.status <> 'vantar_bekraftelse' then
    raise exception 'Bytet kan inte bekräftas i sitt nuvarande läge (%).', v_request.status;
  end if;

  if v_request.requested_by <> p_confirmer then
    raise exception 'Endast den som lade ut passet kan bekräfta bytet';
  end if;

  if v_request.responder_id is null then
    raise exception 'Ingen har erbjudit sig än';
  end if;

  select * into v_shift from public.shifts where id = v_request.shift_id for update;
  if not found then
    raise exception 'Passet hittades inte';
  end if;

  if v_request.type = 'ta_over' then
    update public.shifts set assigned_to = v_request.responder_id where id = v_shift.id;
  elsif v_request.type = 'direkt_byte' then
    if v_request.offered_shift_id is null then
      raise exception 'Inget erbjudet pass angivet för direktbyte';
    end if;
    -- Byt ägare mellan de två passen
    update public.shifts set assigned_to = v_request.responder_id where id = v_shift.id;
    update public.shifts set assigned_to = v_request.requested_by where id = v_request.offered_shift_id;
  end if;

  update public.swap_requests
    set status = 'bekraftad', confirmed_at = now()
    where id = p_request_id;

  -- Alla andra öppna/väntande förfrågningar på samma pass blir ogiltiga
  update public.swap_requests
    set status = 'avbruten'
    where shift_id = v_request.shift_id
      and id <> p_request_id
      and status in ('oppen', 'vantar_bekraftelse');
end;
$$;

grant execute on function public.confirm_swap(uuid, uuid) to authenticated;

-- ============================================================
-- Trigger: uppdatera updated_at automatiskt
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.shifts;
create trigger set_updated_at before update on public.shifts
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at on public.notes;
create trigger set_updated_at before update on public.notes
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at on public.placement_items;
create trigger set_updated_at before update on public.placement_items
  for each row execute procedure public.set_updated_at();

-- ============================================================
-- Row Level Security
-- Alla inloggade användare i teamet ser samma data (litet team, ingen
-- multi-tenant-uppdelning). Skrivrättigheter styrs per tabell nedan.
-- ============================================================
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.shifts enable row level security;
alter table public.swap_requests enable row level security;
alter table public.notes enable row level security;
alter table public.placement_items enable row level security;
alter table public.placement_confirmations enable row level security;
alter table public.placement_item_history enable row level security;

-- profiles
create policy "Inloggade kan se alla profiler" on public.profiles
  for select using (auth.role() = 'authenticated');
create policy "Man kan uppdatera sin egen profil" on public.profiles
  for update using (auth.uid() = id);

-- clients
create policy "Inloggade kan se brukare" on public.clients
  for select using (auth.role() = 'authenticated');
create policy "Inloggade kan hantera brukare" on public.clients
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- shifts
create policy "Inloggade kan se pass" on public.shifts
  for select using (auth.role() = 'authenticated');
create policy "Inloggade kan hantera pass" on public.shifts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- swap_requests
create policy "Inloggade kan se bytesförfrågningar" on public.swap_requests
  for select using (auth.role() = 'authenticated');
create policy "Inloggade kan hantera bytesförfrågningar" on public.swap_requests
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- notes
create policy "Inloggade kan se anteckningar" on public.notes
  for select using (auth.role() = 'authenticated');
create policy "Inloggade kan skapa anteckningar" on public.notes
  for insert with check (auth.uid() = author_id);
create policy "Man kan redigera / ta bort egna anteckningar" on public.notes
  for update using (auth.uid() = author_id);
create policy "Man kan ta bort egna anteckningar" on public.notes
  for delete using (auth.uid() = author_id);

-- placement_items
create policy "Inloggade kan se checklistor" on public.placement_items
  for select using (auth.role() = 'authenticated');
create policy "Inloggade kan hantera checklistor" on public.placement_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- placement_confirmations
create policy "Inloggade kan se bekräftelser" on public.placement_confirmations
  for select using (auth.role() = 'authenticated');
create policy "Inloggade kan bekräfta" on public.placement_confirmations
  for insert with check (auth.uid() = confirmed_by);

-- placement_item_history
create policy "Inloggade kan se historik" on public.placement_item_history
  for select using (auth.role() = 'authenticated');
create policy "Systemet kan skriva historik" on public.placement_item_history
  for insert with check (auth.role() = 'authenticated');

-- ============================================================
-- Storage: bucket för foton till placeringschecklistan
-- ============================================================
insert into storage.buckets (id, name, public)
values ('placement-photos', 'placement-photos', true)
on conflict (id) do nothing;

create policy "Alla kan se placeringsfoton" on storage.objects
  for select using (bucket_id = 'placement-photos');
create policy "Inloggade kan ladda upp placeringsfoton" on storage.objects
  for insert with check (bucket_id = 'placement-photos' and auth.role() = 'authenticated');
create policy "Inloggade kan ta bort placeringsfoton" on storage.objects
  for delete using (bucket_id = 'placement-photos' and auth.role() = 'authenticated');

-- ============================================================
-- Realtime: publicera tabeller för Supabase Realtime
-- ============================================================
alter publication supabase_realtime add table public.shifts;
alter publication supabase_realtime add table public.swap_requests;
alter publication supabase_realtime add table public.notes;
alter publication supabase_realtime add table public.placement_items;
alter publication supabase_realtime add table public.placement_confirmations;
