CREATE OR REPLACE FUNCTION public.reset_game(
  p_admin_id integer
)
RETURNS SETOF public.teams
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
  IF p_admin_id <> 6145 THEN
    RAISE EXCEPTION 'unauthorized admin id';
  END IF;

  TRUNCATE TABLE public.submissions RESTART IDENTITY;

  UPDATE public.teams
  SET score = 0;

  RETURN QUERY
  SELECT *
  FROM public.teams
  ORDER BY score DESC;
END;
$$;
