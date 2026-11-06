# Workhub

Custom work hub for Augustine Agency (a digital marketing agency on Microsoft 365), replacing Adobe Workfront. Built in phases; this repo is the Phase 1 (MVP) foundation. Staff only: there is no client access.

- Roadmap and Build progress tracker (status of all 66 Workfront features): https://claude.ai/artifact/3ATMWfRGDBKsvEL91cBRFH
- Supabase project: `workhub` (ref `btixhcfjtmukefyjzfgx`, us-east-2, Free plan)

## Product direction

- Workhub is a custom hub for Augustine, not a feature-for-feature Workfront clone. Prioritize agency-specific value:
  - Low-friction time capture
  - Request-to-profit: job numbers, rates, retainers
  - One home for our internal tools (Media & Budget Tracker alerts, website status sheets, Visioneer Time)
  - Microsoft 365 integration
  - AI on our own data
- Target scale: about 40 users, 2 developers. No per-user costs: pick tools and services that don't charge per seat.
- Files (later phase, not now): working files live in Dropbox (Dropbox Enterprise). Workhub will store links to Dropbox files and auto-create project folders; proofing will use Dropbox Replay first. Until then, **do not build file uploads or Supabase file storage.** People paste Dropbox links in task comments, and admins can paste a project's folder link (`projects.dropbox_url`, Dropbox links only, checked in the DB and the action).

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
| Change task status | Any task | Only tasks they're one of the assignees on (trigger `guard_task_update` blocks other columns) |
| Add or remove a task's assignees or open roles | ✓ | ✗ |
| Manage job roles and people's roles | ✓ | ✗ |
| Take open work for a role (`take_role_task`) | ✓ | Only for roles they hold |
| Comment | ✓ | ✓ |
| Log time | ✓ | Own only |
| Edit / remove time entries | Anyone's | Own only, and never in a submitted or approved week (admins must reopen it first) |
| Submit / recall a week's timesheet | Own | Own |
| Approve, return (with note) or reopen timesheets | ✓ | ✗ |
| Set someone's hours per week | ✓ | ✗ (trigger `guard_profile_update`) |
| Delete projects, tasks, comments, clients | ✓ | ✗ |
| Admin page, audit log, other people's timesheets | ✓ | ✗ (team managers: their members' timesheets) |
| Approve, return or reopen a team member's timesheet | ✓ | Team manager only, never their own |
| Manage teams | ✓ | ✗ |
| Notification settings | Own | Own ("timesheet returned" can't be turned off) |
| Project templates (view, create, edit, delete, use, save project as template) | ✓ | ✗ |

When adding a feature, decide its admin/member rule first. Enforce it with an RLS policy or trigger in a new migration, check it in the server action (`requireAdmin()` / `requireProfile()`), and hide controls the person can't use.

## Database changes: important

- The live migration history matches the files in `supabase/migrations` (init, admin_only_deletes, member_permissions, task_milestones, comment_mentions, project_templates, timesheets, subtasks, project_naming, task_assignees, job_roles, notification_preferences, teams, fix_reference_number_update, project_dropbox_link).
- **Never edit an existing migration.** Add a new file named `YYYYMMDDHHMMSS_description.sql`.
- Test migrations locally before pushing. Postgres 16 with a small `auth` stub (an `auth.users` table, `auth.uid()` reading `request.jwt.claim.sub`, and an `authenticated` role) is enough. Test as both an admin and a member.
- Apply to Supabase with `supabase db push` (CLI) or the GitHub integration. If you run SQL by hand in the dashboard, also insert the version into `supabase_migrations.schema_migrations` so history stays in sync.

## Conventions

- Saves are version-checked: projects and tasks have a `version` column bumped by trigger. Updates use `.eq("version", v)`, and 0 rows means someone else saved first, so show the conflict message and never overwrite silently.
- Comments are append-only (no update policy). `comments.mentions` holds the people @mentioned; a trigger keeps only active people other than the author, and they get a `mention` notification instead of `task_comment`.
- Notifications are rows in `notification_events`, created by DB triggers. The in-app inbox reads them now; a future email worker will send rows where `emailed_at` is null.
- Opening a notification (`/inbox/open/[id]`) or its task marks it read.
- Person pickers use `personOption()` (name + email), because names default to the email prefix and can look alike.
- Forms post to server actions and redirect with `?error=` / `?notice=`, rendered by `<Flash>`.
- Pages that others can change include `<LiveRefresh subs={…}>` for Realtime refresh.
- Templates (`project_templates`, `template_tasks`) store days as working days from the project start (Mon to Fri; `add_working_days()` in SQL and `addWorkingDays()` in `dates.ts` must match, and holidays would go in both). Projects are created from templates, and saved as templates, by the database functions `create_project_from_template()` and `create_template_from_project()` in one transaction.
- Project names are built by trigger `build_project_name` as `reference_number_billing year_name on project_title_project type` (e.g. `973623_2026_The Lanes_Website_TA`, matching the Workfront convention). New projects take `workhub_settings.next_reference_number`; Workfront imports keep their number and set `name_locked`. `src/lib/naming.ts` mirrors the rules for the live preview and must stay in step. Clients are the legal billing entity and hold `project_label` (brand) and `fiscal_year_start_month`. Project types (TA, TB, HC, Monthly, Initial) live in `project_types`.
- Tasks can have several people: `task_assignees` (and `template_task_assignees`). There is no `tasks.assignee_id`. Select `task_assignees(profile_id)` and turn it into `assignee_ids` with `withAssignees()` in `src/lib/assignees.ts`; save with `syncAssignees()` in actions. Adding someone notifies them (`notify_task_assignee_added`).
- Job roles: `job_roles`, `profile_job_roles` (one `is_main` per person). Open role slots on tasks are `task_role_slots` (repeats allowed), on templates `template_task_role_slots`. `take_role_task()` swaps a slot for the caller ("Work on it"), `assign_role_slot()` lets an admin fill it; both record `task_assignees.as_role_id`. Load slots with the `ASSIGNEES` embed (gives `open_roles`), save with `syncRoleSlots()`.
- Teams: `teams` (optional `manager_id`) and `team_members`. `manages(profile)` is true for an active team's manager; it widens timesheet reads and lets `decide_timesheet` / `reopen_timesheet` act for managers (never on their own week). Filters accept `team:<id>`. Mentioning "@Team name" mentions every member.
- Notification settings: `notification_preferences` rows turn a kind off; trigger `skip_muted_notification` drops those notices. `timesheet_returned` isn't an allowed kind there, so it's always on.
- Subtasks: `tasks.parent_task_id`, same project, one level deep (trigger `check_task_parent`; relax it there to allow more levels). A parent's start, due and estimate are rolled up from its subtasks by `apply_subtask_rollup` / `refresh_parent_rollup`, per field, only when at least one subtask has that value. Admin-only to create, like all tasks.
- Timesheets: one row per person per Monday week in `timesheets`, changed only through `submit_timesheet()`, `recall_timesheet()`, `decide_timesheet()` and `reopen_timesheet()` (no direct write policies). A week can't be submitted below the person's `profiles.weekly_hours` (PTO counts). Trigger `guard_locked_week` blocks time entry changes in submitted or approved weeks for everyone.
- `docs/roles-guide.md` lists what Admins and Users can do, feature by feature, in plain language for the future onboarding doc. Update it whenever a feature lands or a permission changes.
- Milestones are tasks with `is_milestone`; other tasks join one through `milestone_id` (same project, enforced by trigger). Health (on track / at risk / late) is computed in `src/lib/milestones.ts`.

## Commands

```bash
npm run dev     # http://localhost:3000 (needs .env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
npm run build   # must pass before committing
npm run lint
```

## Next up (MVP)

Email notifications, subtasks UI, list sorting/filters, custom fields, teams/groups, Microsoft (Entra ID) sign-in, Dropbox integration (later phase). Update the Build progress tracker as features land.

Open question: should members be able to mark tasks complete when they aren't assigned to them? Currently assigned-only.
