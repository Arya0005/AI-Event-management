-- =============================================================================
-- RLS performance: evaluate event visibility once per query instead of once
-- per row. Per-row calls to can_view_event()/can_manage_event() cost ~16s to
-- scan 80k attendees; a set-returning function in an IN (select ...) subquery
-- is computed once and hashed. Permissions are unchanged.
-- =============================================================================

create or replace function public.managed_event_ids()
returns setof uuid
language sql stable
security definer
set search_path = public
as $$
  select e.id from public.events e
  where public.is_admin()
     or (public.app_role() = 'organizer' and e.organizer_id = auth.uid())
$$;

create or replace function public.visible_event_ids()
returns setof uuid
language sql stable
security definer
set search_path = public
as $$
  select public.managed_event_ids()
  union
  select s.event_id from public.event_staff s where s.user_id = auth.uid()
$$;

create or replace function public.staff_event_ids()
returns setof uuid
language sql stable
security definer
set search_path = public
as $$
  select s.event_id from public.event_staff s where s.user_id = auth.uid()
$$;

revoke all on function public.managed_event_ids() from public, anon;
revoke all on function public.visible_event_ids() from public, anon;
revoke all on function public.staff_event_ids() from public, anon;
grant execute on function public.managed_event_ids() to authenticated;
grant execute on function public.visible_event_ids() to authenticated;
grant execute on function public.staff_event_ids() to authenticated;

-- events: judged from the row's own columns, NOT from a lookup of the events
-- table — a row being inserted (INSERT ... RETURNING) isn't in that lookup yet.
drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated
  using (
    (select public.is_admin())
    or ((select public.app_role()) = 'organizer' and organizer_id = (select auth.uid()))
    or id in (select public.staff_event_ids())
  );

drop policy if exists events_update on public.events;
create policy events_update on public.events for update to authenticated
  using (
    (select public.is_admin())
    or ((select public.app_role()) = 'organizer' and organizer_id = (select auth.uid()))
  )
  with check (public.is_admin() or organizer_id = auth.uid());

drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete to authenticated
  using (
    (select public.is_admin())
    or ((select public.app_role()) = 'organizer' and organizer_id = (select auth.uid()))
  );

-- event_staff
drop policy if exists event_staff_select on public.event_staff;
create policy event_staff_select on public.event_staff for select to authenticated
  using (user_id = auth.uid() or event_id in (select public.managed_event_ids()));

drop policy if exists event_staff_write on public.event_staff;
create policy event_staff_write on public.event_staff for all to authenticated
  using (event_id in (select public.managed_event_ids()))
  with check (event_id in (select public.managed_event_ids()));

-- attendees (insert keeps the per-row check: it only ever sees one row)
drop policy if exists attendees_select on public.attendees;
create policy attendees_select on public.attendees for select to authenticated
  using (event_id in (select public.visible_event_ids()));

drop policy if exists attendees_update on public.attendees;
create policy attendees_update on public.attendees for update to authenticated
  using (event_id in (select public.visible_event_ids()))
  with check (event_id in (select public.visible_event_ids()));

drop policy if exists attendees_delete on public.attendees;
create policy attendees_delete on public.attendees for delete to authenticated
  using (event_id in (select public.managed_event_ids()));

-- revenue / expenses
drop policy if exists revenue_all on public.revenue;
create policy revenue_all on public.revenue for all to authenticated
  using (event_id in (select public.managed_event_ids()))
  with check (event_id in (select public.managed_event_ids()));

drop policy if exists expenses_all on public.expenses;
create policy expenses_all on public.expenses for all to authenticated
  using (event_id in (select public.managed_event_ids()))
  with check (event_id in (select public.managed_event_ids()));

-- predictions
drop policy if exists predictions_select on public.predictions;
create policy predictions_select on public.predictions for select to authenticated
  using (
    public.is_admin()
    or created_by = auth.uid()
    or event_id in (select public.managed_event_ids())
  );
