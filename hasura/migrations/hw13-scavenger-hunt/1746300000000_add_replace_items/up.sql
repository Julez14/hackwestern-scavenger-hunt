CREATE OR REPLACE FUNCTION public.replace_items(
  p_admin_id integer,
  p_items jsonb
)
RETURNS SETOF public.items
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  prompt_count integer;
BEGIN
  IF p_admin_id <> 6145 THEN
    RAISE EXCEPTION 'unauthorized admin id';
  END IF;

  LOCK TABLE public.items IN EXCLUSIVE MODE;
  LOCK TABLE public.submissions IN SHARE MODE;
  LOCK TABLE public.teams IN SHARE MODE;

  IF EXISTS (SELECT 1 FROM public.submissions) OR EXISTS (SELECT 1 FROM public.teams WHERE score <> 0) THEN
    RAISE EXCEPTION 'prompts can only be replaced after the game has been reset';
  END IF;

  IF jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'items must be a json array';
  END IF;

  DROP TABLE IF EXISTS pg_temp.next_items;
  CREATE TEMP TABLE next_items (
    display_order integer PRIMARY KEY,
    item text NOT NULL,
    points integer NOT NULL,
    category text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO next_items (display_order, item, points, category)
  SELECT
    incoming.display_order,
    btrim(incoming.item),
    incoming.points,
    COALESCE(NULLIF(btrim(incoming.category), ''), 'Uncategorized')
  FROM jsonb_to_recordset(p_items) AS incoming(
    display_order integer,
    item text,
    points integer,
    category text
  );

  SELECT COUNT(*) INTO prompt_count
  FROM next_items;

  IF prompt_count = 0 THEN
    RAISE EXCEPTION 'at least one item is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM next_items
    WHERE display_order IS NULL
      OR display_order < 1
      OR item = ''
      OR points < 0
  ) THEN
    RAISE EXCEPTION 'items must have display_order, item, and non-negative points';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT display_order, row_number() OVER (ORDER BY display_order) AS expected_order
      FROM next_items
    ) ordered_items
    WHERE display_order <> expected_order
  ) THEN
    RAISE EXCEPTION 'display_order must be sequential starting at 1';
  END IF;

  DELETE FROM public.items;

  INSERT INTO public.items (item, points, category, display_order)
  SELECT next_items.item, next_items.points, next_items.category, next_items.display_order
  FROM next_items
  ORDER BY next_items.display_order ASC;

  UPDATE public.teams
  SET score = COALESCE((
    SELECT SUM(items.points)
    FROM public.submissions
    INNER JOIN public.items
      ON items.id = submissions.item_id
    WHERE submissions.team_id = teams.id
      AND submissions.status = 'approved'
  ), 0);

  RETURN QUERY
  SELECT *
  FROM public.items
  ORDER BY display_order ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_item(
  p_admin_id integer,
  p_item text,
  p_points integer,
  p_category text DEFAULT 'Uncategorized'
)
RETURNS SETOF public.items
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  next_display_order integer;
BEGIN
  IF p_admin_id <> 6145 THEN
    RAISE EXCEPTION 'unauthorized admin id';
  END IF;

  IF p_item IS NULL OR btrim(p_item) = '' OR p_points IS NULL OR p_points < 0 THEN
    RAISE EXCEPTION 'item and non-negative points are required';
  END IF;

  LOCK TABLE public.items IN EXCLUSIVE MODE;

  SELECT COALESCE(MAX(display_order), 0) + 1 INTO next_display_order
  FROM public.items;

  INSERT INTO public.items (item, points, category, display_order)
  VALUES (
    btrim(p_item),
    p_points,
    COALESCE(NULLIF(btrim(p_category), ''), 'Uncategorized'),
    next_display_order
  );

  RETURN QUERY
  SELECT *
  FROM public.items
  ORDER BY display_order ASC;
END;
$$;
