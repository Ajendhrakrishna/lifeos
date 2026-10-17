-- LifeOS schema. Paste into Supabase: SQL Editor -> New query -> Run.
-- Safe to run once on a fresh project. Every row belongs to one signed-in user (Supabase Auth).
-- An older database needs the files in db/migrations instead (see README).

create table tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null constraint tasks_user_fk references auth.users (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 200),
  due_date   date not null,
  kind       text not null default 'other'
             constraint tasks_kind_check check (kind in ('due', 'homework', 'project', 'chore', 'other')),
  cost       numeric(12,2) check (cost >= 0),
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  -- Only 'due' tasks (bills, fees) can have a cost
  constraint tasks_cost_only_when_due check (cost is null or kind = 'due')
);

create table expenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null constraint expenses_user_fk references auth.users (id) on delete cascade,
  amount     numeric(12,2) not null check (amount > 0),
  -- A fixed category or the user's own label, trimmed, 1 to 40 characters
  category   text not null
             constraint expenses_category_check
             check (char_length(category) between 1 and 40 and category = btrim(category)),
  spent_on   date not null,
  created_at timestamptz not null default now()
);

create table budgets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null constraint budgets_user_fk references auth.users (id) on delete cascade,
  month      date not null check (extract(day from month) = 1), -- always the 1st
  amount     numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  -- One budget per user per month
  unique nulls not distinct (user_id, month)
);

-- Fast look-ups of one user's rows (budgets already has its unique (user_id, month) index)
create index tasks_user_due on tasks (user_id, due_date);
create index expenses_user_spent on expenses (user_id, spent_on);

-- Row Level Security: anyone using a publishable key only reaches their own rows.
-- The LifeOS server uses the secret key, which skips these; its own user filter is the real lock.
alter table tasks    enable row level security;
alter table expenses enable row level security;
alter table budgets  enable row level security;
create policy "Own tasks" on tasks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own expenses" on expenses for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own budgets" on budgets for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
