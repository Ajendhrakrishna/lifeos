-- 002: task kinds. Run ONCE in Supabase: SQL Editor -> New query -> paste -> Run.
-- Only for a database created from schema.sql before this change; a fresh setup already has it.
-- All or nothing: if any line fails, nothing is changed.

begin;

-- New column; every existing task starts as 'other'
alter table tasks add column kind text not null default 'other';

-- Tasks that already have a cost become 'due' (must happen before the cost check below)
update tasks set kind = 'due' where cost is not null;

alter table tasks
  add constraint tasks_kind_check check (kind in ('due', 'homework', 'project', 'chore', 'other')),
  add constraint tasks_cost_only_when_due check (cost is null or kind = 'due');

commit;
