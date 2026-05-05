CREATE TABLE IF NOT EXISTS public.game_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  auto_approval_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by integer
);

INSERT INTO public.game_settings (id, auto_approval_enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.apply_auto_approval()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  auto_approval_enabled boolean;
  item_points integer;
BEGIN
  NEW.status = 'pending';
  NEW.reviewed_at = NULL;
  NEW.reviewed_by = NULL;

  SELECT game_settings.auto_approval_enabled INTO auto_approval_enabled
  FROM public.game_settings
  WHERE id = 1;

  IF auto_approval_enabled THEN
    NEW.status = 'approved';
    NEW.reviewed_at = now();
    NEW.reviewed_by = 6145;

    SELECT points INTO item_points
    FROM public.items
    WHERE id = NEW.item_id;

    UPDATE public.teams
    SET score = score + COALESCE(item_points, 0)
    WHERE id = NEW.team_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS submissions_apply_auto_approval ON public.submissions;
CREATE TRIGGER submissions_apply_auto_approval
  BEFORE INSERT ON public.submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_auto_approval();

CREATE OR REPLACE FUNCTION public.set_auto_approval(
  p_admin_id integer,
  p_enabled boolean
)
RETURNS SETOF public.game_settings
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  updated_setting public.game_settings%ROWTYPE;
BEGIN
  IF p_admin_id <> 6145 THEN
    RAISE EXCEPTION 'unauthorized admin id';
  END IF;

  UPDATE public.game_settings
  SET auto_approval_enabled = p_enabled,
      updated_at = now(),
      updated_by = p_admin_id
  WHERE id = 1
  RETURNING * INTO updated_setting;

  RETURN NEXT updated_setting;
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_approval(
  p_submission_id integer,
  p_reviewed_by integer
)
RETURNS SETOF public.submissions
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  undone_row public.submissions%ROWTYPE;
  item_points integer;
BEGIN
  IF p_reviewed_by <> 6145 THEN
    RAISE EXCEPTION 'unauthorized admin id';
  END IF;

  UPDATE public.submissions
  SET status = 'pending',
      reviewed_at = NULL,
      reviewed_by = NULL
  WHERE id = p_submission_id
    AND status = 'approved'
  RETURNING * INTO undone_row;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT points INTO item_points
  FROM public.items
  WHERE id = undone_row.item_id;

  UPDATE public.teams
  SET score = GREATEST(score - COALESCE(item_points, 0), 0)
  WHERE id = undone_row.team_id;

  RETURN NEXT undone_row;
END;
$$;
