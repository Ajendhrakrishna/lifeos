# LifeOS

LifeOS is a personal app that puts your tasks and your money in one place. It shows what is due this week, what you have spent this month, and warns you when deadlines slip or your upcoming bills won't fit your budget.

## Features

- **Home**: warnings for overdue tasks and money problems, a one-line summary of your week, a 7-day ribbon with each day's tasks and spending, and how much of this month's budget is left.
- **Tasks**: add a task with a kind (Due, Homework, Project, Chore, Other), a due date and, for Due tasks only, a cost. Mark tasks done or delete them.
- **Money**: set a monthly budget, record expenses with a category (or your own label under "Other"), and see this month's spending. Amounts are in ₹.
- Friendly messages when the server or the database can't be reached.

## Stack

- Backend: Node.js with Express (`server/`)
- Database: Supabase (Postgres). Only the backend talks to it.
- Frontend: plain HTML, CSS and JavaScript (`public/`), which only talks to the backend's `/api` routes
- Tests: Node's built-in test runner (`test/`)

## Set up on a new computer

1. Install **Node.js 22 LTS** or newer and **Git**. Check with `node -v`.
2. Get the project folder (copy it, or `git clone` it if you have pushed it somewhere), then open PowerShell in it.
3. Install the dependencies:
   ```
   npm install
   ```
4. Create the database:
   1. Sign in at supabase.com and create a **new project**. Save the database password in a password manager.
   2. Open **SQL Editor → New query**, paste the whole of `db/schema.sql`, and click **Run**.
   3. In **Table Editor** you should see `tasks`, `expenses` and `budgets`.
5. Connect the app to it:
   1. Copy the example settings file:
      ```
      Copy-Item .env.example .env
      ```
   2. In Supabase, open **Project Settings → API Keys** and copy the **Project URL** and the **secret** key (it starts with `sb_secret_`; older projects call it `service_role`).
   3. Paste them into `.env` after `SUPABASE_URL=` and `SUPABASE_SECRET_KEY=`.
6. Start the app:
   ```
   npm run dev
   ```
   Open http://localhost:3000. http://localhost:3000/api/health should show `{"ok":true,"db":true}`.
7. Run the tests:
   ```
   npm test
   ```

## Updating an existing database

`db/schema.sql` always describes the latest database, so a **new** project only needs that file.

A database created **before** a change needs the files in `db/migrations` instead. Run them in number order (`002_…`, then `003_…`, and so on), **once each**, the same way: SQL Editor → New query → paste → Run. Skip any you have already run. Each file says at the top what it changes.

If the page says "The database is missing an update", a migration has not been run yet.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the app and restarts it when you save a file |
| `npm start` | Starts the app |
| `npm test` | Runs all tests |

## Keeping secrets safe

- `.env` holds your Supabase secret key. It is listed in `.gitignore`, so Git never commits it. Never paste the key into code, `public/`, screenshots or chats.
- The secret key bypasses Supabase's security rules, so only the backend uses it. If it ever leaks, rotate it in Supabase under **Project Settings → API Keys** and update `.env`.

## Deploying

**Do not put v1 online.** It has no login, so anyone with the address could see and change all data. Deployment comes in v2, after login. Until then the server only answers on this computer (`localhost` or `127.0.0.1`).

For later (v2): when LifeOS runs anywhere other than your own computer, **set the environment variable `NODE_ENV=production`** on the server. Visitors then only see a general message ("LifeOS is having trouble right now…"), never details such as key names, files or database tables. The full error is always written to the server's log.

## When something goes wrong

These detailed messages appear on your own computer. With `NODE_ENV=production` they are replaced by one general message.

| The page says | What to do |
|---|---|
| Can't reach the LifeOS server | Start it with `npm run dev`, then click **Try again**. |
| LifeOS can't reach its database | Check your internet connection and that the Supabase project is running, then **Try again**. |
| LifeOS could not sign in to its database | The secret key in `.env` is wrong. Fix it and restart the server. |
| The database is missing an update | Run the files in `db/migrations` you haven't run yet (see above). |

The server refuses to start, with a clear message, if `.env` is missing a value.

See [PLAN.md](PLAN.md) for how the app is built and [DESIGN.md](DESIGN.md) for how it looks.
