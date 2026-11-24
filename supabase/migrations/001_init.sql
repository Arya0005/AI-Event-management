-- =============================================================================
-- AI Event Management System — initial schema
--
-- Roles live in auth.users.raw_app_meta_data->>'role' (admin | organizer | staff)
-- so they are carried inside the Supabase JWT and cannot be edited by users.
-- public.profiles mirrors them for display/listing.
--
-- Permission matrix (enforced here by RLS and again in FastAPI):
--   admin      everything, including role management and audit logs
--   organizer  full control of the events they own (and their attendees/finance)
--   staff      read assigned events; view/add/update attendees of those events
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

create or replace function public.app_role()
returns text
language sql stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'staff')
$$;

create or replace function public.is_admin()
returns boolean
language sql stable
as $$
  select public.app_role() = 'admin'
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profiles (mirror of auth.users)
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text not null default 'staff' check (role in ('admin', 'organizer', 'staff')),
  created_at  timestamptz not null default now()
);

create or replace function public.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_app_meta_data ->> 'role', 'staff')
  )
  on conflict (id) do update
    set email     = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        role      = excluded.role;
  return new;
end;
$$;

drop trigger if exists on_auth_user_changed on auth.users;
create trigger on_auth_user_changed
  after insert or update of email, raw_app_meta_data, raw_user_meta_data on auth.users
  for each row execute function public.sync_profile_from_auth();

-- Backfill users that existed before this migration.
insert into public.profiles (id, email, full_name, role)
select u.id,
       coalesce(u.email, ''),
       coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
       coalesce(u.raw_app_meta_data ->> 'role', 'staff')
from auth.users u
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Events
-- -----------------------------------------------------------------------------

create table if not exists public.events (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(trim(name)) > 0),
  description      text,
  event_type       text not null,
  venue            text,
  start_date       timestamptz not null,
  end_date         timestamptz not null,
  capacity         integer not null check (capacity > 0),
  ticket_price     numeric(12, 2) not null default 0 check (ticket_price >= 0),
  budget           numeric(14, 2) not null default 0 check (budget >= 0),
  marketing_budget numeric(14, 2) not null default 0 check (marketing_budget >= 0),
  status           text not null default 'draft' check (status in (
                     'draft', 'published', 'registration_open', 'registration_closed',
                     'completed', 'cancelled')),
  organizer_id     uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists events_organizer_idx on public.events (organizer_id);
create index if not exists events_status_idx on public.events (status);
create index if not exists events_start_idx on public.events (start_date);
create index if not exists events_type_idx on public.events (event_type);

drop trigger if exists events_updated_at on public.events;
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

create table if not exists public.event_staff (
  event_id    uuid not null references public.events (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists event_staff_user_idx on public.event_staff (user_id);

-- Access helpers. SECURITY DEFINER so policies on child tables don't recurse
-- through the events/event_staff policies.
create or replace function public.can_manage_event(p_event_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or exists (select 1 from public.events e
                 where e.id = p_event_id
                   and e.organizer_id = auth.uid()
                   and public.app_role() = 'organizer')
$$;

create or replace function public.can_view_event(p_event_id uuid)
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select public.can_manage_event(p_event_id)
      or exists (select 1 from public.event_staff s
                 where s.event_id = p_event_id and s.user_id = auth.uid())
$$;

-- -----------------------------------------------------------------------------
-- Attendees
-- -----------------------------------------------------------------------------

create table if not exists public.attendees (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references public.events (id) on delete cascade,
  name               text not null,
  email              text not null,
  phone              text,
  ticket_type        text not null default 'general',
  ticket_price       numeric(12, 2) not null default 0 check (ticket_price >= 0),
  payment_status     text not null default 'pending'
                       check (payment_status in ('pending', 'paid', 'refunded')),
  attendance_status  text not null default 'registered'
                       check (attendance_status in ('registered', 'attended', 'no_show', 'cancelled')),
  registered_at      timestamptz not null default now(),
  unique (event_id, email)
);

create index if not exists attendees_event_idx on public.attendees (event_id);

-- -----------------------------------------------------------------------------
-- Finance. Ticket revenue is derived from paid attendees, so the revenue table
-- only holds non-ticket income — this avoids double counting.
-- -----------------------------------------------------------------------------

create table if not exists public.revenue (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  source       text not null check (source in ('sponsorship', 'merchandise', 'food_beverage', 'other')),
  amount       numeric(14, 2) not null check (amount >= 0),
  description  text,
  created_at   timestamptz not null default now()
);

create index if not exists revenue_event_idx on public.revenue (event_id);

create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  category     text not null check (category in (
                 'venue', 'equipment', 'staff', 'marketing', 'catering', 'logistics', 'other')),
  amount       numeric(14, 2) not null check (amount >= 0),
  description  text,
  created_at   timestamptz not null default now()
);

create index if not exists expenses_event_idx on public.expenses (event_id);

-- -----------------------------------------------------------------------------
-- Predictions & audit
-- -----------------------------------------------------------------------------

create table if not exists public.predictions (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid references public.events (id) on delete cascade,
  prediction_type  text not null check (prediction_type in ('attendance', 'revenue', 'success')),
  predicted_value  numeric(16, 4) not null,
  model_version    text not null,
  input_snapshot   jsonb not null,
  output           jsonb,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);

create index if not exists predictions_event_idx on public.predictions (event_id);
create index if not exists predictions_created_by_idx on public.predictions (created_by);

create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  user_id     uuid,
  action      text not null,
  table_name  text not null,
  record_id   text,
  details     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
begin
  -- Only log actions performed by an authenticated user (not seed/training jobs).
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;

  insert into public.audit_logs (user_id, action, table_name, record_id, details)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'event_id'),
    case when tg_op = 'UPDATE'
         then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
         else v_row end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_events on public.events;
create trigger audit_events after insert or update or delete on public.events
  for each row execute function public.audit_row_change();

drop trigger if exists audit_event_staff on public.event_staff;
create trigger audit_event_staff after insert or delete on public.event_staff
  for each row execute function public.audit_row_change();

drop trigger if exists audit_revenue on public.revenue;
create trigger audit_revenue after insert or update or delete on public.revenue
  for each row execute function public.audit_row_change();

drop trigger if exists audit_expenses on public.expenses;
create trigger audit_expenses after insert or update or delete on public.expenses
  for each row execute function public.audit_row_change();

-- Attendee inserts/updates are high volume; only deletions are audited.
drop trigger if exists audit_attendees on public.attendees;
create trigger audit_attendees after delete on public.attendees
  for each row execute function public.audit_row_change();

-- -----------------------------------------------------------------------------
-- Role management (admin only, enforced inside the function)
-- -----------------------------------------------------------------------------

create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'organizer', 'staff') then
    raise exception 'Invalid role %', p_role using errcode = '22023';
  end if;

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p_role)
   where id = p_user_id;

  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  insert into public.audit_logs (user_id, action, table_name, record_id, details)
  values (auth.uid(), 'set_role', 'profiles', p_user_id::text, jsonb_build_object('role', p_role));
