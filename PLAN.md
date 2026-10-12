# LifeOS: Version 1 Plan

A personal management app that connects tasks and money.
Stack: Node.js + Express (backend), Supabase Postgres (database), plain HTML/CSS/JS (frontend).

## Ground rules

- **Only the backend talks to Supabase.** The browser only calls our own `/api/...` routes.
- **Secrets live in `.env`**, which is listed in `.gitignore` and never committed. A `.env.example` with blank values *is* committed so you remember which variables you need.
- **Built ready for login later.** Every table has a `user_id` column, and the backend gets "who is the user" from one function (`server/user.js`). In v1 that function returns no user. In v2 it will read the logged-in user, and nothing else needs to change shape.
- **Money is stored as `numeric(12,2)`**, never as a floating-point number, so 0.1 + 0.2 stays 0.30.
- **Dates are plain `YYYY-MM-DD` values** (Postgres `date`). The browser sends its own "today" to the dashboard so "this week" and "this month" match your time zone, not the server's.

## Decisions I made for you (change them now if you disagree)

| Question | v1 answer |
|---|---|
| What is "this week"? | Tasks not done, of any kind, due from today through the next 6 days (7 days in total). |
| What are "upcoming tasks" for the warning? | Tasks not done, of kind "due", with a cost, due from today to the end of this month. That matches the budget, which is per month. |
| Budget: one number forever, or one per month? | One per month (`2026-10` → 500.00). If no budget is set for the month, the dashboard says "No budget set". |
| Expense categories | A fixed list in a dropdown: Food, Transport, Bills, Shopping, Health, Fun, Other. Stored as text, so the list can change later without touching the database. |
| One page or many? | One page (`index.html`) with three sections: Dashboard, Tasks, Money. |
| Do I need `dotenv`? | No. Node 20.6+ can load `.env` itself with `node --env-file=.env`. |

**Left out of v1 (not asked for):** editing tasks or expenses, deleting expenses, recurring tasks, charts, login. Each is easy to add later.

---

## Files

```
lifeos/
├── .gitignore            Keeps node_modules/ and .env out of Git
├── .env.example          Variable names with no values (committed)
├── .env                  Your real Supabase URL and secret key (NOT committed)
├── package.json          Dependencies and the npm scripts: start, dev, test
├── README.md             How to set up and run the app
├── PLAN.md               This file
│
├── db/
│   └── schema.sql        SQL you paste into Supabase once to create the tables
│
├── server/
│   ├── index.js          Starts Express, serves public/, mounts the API routes, handles errors
│   ├── supabase.js       Creates the one Supabase client from the .env values
│   ├── user.js           getUserId(req): returns null in v1, the logged-in user in v2
│   ├── validate.js       Small checks shared by the routes: valid date, positive amount, etc.
│   ├── summary.js        Pure function that computes the dashboard numbers (no database, easy to test)
│   └── routes/
│       ├── tasks.js      GET, POST, PATCH (mark done), DELETE /api/tasks
│       ├── budget.js     GET and PUT /api/budget?month=YYYY-MM
│       ├── expenses.js   GET and POST /api/expenses
│       └── dashboard.js  GET /api/dashboard?today=YYYY-MM-DD (loads data, calls summary.js)
│
├── public/               Everything the browser loads
│   ├── index.html        The page: Dashboard, Tasks and Money sections
│   ├── styles.css        All styling
│   ├── api.js            One small fetch helper: calls /api/..., throws on errors
│   ├── tasks.js          Task list, add form, done checkbox, delete button
│   ├── money.js          Budget form, expense form, this month's expense list
│   └── dashboard.js      Loads /api/dashboard and shows the numbers and the warning
│
└── test/
    └── summary.test.js   Tests for summary.js using Node's built-in test runner
```

**Dependencies:** just `express` and `@supabase/supabase-js`. Tests use `node:test`, which comes with Node, so there is nothing extra to install.

## API

