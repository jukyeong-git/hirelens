-- HL-020: allow authorized job participants to populate the Job form and list.
-- Rollback note: restore the previous profiles_select policy in a forward migration.

drop policy if exists profiles_select on public.profiles;

create policy profiles_select on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.is_admin()
  or (
    public.current_user_role() = 'RECRUITER'::public.app_role
    and role = 'HIRING_MANAGER'::public.app_role
  )
  or exists (
    select 1
    from public.jobs visible_job
    where (
      visible_job.recruiter_id = public.profiles.id
      or visible_job.hiring_manager_id = public.profiles.id
    )
    and public.can_access_job(visible_job.id)
  )
);
