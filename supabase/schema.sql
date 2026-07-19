-- Bypass: profiles, clips, run_requests, user_settings
-- Run this in the Supabase SQL editor after creating a project.

-- ---------------------------------------------------------------------------
-- profiles
--
-- Supabase Auth is email/password under the hood. To give users a plain
-- username + password experience, the app signs up/logs in with a
-- deterministic, fake internal email derived from the username
-- (`<username>@bypass.local`) and never shows that email anywhere. This
-- table stores the human-readable username for display and is populated
-- right after signup.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

create unique index if not exists profiles_username_unique_idx
  on public.profiles (username);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- clips
-- ---------------------------------------------------------------------------
create table if not exists public.clips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  content text not null default '',
  min_wpm integer not null default 40 check (min_wpm > 0),
  max_wpm integer not null default 80 check (max_wpm > 0),
  mistakes_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clips_wpm_range check (min_wpm <= max_wpm)
);

create index if not exists clips_user_id_idx on public.clips (user_id);

alter table public.clips enable row level security;

drop policy if exists "clips_select_own" on public.clips;
create policy "clips_select_own"
  on public.clips for select
  using (auth.uid() = user_id);

drop policy if exists "clips_insert_own" on public.clips;
create policy "clips_insert_own"
  on public.clips for insert
  with check (auth.uid() = user_id);

drop policy if exists "clips_update_own" on public.clips;
create policy "clips_update_own"
  on public.clips for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "clips_delete_own" on public.clips;
create policy "clips_delete_own"
  on public.clips for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- run_requests
-- ---------------------------------------------------------------------------
create table if not exists public.run_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  clip_id uuid not null references public.clips (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'running', 'paused', 'completed', 'cancelled', 'failed')),
  progress_index integer not null default 0 check (progress_index >= 0),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists run_requests_user_status_idx
  on public.run_requests (user_id, status);

create index if not exists run_requests_clip_id_idx
  on public.run_requests (clip_id);

alter table public.run_requests enable row level security;

drop policy if exists "run_requests_select_own" on public.run_requests;
create policy "run_requests_select_own"
  on public.run_requests for select
  using (auth.uid() = user_id);

drop policy if exists "run_requests_insert_own" on public.run_requests;
create policy "run_requests_insert_own"
  on public.run_requests for insert
  with check (auth.uid() = user_id);

drop policy if exists "run_requests_update_own" on public.run_requests;
create policy "run_requests_update_own"
  on public.run_requests for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "run_requests_delete_own" on public.run_requests;
create policy "run_requests_delete_own"
  on public.run_requests for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- user_settings
-- ---------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  scroll_enabled boolean not null default false,
  scroll_min_pause_ms integer not null default 1500 check (scroll_min_pause_ms >= 0),
  scroll_max_pause_ms integer not null default 5000 check (scroll_max_pause_ms >= 0),
  scroll_min_amount_px integer not null default 80 check (scroll_min_amount_px >= 0),
  scroll_max_amount_px integer not null default 400 check (scroll_max_amount_px >= 0),
  scroll_min_speed_px_s integer not null default 200 check (scroll_min_speed_px_s > 0),
  scroll_max_speed_px_s integer not null default 800 check (scroll_max_speed_px_s > 0),
  updated_at timestamptz not null default now(),
  constraint user_settings_pause_range check (scroll_min_pause_ms <= scroll_max_pause_ms),
  constraint user_settings_amount_range check (scroll_min_amount_px <= scroll_max_amount_px),
  constraint user_settings_speed_range check (scroll_min_speed_px_s <= scroll_max_speed_px_s)
);

-- Safe to re-run on a project created before scroll speed was added.
alter table public.user_settings
  add column if not exists scroll_min_speed_px_s integer not null default 200 check (scroll_min_speed_px_s > 0);
alter table public.user_settings
  add column if not exists scroll_max_speed_px_s integer not null default 800 check (scroll_max_speed_px_s > 0);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_settings_speed_range'
  ) then
    alter table public.user_settings
      add constraint user_settings_speed_range check (scroll_min_speed_px_s <= scroll_max_speed_px_s);
  end if;
end $$;

alter table public.user_settings enable row level security;

drop policy if exists "user_settings_select_own" on public.user_settings;
create policy "user_settings_select_own"
  on public.user_settings for select
  using (auth.uid() = user_id);

drop policy if exists "user_settings_insert_own" on public.user_settings;
create policy "user_settings_insert_own"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_update_own"
  on public.user_settings for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clips_set_updated_at on public.clips;
create trigger clips_set_updated_at
  before update on public.clips
  for each row execute function public.set_updated_at();

drop trigger if exists run_requests_set_updated_at on public.run_requests;
create trigger run_requests_set_updated_at
  before update on public.run_requests
  for each row execute function public.set_updated_at();

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create user_settings on signup
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