All responses are JSON. Errors look like `{ "error": "message" }` with status 400 (your input was wrong), 404 (not found) or 500 (server problem).

| Method | Path | Body or query | Does |
|---|---|---|---|
| GET | `/api/health` | | Says the server is up and can reach the database |
| GET | `/api/tasks` | | All tasks, soonest due first |
| POST | `/api/tasks` | `{ title, due_date, cost? }` | Adds a task |
| PATCH | `/api/tasks/:id` | `{ done: true/false }` | Marks done or not done |
| DELETE | `/api/tasks/:id` | | Deletes a task |
| GET | `/api/budget` | `?month=2026-10` | Budget for that month, or `null` |
| PUT | `/api/budget` | `{ month, amount }` | Sets or replaces that month's budget |
| GET | `/api/expenses` | `?month=2026-10` | Expenses in that month, newest first |
| POST | `/api/expenses` | `{ amount, category, spent_on }` | Records an expense |
| GET | `/api/dashboard` | `?today=2026-10-11` | `{ tasksDueThisWeek, spentThisMonth, budget, budgetRemaining, upcomingTaskCost, overBudgetWarning }` |

**Validation (at the backend, because the browser can't be trusted):**
- title: required, trimmed, 1 to 200 characters
- dates: real `YYYY-MM-DD` dates
- cost: optional, 0 or more
- amount: more than 0
- category: must be one of the list

## Database (in `db/schema.sql`)

**tasks**: `id` (uuid), `user_id` (uuid, empty in v1), `title` (text), `due_date` (date), `cost` (numeric, optional), `done` (boolean, default false), `created_at` (timestamp)

**expenses**: `id`, `user_id`, `amount` (numeric, > 0), `category` (text), `spent_on` (date), `created_at`

**budgets**: `id`, `user_id`, `month` (date, always the 1st of the month), `amount` (numeric, ≥ 0), `created_at`
- One budget per user per month: `unique nulls not distinct (user_id, month)`. "Nulls not distinct" matters in v1 because `user_id` is empty, and without it Postgres would allow duplicate budgets.

**Row Level Security (RLS)** is turned **on** for all three tables, with **no policies**. That means the public ("publishable"/"anon") key can't read or write anything. Only our backend, using the secret key, can. When login arrives, we add real policies.

Checks such as `amount > 0` are also in the database, so bad data can't get in even if the code has a bug.

---

## What you set up in Supabase yourself

1. Sign up at supabase.com and create a **new project**. Pick a region near you. Save the database password somewhere safe (a password manager). You won't need it in v1, but you can't see it again later.
2. When I give you `db/schema.sql` (step 2 below): open **SQL Editor → New query**, paste the file, click **Run**. Then check that **Table Editor** shows `tasks`, `expenses` and `budgets`.
3. Go to **Project Settings → API Keys** (some projects call this **API**) and copy:
   - the **Project URL** → `SUPABASE_URL`
   - the **secret** key (starts with `sb_secret_`; in older projects it's the `service_role` key) → `SUPABASE_SECRET_KEY`
4. Paste both into `.env`. **Never** put the secret key in any file under `public/`, in a screenshot, or in a chat. It skips all security rules. If it ever leaks, rotate it in the same settings page.
5. Have **Node.js 22 LTS** installed (`node -v` should print v22 or newer; anything from 20.6 works).

---

## Build order

Each step ends with something you can see working. Test it, then commit before going on. Commit commands are just a suggestion. Windows note: in PowerShell use `curl.exe`, not `curl`, or test from the browser.

### Step 0: Project skeleton
Create `.gitignore`, `.env.example`, `package.json`, `README.md`. Run `npm install`.
**Test:** create an empty `.env` and run `git status`. `.env` and `node_modules/` must **not** appear.
**Commit:** `Set up project skeleton`

### Step 1: Express server serving a page
`server/index.js` serving `public/index.html` (just a heading) and `GET /api/health` → `{ ok: true }`. Server listens on `localhost:3000` only.
**Test:** `npm run dev`, open http://localhost:3000 and http://localhost:3000/api/health.
**Commit:** `Add Express server and health check`

### Step 2: Connect to Supabase
You create the project (setup steps 1 to 4). I write `db/schema.sql`, `server/supabase.js` and `server/user.js`. The health check now runs a tiny query. The server refuses to start, with a clear message, if a `.env` value is missing.
**Test:** `/api/health` shows `{ ok: true, db: true }`. Break the URL in `.env` on purpose and see a clear error, then fix it.
**Commit:** `Add database schema and Supabase connection`

### Step 3: Tasks API: list and add
`server/validate.js` and `server/routes/tasks.js` with GET and POST.
**Test:** POST a task with curl and see it in GET and in Supabase's Table Editor. POST with an empty title and get a 400.
**Commit:** `Add tasks API: list and create`

### Step 4: Tasks API: done and delete
PATCH and DELETE. An unknown id gives 404.
**Test:** mark a task done, delete one, try a made-up id.
**Commit:** `Add tasks API: mark done and delete`

### Step 5: Tasks page section
`public/api.js`, `public/tasks.js`, the Tasks section of `index.html`, and basic `styles.css`. Text from the database is always shown with `textContent`, never `innerHTML`, so a task titled `<script>` can't run code.
**Test:** add, tick done, and delete tasks in the browser. Refresh: they're still there. Add a task titled `<b>hi</b>` and it shows the tags as plain text.
**Commit:** `Add tasks UI`

### Step 6: Budget
`server/routes/budget.js` and the budget form in `public/money.js`.
**Test:** set this month's budget, refresh, it's still there. Set it again and it's replaced, not duplicated (check Table Editor).
**Commit:** `Add monthly budget`

### Step 7: Expenses
`server/routes/expenses.js`, the expense form and this month's list in `public/money.js`.
**Test:** add expenses this month and last month. Only this month's show. Amount 0 or −5 is rejected.
**Commit:** `Add expenses`

### Step 8: Dashboard calculation and tests
`server/summary.js` (pure function: takes tasks, expenses, budget and today, returns plain numbers, no formatting or ₹) and `test/summary.test.js`.
- **tasksDueThisWeek:** tasks not done, any kind, due from today through the next 6 days, soonest first.
- **upcomingTaskCost:** tasks not done, kind "due", with a cost, due from today to the end of this month.
- **spentThisMonth:** expenses dated in today's month. **budget:** this month's budget or none. **budgetRemaining:** budget minus spent (can be negative), none if no budget.
- **overBudgetWarning:** only when upcomingTaskCost is more than budgetRemaining (equal is **not** a warning). No budget set means no warning.

Cases to cover: a week that crosses into next month (and next year), tasks already done (ignored), tasks with no cost, a Homework task (in the week, adds no cost), costs after this month (not counted), overdue tasks (not counted), no budget set, a budget of 0, and the warning exactly at the limit.
**Test:** `npm test`, all passing.
**Commit:** `Add dashboard calculation with tests`

### Step 9: Dashboard API and section
`server/routes/dashboard.js` and `public/dashboard.js`. The dashboard refreshes after any task, budget or expense change.
**Test:** set budget 100, add expenses of 70, add a task costing 50 due this month → warning shows. Mark the task done → warning goes away.
**Commit:** `Add dashboard`

### Step 10: Finish
Friendly error messages in the UI when the server is down. README updated with setup and run steps. Do every test from steps 1 to 9 once more.
**Commit:** `Polish errors and README`

---

## Later: adding login (v2 preview)

1. Turn on Supabase Auth. The frontend sends the user's token to our backend with each request.
2. `server/user.js` checks the token and returns the real user id. All routes already filter by `getUserId(req)`.
3. Make `user_id` required (`not null`) and link it to `auth.users`. Add RLS policies so each user sees only their own rows.
4. Decide what happens to the v1 rows that have no `user_id` (for example, give them to your own account).
