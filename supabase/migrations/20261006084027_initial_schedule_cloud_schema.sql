create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.schedule_accounts (
  id bigint generated always as identity primary key,
  user_id uuid unique references auth.users(id) on delete set null,
  email extensions.citext not null unique,
  username extensions.citext not null unique,
  display_name text not null check (length(btrim(display_name)) between 2 and 120),
  role text not null check (role in ('full', 'department')),
  department text,
  active boolean not null default true,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_accounts_department_check check (
    (role = 'full' and department is null)
    or (role = 'department' and nullif(btrim(department), '') is not null)
  )
);

create unique index schedule_accounts_one_primary_idx
  on public.schedule_accounts (is_primary)
  where is_primary;
create index schedule_accounts_user_active_idx
  on public.schedule_accounts (user_id, active);
create index schedule_accounts_role_department_idx
  on public.schedule_accounts (role, department)
  where active;

create table public.schedule_state (
  state_key text primary key default 'main',
  state_json jsonb not null default '{}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint schedule_state_main_key_check check (state_key = 'main'),
  constraint schedule_state_json_object_check check (jsonb_typeof(state_json) = 'object')
);

create index schedule_state_updated_by_idx on public.schedule_state (updated_by);

create table public.schedule_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index schedule_audit_log_actor_created_idx
  on public.schedule_audit_log (actor_user_id, created_at desc);
create index schedule_audit_log_created_idx
  on public.schedule_audit_log (created_at desc);

create or replace function private.has_active_schedule_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.schedule_accounts
    where user_id = (select auth.uid())
      and active
  );
$$;

create or replace function private.is_schedule_full_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.schedule_accounts
    where user_id = (select auth.uid())
      and active
      and role = 'full'
  );
$$;

create or replace function private.set_schedule_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.protect_primary_schedule_account()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.is_primary then
    raise exception 'لا يمكن حذف المدير الأساسي.';
  end if;
  if tg_op = 'UPDATE' and old.is_primary and (
    not new.is_primary or not new.active or new.role <> 'full'
  ) then
    raise exception 'لا يمكن تعطيل المدير الأساسي أو تقليل صلاحياته.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.audit_schedule_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.schedule_audit_log(actor_user_id, action, details)
  values (
    (select auth.uid()),
    tg_table_name || '_' || lower(tg_op),
    jsonb_build_object(
      'record_id', coalesce(
        to_jsonb(new) ->> 'id',
        to_jsonb(old) ->> 'id',
        to_jsonb(new) ->> 'state_key',
        to_jsonb(old) ->> 'state_key'
      ),
      'role', coalesce(to_jsonb(new) ->> 'role', to_jsonb(old) ->> 'role'),
      'department', coalesce(to_jsonb(new) ->> 'department', to_jsonb(old) ->> 'department')
    )
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger schedule_accounts_set_updated_at
before update on public.schedule_accounts
for each row execute function private.set_schedule_updated_at();

create trigger schedule_accounts_protect_primary
before update or delete on public.schedule_accounts
for each row execute function private.protect_primary_schedule_account();

create trigger schedule_accounts_audit
after insert or update or delete on public.schedule_accounts
for each row execute function private.audit_schedule_change();

create trigger schedule_state_audit
after insert or update on public.schedule_state
for each row execute function private.audit_schedule_change();

create or replace function private.link_schedule_account_after_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.schedule_accounts
  set user_id = new.id,
      updated_at = now()
  where lower(email::text) = lower(new.email)
    and user_id is null;
  return new;
end;
$$;

create trigger link_schedule_account_after_signup
after insert or update of email on auth.users
for each row execute function private.link_schedule_account_after_signup();

create or replace function public.claim_my_schedule_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  v_account public.schedule_accounts%rowtype;
begin
  if v_uid is null or v_email = '' then
    raise exception 'يجب تسجيل الدخول أولًا.';
  end if;

  update public.schedule_accounts
  set user_id = v_uid,
      updated_at = now()
  where lower(email::text) = v_email
    and user_id is null;

  select * into v_account
  from public.schedule_accounts
  where user_id = v_uid
    and active;

  if v_account.id is null then
    raise exception 'هذا البريد غير مضاف إلى حسابات برنامج الجدول.';
  end if;

  return to_jsonb(v_account);
end;
$$;

create or replace function public.save_department_substitutions(p_records jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_account public.schedule_accounts%rowtype;
  v_state jsonb;
  v_retained jsonb := '[]'::jsonb;
  v_stamp timestamptz := now();
  v_revision bigint;
begin
  if jsonb_typeof(p_records) <> 'array' then
    raise exception 'سجل التبديلات غير صالح.';
  end if;

  select * into v_account
  from public.schedule_accounts
  where user_id = v_uid and active;

  if v_account.id is null then
    raise exception 'الحساب غير مصرح له.';
  end if;

  select state_json into v_state
  from public.schedule_state
  where state_key = 'main'
  for update;

  if v_state is null then
    raise exception 'يجب أن يحفظ المدير الأساسي الجدول أولًا.';
  end if;

  if v_account.role = 'department' then
    if exists (
      select 1
      from jsonb_array_elements(p_records) as record
      where not exists (
        select 1
        from jsonb_array_elements(coalesce(v_state -> 'teachers', '[]'::jsonb)) as teacher
        where teacher ->> 'id' = record ->> 'absentTeacherId'
          and teacher ->> 'department' = v_account.department
      )
    ) then
      raise exception 'يمكنك تعديل غياب واستئذان معلمي قسمك فقط.';
    end if;

    select coalesce(jsonb_agg(record), '[]'::jsonb)
    into v_retained
    from jsonb_array_elements(coalesce(v_state -> 'dailySubstitutions', '[]'::jsonb)) as record
    where not exists (
      select 1
      from jsonb_array_elements(coalesce(v_state -> 'teachers', '[]'::jsonb)) as teacher
      where teacher ->> 'id' = record ->> 'absentTeacherId'
        and teacher ->> 'department' = v_account.department
    );

    v_state := jsonb_set(v_state, '{dailySubstitutions}', v_retained || p_records, true);
  else
    v_state := jsonb_set(v_state, '{dailySubstitutions}', p_records, true);
  end if;

  update public.schedule_state
  set state_json = v_state,
      revision = revision + 1,
      updated_at = v_stamp,
      updated_by = v_uid
  where state_key = 'main'
  returning revision into v_revision;

  insert into public.schedule_audit_log(actor_user_id, action, details)
  values (v_uid, 'update_substitutions', jsonb_build_object('department', coalesce(v_account.department, 'all')));

  return jsonb_build_object('ok', true, 'updatedAt', v_stamp, 'revision', v_revision);
end;
$$;

alter table public.schedule_accounts enable row level security;
alter table public.schedule_state enable row level security;
alter table public.schedule_audit_log enable row level security;

create policy schedule_accounts_select
on public.schedule_accounts for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_schedule_full_admin())
);

