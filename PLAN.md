# LifeOS Plan

A personal management app that connects tasks and money.
Stack: Node.js + Express (backend), Supabase Postgres (database), plain HTML/CSS/JS (frontend).
This file describes what version 1 actually is. The look is in [DESIGN.md](DESIGN.md); setup is in [README.md](README.md).

## Ground rules

- **Only the backend talks to Supabase.** The browser only calls our own `/api/...` routes.
- **Secrets live in `.env`**, which is in `.gitignore` and never committed. `.env.example` (blank values) is committed.
- **Ready for login later.** Every table has a `user_id` column, and every route asks one function, `getUserId(req)` in `server/user.js`, who the user is. In v1 the answer is "nobody" (`null`).
- **Money is `numeric(12,2)`** in the database and is added up in whole paise in code, so 0.1 + 0.2 stays 0.30. Shown with ₹ and Indian grouping (₹1,23,456.79).
- **Dates are plain `YYYY-MM-DD`.** The browser sends its own "today", so "this week" and "this month" follow the user's time zone.
- **Validation happens twice:** in `server/validate.js` (friendly messages) and as database checks (a safety net).
- **User text is shown with `textContent` only**, never `innerHTML`.
- In production (NODE_ENV=production), users see only a general error message; full details go to the server log.

## Decisions

| Question | v1 answer |
|---|---|
| Sections | One page, three sections chosen by the URL hash: Home (`#home`, the default), Tasks (`#tasks`), Money (`#money`). |
| Task kinds | Due, Homework, Project, Chore, Other (default). Only **Due** tasks can have a cost. |
| What is "this week"? | Tasks not done, any kind, due from today through the next 6 days. |
| Overdue | Tasks not done, due before today. Shown as warnings, not in the week. |
| Upcoming dues | Tasks not done, kind Due, with a cost, due from today to the end of this month. |
| Budget | One per month. Set from the three-dot menu next to the budget figure. |
| Money warnings | "Over budget" when spent is more than the budget; otherwise "Dues won't fit" when upcoming dues are more than what is left (equal is fine). No budget, no warning. |
| Expense categories | Food, Transport, Bills, Shopping, Health, Fun, or "Other" with the user's own label (1 to 40 characters, trimmed). A blank label is saved as "Other". |
| Home headline | "Nothing due this week. Add a task to begin." only when there are no tasks at all; otherwise a count and the next task. |
| Do I need `dotenv`? | No. Node 20.6+ loads `.env` itself with `node --env-file=.env`. |

**Left out of v1:** login, editing tasks or expenses, deleting expenses, recurring tasks, charts, the AI ask bar (space is planned in DESIGN.md).

---

## Files

```
lifeos/
├── .gitignore, .env.example, .env (not committed), package.json
├── README.md             Setup on a new computer, migrations, troubleshooting
├── PLAN.md               This file
├── DESIGN.md             Colours, type, layout and states
├── CLAUDE.md             Working rules for Claude Code
│
├── db/
│   ├── schema.sql        The whole, latest database. Run once on a new Supabase project.
│   └── migrations/       Changes for a database created earlier. Run in number order, once each.
│       ├── 002_task_kind.sql         Adds tasks.kind; only Due tasks may have a cost
│       └── 003_category_length.sql   Expense category is 1 to 40 characters, trimmed
│
├── server/
│   ├── index.js          Starts Express, serves public/, mounts the routes, turns errors into JSON
│   ├── supabase.js       The one Supabase client, from .env (stops with a clear message if a value is missing)
│   ├── user.js           getUserId(req) and forUser(query, req): v1 = rows with no user
│   ├── validate.js       Checks for tasks, budgets, expenses, dates, months and ids
│   ├── summary.js        Pure function for the Home numbers, plus the date window it needs
│   ├── host.js           Refuses requests not addressed to localhost or 127.0.0.1 (403)
│   ├── errors.js         Turns any server error into a friendly message (database down, wrong key, missing migration); in production only a general one
│   └── routes/
│       ├── tasks.js      GET, POST, PATCH (done), DELETE /api/tasks
│       ├── budget.js     GET and PUT /api/budget?month=YYYY-MM
│       ├── expenses.js   GET and POST /api/expenses
│       └── dashboard.js  GET /api/dashboard?today=YYYY-MM-DD
│
├── public/
│   ├── index.html        Header, the three sections, and templates for rows, tiles and banners
│   ├── styles.css        Everything in DESIGN.md
│   ├── api.js            The only way the page calls the server; readable errors
│   ├── ui.js             Shared helpers: ₹ and date formats, states, notices, the "something changed" signal
│   ├── nav.js            Shows one section at a time from the URL hash
│   ├── home.js           Warnings, headline, week ribbon, money line; refreshes after any change
│   ├── tasks.js          Task form (Kind, Due date, Cost for Due), list, done, delete
│   └── money.js          Budget menu and dialog, expense form (custom category), this month's list
│
└── test/                 Node's built-in test runner: validate, summary, errors, routes and host
```

## API

All responses are JSON. Errors look like `{ "error": "message" }`: 400 (your input was wrong), 404 (not found), 503 (database unreachable or wrong key) or 500 (anything else).

