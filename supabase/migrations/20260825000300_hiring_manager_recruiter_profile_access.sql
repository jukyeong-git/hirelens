-- Allow a Hiring Manager to choose an operating Recruiter when starting a
-- requisition, including before the manager has any existing assigned jobs.
-- Rollback note: remove this policy only with a forward migration after the
-- replacement authorization path has been verified.

create policy profiles_select_recruiters_for_hiring_manager on public.profiles
for select to authenticated
using (
  public.current_user_role() = 'HIRING_MANAGER'::public.app_role
  and role = 'RECRUITER'::public.app_role
);
