DROP FUNCTION IF EXISTS public.undo_approval(integer, integer);
DROP FUNCTION IF EXISTS public.set_auto_approval(integer, boolean);
DROP TRIGGER IF EXISTS submissions_apply_auto_approval ON public.submissions;
DROP FUNCTION IF EXISTS public.apply_auto_approval();
DROP TABLE IF EXISTS public.game_settings;
