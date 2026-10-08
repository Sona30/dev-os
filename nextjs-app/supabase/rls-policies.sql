-- =====================================================================
-- TestReady — security hardening (docs/security/security-plan.md)
-- Paste and run in the Supabase SQL Editor AFTER docs/specs/supabase-schema.sql (and 0002).
-- Idempotent: safe to run more than once.
--
-- What it does
--   1. rate_limit_events + rate_limit_check(): sliding-window rate limiting, service role only.
--   2. Row Level Security on every table (re-asserted).
--   3. Column-level write privileges: a signed-in parent can call the Supabase REST API directly with the
--      public anon key and their own session, bypassing our API's validation. RLS limits WHICH rows they can
--      touch; these grants limit WHICH COLUMNS. Everything else is written by the server (service role).
--   4. Removes direct parent writes to `reports` and `feedback` (the API writes them with the service role
--      after validating and screening the values).
--   5. Length checks on parent-typed text that is shown to the AI or stored.
--   6. Storage: parents can no longer upload objects outside the signed-upload flow.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Sliding-window rate limiting
--    subject = "user:<uuid>" | "ip:<sha256>" | "email:<sha256>"  (IPs and emails are never stored in clear)
--    action  = bucket name, e.g. "auth", "ai.hourly", "uploads.daily", "reports.create.hourly"
-- ---------------------------------------------------------------------
create table if not exists public.rate_limit_events (
  id         bigint      generated always as identity primary key,
  subject    text        not null check (char_length(subject) <= 128),
  action     text        not null check (char_length(action) <= 64),
  created_at timestamptz not null default now()
);
create index if not exists idx_rate_limit_events_lookup
  on public.rate_limit_events (subject, action, created_at desc);
create index if not exists idx_rate_limit_events_created
  on public.rate_limit_events (created_at);

alter table public.rate_limit_events enable row level security;
-- No user-facing policies: service role only.
revoke all on public.rate_limit_events from public, anon, authenticated;

