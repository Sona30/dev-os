-- =====================================================================
-- TestReady — Supabase schema
-- Paste into the Supabase SQL Editor and run once on a fresh project.
-- Source: docs/engineering/engineering-doc.md §7 (+ refinements listed in
-- docs/specs/00-overview-and-conventions.md §9).
--
-- Access model
--   * Parents read their own data through RLS using the user-scoped client.
--   * Parents directly WRITE only: children, reports (manual/confirm),
--     feedback, uploads (delete own), graded_items (confirm own).
--   * Everything derived (diagnoses, cycles, worksheets, items, history,
--     mastery, calibration events, jobs, usage) is written by server code with
--     the service-role key AFTER an ownership check. Owners get SELECT only.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;      -- gen_random_uuid()
create extension if not exists pg_trgm;       -- (reserved for near-duplicate question search)

-- ---------------------------------------------------------------------
-- 2. Enums
-- ---------------------------------------------------------------------
create type public.paper_size            as enum ('letter', 'a4');
create type public.plan_tier             as enum ('free', 'season', 'family', 'tutor');
create type public.subscription_status   as enum ('none', 'active', 'past_due', 'canceled');
create type public.reading_confidence    as enum ('low', 'med', 'high');
create type public.report_source         as enum ('upload', 'manual');
create type public.assessment_window     as enum ('BOY', 'MOY', 'EOY');
create type public.parse_status          as enum ('pending', 'parsed', 'manual', 'failed');
create type public.data_confidence       as enum ('high', 'medium', 'low');
create type public.cycle_status          as enum ('planned', 'generating', 'ready', 'grading', 'needs_review', 'graded', 'complete', 'failed');
create type public.answer_type           as enum ('integer', 'text', 'choice');
create type public.upload_kind           as enum ('report_page', 'completed_sheet', 'item_crop');
create type public.item_status           as enum ('correct', 'partial', 'incorrect', 'blank');
create type public.error_type            as enum ('calculation_slip', 'concept_gap', 'reading_difficulty', 'attention_copying', 'unclear');
create type public.mastery_status        as enum ('secure', 'developing', 'not_yet', 'not_enough_evidence');
create type public.trend_direction       as enum ('improving', 'steady', 'slipping');
create type public.calibration_axis      as enum ('math', 'reading');
create type public.calibration_source    as enum ('rules', 'parent_override', 'parent_feedback', 'baseline_reset');
create type public.difficulty_feedback   as enum ('too_hard', 'too_easy');
create type public.job_type              as enum ('parse_report', 'diagnose', 'generate_worksheet', 'rerender_pdf', 'grade_sheet', 'recalibrate', 'delete_child');
create type public.job_status            as enum ('queued', 'running', 'succeeded', 'failed');

-- ---------------------------------------------------------------------
-- 3. Generic helper functions
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Tables (dependency order)
-- ---------------------------------------------------------------------

