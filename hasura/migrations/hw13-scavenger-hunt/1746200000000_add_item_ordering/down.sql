DROP INDEX IF EXISTS public.items_display_order_unique;
ALTER TABLE public.items DROP COLUMN display_order, DROP COLUMN category;