-- Records one hit and returns 0 when allowed; when the window is full it records nothing and returns the
-- number of seconds until a slot frees up (used for the Retry-After header).
create or replace function public.rate_limit_check(
  p_subject text,
  p_action text,
  p_window_seconds integer,
  p_max integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_now   timestamptz := clock_timestamp();
  v_since timestamptz;
  v_count integer;
  v_freed timestamptz;
begin
  if p_subject is null or p_action is null or p_window_seconds is null or p_max is null
     or p_window_seconds <= 0 or p_max <= 0 then
    raise exception 'rate_limit_check: invalid arguments' using errcode = '22023';
  end if;

  -- Serialise concurrent checks for the same subject + bucket so two requests cannot both take the last slot.
  perform pg_advisory_xact_lock(hashtextextended(p_subject || '|' || p_action, 0));
  v_now := clock_timestamp();
  v_since := v_now - make_interval(secs => p_window_seconds);

  select count(*) into v_count
    from public.rate_limit_events
   where subject = p_subject and action = p_action and created_at > v_since;

  if v_count >= p_max then
    -- A slot frees up when the oldest event that keeps the window full ages out.
    select created_at into v_freed
      from public.rate_limit_events
     where subject = p_subject and action = p_action and created_at > v_since
     order by created_at asc
     offset (v_count - p_max)
     limit 1;
    return greatest(1, ceil(extract(epoch from (v_freed + make_interval(secs => p_window_seconds) - v_now)))::integer);
  end if;

  insert into public.rate_limit_events (subject, action, created_at) values (p_subject, p_action, v_now);
  return 0;
end;
$$;

revoke execute on function public.rate_limit_check(text, text, integer, integer) from public, anon, authenticated;
grant  execute on function public.rate_limit_check(text, text, integer, integer) to service_role;

-- The old fixed-window limiter is no longer called by the app. Kept (not dropped) so a rollback still works;
-- drop public.rate_limit_hit and public.rate_limits once the new code has been live for a few days.
revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Row Level Security on every table (no-op where already enabled)
-- ---------------------------------------------------------------------
alter table public.skills_catalog     enable row level security;
alter table public.profiles           enable row level security;
alter table public.subscriptions      enable row level security;
alter table public.children           enable row level security;
alter table public.reports            enable row level security;
alter table public.diagnoses          enable row level security;
alter table public.cycles             enable row level security;
alter table public.worksheets         enable row level security;
alter table public.worksheet_items    enable row level security;
alter table public.question_history   enable row level security;
alter table public.uploads            enable row level security;
alter table public.graded_items       enable row level security;
alter table public.skill_mastery      enable row level security;
alter table public.calibration_events enable row level security;
alter table public.feedback           enable row level security;
alter table public.jobs               enable row level security;
alter table public.usage_events       enable row level security;
alter table public.rate_limits        enable row level security;
alter table public.rate_limit_events  enable row level security;

-- ---------------------------------------------------------------------
-- 3. Table and column privileges
--    Signed-out visitors (anon) never read or write app tables: every request goes through our API.
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;

-- Server-written tables: parents may only read (RLS decides which rows).
revoke insert, update, delete on
  public.skills_catalog, public.subscriptions, public.diagnoses, public.cycles, public.worksheets,
  public.worksheet_items, public.question_history, public.skill_mastery, public.calibration_events,
  public.jobs, public.usage_events, public.rate_limits
from authenticated;

-- profiles: only the preferences a parent can change in Account settings.
-- (email and terms_accepted_at are records of the sign-up and must not be rewritten by the user.)
revoke insert, update, delete on public.profiles from authenticated;
grant update (paper_size, locale) on public.profiles to authenticated;

-- children: create with a nickname and grade; edit nickname, grade, Lexile and the reading baseline derived from
-- it. current_cycle (which gates the grade lock), profile_summary (sent to the AI) and the calibration streak
-- counters are server-only.
revoke insert, update on public.children from authenticated;
grant insert (user_id, nickname, grade) on public.children to authenticated;
grant update (nickname, grade, lexile, reading_band, reading_band_estimated, reading_up_streak, reading_down_streak)
  on public.children to authenticated;

-- reports: read-only for parents. Manual reports and confirmations are written by the API with the service
-- role, after Zod validation and prompt-injection screening, because these values are sent to the AI.
revoke insert, update, delete on public.reports from authenticated;
drop policy if exists reports_insert_manual on public.reports;
drop policy if exists reports_update_own on public.reports;

-- graded_items: a parent may only record their confirmation of an answer. The system judgement columns are
-- additionally protected by the graded_items_protect trigger.
revoke insert, update, delete on public.graded_items from authenticated;
grant update (parent_confirmed, parent_answer, final_status, overridden, confirmed_at)
  on public.graded_items to authenticated;

-- uploads: rows are created and updated by the API (quota and type checks); a parent may still delete their own.
revoke insert, update on public.uploads from authenticated;

-- feedback: written by the API with the service role after an ownership check.
revoke insert, update, delete on public.feedback from authenticated;
drop policy if exists feedback_insert_own on public.feedback;

-- ---------------------------------------------------------------------
-- 4. Length limits on parent-typed text (NOT VALID: enforced for new writes, existing rows are untouched)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reports_placement_length') then
    alter table public.reports
      add constraint reports_placement_length check (placement is null or char_length(placement) <= 80) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'graded_items_parent_answer_length') then
    alter table public.graded_items
      add constraint graded_items_parent_answer_length
      check (parent_answer is null or char_length(parent_answer) <= 40) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_locale_format') then
    alter table public.profiles
      add constraint profiles_locale_format
      check (char_length(locale) between 2 and 10 and locale ~ '^[A-Za-z0-9-]+$') not valid;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Functions: only what the app calls with a user session is executable by signed-in users
-- ---------------------------------------------------------------------
revoke execute on function public.claim_job(uuid)                        from public, anon, authenticated;
revoke execute on function public.allocate_cycle(uuid, uuid)             from public, anon, authenticated;
revoke execute on function public.apply_recalibration(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.set_waitlist_opt_in(boolean)           from public, anon;
revoke execute on function public.owns_child(uuid)                       from public, anon;
grant  execute on function public.set_waitlist_opt_in(boolean)           to authenticated;
grant  execute on function public.owns_child(uuid)                       to authenticated;

-- ---------------------------------------------------------------------
-- 6. Storage
--    Both buckets stay private (signed URLs only). Uploads go through signed upload URLs issued by the API
--    (uploads.sign), which do not need an INSERT policy, so the direct-upload policy is removed: a parent
--    can no longer put arbitrary objects in their folder outside the quota and type checks.
-- ---------------------------------------------------------------------
update storage.buckets set public = false where id in ('uploads', 'worksheets');
drop policy if exists uploads_objects_insert_own on storage.objects;

-- Make the new function visible to the REST API immediately.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- Check (optional): every public table has RLS enabled -> expect zero rows.
-- ---------------------------------------------------------------------
-- select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
