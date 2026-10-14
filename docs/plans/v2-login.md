# Version 2, feature 1: Login and per-user data (approved plan)

Status: approved, not started. Build on a branch: `git checkout -b v2-login`.
Read with CLAUDE.md, PLAN.md (Version 2 roadmap, feature 1) and DESIGN.md.
Delete this file after the feature is merged and PLAN.md is updated.

## Requirements

- Email and password sign-up and sign-in with Supabase Auth, plus password reset by email.
- Only the backend talks to Supabase. The browser gets secure httpOnly cookies, never a Supabase key.
- `user_id` is required on every table, and every query uses the signed-in user through `server/user.js`. The backend's secret key bypasses Row Level Security, so the backend filtering must be correct on its own; RLS policies are a second layer.
- A migration that gives the owner's existing v1 rows to their account.
- Sign-in, sign-up and reset pages following DESIGN.md, and a sign-out link.
- Everything stays reachable only at localhost until the Deploy feature.

## Decisions

- **Session checks use `getClaims`.** The token is verified locally with Supabase's public signing keys, without a network call on every request. Trade-off: a stolen access token stays valid until it expires (up to 1 hour). The stricter option, `getUser` on every request, adds a delay to each request.
- **Email links need a click.** The confirm and reset links open a page with a button instead of acting when the link is opened, because some email services open links automatically to scan them and would use up a one-time link.

## 1. Files

**New**

| File | What it does |
|---|---|
| `server/session.js` | Reads and sets the two login cookies. `requireUser` checks them on every data request, refreshes an expired session, and answers 401 when there is none. |
| `server/routes/auth.js` | `/api/auth/signup`, `signin`, `signout`, `me`, `confirm`, `reset` (send the email) and `reset/complete` (set the new password). |
| `server/limits.js` | Small in-memory limit on sign-in, sign-up and reset attempts, per IP address and per email. |
| `public/auth.html` + `public/auth.js` | One page for `/signin`, `/signup`, `/confirm` and `/reset`; the address decides which card shows. |
| `db/migrations/004_per_user.sql` | Gives the v1 rows to the owner's account, makes `user_id` required, adds RLS policies (section 2). |
| `test/auth.test.js`, `test/isolation.test.js` | Sign-in and cookie tests; one user never touches another's data (section 5). |
| `scripts/check-isolation.mjs` | Run by hand against the real Supabase with two temporary accounts, which it deletes afterwards. |

**Changed**

- `server/user.js`: `getUserId` returns the signed-in user and **throws** if there is none (today it falls back to "rows with no user"; that fallback must go so a bug can never quietly share rows). `forUser` always filters by that user.
- `server/supabase.js`: adds a way to make a short-lived, separate client for login calls (see section 3).
- `server/index.js`: mounts the auth routes, puts `requireUser` in front of every data route, sends `/` to `/signin` when nobody is signed in, and adds an Origin check on every request that changes data.
- `server/validate.js`: checks the email (trimmed, lowercase, at most 254 characters) and the password (8 to 72 bytes; Supabase ignores anything past 72 bytes).
- `public/api.js`: any 401 answer sends the browser to `/signin`.
- `public/index.html` and `public/nav.js`: a "Sign out" link at the end of the nav.
- `/api/health`: stays public, but checks the database without reading anyone's rows.
- `db/schema.sql`, `DESIGN.md`, `README.md`, `PLAN.md` and `.env.example` are updated to match.

## 2. Database migration (`004_per_user.sql`)

Run it **after** signing up and confirming the owner's account. Type the email into the SQL editor before running; never save the email into the file.

```sql
begin;
do $$
declare me uuid := (select id from auth.users where email = 'you@example.com');
begin
  if me is null then raise exception 'No account with that email. Sign up first.'; end if;
  update tasks    set user_id = me where user_id is null;
  update expenses set user_id = me where user_id is null;
  update budgets  set user_id = me where user_id is null;
end $$;
-- for each of tasks, expenses, budgets:
alter table tasks alter column user_id set not null,
  add constraint tasks_user_fk foreign key (user_id) references auth.users(id) on delete cascade;
create index tasks_user_due on tasks (user_id, due_date);
create policy "own tasks" on tasks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
commit;
```

- All or nothing: if the email is not found, nothing changes.
- `on delete cascade`: deleting an account later (roadmap feature 6) removes its data too.
- RLS: the backend's secret key bypasses these policies, so the backend filtering is the real lock, and the isolation tests (section 5) prove it. The policies only matter if a publishable key is ever used, for example by the live check script.

