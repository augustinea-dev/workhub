# Workhub

The starter for Augustine Agency's in-house Workfront replacement. Phase 1 foundation: projects, tasks, My Work, comments, time logging and an in-app inbox, for staff only.

**Stack:** Next.js 15 (App Router, TypeScript, Tailwind) · Supabase (Postgres, Auth, Realtime) · Vercel.

## What's in it

| Area | What works |
| --- | --- |
| Sign-in | Email login links. Invite-only: nobody can sign up on their own |
| Roles | **Admin**: manage people, delete projects, read the audit log. **Member**: everything else |
| My Work | Your open tasks grouped Overdue / This week / Later / No date, with a one-click status change and your hours this week |
| Projects | List (open or all), create, edit details, status, owner, client and dates; tasks inside each project |
| Tasks | Title, status, assignee, due date, estimate, milestone flag, description; an update thread; time logged against the task |
| Time | Weekly view with totals and billable share; log time against a project or task. Admins can view anyone's week |
| Clients | A simple client list that projects link to |
| Inbox | Notifications when you're assigned a task or someone comments on a task you're involved in |
| Live updates | Open pages refresh when someone else changes a task or comment (Supabase Realtime) |
| Safe saves | Every task and project carries a version number. If someone else saved first, you get a message and nothing is overwritten |
| Audit trail | Database triggers log every create, update and delete, with who did it and when |

Permissions are enforced in the database with row-level security, not only in the UI. The migration was tested against Postgres 16: members can't promote themselves, log time for others or delete projects, and stale saves are rejected.

## Setup (about 15 minutes)

1. **Create a Supabase project** at [supabase.com](https://supabase.com). Region: West US.
2. **Run the migration.** In the SQL editor, paste and run `supabase/migrations/20261028000000_init.sql`. If you use the Supabase CLI, run `supabase link` and then `supabase db push`.
3. **Configure auth.** Go to Authentication → Sign In / Providers → Email:
   - Turn **off** "Allow new users to sign up". The app is invite-only.
   - Under URL Configuration, set **Site URL** to your app URL. Add `http://localhost:3000/**` and your Vercel URL followed by `/**` to the **Redirect URLs**.
4. **Invite the two users.** Go to Authentication → Users → *Invite user* and invite each email address.
5. **Make yourself admin.** In the SQL editor, run:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@augustineagency.com';
   ```
6. **Run it locally:**
   ```bash
   cp .env.example .env.local   # add the project URL and publishable key from Project Settings → API
   npm install
   npm run dev
   ```
7. **Deploy.** Import the repo into Vercel and add the same two environment variables.

> Supabase's built-in email is rate-limited and meant for testing. Before more people use the app, set up custom SMTP under Authentication → Emails (Microsoft 365 or Resend).

## Project layout

```
supabase/migrations/   Database schema, triggers, row-level security
src/app/login          Email login-link page
src/app/auth           Login-link callback and sign-out
src/app/(app)/         Signed-in pages: My Work, projects, tasks, time, clients, inbox, admin
src/app/(app)/actions.ts  All writes (server actions), each re-checked by RLS
src/components/        Shared UI, live refresh, status select
src/lib/               Supabase clients, session helpers, types, date helpers (Pacific time)
```

## Next steps (from the roadmap)

- **Microsoft sign-in.** Add the Azure provider in Supabase Auth once IT registers the app in Entra ID. No data changes are needed.
- **Email notifications.** A scheduled Edge Function that reads `notification_events` where `emailed_at` is null and sends through Microsoft Graph.
- **Kanban board, project templates and custom fields.** These finish the rest of Phase 1.
- **Timesheet submission and approval.** Lock a week once it's submitted.
