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

  -- Signalerar till swap_requests_guard() (se RLS-sektionen längre ner) att
  -- de uppdateringar den här funktionen gör är betrodda — annars skulle
  -- triggern blockera själva statusövergången till 'bekraftad', som annars
  -- ALDRIG får ske via en direkt UPDATE från klienten. `is_local = true`
  -- gör att flaggan bara gäller den här transaktionen.
  perform set_config('cue.confirm_swap_in_progress', 'on', true);

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

  -- Försvar i djupet: passet ska fortfarande vara tilldelat den som lade ut
  -- bytet. Detta ska redan garanteras av insert-policyn på swap_requests
  -- (requested_by måste vara shift.assigned_to när raden skapas), men om
  -- passet hann tilldelas om till någon annan under tiden (eller om något
  -- annat hål skulle finnas i den kontrollen) ska bekräftelsen ändå aldrig
  -- flytta ett pass som inte faktiskt tillhör den som la ut bytet.
  if v_shift.assigned_to <> v_request.requested_by then
    raise exception 'Passet tillhör inte längre den som lade ut bytet.';
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

-- Säkerhetsdefinierad hjälpfunktion: slår upp is_admin utan att gå via RLS på
-- profiles (annars riskerar en policy som anropar denna funktion rekursion).
create or replace function public.is_admin(check_uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = check_uid), false);
$$;

-- Var och en får uppdatera sin egen profil, men INTE sin egen admin-status
-- (annars kan vem som helst göra sig själv till admin direkt mot databasen,
-- förbi kontrollen i Server Action-lagret). En admin får däremot uppdatera
-- vem som helsts profil, inklusive admin-status — det är så `setAdminStatus`
-- i src/lib/actions/team.ts faktiskt kan fungera.
create policy "Uppdatera profil: sig själv (ej admin-status) eller admin uppdaterar valfri profil"
  on public.profiles
  for update
  using (auth.uid() = id or public.is_admin(auth.uid()))
  with check (
    public.is_admin(auth.uid())
    or (auth.uid() = id and is_admin = (select p.is_admin from public.profiles p where p.id = auth.uid()))
  );

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
--
-- Tidigare tillät en enda "for all"-policy vilken inloggad användare som
-- helst att skriva DIREKT till den här tabellen (t.ex. via webbläsarens
-- devtools, förbi Server Actions helt). Det gjorde det möjligt att sätta
-- status = 'bekraftad' utan att passet någonsin bytte ägare (confirm_swap()
-- är den enda plats som faktiskt uppdaterar shifts.assigned_to atomiskt),
-- eller att svara/avböja/avbryta på någon annans bytesförfrågan. RLS +
-- swap_requests_guard()-triggern nedan speglar nu exakt samma
-- tillståndsmaskin som src/lib/validation/swap.ts redan enhetstestar på
-- applikationsnivå.
create policy "Inloggade kan se bytesförfrågningar" on public.swap_requests
  for select using (auth.role() = 'authenticated');

create policy "Man kan lägga ut sina egna pass för byte" on public.swap_requests
  for insert
  with check (
    auth.role() = 'authenticated'
    and requested_by = auth.uid()
    and status = 'oppen'
    and responder_id is null
    and confirmed_at is null
    -- Inte bara "man är inloggad som requested_by" — passet man lägger ut
    -- måste faktiskt vara tilldelat en själv just nu. Annars kunde vem som
    -- helst lägga ut EN ANNANS pass för byte (bara med sig själv som
    -- requested_by) och sedan låta confirm_swap() flytta över det passet
    -- till en "responder" utan att den verkliga ägaren varit inblandad alls.
    and requested_by = (select assigned_to from public.shifts where id = shift_id)
  );

-- Vem som får RÖRA en rad (grovkornigt) — exakt vilka fält som får ändras
-- till vad avgörs av swap_requests_guard()-triggern nedan.
create policy "Berörda parter kan uppdatera en bytesförfrågan" on public.swap_requests
  for update
  using (
    auth.role() = 'authenticated'
    and (requested_by = auth.uid() or responder_id = auth.uid() or status = 'oppen')
  )
  with check (auth.role() = 'authenticated');

-- Ingen delete-policy: appen tar aldrig bort bytesförfrågningar (bara sätter
-- status = 'avbruten'), så direkt DELETE nekas som standard.