create policy schedule_accounts_insert
on public.schedule_accounts for insert
to authenticated
with check ((select private.is_schedule_full_admin()));

create policy schedule_accounts_update
on public.schedule_accounts for update
to authenticated
using ((select private.is_schedule_full_admin()))
with check ((select private.is_schedule_full_admin()));

create policy schedule_accounts_delete
on public.schedule_accounts for delete
to authenticated
using ((select private.is_schedule_full_admin()));

create policy schedule_state_select
on public.schedule_state for select
to authenticated
using ((select private.has_active_schedule_account()));

create policy schedule_state_insert
on public.schedule_state for insert
to authenticated
with check ((select private.is_schedule_full_admin()));

create policy schedule_state_update
on public.schedule_state for update
to authenticated
using ((select private.is_schedule_full_admin()))
with check ((select private.is_schedule_full_admin()));

create policy schedule_audit_log_select
on public.schedule_audit_log for select
to authenticated
using ((select private.is_schedule_full_admin()));

revoke all on public.schedule_accounts from anon, authenticated;
revoke all on public.schedule_state from anon, authenticated;
revoke all on public.schedule_audit_log from anon, authenticated;
grant select, insert, update, delete on public.schedule_accounts to authenticated;
grant select, insert, update on public.schedule_state to authenticated;
grant select on public.schedule_audit_log to authenticated;
grant usage, select on sequence public.schedule_accounts_id_seq to authenticated;

revoke all on function public.claim_my_schedule_account() from public, anon;
grant execute on function public.claim_my_schedule_account() to authenticated;
revoke all on function public.save_department_substitutions(jsonb) from public, anon;
grant execute on function public.save_department_substitutions(jsonb) to authenticated;

grant execute on function private.has_active_schedule_account() to authenticated;
grant execute on function private.is_schedule_full_admin() to authenticated;

insert into public.schedule_accounts (
  email, username, display_name, role, department, active, is_primary
)
values (
  'm.samra0103@gmail.com', 'M.samra0103', 'المدير الأساسي', 'full', null, true, true
)
on conflict (email) do update
set username = excluded.username,
    display_name = excluded.display_name,
    role = 'full',
    department = null,
    active = true,
    is_primary = true,
    updated_at = now();
