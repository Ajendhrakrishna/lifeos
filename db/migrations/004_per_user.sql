-- 004: per-user data (Version 2, login).
-- Run ONCE in Supabase, AFTER you have signed up and confirmed your own LifeOS account:
--   SQL Editor -> New query -> paste this file -> replace you@example.com below with your email -> Run.
-- Type your email only in the SQL Editor. Never save it into this file.
-- All or nothing: if anything fails (placeholder left in, no account with that email), nothing changes.
-- A fresh database made from schema.sql already has all of this; do not run it there.

begin;

-- 1. Give every row that has no owner (all v1 data) to your account. Existing rows are kept.
do $$
declare
  owner_email text := 'you@example.com';  -- <- replace with your email, in the SQL Editor only
  owner uuid;
  duplicates int;
begin
  -- Checks the domain, so it still works if you used Find and Replace All on the placeholder
  if owner_email like '%@example.com' then
    raise exception 'Replace you@example.com with your own email first.';
  end if;

  select id into owner from auth.users where email = lower(trim(owner_email));
  if owner is null then
    raise exception 'No LifeOS account uses that email. Sign up and confirm it first.';
  end if;

  update tasks    set user_id = owner where user_id is null;
  update expenses set user_id = owner where user_id is null;

  -- One budget per month: if you already set a budget for a month after signing in,
  -- keep that one and remove the old v1 budget for the same month.
  delete from budgets old
  where old.user_id is null
    and exists (select 1 from budgets mine where mine.user_id = owner and mine.month = old.month);
  get diagnostics duplicates = row_count;
  if duplicates > 0 then
    raise notice 'Kept your newer budget and removed % old v1 budget(s) for the same month.', duplicates;
  end if;
  update budgets set user_id = owner where user_id is null;

  -- Every row must belong to an existing account before the links in step 2 can be added
  if exists (select 1 from tasks t where not exists (select 1 from auth.users u where u.id = t.user_id))
     or exists (select 1 from expenses e where not exists (select 1 from auth.users u where u.id = e.user_id))
     or exists (select 1 from budgets b where not exists (select 1 from auth.users u where u.id = b.user_id)) then
    raise exception 'Some rows belong to an account that no longer exists, so nothing was changed. Ask for help before running this again.';
  end if;
end $$;

-- 2. Every row must now have an owner, who must be a real account.
--    Deleting an account later removes its data too (on delete cascade).
alter table tasks
  alter column user_id set not null,
  add constraint tasks_user_fk foreign key (user_id) references auth.users (id) on delete cascade;
alter table expenses
  alter column user_id set not null,
  add constraint expenses_user_fk foreign key (user_id) references auth.users (id) on delete cascade;
alter table budgets
  alter column user_id set not null,
  add constraint budgets_user_fk foreign key (user_id) references auth.users (id) on delete cascade;

-- 3. Fast look-ups of one user's rows (budgets already has its unique (user_id, month) index).
create index tasks_user_due on tasks (user_id, due_date);
create index expenses_user_spent on expenses (user_id, spent_on);

-- 4. Second layer: anyone using a publishable key only reaches their own rows.
--    The LifeOS server uses the secret key, which skips these; its own user filter is the real lock.
--    Row Level Security must be on for the policies to count (already on since v1; safe to repeat).
alter table tasks    enable row level security;
alter table expenses enable row level security;
alter table budgets  enable row level security;
create policy "Own tasks" on tasks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own expenses" on expenses for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own budgets" on budgets for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

commit;