## 3. Keeping passwords and sessions safe

- **Passwords:** our server passes the password straight to Supabase, which stores only a hash. We never store, log or send back passwords, and the auth routes never log the request body.
- **A separate client for login calls:** a Supabase client remembers whoever last signed in through it. If the shared client were used for sign-in, the next database query could run as that user, or as the wrong one. Every sign-in, sign-up and reset uses its own short-lived client.
- **Two cookies that page JavaScript cannot read** (`httpOnly`, `SameSite=Lax`, plus `Secure` in production):
  - `lifeos_access`: the access token. It lasts 1 hour and is sent with every request (`Path=/`).
  - `lifeos_refresh`: the refresh token. It lasts 30 days and is sent only to `/api` (`Path=/api`).
  - The browser never receives a Supabase key, and no token appears in any response body.
- **Session refresh:** when the access token has expired, `requireUser` uses the refresh token to get a new pair and sets fresh cookies. If that fails, it clears both cookies and answers 401.
- **Opening the site after the access cookie expired, while the 30-day session is still valid:**
  1. Opening `/` sends only the expired access cookie (the refresh cookie only goes to `/api`), so the server sends the browser to `/signin`.
  2. Before showing any form, `/signin` asks `GET /api/auth/me`. That request carries the refresh cookie.
  3. `requireUser` refreshes the session and sets a fresh access cookie, and `me` answers with the user.
  4. The page goes straight to Home with `location.replace('/')`, which now passes.
  - The user sees a moment of the loading shimmer on the sign-in card (no form, so no flicker), then Home. The sign-in form only shows if `me` answers 401 (the 30-day session has also ended or was signed out). `/signup` and `/reset` do the same check.
- **Sign-out:** revokes the refresh token at Supabase (`admin.signOut`) and clears both cookies.
- **Cross-site attacks (CSRF):** `SameSite=Lax` cookies are not sent when another site submits a form to LifeOS. On top of that, any request that changes data must come from LifeOS's own address (the Origin check). The existing `localOnly` check still refuses any address except localhost.
- **No account guessing:** sign-up always says "Check your email to confirm your account." Reset always says "If that email has an account, we've sent a link." Sign-in always says "Email or password is wrong."
- **Attempt limits:** Supabase limits attempts per IP address, but it would see our server's address for every user. So we add our own limits: at most 5 failed sign-ins per email per 15 minutes, and a few sign-ups and resets per hour per IP. They are kept in memory and reset when the server restarts; that is fine on one computer (the Deploy feature moves them to a shared store).
- **Localhost only:** the server still listens only on `127.0.0.1`, keeps the `localhost` host check, and Supabase's allowed redirect addresses are localhost only.

### `.env` variables

Only one new variable. All three are in `.env.example` with blank values, and all stay on the server; the browser never receives any key.

| Variable | New? | Where to find it in Supabase | Used by |
|---|---|---|---|
| `SUPABASE_URL` | already there | Project Settings → API Keys (Project URL) | server |
| `SUPABASE_SECRET_KEY` | already there | Project Settings → API Keys → secret key (`sb_secret_…`) | server |
| `SUPABASE_PUBLISHABLE_KEY` | **new** | Project Settings → API Keys → publishable key (`sb_publishable_…`) | only `scripts/check-isolation.mjs` |

`getClaims` uses Supabase's public signing keys, so there is no JWT secret to store. Email links use the Site URL set in Supabase.

## 4. What the owner sets up in Supabase

The menu names are from memory and may differ slightly in the dashboard.

1. **Email login settings**, under Authentication → Sign In / Providers → Email: email login on, "Confirm email" on, minimum password length 8.
2. **Allowed addresses**, under Authentication → URL Configuration: Site URL `http://localhost:3000`, and `http://localhost:3000/**` in the Redirect URLs.
3. **Email templates**, under Authentication → Emails (Templates):
   - "Confirm signup" links to `{{ .SiteURL }}/confirm?token_hash={{ .TokenHash }}&type=email`
   - "Reset password" links to `{{ .SiteURL }}/reset?token_hash={{ .TokenHash }}&type=recovery`
4. **Email delivery limits:** Supabase's built-in email only reaches the project team's addresses, and only a few emails an hour. The owner's account works fine. For a second test account, use the live check script, which makes accounts without sending email. For real email to anyone, set up custom SMTP (for example Resend) under Authentication → Emails → SMTP.
5. **Publishable key:** copy it into `.env` as `SUPABASE_PUBLISHABLE_KEY`.
6. **Migration:** run `004_per_user.sql` at stop (b), after signing up.

