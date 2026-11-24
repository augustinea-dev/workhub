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
- Files (later phase, not now): working files live in Dropbox (Dropbox Enterprise). Workhub will store links to Dropbox files and auto-create project folders; proofing will use Dropbox Replay first. Until then, **do not build file uploads or Supabase file storage.** People paste Dropbox links in task comments, and admins can paste a project's folder link (`projects.dropbox_url`, Dropbox links only, checked in the DB and the action). Dropbox is connected once on the Admin page (OAuth, App folder app for now); the refresh token lives in `dropbox_connection`, which has no policies and is read only with the secret key (`src/lib/supabase/service.ts`, `SUPABASE_SECRET_KEY`). New projects get `/<client>/<project name>` and its share link via `src/lib/dropbox.ts`; a Dropbox failure never blocks creating a project.

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
| Fill in the weekly timesheet grid (tasks + General Time) | Own and anyone's | Own only |
| Manage General Time items | ✓ | ✗ (can read them) |
| Set a project's Billable setting | ✓ | ✗ |
| Start, stop or discard a timer | Own only | Own only |
| Edit / remove time entries | Anyone's | Own only, and never in a submitted or approved week (admins must reopen it first) |
| Submit / recall a week's timesheet | Own | Own |
| Approve, return (with note) or reopen timesheets | ✓ | ✗ |
| Set someone's hours per week | ✓ | ✗ (trigger `guard_profile_update`) |
| Delete projects, tasks, comments, clients | ✓ | ✗ |
| Admin page, audit log, other people's timesheets | ✓ | ✗ (team managers: their members' timesheets) |
| Reports (utilization) and their CSV export | ✓ | ✗ |
| Workload page | ✓ | ✗ |
| Add or remove holidays | ✓ | ✗ (can read them) |
| Approve, return or reopen a team member's timesheet | ✓ | Team manager only, never their own |
| Manage teams | ✓ | ✗ |
| Notification settings | Own | Own ("timesheet returned" can't be turned off) |
| Receive budget alerts (75%, 90%, 100% of estimates) | Every project | Projects they own |
| Project templates (view, create, edit, delete, use, save project as template) | ✓ | ✗ |
| Connect or disconnect Dropbox, create a project's Dropbox folder | ✓ | ✗ |

When adding a feature, decide its admin/member rule first. Enforce it with an RLS policy or trigger in a new migration, check it in the server action (`requireAdmin()` / `requireProfile()`), and hide controls the person can't use.

## Database changes: important

- The live migration history matches the files in `supabase/migrations` (init, admin_only_deletes, member_permissions, task_milestones, comment_mentions, project_templates, timesheets, subtasks, project_naming, task_assignees, job_roles, notification_preferences, teams, fix_reference_number_update, project_dropbox_link, dropbox_connection, time_entries_realtime, running_timers, budget_alerts, holidays, timesheet_grid).
- **Never edit an existing migration.** Add a new file named `YYYYMMDDHHMMSS_description.sql`.
- Test migrations locally before pushing. Postgres 16 with a small `auth` stub (an `auth.users` table, `auth.uid()` reading `request.jwt.claim.sub`, and an `authenticated` role) is enough. Test as both an admin and a member.
- Apply to Supabase with `supabase db push` (CLI) or the GitHub integration. If you run SQL by hand in the dashboard, also insert the version into `supabase_migrations.schema_migrations` so history stays in sync.

## Rollbacks

- Risky changes get a git tag before they start and a matching undo script in `supabase/rollbacks/` (never in `migrations`, so the CLI doesn't run it).
- Timesheet grid (`20261117211210_timesheet_grid`): the migration copies `time_entries`, `timesheets` and project clients into the `backup_timesheet_grid` schema first. To undo:
  1. Run `supabase/rollbacks/20261117211210_timesheet_grid_down.sql` in the SQL editor as one script. It removes General Time entries, restores hour types and timesheets from the backup, puts weeks back to Monday and deletes the migration's history row.
  2. Deploy the `before-timesheet-grid` git tag (or revert the branch's merge commit) so the app matches.
  3. Once sure, `drop schema backup_timesheet_grid cascade;`.

## Conventions

- Saves are version-checked: projects and tasks have a `version` column bumped by trigger. Updates use `.eq("version", v)`, and 0 rows means someone else saved first, so show the conflict message and never overwrite silently.
- Comments are append-only (no update policy). `comments.mentions` holds the people @mentioned; a trigger keeps only active people other than the author, and they get a `mention` notification instead of `task_comment`.
- Notifications are rows in `notification_events`, created by DB triggers. The in-app inbox reads them now; a future email worker will send rows where `emailed_at` is null.
- Opening a notification (`/inbox/open/[id]`) or its task marks it read.
- Person pickers use `personOption()` (name + email), because names default to the email prefix and can look alike.
- Forms post to server actions and redirect with `?error=` / `?notice=`, rendered by `<Flash>`.
- Pages that others can change include `<LiveRefresh subs={…}>` for Realtime refresh.
- Templates (`project_templates`, `template_tasks`) store days as working days from the project start (Mon to Fri, skipping `holidays`; `is_working_day()` / `add_working_days()` / `working_days_between()` in SQL and `isWorkingDay()` / `addWorkingDays()` in `dates.ts` must match, so pass the holiday set from `getHolidays()`). Projects are created from templates, and saved as templates, by the database functions `create_project_from_template()` and `create_template_from_project()` in one transaction.
- Project names are built by trigger `build_project_name` as `reference_number_billing year_name on project_title_project type` (e.g. `973623_2026_The Lanes_Website_TA`, matching the Workfront convention). New projects take `workhub_settings.next_reference_number`; Workfront imports keep their number and set `name_locked`. `src/lib/naming.ts` mirrors the rules for the live preview and must stay in step. Clients are the legal billing entity and hold `project_label` (brand) and `fiscal_year_start_month`. Project types (TA, TB, HC, Monthly, Initial) live in `project_types`.
- Tasks can have several people: `task_assignees` (and `template_task_assignees`). There is no `tasks.assignee_id`. Select `task_assignees(profile_id)` and turn it into `assignee_ids` with `withAssignees()` in `src/lib/assignees.ts`; save with `syncAssignees()` in actions. Adding someone notifies them (`notify_task_assignee_added`).
- Job roles: `job_roles`, `profile_job_roles` (one `is_main` per person). Open role slots on tasks are `task_role_slots` (repeats allowed), on templates `template_task_role_slots`. `take_role_task()` swaps a slot for the caller ("Work on it"), `assign_role_slot()` lets an admin fill it; both record `task_assignees.as_role_id`. Load slots with the `ASSIGNEES` embed (gives `open_roles`), save with `syncRoleSlots()`.
- Teams: `teams` (optional `manager_id`) and `team_members`. `manages(profile)` is true for an active team's manager; it widens timesheet reads and lets `decide_timesheet` / `reopen_timesheet` act for managers (never on their own week). Filters accept `team:<id>`. Mentioning "@Team name" mentions every member.
- Notification settings: `notification_preferences` rows turn a kind off; trigger `skip_muted_notification` drops those notices. `timesheet_returned` isn't an allowed kind there, so it's always on.
- Subtasks: `tasks.parent_task_id`, same project, one level deep (trigger `check_task_parent`; relax it there to allow more levels). A parent's start, due and estimate are rolled up from its subtasks by `apply_subtask_rollup` / `refresh_parent_rollup`, per field, only when at least one subtask has that value. Admin-only to create, like all tasks.
- Weeks run Sunday to Saturday everywhere: `week_sunday()` in SQL, `weekStart()` in `dates.ts`.
- Time entries are on a project/task **or** a General Time item (`time_entries.category_id` to `time_categories`, check `time_entries_project_or_category`), never both. `hour_type` is set by trigger `time_entry_set_type` and never by the app: billable project = billable, internal project (`projects.billable` false) = non_billable, category kind work = admin (shown as Agency), time_off and holiday = pto (shown as Time off). Changing `projects.billable` rewrites its entries' type (`guard_locked_week` allows type-only updates in locked weeks). `job_role_id` defaults to the person's main role. Reports skip holiday-kind hours because holidays are already out of available hours.
- The Time page grid (`src/components/timesheet-grid.tsx`) saves with `saveTimesheetWeek`: each cell sets that row and day's total (rows `t:<task>`, `p:<project>`, `c:<category>`), merging several entries into one. The one-entry form uses `logTime` with `work` = `p:<id>` or `c:<id>`.
- Action redirects keep the page's query string (for example `?week=`), replacing only `error` / `notice`.
- Timesheets: one row per person per Sunday week in `timesheets`, changed only through `submit_timesheet()`, `recall_timesheet()`, `decide_timesheet()` and `reopen_timesheet()` (no direct write policies). A week can't be submitted below the person's `profiles.weekly_hours` (time off and holiday hours count). Trigger `guard_locked_week` blocks time entry changes in submitted or approved weeks for everyone.
- `docs/roles-guide.md` lists what Admins and Users can do, feature by feature, in plain language for the future onboarding doc. Update it whenever a feature lands or a permission changes.
- Reports: `/reports` (requireAdmin) and `/export/utilization` (403 for Users), views by person, job role (main role) and project, with total, week or month breakdown. All maths is in `src/lib/utilization.ts`: available = weekly hours ÷ 5 × working days (holidays out) − PTO; planned = each leaf task's estimate split evenly among its assignees and open role slots and over the working days from start to due (one date only: that day; no dates: listed as Unscheduled). No RLS change: Admins can already read all tasks and time.
- Workload: `/workload` (requireAdmin), people by day, 3 weeks at a time (`?from=` snaps to Sunday, `?weeks=` up to 52, scrolling right or "Show 3 more weeks" adds 3, `?team=`). Built in `src/lib/workload.ts` from `loadReportData` with the same estimate split as Reports (leaf tasks, not done; open role slots and tasks with no one go to the Unassigned work row). Clicking a day lists its tasks.
- Budget alerts: `check_project_budget()` runs from triggers on `time_entries` and `tasks`, compares non-PTO hours with the sum of top-level task estimates, and sends one `budget_alert` notice (the highest newly passed level) to active Admins and the project owner. Levels sent are kept in `project_budget_alerts` (no policies) and cleared when the project drops below them. The budget bar (`src/components/budget-bar.tsx`, on the project page and each project heading in the timesheet grid, where unsaved cells count toward it) uses the maths in `src/lib/budget.ts`; keep that and the SQL in step.
- Timer: `running_timers`, one row per person (primary key `user_id`), readable and writable only by its owner. Started with `startTimer`, logged with `logTimer` (inserts a normal time entry, then deletes the timer) or dropped with `discardTimer`; `/timer` is the stop page. `getMyTimer()` in `src/lib/timer.ts`.
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
