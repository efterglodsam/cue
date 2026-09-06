-- ============================================================
-- RLS-skärpning: swap_requests, notes, placement_item_history
-- ============================================================
-- Kör den här filen EN GÅNG i Supabase SQL Editor mot din befintliga
-- (live) databas. supabase/schema.sql är bara "fresh install"-referensen
-- för ett helt nytt projekt (den skapar tabeller/policys med `create` utan
-- `if not exists`/`or replace` överallt, så att köra om HELA den filen mot
-- en databas som redan finns skulle krascha på "already exists"). Det här
-- är den motsvarande, idempotenta ändringen för en databas som redan kör
-- den gamla versionen av schema.sql — säker att köra även om du råkar köra
-- den två gånger.
--
-- Bakgrund / vad som ändras och varför:
--
-- 1. swap_requests hade tidigare en enda "for all"-policy som lät VILKEN
--    inloggad användare som helst skriva direkt till tabellen (t.ex. via
--    devtools, förbi Server Actions). Det gjorde det möjligt att sätta
--    status = 'bekraftad' utan att passet någonsin bytte ägare, svara på
--    någon annans bytesförfrågan, eller lägga ut ett pass som inte ens var
--    ens eget. RLS + en ny swap_requests_guard()-trigger speglar nu exakt
--    samma tillståndsmaskin som src/lib/validation/swap.ts redan
--    enhetstestar på applikationsnivå, och confirm_swap() har fått en
--    extra "försvar i djupet"-koll (passet måste fortfarande tillhöra den
--    som lade ut bytet).
-- 2. notes: "fäst/lossa" i UI:t är tänkt att funka för ALLA anteckningar,
--    men den gamla policyn (author_id = auth.uid()) gjorde att det
--    misslyckades helt tyst för andras anteckningar. UPDATE är nu öppet
--    för alla inloggade, men en ny notes_update_guard()-trigger säkerställer
--    att bara författaren kan ändra titel/text/kategori.
-- 3. placement_item_history: insert-policyn krävde tidigare bara att man
--    var inloggad, utan att kolla changed_by — vem som helst kunde alltså
--    logga en ändring i en kollegas namn. changed_by måste nu vara
--    auth.uid().
--
-- Alla tre är verifierade med nya/uppdaterade tester i db-tests/
-- (rls-swap-requests.test.ts, confirm-swap.test.ts, rls-notes.test.ts,
-- rls-placement-history.test.ts) — se PR:en för detaljer.

-- ----------------------------------------------------------------
-- 1. confirm_swap(): "cue.confirm_swap_in_progress"-flaggan (så att
--    swap_requests_guard() vet att skriva den här funktionen gör är
--    betrodda) + försvar-i-djupet-kollen mot att flytta ett pass som inte
--    längre tillhör den som lade ut bytet.
-- ----------------------------------------------------------------
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

-- ----------------------------------------------------------------
-- 2. swap_requests: byt ut den gamla "for all"-policyn mot insert/update
--    som speglar tillståndsmaskinen, plus guard-triggern.
-- ----------------------------------------------------------------
drop policy if exists "Inloggade kan hantera bytesförfrågningar" on public.swap_requests;
drop policy if exists "Man kan lägga ut sina egna pass för byte" on public.swap_requests;
drop policy if exists "Berörda parter kan uppdatera en bytesförfrågan" on public.swap_requests;

create policy "Man kan lägga ut sina egna pass för byte" on public.swap_requests
  for insert
  with check (
    auth.role() = 'authenticated'
    and requested_by = auth.uid()
    and status = 'oppen'
    and responder_id is null
    and confirmed_at is null
    and requested_by = (select assigned_to from public.shifts where id = shift_id)
  );

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

-- ----------------------------------------------------------------
-- 3. notes: öppna UPDATE för alla inloggade, men skydda innehållet med en
--    guard-trigger så bara författaren kan ändra det (icke-ägare får bara
--    ändra `pinned`).
-- ----------------------------------------------------------------
drop policy if exists "Man kan redigera / ta bort egna anteckningar" on public.notes;

create policy "Inloggade kan uppdatera anteckningar (innehåll skyddas av trigger)" on public.notes
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

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

-- ----------------------------------------------------------------
-- 4. placement_item_history: kräv att changed_by faktiskt är den som är
--    inloggad (src/lib/actions/placement.ts sätter redan alltid detta
--    korrekt, så det här bryter inget existerande beteende).
-- ----------------------------------------------------------------
drop policy if exists "Systemet kan skriva historik" on public.placement_item_history;

create policy "Inloggade kan skriva historik i eget namn" on public.placement_item_history
  for insert with check (auth.role() = 'authenticated' and changed_by = auth.uid());
