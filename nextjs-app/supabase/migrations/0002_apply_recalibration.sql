-- =====================================================================
-- apply_recalibration — writes the result of a recalibration atomically.
-- Run this in the Supabase SQL Editor if you applied 0001 before this feature existed.
-- (It is also included in docs/specs/supabase-schema.sql for fresh projects.)
--
-- One transaction updates the skills, the reading level, the change log and the cycle together, so a crash
-- can never leave levels half-updated (which would double-count on retry). Safe to call twice: a cycle that
-- is already complete is left alone.
-- =====================================================================
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

revoke execute on function public.apply_recalibration(uuid, uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.apply_recalibration(uuid, uuid, jsonb) to service_role;
