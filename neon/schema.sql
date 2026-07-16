begin;

create schema if not exists c2_internal;
revoke all on schema c2_internal from public;

create table if not exists public.c2_attempts (
  id text primary key,
  user_id text not null default (auth.user_id()),
  legacy_supabase_user_id uuid,
  section text not null,
  correct integer not null default 0,
  total integer not null default 0,
  percentage numeric not null default 0,
  scale_score integer not null default 0,
  answers jsonb not null default '{}'::jsonb,
  graded_states jsonb not null default '{}'::jsonb,
  attempted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  migration_version text not null default 'neon-v1',
  constraint c2_attempts_user_id_not_blank check (length(btrim(user_id)) > 0)
);

create table if not exists public.c2_user_mappings (
  neon_user_id uuid primary key references neon_auth."user"(id) on delete cascade,
  legacy_supabase_user_id uuid not null unique,
  email_sha256 text not null,
  migration_version text not null default 'supabase-to-neon-v1',
  created_at timestamptz not null default now(),
  constraint c2_user_mappings_email_sha256_format check (email_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists c2_attempts_user_date_idx
  on public.c2_attempts (user_id, attempted_at);

create index if not exists c2_attempts_legacy_user_idx
  on public.c2_attempts (legacy_supabase_user_id);

create or replace function c2_internal.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if current_setting('c2.restore_mode', true) = 'on' then
    return new;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function c2_internal.set_updated_at() from public;

drop trigger if exists c2_attempts_set_updated_at on public.c2_attempts;
create trigger c2_attempts_set_updated_at
before update on public.c2_attempts
for each row execute function c2_internal.set_updated_at();

alter table public.c2_attempts enable row level security;
alter table public.c2_attempts force row level security;
alter table public.c2_user_mappings enable row level security;
alter table public.c2_user_mappings force row level security;

drop policy if exists "C2 users select their rows" on public.c2_attempts;
create policy "C2 users select their rows"
on public.c2_attempts
for select
to authenticated
using ((select auth.user_id()) = user_id);

drop policy if exists "C2 users insert their rows" on public.c2_attempts;
create policy "C2 users insert their rows"
on public.c2_attempts
for insert
to authenticated
with check ((select auth.user_id()) = user_id);

drop policy if exists "C2 users update their rows" on public.c2_attempts;
create policy "C2 users update their rows"
on public.c2_attempts
for update
to authenticated
using ((select auth.user_id()) = user_id)
with check ((select auth.user_id()) = user_id);

drop policy if exists "C2 users delete their rows" on public.c2_attempts;
create policy "C2 users delete their rows"
on public.c2_attempts
for delete
to authenticated
using ((select auth.user_id()) = user_id);

drop policy if exists "C2 users read their legacy mapping" on public.c2_user_mappings;
create policy "C2 users read their legacy mapping"
on public.c2_user_mappings
for select
to authenticated
using ((select auth.user_id()) = neon_user_id::text);

revoke all on public.c2_attempts from public, anonymous, authenticated;
grant select, insert, update, delete on public.c2_attempts to authenticated;

revoke all on public.c2_user_mappings from public, anonymous, authenticated;
grant select on public.c2_user_mappings to authenticated;

commit;
