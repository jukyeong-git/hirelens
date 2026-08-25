-- Normalize synthetic profile display names for the internal workspace.
-- Forward-only data correction: no automatic rollback is provided because the
-- removed prefix is presentation noise, not user-authored profile data.

update public.profiles
set display_name = regexp_replace(display_name, '^Demo[[:space:]]+', '', 1, 1, 'i')
where display_name ~* '^Demo[[:space:]]+';
