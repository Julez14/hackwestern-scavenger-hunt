CREATE OR REPLACE FUNCTION public.unsubmit_submission(
  p_submission_id integer,
  p_team_id integer
)
RETURNS SETOF public.submissions
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  removed_row public.submissions%ROWTYPE;
  item_points integer;
BEGIN
  DELETE FROM public.submissions
  WHERE id = p_submission_id
    AND team_id = p_team_id
    AND status IN ('pending', 'approved')
  RETURNING * INTO removed_row;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF removed_row.status = 'approved' THEN
    SELECT points INTO item_points
    FROM public.items
    WHERE id = removed_row.item_id;

    UPDATE public.teams
    SET score = GREATEST(score - COALESCE(item_points, 0), 0)
    WHERE id = removed_row.team_id;
  END IF;

  RETURN NEXT removed_row;
END;
$$;
