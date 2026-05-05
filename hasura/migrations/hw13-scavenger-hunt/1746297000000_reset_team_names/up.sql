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

  UPDATE public.teams AS teams
  SET name = defaults.name,
      score = 0
  FROM (VALUES
    (7687, 'Team 1'),
    (6215, 'Team 2'),
    (9277, 'Team 3'),
    (1023, 'Team 4'),
    (4136, 'Team 5')
  ) AS defaults(id, name)
  WHERE teams.id = defaults.id;

  RETURN QUERY
  SELECT *
  FROM public.teams
  ORDER BY id;
END;
$$;