end;
$$;

revoke all on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles    enable row level security;
alter table public.events      enable row level security;
alter table public.event_staff enable row level security;
alter table public.attendees   enable row level security;
alter table public.revenue     enable row level security;
alter table public.expenses    enable row level security;
alter table public.predictions enable row level security;
alter table public.audit_logs  enable row level security;

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.app_role() in ('admin', 'organizer'));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));

-- events
drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated
  using (public.can_view_event(id));

drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert to authenticated
  with check (
    public.is_admin()
    or (public.app_role() = 'organizer' and organizer_id = auth.uid())
  );

drop policy if exists events_update on public.events;
create policy events_update on public.events for update to authenticated
  using (public.can_manage_event(id))
  with check (public.is_admin() or organizer_id = auth.uid());

drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete to authenticated
  using (public.can_manage_event(id));

-- event_staff
drop policy if exists event_staff_select on public.event_staff;
create policy event_staff_select on public.event_staff for select to authenticated
  using (user_id = auth.uid() or public.can_manage_event(event_id));

drop policy if exists event_staff_write on public.event_staff;
create policy event_staff_write on public.event_staff for all to authenticated
  using (public.can_manage_event(event_id))
  with check (public.can_manage_event(event_id));

-- attendees: staff may view/add/update for assigned events; only managers delete
drop policy if exists attendees_select on public.attendees;
create policy attendees_select on public.attendees for select to authenticated
  using (public.can_view_event(event_id));

drop policy if exists attendees_insert on public.attendees;
create policy attendees_insert on public.attendees for insert to authenticated
  with check (public.can_view_event(event_id));

drop policy if exists attendees_update on public.attendees;
create policy attendees_update on public.attendees for update to authenticated
  using (public.can_view_event(event_id))
  with check (public.can_view_event(event_id));

drop policy if exists attendees_delete on public.attendees;
create policy attendees_delete on public.attendees for delete to authenticated
  using (public.can_manage_event(event_id));

-- revenue / expenses: managers only
drop policy if exists revenue_all on public.revenue;
create policy revenue_all on public.revenue for all to authenticated
  using (public.can_manage_event(event_id))
  with check (public.can_manage_event(event_id));

drop policy if exists expenses_all on public.expenses;
create policy expenses_all on public.expenses for all to authenticated
  using (public.can_manage_event(event_id))
  with check (public.can_manage_event(event_id));

-- predictions
drop policy if exists predictions_select on public.predictions;
create policy predictions_select on public.predictions for select to authenticated
  using (
    public.is_admin()
    or created_by = auth.uid()
    or (event_id is not null and public.can_manage_event(event_id))
  );

drop policy if exists predictions_insert on public.predictions;
create policy predictions_insert on public.predictions for insert to authenticated
  with check (
    public.app_role() in ('admin', 'organizer')
    and created_by = auth.uid()
    and (event_id is null or public.can_manage_event(event_id))
  );

-- audit logs: admins read; rows are written only by SECURITY DEFINER functions
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.is_admin());
