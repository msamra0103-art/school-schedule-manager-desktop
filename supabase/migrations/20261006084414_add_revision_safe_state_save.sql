drop policy if exists schedule_state_insert on public.schedule_state;
drop policy if exists schedule_state_update on public.schedule_state;
revoke insert, update on public.schedule_state from authenticated;

create or replace function public.save_schedule_state(
  p_state jsonb,
  p_expected_revision bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_revision bigint;
  v_stamp timestamptz := now();
begin
  if not (select private.is_schedule_full_admin()) then
    raise exception 'هذه العملية متاحة للمدير كامل الصلاحيات فقط.';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'بيانات الجدول غير صالحة.';
  end if;
  if pg_column_size(p_state) > 8000000 then
    raise exception 'حجم بيانات الجدول أكبر من المسموح.';
  end if;

  select revision into v_revision
  from public.schedule_state
  where state_key = 'main'
  for update;

  if v_revision is null then
    if coalesce(p_expected_revision, 0) <> 0 then
      raise exception 'revision_conflict';
    end if;
    insert into public.schedule_state(state_key, state_json, revision, updated_at, updated_by)
    values ('main', p_state, 1, v_stamp, v_uid)
    returning revision into v_revision;
  else
    if v_revision <> coalesce(p_expected_revision, 0) then
      raise exception 'revision_conflict';
    end if;
    update public.schedule_state
    set state_json = p_state,
        revision = revision + 1,
        updated_at = v_stamp,
        updated_by = v_uid
    where state_key = 'main'
    returning revision into v_revision;
  end if;

  return jsonb_build_object(
    'ok', true,
    'revision', v_revision,
    'updatedAt', v_stamp
  );
end;
$$;

revoke all on function public.save_schedule_state(jsonb, bigint) from public, anon;
grant execute on function public.save_schedule_state(jsonb, bigint) to authenticated;
