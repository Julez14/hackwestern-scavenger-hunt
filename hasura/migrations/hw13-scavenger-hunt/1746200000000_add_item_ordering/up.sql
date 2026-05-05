ALTER TABLE public.items
  ADD COLUMN category text NOT NULL DEFAULT 'Uncategorized',
  ADD COLUMN display_order integer;

CREATE UNIQUE INDEX items_display_order_unique ON public.items (display_order);

DELETE FROM public.items WHERE display_order IS NULL;