## 5. Tests

**Automatic (`npm test`)**, using a fake Supabase that stores rows and applies filters:

- **Isolation:** users A and B each have tasks, expenses and a budget, and A is signed in. A can never:
  - list, or see on the dashboard, anything of B's;
  - mark done or delete B's task (404, and B's row is unchanged);
  - read or overwrite B's budget for the same month;
  - create a row for B by sending `user_id: B` (the server always uses A).
- **Signed-out access:** every data route answers 401 with no cookie, and `/` redirects to `/signin`.
- **Cookies:** `httpOnly` and `SameSite=Lax`; no `Secure` in development, `Secure` in production; no token in any response body.
- **Sessions:**
  - an expired access token with a valid refresh token still works and sets new cookies;
  - an expired access cookie with a valid session, opening `/signin`, lands on Home;
  - a bad refresh token gives 401 and clears the cookies;
  - sign-out revokes the session and clears the cookies.
- **Guarding:** the generic messages are the same for a wrong password, an unknown email and an existing sign-up; the 6th failed sign-in gets 429; a request from another Origin gets 403.
- **Reset:** a bad or used reset link gives a friendly 400; a good one sets the password and signs the user in.
- **Validation:** a short password, a password over 72 bytes and a malformed email are refused.

**Live check (`node scripts/check-isolation.mjs`)**, run by the owner against the real Supabase:

1. Creates two temporary confirmed accounts, without sending email.
2. Signs both in through the running server.
3. A creates data; B tries to read, change and delete it.
4. With the publishable key and B's token, confirms RLS also hides A's rows.
5. Deletes both accounts.

This is the roadmap's "two test accounts cannot see each other's data" check.

## 6. Build order

Before stop (a): create the branch (`git checkout -b v2-login`) and do the Supabase setup in section 4, items 1 to 5.

### Stop (a): auth backend plus the sign-in and sign-up pages (steps 1 and 2)

- **Backend:** email and password checks, in-memory attempt limits, the Origin check, the separate short-lived client for login calls, the httpOnly cookies, and the routes `signup`, `signin`, `signout`, `me` and `confirm`.
- **Design:** update `DESIGN.md` first, for the auth pages (a centred frosted card on marble with the wordmark above it) and the Sign out link.
- **Pages:** `auth.html` and `auth.js` for `/signin`, `/signup` and `/confirm`, with click-to-confirm links. `/signin` asks `/api/auth/me` first.
- **Data:** still works the v1 way during this stop.
- **Then stop.** The owner signs up their real account and confirms it from the email. Tests: `npm test` (auth tests) and a browser checklist.

### Stop (b): per-user data, session refresh and sign-out (steps 3 and 4)

- **Code:** `requireUser` on every data route; the new `user.js` (`getUserId` throws when nobody is signed in; `forUser` always filters by the user); `/` sends to `/signin` when signed out; `api.js` sends any 401 to `/signin`; the Sign out link; session refresh, and sign-out revoking the session at Supabase; `db/migrations/004_per_user.sql` and the matching `db/schema.sql`.
- **Then stop.** The owner runs migration 004 in Supabase with their email typed in, then restarts the server.
- **Tests:** the isolation tests (A cannot read, change or delete B's data); the session tests, including that an expired access cookie with a valid session lands on Home; the owner's v1 data appears after signing in.

### Stop (c): password reset and finishing (steps 5 and 6)

- **Reset:** "Forgot password?", the reset email using the template link, and the set-new-password page, which signs the user in afterwards.
- **Live check:** `scripts/check-isolation.mjs` (two temporary accounts; checks both the backend and RLS; deletes them).
- **Review:** a `code-reviewer` agent review, with its "Must fix" items fixed.
- **Docs:** `README.md` (new setup steps and the migration) and `PLAN.md` updated.
- **Then stop.** Tests: the roadmap's "Done when": two test accounts cannot see each other's data, and a forgotten password can be reset by email.

## Not in this feature

A "remember me" option, sign-in with Google or other providers, two-factor login, changing the email address, and showing the email in the header.

## Known risks

- Supabase's current email-delivery limits and dashboard menu names were written from memory; check them in Supabase's docs.
- The attempt limits reset whenever the server restarts (moved to a shared store in the Deploy feature).