| Method | Path | Body or query | Does |
|---|---|---|---|
| GET | `/api/health` | | Server is up and can reach the database |
| GET | `/api/tasks` | | All tasks, soonest due first |
| POST | `/api/tasks` | `{ title, due_date, kind?, cost? }` | Adds a task (cost only when kind is `due`) |
| PATCH | `/api/tasks/:id` | `{ done }` | Marks done or not done |
| DELETE | `/api/tasks/:id` | | Deletes a task |
| GET | `/api/budget` | `?month=2026-10` | That month's budget, or `null` |
| PUT | `/api/budget` | `{ month, amount }` | Sets or replaces that month's budget |
| GET | `/api/expenses` | `?month=2026-10` | That month's expenses, newest first |
| POST | `/api/expenses` | `{ amount, category, spent_on }` | Records an expense |
| GET | `/api/dashboard` | `?today=2026-10-13` | The Home numbers (below) |

`/api/dashboard` returns `tasksDueThisWeek`, `overdueTasks` (each with `daysOverdue`), `taskCount`, `spentThisMonth`, `budget`, `budgetRemaining`, `overspentBy`, `upcomingTaskCost`, `overBudgetWarning`, `duesShortBy` (how much the upcoming dues exceed what is left, 0 if they fit) and `spendingByDay` (7 days from today). Plain numbers, no ₹.

## Database (`db/schema.sql`)

- **tasks**: `id`, `user_id`, `title` (1 to 200), `due_date`, `kind` (due, homework, project, chore, other; default other), `cost` (0 or more, only when kind is due), `done`, `created_at`
- **expenses**: `id`, `user_id`, `amount` (more than 0), `category` (1 to 40, trimmed), `spent_on`, `created_at`
- **budgets**: `id`, `user_id`, `month` (always the 1st), `amount` (0 or more), `created_at`; one per user per month (`unique nulls not distinct`)
- **Row Level Security** is on for all three tables with no policies, so only the backend's secret key can read or write.

**Changing the database:** add a new numbered file to `db/migrations` and make the same change in `db/schema.sql`, so new and existing databases end up the same.

---

## Build history

Each step was tested and committed on its own.

0. **Skeleton**: `.gitignore`, `.env.example`, `package.json`, README.
1. **Express server** on `localhost:3000` with `/api/health`.
2. **Supabase**: schema, client, `user.js`; health checks the database.
3. **Tasks API**: list and add, with validation.
4. **Tasks API**: mark done and delete; unknown ids give 404.
5. **Tasks page**, following DESIGN.md (marble, frosted cards, gold), with loading, empty and error states.
6. and 7. **Money**: monthly budget and expenses, routes and page; ₹ everywhere.
- **Design pass**: wordmark, top navigation with one section at a time, budget three-dot menu and dialog.
- **Batch B**: task kinds (migration 002), custom expense categories (migration 003).

8. **Dashboard numbers**: `summary.js` with tests for every edge case.
9. **Home**: `/api/dashboard`, warning banners (amber for overdue, terracotta for money), headline, 7-day ribbon, money line with progress bar; refreshes after any change.
10. **Finish**: friendly error messages in every section (server stopped, database unreachable, wrong key, missing migration), and only a general message in production (NODE_ENV=production) with full details in the server log, "Add a task to begin" only when there are no tasks at all, README for a new computer, this file brought up to date.

---

## Version 2 roadmap

Built in this order, one feature per branch.

1. **Login and per-user data.** Includes password reset: a student who forgets their password can reset it by email. Done when: two test accounts cannot see each other's data, and a forgotten password can be reset.
   - Turn on Supabase Auth. The page sends the user's token with each request.
   - `server/user.js` checks the token and returns the real user id. All routes already filter by it.
   - Make `user_id` required and linked to `auth.users`, in a new migration. Add RLS policies so each user sees only their own rows.
   - Decide what happens to v1 rows with no `user_id` (for example, give them to your own account).
2. **Deploy.** Production settings, host allow-list, hide X-Powered-By, security headers. Done when: LifeOS opens on a phone from a public link.
   - Only after login works. v1 is never deployed: it has no login, so anyone with the address could see and change all data.
   - Add the real domain to `ALLOWED` in `server/host.js`, and listen on all addresses instead of `127.0.0.1` in `server/index.js`.
   - Set `NODE_ENV=production` on the server, so visitors see only a general error message and full details go to the server log.
3. **Everyday fixes.** Edit tasks and expenses, delete expenses, a friendlier date message, phone layout (every section works on a phone screen). Done when: tasks and expenses can be edited and expenses deleted from the page, a bad date gets a plain-language message, and every section works on a phone screen.
4. **Academics.**
   - **4a. Exams and assignments with countdowns.** Done when: exams and assignments can be added, and each shows a countdown.
   - **4b. Weekly timetable.** Done when: a weekly timetable can be entered and viewed.
   - **4c. Exam portions (topics to study).** Topics can be added in three ways: typed in one at a time, pasted (one per line), or imported from an uploaded PDF or DOCX file.
     - Uploads: the server extracts the text without any AI, accepts only PDF and DOCX with a size limit, never runs anything from inside the file, and shows an editable topic list for the student to review before saving.
     - Only the topics are saved: the file is discarded, never stored, and never sent to a third party.
     - A file with no readable text gets a message that suggests typing or pasting instead.
     - Reading topics from a file with AI is Version 3.
     - Done when: topics can be added by typing, pasting or uploading, ticked off as done, and each exam shows topics left and topics per day needed.
5. **Lent / Owed.** Done when: money lent is recorded separately, is not counted as spent, and can be marked as paid back.
6. **Trust.** Privacy policy, delete my account. Done when: a privacy policy is linked from the page, and a user can delete their account and all their data.

**Version 3:** the AI ask bar (Groq first, with OpenRouter and Gemini as fallbacks behind `server/ai.js`, summaries only, a daily limit per user), predictions, planned vs actual, and reminders.
