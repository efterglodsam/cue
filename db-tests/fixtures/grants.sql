-- Supabase grants broad table-level privileges to `anon`/`authenticated` and
-- lets Row Level Security narrow things down per-row. A plain Postgres
-- instance doesn't set this up on its own, so replicate it after
-- supabase/schema.sql has created the tables.

grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant select, insert, delete on storage.objects to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
