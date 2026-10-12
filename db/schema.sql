-- LifeOS schema. Paste into Supabase: SQL Editor -> New query -> Run.
-- Safe to run once on a fresh project. user_id stays empty in v1 (no login yet).

create table tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid,
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
  user_id    uuid,
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
  user_id    uuid,
  month      date not null check (extract(day from month) = 1), -- always the 1st
  amount     numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  -- "nulls not distinct": in v1 user_id is empty, and we still want one budget per month
  unique nulls not distinct (user_id, month)
);

-- Row Level Security on, no policies: the public key can do nothing.
-- Only our backend (secret key) can read and write.
alter table tasks    enable row level security;
alter table expenses enable row level security;
alter table budgets  enable row level security;
