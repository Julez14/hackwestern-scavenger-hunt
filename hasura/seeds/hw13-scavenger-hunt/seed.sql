INSERT INTO public.teams (id, name, members, score)
VALUES
  (7687, 'Team 1', ARRAY[]::text[], 0),
  (6215, 'Team 2', ARRAY[]::text[], 0),
  (9277, 'Team 3', ARRAY[]::text[], 0),
  (1023, 'Team 4', ARRAY[]::text[], 0),
  (4136, 'Team 5', ARRAY[]::text[], 0)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    members = EXCLUDED.members,
    score = EXCLUDED.score;
