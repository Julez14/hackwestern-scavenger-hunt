DROP FUNCTION IF EXISTS public.deny_submission(integer, integer);
DROP FUNCTION IF EXISTS public.approve_submission(integer, integer);

DROP INDEX IF EXISTS public.submissions_team_status_idx;
DROP INDEX IF EXISTS public.submissions_item_status_idx;
DROP INDEX IF EXISTS public.submissions_one_approved_per_team_item;
DROP INDEX IF EXISTS public.submissions_one_pending_per_team_item;

DROP TABLE IF EXISTS public.submissions;
DROP TABLE IF EXISTS public.items;
DROP TABLE IF EXISTS public.teams;