-- 4.1 skills_catalog — reference data seeded from the SME-reviewed syllabus (kb/)
create table public.skills_catalog (
  skill_id       text primary key check (skill_id ~ '^G[12]\.[A-Z]{2,4}\.[0-9]{2}$'),
  grade          smallint not null check (grade in (1, 2)),
  domain         text not null check (domain in ('Number & Operations', 'Algebra & Algebraic Thinking', 'Measurement & Data', 'Geometry')),
  name           text not null,
  prerequisites  text[] not null default '{}',
  levels         jsonb not null,                          -- {"M1": "...", "M2": "...", "M3": "...", "M4": "..."}
  kb_version     text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index skills_catalog_grade_domain_idx on public.skills_catalog (grade, domain);
create trigger skills_catalog_set_updated_at before update on public.skills_catalog
  for each row execute function public.set_updated_at();

-- 4.2 profiles — one per auth user
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              text not null,
  paper_size         public.paper_size not null default 'letter',
  locale             text not null default 'en-US',
  terms_accepted_at  timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- 4.3 subscriptions — entitlement state (stub in MVP; Stripe fields used in Phase 2)
create table public.subscriptions (
  user_id                 uuid primary key references public.profiles (id) on delete cascade,
  plan                    public.plan_tier not null default 'free',
  status                  public.subscription_status not null default 'none',
  free_cycle_used         boolean not null default false,
  waitlist_opt_in         boolean not null default false,
  child_limit             smallint not null default 3 check (child_limit between 1 and 10),
  daily_cycle_cap         smallint not null default 3 check (daily_cycle_cap between 1 and 50),
  stripe_customer_id      text,
  stripe_subscription_id  text,
  current_period_end      timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create unique index subscriptions_stripe_customer_uidx on public.subscriptions (stripe_customer_id) where stripe_customer_id is not null;
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- 4.4 children
create table public.children (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.profiles (id) on delete cascade,
  nickname                 text not null check (char_length(nickname) between 1 and 30),
  grade                    smallint not null check (grade in (1, 2)),
  lexile                   integer check (lexile between 0 and 1500),
  reading_band             text check (reading_band in ('R1', 'R2', 'R3', 'R4')),
  reading_band_estimated   boolean not null default true,
  reading_confidence       public.reading_confidence not null default 'low',
  reading_up_streak        smallint not null default 0 check (reading_up_streak >= 0),
  reading_down_streak      smallint not null default 0 check (reading_down_streak >= 0),
  reading_evidence_cycles  smallint not null default 0 check (reading_evidence_cycles >= 0),
  current_cycle            integer not null default 0 check (current_cycle >= 0),
  profile_summary          jsonb,                           -- cached Child Profile payload (rebuilt after each cycle)
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (user_id, nickname)
);
create index children_user_idx on public.children (user_id);
create trigger children_set_updated_at before update on public.children
  for each row execute function public.set_updated_at();

-- 4.5 reports
create table public.reports (
  id                uuid primary key default gen_random_uuid(),
  child_id          uuid not null references public.children (id) on delete cascade,
  source            public.report_source not null,
  assessment_window public.assessment_window,   -- BOY / MOY / EOY ("window" is a reserved word in Postgres)
  overall_score     integer check (overall_score between 0 and 1000),
  placement         text,
  domain_results    jsonb,
  field_confidence  jsonb,
  parsed_values     jsonb,                                  -- raw agent output (immutable after parse)
  confirmed_values  jsonb,                                  -- parent-confirmed values
  confirmed_at      timestamptz,
  parse_status      public.parse_status not null default 'pending',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (confirmed_at is null or confirmed_values is not null)
);
create index reports_child_created_idx on public.reports (child_id, created_at desc);
create trigger reports_set_updated_at before update on public.reports
  for each row execute function public.set_updated_at();

-- 4.6 diagnoses
create table public.diagnoses (
  id               uuid primary key default gen_random_uuid(),
  child_id         uuid not null references public.children (id) on delete cascade,
  report_id        uuid not null references public.reports (id) on delete cascade,
  data_confidence  public.data_confidence not null,
  summary          text not null,
  gaps             jsonb not null default '[]',
  strengths        jsonb not null default '[]',
  recommendations  jsonb not null default '[]',
  unmapped_items   jsonb not null default '[]',
  kb_version       text not null,
  prompt_version   text not null,
  model            text not null,
  created_at       timestamptz not null default now()
);
create index diagnoses_child_created_idx on public.diagnoses (child_id, created_at desc);

-- 4.7 cycles
create table public.cycles (
  id                          uuid primary key default gen_random_uuid(),
  child_id                    uuid not null references public.children (id) on delete cascade,
  cycle_number                integer not null check (cycle_number >= 1),
  diagnosis_id                uuid references public.diagnoses (id) on delete set null,
  status                      public.cycle_status not null default 'planned',
  focus                       jsonb,                         -- chosen skills + axis plan
  regenerations_used          smallint not null default 0 check (regenerations_used between 0 and 1),
  parent_difficulty_feedback  public.difficulty_feedback,
  read_aloud                  boolean not null default false,
  summary                     text,
  calibration_text            text,
  completed_at                timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (child_id, cycle_number)
);
create index cycles_child_idx on public.cycles (child_id, cycle_number desc);
create trigger cycles_set_updated_at before update on public.cycles
  for each row execute function public.set_updated_at();

-- 4.8 worksheets
create table public.worksheets (
  id               uuid primary key default gen_random_uuid(),
  cycle_id         uuid not null references public.cycles (id) on delete cascade,
  child_id         uuid not null references public.children (id) on delete cascade,
  sheet_id         text not null unique check (sheet_id ~ '^TR-[A-Za-z0-9]{1,12}-C[0-9]{1,4}-[A-Z0-9]{4}$'),
  version          smallint not null default 1,
  is_current       boolean not null default true,
  superseded_by    uuid references public.worksheets (id) on delete set null,
  paper_size       public.paper_size not null,
  student_pdf_path text,
  key_pdf_path     text,
  prompt_version   text not null,
  model            text not null,
  kb_version       text not null,
  verified_at      timestamptz,                              -- set ONLY after every item passes verification
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index worksheets_one_current_per_cycle_uidx on public.worksheets (cycle_id) where is_current;
create index worksheets_child_idx on public.worksheets (child_id, created_at desc);
create trigger worksheets_set_updated_at before update on public.worksheets
  for each row execute function public.set_updated_at();

-- 4.9 worksheet_items
create table public.worksheet_items (
  id                uuid primary key default gen_random_uuid(),
  worksheet_id      uuid not null references public.worksheets (id) on delete cascade,
  position          smallint not null check (position between 1 and 10),
  skill_id          text not null references public.skills_catalog (skill_id),
  domain            text not null,
  math_level        smallint not null check (math_level between 1 and 4),
  reading_band      text not null check (reading_band in ('R1', 'R2', 'R3', 'R4')),
  pair_id           text,
  is_stretch        boolean not null default false,
  is_reading_probe  boolean not null default false,
  structure         text not null,
  context           text not null,
  number_set        jsonb not null,
  question_text     text not null,
  answer_type       public.answer_type not null,
  correct_answer    text not null,
  accepted_answers  text[] not null default '{}',            -- equivalent correct forms (e.g. '12', 'twelve')
  working           text not null,
  verification      jsonb not null,                          -- {expression, expected, passed, method}
  question_hash     text not null,
  key_flagged_wrong boolean not null default false,
  created_at        timestamptz not null default now(),
  unique (worksheet_id, position)
);
create index worksheet_items_worksheet_idx on public.worksheet_items (worksheet_id);
create index worksheet_items_hash_idx on public.worksheet_items (question_hash);

-- 4.10 question_history — one row per item ever shown to a child
create table public.question_history (
  id             uuid primary key default gen_random_uuid(),
  child_id       uuid not null references public.children (id) on delete cascade,
  worksheet_id   uuid not null references public.worksheets (id) on delete cascade,
  cycle_number   integer not null,
  skill_id       text not null,
  structure      text not null,
  context        text not null,
  number_set     jsonb not null,
  question_hash  text not null,
  context_structure_key text not null,                       -- lower(context) || '|' || structure
  number_set_key text not null,                              -- sorted, comma-joined numbers
  created_at     timestamptz not null default now()
);
create index question_history_child_cycle_idx on public.question_history (child_id, cycle_number desc);
create index question_history_child_hash_idx on public.question_history (child_id, question_hash);

-- 4.11 uploads
create table public.uploads (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  child_id       uuid not null references public.children (id) on delete cascade,
  kind           public.upload_kind not null,
  report_id      uuid references public.reports (id) on delete cascade,
  worksheet_id   uuid references public.worksheets (id) on delete cascade,
  storage_path   text not null unique,
  mime           text not null check (mime in ('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif')),
  bytes          integer not null check (bytes > 0 and bytes <= 10485760),
  page_no        smallint check (page_no between 1 and 5),
  quality_score  numeric(4, 3) check (quality_score between 0 and 1),
  confirmed_uploaded boolean not null default false,        -- set true once the object exists in Storage
  expires_at     timestamptz not null default (now() + interval '30 days'),
  deleted_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index uploads_child_idx on public.uploads (child_id, created_at desc);
create index uploads_expiry_idx on public.uploads (expires_at) where deleted_at is null;

-- 4.12 graded_items
create table public.graded_items (
  id                     uuid primary key default gen_random_uuid(),
  worksheet_item_id      uuid not null references public.worksheet_items (id) on delete cascade,
  cycle_id               uuid not null references public.cycles (id) on delete cascade,
  upload_id              uuid references public.uploads (id) on delete set null,
  extracted_answer       text,
  extraction_confidence  numeric(3, 2) not null check (extraction_confidence between 0 and 1),
  system_status          public.item_status not null,       -- immutable system judgement
  error_type             public.error_type,
  method_evidence        text,
  method_sound           boolean,                            -- null = could not tell
  needs_review           boolean not null default false,
  crop_path              text,
  parent_confirmed       boolean not null default false,
  parent_answer          text,
  final_status           public.item_status,
  overridden             boolean not null default false,
  confirmed_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (worksheet_item_id, cycle_id),
  check (parent_confirmed = false or final_status is not null)
);
create index graded_items_cycle_review_idx on public.graded_items (cycle_id, needs_review);
create trigger graded_items_set_updated_at before update on public.graded_items
  for each row execute function public.set_updated_at();

-- 4.13 skill_mastery
create table public.skill_mastery (
  id                uuid primary key default gen_random_uuid(),
  child_id          uuid not null references public.children (id) on delete cascade,
  skill_id          text not null references public.skills_catalog (skill_id),
  math_level        smallint not null check (math_level between 1 and 4),
  status            public.mastery_status not null default 'not_enough_evidence',
  evidence_count    integer not null default 0 check (evidence_count >= 0),
  secure_cycles     smallint not null default 0 check (secure_cycles >= 0),
  not_yet_cycles    smallint not null default 0 check (not_yet_cycles >= 0),
  last_seen_cycle   integer,
  score_history     smallint[] not null default '{}',        -- last 5 cycle scores: not_yet=0, developing=1, secure=2
  trend             public.trend_direction,                  -- null until >= 2 scored cycles
  manual_override   boolean not null default false,
  retest            boolean not null default false,          -- decay / prerequisite re-test flag read by the planner
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (child_id, skill_id)
);
create index skill_mastery_child_idx on public.skill_mastery (child_id);
create trigger skill_mastery_set_updated_at before update on public.skill_mastery
  for each row execute function public.set_updated_at();

-- 4.14 calibration_events
create table public.calibration_events (
  id          uuid primary key default gen_random_uuid(),
  child_id    uuid not null references public.children (id) on delete cascade,
  cycle_id    uuid references public.cycles (id) on delete set null,
  axis        public.calibration_axis not null,
  skill_id    text references public.skills_catalog (skill_id),
  from_level  text not null,
  to_level    text not null,
  reason      text not null,
  source      public.calibration_source not null,
  created_at  timestamptz not null default now()
);
create index calibration_events_child_idx on public.calibration_events (child_id, created_at desc);

-- 4.15 feedback
create table public.feedback (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  cycle_id      uuid not null references public.cycles (id) on delete cascade,
  worksheet_id  uuid not null references public.worksheets (id) on delete cascade,
  rating        smallint not null check (rating between 1 and 5),
  comment       text check (char_length(comment) <= 500),
  created_at    timestamptz not null default now(),
  unique (user_id, worksheet_id)
);

-- 4.16 jobs
create table public.jobs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  child_id       uuid references public.children (id) on delete cascade,
  type           public.job_type not null,
  status         public.job_status not null default 'queued',
  progress       jsonb not null default '{"step": "queued", "percent": 0}',
  input          jsonb not null default '{}',
  result         jsonb,
  error_code     text,
  error_message  text,
  attempts       smallint not null default 0 check (attempts between 0 and 3),
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index jobs_user_created_idx on public.jobs (user_id, created_at desc);
create index jobs_status_started_idx on public.jobs (status, started_at);
create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

-- 4.17 usage_events — child_id intentionally has no FK so deletion keeps cost history
create table public.usage_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  child_id       uuid,
  job_id         uuid,
  event          text not null,
  input_tokens   integer not null default 0,
  output_tokens  integer not null default 0,
  est_cost_usd   numeric(8, 4) not null default 0,
  created_at     timestamptz not null default now()
);
create index usage_events_user_created_idx on public.usage_events (user_id, created_at);
create index usage_events_event_created_idx on public.usage_events (event, created_at);

-- 4.18 rate_limits — fixed-window counters used by the API (stateless functions)
create table public.rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  count         integer not null default 0,
  primary key (key, window_start)
);
create index rate_limits_window_idx on public.rate_limits (window_start);

-- ---------------------------------------------------------------------
-- 5. Functions & triggers that depend on tables
-- ---------------------------------------------------------------------

-- 5.1 New auth user -> profile + subscription
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, terms_accepted_at)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data ->> 'terms_accepted_at', '')::timestamptz
  );
  insert into public.subscriptions (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5.2 Ownership helper used by every child-scoped RLS policy
create or replace function public.owns_child(p_child_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.children c
    where c.id = p_child_id and c.user_id = (select auth.uid())
  );
$$;

-- 5.3 Enforce the plan's child limit
create or replace function public.enforce_child_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit smallint;
  v_count integer;
begin
  select child_limit into v_limit from public.subscriptions where user_id = new.user_id;
  select count(*) into v_count from public.children where user_id = new.user_id;
  if v_count >= coalesce(v_limit, 3) then
    raise exception 'CHILD_LIMIT' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger children_enforce_limit before insert on public.children
  for each row execute function public.enforce_child_limit();

-- 5.4 Block grade changes once a cycle exists (GRADE_LOCKED)
create or replace function public.lock_grade_after_first_cycle()
returns trigger
language plpgsql
as $$
begin
  if new.grade is distinct from old.grade and old.current_cycle > 0 then
    raise exception 'GRADE_LOCKED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger children_lock_grade before update on public.children
  for each row execute function public.lock_grade_after_first_cycle();

-- 5.5 Protect immutable graded_items columns from parent edits
create or replace function public.protect_graded_items_system_columns()
returns trigger
language plpgsql
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;
  if new.worksheet_item_id is distinct from old.worksheet_item_id
     or new.cycle_id is distinct from old.cycle_id
     or new.upload_id is distinct from old.upload_id
     or new.extracted_answer is distinct from old.extracted_answer
     or new.extraction_confidence is distinct from old.extraction_confidence
     or new.system_status is distinct from old.system_status
     or new.error_type is distinct from old.error_type
     or new.needs_review is distinct from old.needs_review
     or new.crop_path is distinct from old.crop_path then
    raise exception 'IMMUTABLE_COLUMN' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger graded_items_protect before update on public.graded_items
  for each row execute function public.protect_graded_items_system_columns();

-- 5.6 Protect reports.parsed_values and block edits after confirmation (parents)
create or replace function public.protect_report_columns()
returns trigger
language plpgsql
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;
  if new.parsed_values is distinct from old.parsed_values
     or new.child_id is distinct from old.child_id
     or new.source is distinct from old.source
     or new.parse_status is distinct from old.parse_status then
    raise exception 'IMMUTABLE_COLUMN' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger reports_protect before update on public.reports
  for each row execute function public.protect_report_columns();

-- 5.7 Atomic job claim: queued -> running, increments attempts. Returns null row if not claimable.
create or replace function public.claim_job(p_job_id uuid)
returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs;
begin
  update public.jobs
     set status = 'running',
         started_at = now(),
         attempts = attempts + 1,
         progress = '{"step": "starting", "percent": 1}'::jsonb
   where id = p_job_id
     and status = 'queued'
     and attempts < 3
  returning * into v_job;
  return v_job;
end;
$$;

-- 5.8 Fixed-window rate limit. Returns true if the call is allowed.
create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;
  return v_count <= p_max;
end;
$$;

-- 5.9 Waitlist opt-in: the only subscription column a parent may change
create or replace function public.set_waitlist_opt_in(p_value boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.subscriptions set waitlist_opt_in = p_value where user_id = (select auth.uid());
$$;

-- 5.10 Atomic cycle-number allocation (call with service role)
create or replace function public.allocate_cycle(p_child_id uuid, p_diagnosis_id uuid)
returns public.cycles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
  v_cycle public.cycles;
begin
  update public.children set current_cycle = current_cycle + 1
   where id = p_child_id
  returning current_cycle into v_next;
  insert into public.cycles (child_id, cycle_number, diagnosis_id, status)
  values (p_child_id, v_next, p_diagnosis_id, 'generating')
  returning * into v_cycle;
  return v_cycle;
end;
$$;

-- 5.11 Apply a recalibration atomically (call with service role; see spec 10 §9)
create or replace function public.apply_recalibration(p_cycle_id uuid, p_child_id uuid, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status public.cycle_status;
begin
  select status into v_status
    from public.cycles
   where id = p_cycle_id and child_id = p_child_id
   for update;
  if not found then
    raise exception 'CYCLE_NOT_FOUND';
  end if;
  if v_status = 'complete' then
    return;
  end if;
  if v_status <> 'graded' then
    raise exception 'CYCLE_NOT_GRADED';
  end if;

  -- Skills the engine updated.
  insert into public.skill_mastery
    (child_id, skill_id, math_level, status, evidence_count, secure_cycles, not_yet_cycles,
     last_seen_cycle, score_history, trend, manual_override, retest)
  select p_child_id, m.skill_id, m.math_level, m.status::public.mastery_status, m.evidence_count,
         m.secure_cycles, m.not_yet_cycles, m.last_seen_cycle,
         coalesce(m.score_history, '{}')::smallint[], m.trend::public.trend_direction,
         coalesce(m.manual_override, false), coalesce(m.retest, false)
    from jsonb_to_recordset(coalesce(p_payload -> 'mastery', '[]'::jsonb)) as m(
      skill_id text, math_level smallint, status text, evidence_count integer, secure_cycles smallint,
      not_yet_cycles smallint, last_seen_cycle integer, score_history integer[], trend text,
      manual_override boolean, retest boolean)
  on conflict (child_id, skill_id) do update
    set math_level      = excluded.math_level,
        status          = excluded.status,
        evidence_count  = excluded.evidence_count,
        secure_cycles   = excluded.secure_cycles,
        not_yet_cycles  = excluded.not_yet_cycles,
        last_seen_cycle = excluded.last_seen_cycle,
        score_history   = excluded.score_history,
        trend           = excluded.trend,
        manual_override = excluded.manual_override,
        retest          = excluded.retest;

  -- Prerequisite skills to re-test after a level was lowered (created at a starting level if new).
  insert into public.skill_mastery (child_id, skill_id, math_level, retest)
  select p_child_id, r.skill_id, r.math_level, true
    from jsonb_to_recordset(coalesce(p_payload -> 'retest', '[]'::jsonb)) as r(skill_id text, math_level smallint)
  on conflict (child_id, skill_id) do update set retest = true;

  -- Reading level.
  update public.children
     set reading_band            = p_payload -> 'reading' ->> 'band',
         reading_band_estimated  = (p_payload -> 'reading' ->> 'estimated')::boolean,
         reading_confidence      = (p_payload -> 'reading' ->> 'confidence')::public.reading_confidence,
         reading_up_streak       = (p_payload -> 'reading' ->> 'up_streak')::smallint,
         reading_down_streak     = (p_payload -> 'reading' ->> 'down_streak')::smallint,
         reading_evidence_cycles = (p_payload -> 'reading' ->> 'evidence_cycles')::smallint
   where id = p_child_id;

  -- Change log (replaces any rule-based events from an earlier partial attempt).
  delete from public.calibration_events where cycle_id = p_cycle_id and source = 'rules';
  insert into public.calibration_events (child_id, cycle_id, axis, skill_id, from_level, to_level, reason, source)
  select p_child_id, p_cycle_id, e.axis::public.calibration_axis, e.skill_id, e.from_level, e.to_level,
         e.reason, 'rules'::public.calibration_source
    from jsonb_to_recordset(coalesce(p_payload -> 'events', '[]'::jsonb)) as e(
      axis text, skill_id text, from_level text, to_level text, reason text);

  -- Closing the cycle is last, so "complete" always means everything above was applied.
  update public.cycles
     set summary          = p_payload -> 'cycle' ->> 'summary',
         calibration_text = p_payload -> 'cycle' ->> 'calibration_text',
         focus            = coalesce(focus, '{}'::jsonb) || coalesce(p_payload -> 'cycle' -> 'focus', '{}'::jsonb),
         status           = 'complete',
         completed_at     = now()
   where id = p_cycle_id;
end;
$$;

-- Lock down service-only functions
revoke execute on function public.claim_job(uuid)                       from public, anon, authenticated;
revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.allocate_cycle(uuid, uuid)            from public, anon, authenticated;
grant  execute on function public.claim_job(uuid)                       to service_role;
grant  execute on function public.rate_limit_hit(text, integer, integer) to service_role;
grant  execute on function public.allocate_cycle(uuid, uuid)            to service_role;
revoke execute on function public.apply_recalibration(uuid, uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.apply_recalibration(uuid, uuid, jsonb) to service_role;
grant  execute on function public.set_waitlist_opt_in(boolean)          to authenticated;
grant  execute on function public.owns_child(uuid)                      to authenticated;

-- ---------------------------------------------------------------------
-- 6. Row Level Security
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
alter table public.rate_limits        enable row level security;   -- no policies: service role only

-- skills_catalog: readable by any signed-in user
create policy skills_catalog_select on public.skills_catalog
  for select to authenticated using (true);

-- profiles
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- subscriptions: read own only; writes via service role (webhook) or set_waitlist_opt_in()
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

-- children: full CRUD on own rows
create policy children_select_own on public.children
  for select to authenticated using (user_id = (select auth.uid()));
create policy children_insert_own on public.children
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy children_update_own on public.children
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy children_delete_own on public.children
  for delete to authenticated using (user_id = (select auth.uid()));

-- reports: parents create manual reports and confirm values; agent-parsed values are written by service role
create policy reports_select_own on public.reports
  for select to authenticated using (public.owns_child(child_id));
create policy reports_insert_manual on public.reports
  for insert to authenticated with check (public.owns_child(child_id) and source = 'manual');
create policy reports_update_own on public.reports
  for update to authenticated using (public.owns_child(child_id)) with check (public.owns_child(child_id));

-- Derived, server-written tables: owner SELECT only
create policy diagnoses_select_own on public.diagnoses
  for select to authenticated using (public.owns_child(child_id));
create policy cycles_select_own on public.cycles
  for select to authenticated using (public.owns_child(child_id));
create policy worksheets_select_own on public.worksheets
  for select to authenticated using (public.owns_child(child_id));
create policy question_history_select_own on public.question_history
  for select to authenticated using (public.owns_child(child_id));
create policy skill_mastery_select_own on public.skill_mastery
  for select to authenticated using (public.owns_child(child_id));
create policy calibration_events_select_own on public.calibration_events
  for select to authenticated using (public.owns_child(child_id));

-- worksheet_items: owner SELECT through the parent worksheet.
-- NOTE: contains correct_answer. The API MUST NOT return answer columns on student-safe endpoints
-- (see docs/specs/08-worksheet-generation.md §7); the answer key PDF is the parent-facing surface.
create policy worksheet_items_select_own on public.worksheet_items
  for select to authenticated using (
    exists (select 1 from public.worksheets w where w.id = worksheet_items.worksheet_id and public.owns_child(w.child_id))
  );

-- uploads: owner may read and delete (delete-now); inserts go through the server after quota checks
create policy uploads_select_own on public.uploads
  for select to authenticated using (user_id = (select auth.uid()));
create policy uploads_delete_own on public.uploads
  for delete to authenticated using (user_id = (select auth.uid()));

-- graded_items: owner reads; owner may confirm (update) — protected columns enforced by trigger above
create policy graded_items_select_own on public.graded_items
  for select to authenticated using (
    exists (select 1 from public.cycles c where c.id = graded_items.cycle_id and public.owns_child(c.child_id))
  );
create policy graded_items_update_own on public.graded_items
  for update to authenticated
  using (exists (select 1 from public.cycles c where c.id = graded_items.cycle_id and public.owns_child(c.child_id)))
  with check (exists (select 1 from public.cycles c where c.id = graded_items.cycle_id and public.owns_child(c.child_id)));

-- feedback
create policy feedback_select_own on public.feedback
  for select to authenticated using (user_id = (select auth.uid()));
create policy feedback_insert_own on public.feedback
  for insert to authenticated with check (user_id = (select auth.uid()));

-- jobs: owner may read their jobs (polling); all writes via service role
create policy jobs_select_own on public.jobs
  for select to authenticated using (user_id = (select auth.uid()));

-- usage_events: owner may read their own usage
create policy usage_events_select_own on public.usage_events
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 7. Storage buckets and policies
--    Object path convention: {user_id}/{child_id}/{kind}/{uuid}.{ext}
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('uploads',    'uploads',    false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'image/heif']),
  ('worksheets', 'worksheets', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists uploads_objects_select_own  on storage.objects;
drop policy if exists uploads_objects_insert_own  on storage.objects;
drop policy if exists uploads_objects_delete_own  on storage.objects;
drop policy if exists worksheets_objects_select_own on storage.objects;

create policy uploads_objects_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy uploads_objects_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy uploads_objects_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- worksheets bucket: owners may read their PDFs; only the service role writes/deletes
create policy worksheets_objects_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'worksheets' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------
-- 8. Metrics views (service-role / dashboard use only; see spec 14 §3)
-- ---------------------------------------------------------------------
create view public.v_cost_per_cycle_7d with (security_invoker = true) as
select
  coalesce(sum(est_cost_usd), 0)::numeric(10, 4)                                   as cost_usd,
  count(*) filter (where event = 'cycle.complete')                                  as cycles,
  case when count(*) filter (where event = 'cycle.complete') = 0 then null
       else round(sum(est_cost_usd) / count(*) filter (where event = 'cycle.complete'), 4) end as cost_per_cycle_usd
from public.usage_events
where created_at > now() - interval '7 days';

create view public.v_override_rate_7d with (security_invoker = true) as
select
  count(*) filter (where event = 'override.item:yes')                               as overrides,
  count(*) filter (where event like 'override.item:%')                              as confirmed_items,
  case when count(*) filter (where event like 'override.item:%') = 0 then null
       else round(count(*) filter (where event = 'override.item:yes')::numeric
                  / count(*) filter (where event like 'override.item:%'), 4) end    as override_rate
from public.usage_events
where created_at > now() - interval '7 days';

create view public.v_latency_p95_by_job_7d with (security_invoker = true) as
select
  type,
  count(*)                                                                                   as jobs,
  percentile_cont(0.95) within group (order by extract(epoch from (finished_at - started_at))) as p95_seconds
from public.jobs
where status = 'succeeded' and finished_at > now() - interval '7 days' and started_at is not null
group by type;

create view public.v_job_failure_rate_1h with (security_invoker = true) as
select
  type,
  count(*)                                           as jobs,
  count(*) filter (where status = 'failed')          as failed,
  round(count(*) filter (where status = 'failed')::numeric / nullif(count(*), 0), 4) as failure_rate
from public.jobs
where created_at > now() - interval '1 hour'
group by type;

create view public.v_loop_completion_30d with (security_invoker = true) as
select
  count(*) filter (where event = 'cycle.started')                                    as started,
  count(*) filter (where event = 'cycle.complete')                                   as completed,
  round(count(*) filter (where event = 'cycle.complete')::numeric
        / nullif(count(*) filter (where event = 'cycle.started'), 0), 4)             as completion_rate
from public.usage_events
where created_at > now() - interval '30 days';

create view public.v_key_flags_7d with (security_invoker = true) as
select count(*) as flags from public.usage_events
where event = 'key.flagged' and created_at > now() - interval '7 days';

create view public.v_monthly_spend with (security_invoker = true) as
select coalesce(sum(est_cost_usd), 0)::numeric(10, 2) as spend_usd
from public.usage_events
where created_at >= date_trunc('month', now());

revoke all on public.v_cost_per_cycle_7d, public.v_override_rate_7d, public.v_latency_p95_by_job_7d,
              public.v_job_failure_rate_1h, public.v_loop_completion_30d, public.v_key_flags_7d,
              public.v_monthly_spend from anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. Realtime (optional upgrade path for job polling)
-- ---------------------------------------------------------------------
-- alter publication supabase_realtime add table public.jobs;

-- =====================================================================
-- End of schema.
-- Seed skills_catalog separately with `npm run seed:catalog` (spec 07 §3)
-- after the syllabus files in kb/ are SME-approved.
-- THEN run nextjs-app/supabase/rls-policies.sql (security hardening: sliding-window rate limiting,
-- column-level write privileges, storage policy tightening). The app's rate limiter depends on it.
-- =====================================================================
