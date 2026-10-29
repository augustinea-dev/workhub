# Workhub

In-house replacement for Adobe Workfront at Augustine Agency (a 30–40 person digital marketing agency on Microsoft 365). Built in phases; this repo is the Phase 1 (MVP) foundation. Staff only: there is no client access.

- Roadmap and Build progress tracker (status of all 66 Workfront features): https://claude.ai/artifact/3ATMWfRGDBKsvEL91cBRFH
- Supabase project: `workhub` (ref `btixhcfjtmukefyjzfgx`, us-east-2, Free plan)

## Stack

- Next.js 15 App Router, React 19, TypeScript, Tailwind v4 (component classes such as `.input`, `.btn`, `.btn-primary`, `.card` and `.table-head` live in `src/app/globals.css`)
- Supabase: Postgres + row-level security, Auth (email login links, invite-only), Realtime
- Deploy target: Vercel. Timezone for "today"/"this week" is America/Los_Angeles (`src/lib/dates.ts`); servers run in UTC.

## Layout

```
supabase/migrations/        Schema, triggers, RLS. Append-only (see below)
src/app/login, src/app/auth Email login link + callback + sign-out
src/app/(app)/              Signed-in pages: My Work (/), projects, tasks, time, clients, inbox, admin
src/app/(app)/actions.ts    ALL writes go through these server actions
src/components/             ui.tsx (server), client.tsx (LiveRefresh, TaskStatusSelect, SubmitButton, NavLink), time-entries.tsx
src/lib/                    supabase clients, session (requireProfile / requireAdmin), data helpers, types, dates
```

## Permission rules (enforced in the database AND the UI; keep both in sync)

| Action | Admin | Member |
| --- | --- | --- |
| Add/edit clients, projects, tasks (any detail) | ✓ | ✗ |
| Change task status | Any task | Only tasks assigned to them (trigger `guard_task_update` blocks other columns) |
| Comment | ✓ | ✓ |
| Log time | ✓ | Own only |
| Edit / remove time entries | Anyone's | Own only |
| Delete projects, tasks, comments, clients | ✓ | ✗ |
| Admin page, audit log, other people's timesheets | ✓ | ✗ |

When adding a feature, decide its admin/member rule first. Enforce it with an RLS policy or trigger in a new migration, check it in the server action (`requireAdmin()` / `requireProfile()`), and hide controls the person can't use.

## Database changes: important

- The live migration history matches the files in `supabase/migrations` (init, admin_only_deletes, member_permissions).
- **Never edit an existing migration.** Add a new file named `YYYYMMDDHHMMSS_description.sql`.
- Test migrations locally before pushing. Postgres 16 with a small `auth` stub (an `auth.users` table, `auth.uid()` reading `request.jwt.claim.sub`, and an `authenticated` role) is enough. Test as both an admin and a member.
- Apply to Supabase with `supabase db push` (CLI) or the GitHub integration. If you run SQL by hand in the dashboard, also insert the version into `supabase_migrations.schema_migrations` so history stays in sync.

## Conventions

- Saves are version-checked: projects and tasks have a `version` column bumped by trigger. Updates use `.eq("version", v)`, and 0 rows means someone else saved first, so show the conflict message and never overwrite silently.
- Comments are append-only (no update policy).
- Notifications are rows in `notification_events`, created by DB triggers. The in-app inbox reads them now; a future email worker will send rows where `emailed_at` is null.
- Opening a notification (`/inbox/open/[id]`) or its task marks it read.
- Person pickers use `personOption()` (name + email), because names default to the email prefix and can look alike.
- Forms post to server actions and redirect with `?error=` / `?notice=`, rendered by `<Flash>`.
- Pages that others can change include `<LiveRefresh subs={…}>` for Realtime refresh.

## Commands

```bash
npm run dev     # http://localhost:3000 (needs .env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
npm run build   # must pass before committing
npm run lint
```

## Next up (MVP)

Email notifications, @mentions, Kanban board, subtasks UI, list sorting/filters, project templates, timesheet submit/approve, file attachments, CSV/Excel export, custom fields, teams/groups, Microsoft (Entra ID) sign-in. Update the Build progress tracker as features land.

Open question: should members be able to mark tasks complete when they aren't assigned to them? Currently assigned-only.
