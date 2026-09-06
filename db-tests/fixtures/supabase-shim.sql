-- Minimal stand-in for the parts of Supabase's platform schema that
-- supabase/schema.sql assumes exist (auth.users, auth.uid(), auth.role(),
-- storage.buckets/objects). This lets the real schema.sql run, RLS included,
-- against a plain local/CI Postgres instance without Docker or the full
-- Supabase stack.
--
-- auth.uid() / auth.role() mirror Supabase's own implementation: they read
-- session-local settings that the test harness sets per "signed in as" user
-- via `set local`. See db-tests/helpers/db.ts.

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text
);

alter table storage.objects enable row level security;

-- Supabase provisions these roles automatically; a plain Postgres instance
-- does not have them yet.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated;
grant usage on schema storage to anon, authenticated;

-- Supabase publications aren't meaningful outside a real Supabase project
-- (no subscriber), and `alter publication ... add table` fails without one.
-- Stub the statement's target so schema.sql's realtime lines are no-ops here.
drop publication if exists supabase_realtime;
create publication supabase_realtime;
