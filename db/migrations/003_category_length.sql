-- 003: expense category is 1 to 40 characters, with no spaces at either end.
-- Run ONCE in Supabase: SQL Editor -> New query -> paste -> Run. A fresh setup from schema.sql already has it.
-- If an existing row breaks the rule, this fails and changes nothing.

alter table expenses
  add constraint expenses_category_check
  check (char_length(category) between 1 and 40 and category = btrim(category));