create or replace function public.swap_requests_guard()
returns trigger
language plpgsql
as $$
begin
  -- confirm_swap() har redan validerat och utför sina uppdateringar atomiskt
  -- (inklusive att sätta status = 'bekraftad' och att ogiltigförklara andra
  -- förfrågningar på samma pass) — lita på den och hoppa över resten.
  if coalesce(current_setting('cue.confirm_swap_in_progress', true), '') = 'on' then
    return new;
  end if;

  if new.shift_id is distinct from old.shift_id
     or new.requested_by is distinct from old.requested_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Får inte ändra shift_id, requested_by eller created_at på en bytesförfrågan.';
  end if;

  -- Bekräftelse får ENDAST ske via confirm_swap() (den enda plats som
  -- faktiskt flyttar passet till den nya ägaren i samma transaktion).
  if new.status = 'bekraftad' then
    raise exception 'Ett byte kan bara bekräftas via confirm_swap().';
  end if;

  -- Svara på en öppen förfrågan (ta över / erbjuda direktbyte).
  if old.status = 'oppen' and new.status = 'vantar_bekraftelse' then
    if auth.uid() = old.requested_by then
      raise exception 'Man kan inte svara på sin egen förfrågan.';
    end if;
    if new.responder_id is distinct from auth.uid() then
      raise exception 'responder_id måste vara den som svarar.';
    end if;
    return new;
  end if;

  -- Avböja ett svar (tillbaka till öppen, nollställ svaret).
  if old.status = 'vantar_bekraftelse' and new.status = 'oppen' then
    if auth.uid() <> old.requested_by then
      raise exception 'Endast den som lade ut passet kan avböja.';
    end if;
    if new.responder_id is not null or new.type is not null or new.offered_shift_id is not null then
      raise exception 'Avböjning måste nollställa svaret.';
    end if;
    return new;
  end if;

  -- Avbryta hela bytet.
  if new.status = 'avbruten' and old.status in ('oppen', 'vantar_bekraftelse') then
    if auth.uid() <> old.requested_by then
      raise exception 'Endast den som lade ut passet kan avbryta.';
    end if;
    return new;
  end if;

  raise exception 'Otillåten statusövergång (%->%) för bytesförfrågan.', old.status, new.status;
end;
$$;

drop trigger if exists swap_requests_guard on public.swap_requests;
create trigger swap_requests_guard before update on public.swap_requests
  for each row execute procedure public.swap_requests_guard();

-- notes
--
-- "Fäst/Lossa" i UI:t (togglePinNote i src/lib/actions/notes.ts) visas för
-- ALLA anteckningar, inte bara egna — anslagstavlan är tänkt att vara en
-- delad, teamgemensam yta där vem som helst kan fästa en viktig anteckning
-- högst upp. Men RLS tillät tidigare bara author_id = auth.uid() att
-- uppdatera en anteckning alls, så att fästa någon annans anteckning
-- misslyckades helt tyst (0 rader uppdaterade, inget felmeddelande syns).
-- Löst genom att öppna UPDATE för alla inloggade, men låta
-- notes_update_guard()-triggern se till att en icke-ägare bara kan ändra
-- `pinned` — allt annat innehåll (titel, text, kategori) är fortfarande
-- skyddat och kräver att man är author_id, precis som testerna i
-- db-tests/rls-notes.test.ts redan bevisar.
create policy "Inloggade kan se anteckningar" on public.notes
  for select using (auth.role() = 'authenticated');
create policy "Inloggade kan skapa anteckningar" on public.notes
  for insert with check (auth.uid() = author_id);
create policy "Inloggade kan uppdatera anteckningar (innehåll skyddas av trigger)" on public.notes
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Man kan ta bort egna anteckningar" on public.notes
  for delete using (auth.uid() = author_id);

create or replace function public.notes_update_guard()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is distinct from old.author_id then
    if new.title is distinct from old.title
       or new.body is distinct from old.body
       or new.category is distinct from old.category
       or new.author_id is distinct from old.author_id then
      raise exception 'Bara den som skrev anteckningen får redigera innehållet.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists notes_update_guard on public.notes;
create trigger notes_update_guard before update on public.notes
  for each row execute procedure public.notes_update_guard();

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
-- (insert-policyn krävde tidigare bara att man var inloggad, utan att
-- kontrollera changed_by — vem som helst kunde alltså logga en ändring i
-- en annan kollegas namn. src/lib/actions/placement.ts sätter redan alltid
-- changed_by till den faktiska användaren, så den här skärpningen bryter
-- inget existerande beteende.)
create policy "Inloggade kan se historik" on public.placement_item_history
  for select using (auth.role() = 'authenticated');
create policy "Inloggade kan skriva historik i eget namn" on public.placement_item_history
  for insert with check (auth.role() = 'authenticated' and changed_by = auth.uid());

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
