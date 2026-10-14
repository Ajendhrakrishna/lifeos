# LifeOS

LifeOS is a personal management app that connects tasks and money: tasks with due dates and optional costs, a monthly budget with expenses, and a dashboard that warns when upcoming task costs exceed the remaining budget. Version 1 has no login, but it is built so login and other users can be added later.

## Stack

- Backend: Node.js + Express (`server/`)
- Database: Supabase (Postgres), schema in `db/schema.sql`
- Frontend: plain HTML, CSS and JavaScript (`public/`)

## Commands

- Run the app: `npm run dev` (restarts on save) or `npm start`, then open http://localhost:3000
- Run the tests: `npm test`

## Rules

- Follow PLAN.md one step at a time. Stop after each step and say how to test it.
- Only the backend talks to Supabase. The frontend only calls our own `/api/...` routes.
- Never put secrets anywhere except `.env`. Not in code, not in `public/`, not in commits.
- The user is a beginner: explain what you did in simple terms.
- Test instructions: numbered steps, one command per step, say what they should see, and use Windows PowerShell commands (`curl.exe`, not `curl`).
- Never commit or push. The user does that themselves.
- Follow DESIGN.md for all UI work.
- Before saying a step is done, use the Superpowers verification skill. Use the debugging skill when something fails. Use brainstorming only when I ask for a new feature that is not in PLAN.md. Follow DESIGN.md fully for UI work; do not cut design details to save code. My rules above still win: no commits, one step at a time.
- Version 2 features follow the roadmap in PLAN.md, one feature per branch.
