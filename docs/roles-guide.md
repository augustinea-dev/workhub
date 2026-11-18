# Workhub: what Admins and Users can do

Working notes for the future onboarding guides. Each section covers one part of Workhub: where to find it, what everyone can do, and what only Admins can do. Keep it in plain language and update it whenever a feature lands or a permission changes.

- **Admin**: manages clients, projects, tasks, templates, people and timesheet approvals.
- **User**: everyone else. Works on their tasks, posts updates and logs time.

Everyone can see all projects and tasks. There is no client access: Workhub is staff only.

---

## Signing in

**Where:** the login page.

- **Everyone:** enter your work email and use the sign-in link that arrives by email. There are no passwords.
- **Admins:** invite new people from the Supabase dashboard (Authentication, Users, Invite user). They appear on the Admin page as a User after they accept.
- People marked inactive can't sign in.

## Finding things: filters and sorting

Filters live in the page address, so a filtered view can be bookmarked or shared, and Back works. Dropdowns apply as soon as you change them; search applies when you press Enter. **Clear filters** resets the view. Exports download exactly what you've filtered to.

- **Everyone:**
  - **Projects:** search by project or client name; filter by Status (Open, All, or one status), Client (including "No client"), Owner (including "No owner") and Type. Click the Project, Client, Next milestone or Due column headings to sort; click again to reverse.
  - **A project's list view:** filter by Assignee (Everyone, Mine, Unassigned, or a person), Status, and Overdue only. Sort by Assignee, Due or Status from the column headings. Tasks stay grouped under their milestones, and done tasks stay at the bottom unless you sort by status.
  - **My Work:** filter your tasks by project or client (shown once your tasks span more than one project).
- **Admins:** same as everyone.

## My Work (home page)

**Where:** My Work in the sidebar.

- **Everyone:** see your open tasks, grouped into Overdue, Due this week, Later and No due date. Change a task's status from the list. The "Logged this week" card shows your hours for Sunday to Saturday and links to the Time page.
- **Waiting on review:** a list of tasks in the "In review" status, with the people on each task, its due date and a link to the project's Dropbox folder. It only appears when there's something to review.
  - **Admins:** see every task in review, on all projects, and can change their status.
  - **Users:** see tasks in review on projects they own. They can change the status only of tasks they're assigned to; the others show the status as a badge.

## Project names

Every project name is built from its parts, the same way as in Workfront: **reference # _ billing year _ name on project _ title _ project type**, for example `973623_2026_The Lanes_Website_TA`.

- **Reference #:** each new project gets the next number automatically. Projects brought over from Workfront keep their Workfront number.
- **Billing year:** the client's billing year, from the project's start date: a calendar year (2026) or a fiscal year (FY27). It can be overridden on a project.
- **Name on project:** the client's name, or the brand the client wants on projects (Maloney Group's projects say "Precizion Partners"). It can be overridden on a project.
- **Title:** what the project is, for example "Website".
- **Project type:** TA or TB (project types that set the proofing flow), HC (hard costs), Monthly (retainer), Initial (setup fee).

- **Everyone:** sees these on the project page and can filter the Projects list by type.
- **Admins only:**
  - Fill them in when creating or editing a project; the name updates as you type and is saved automatically.
  - On each client: set **Brand used in project names** and **Billing year** (calendar, or fiscal from a given month). Changing them updates that client's project names.
  - On the Admin page: set the **Next reference number** (it must stay above every number in use) and manage **Project types** (add, rename the label, retire).
  - For a project imported from Workfront, tick **Keep this exact name** (under "Reference number and exact name") so its name isn't rebuilt.

## Projects list

**Where:** Projects in the sidebar.

- **Everyone:** see Open or All projects, each with its client, owner, status, next milestone (with its date and health), open task count and due date.
- **Admins only:** **+ New project**. Set the title, client, project type, start date, owner, due date and cost code (name on project and billing year fill in from the client). A preview shows the full project name. Optionally pick **Start from template**: a start date is then required, and leaving Due empty uses the template's length.

## Project page

**Where:** open any project.

- **Everyone:**
  - The header shows the owner, due date, hours logged (and billable) and the next milestone.
  - **Budget bar:** hours logged against the task estimates, for example "62 of 80 h · 78%". It adds up the estimates on the project's tasks (subtasks count through their parent). PTO doesn't count. The bar turns amber at 75% and red over 100%, with the hours over. With no estimates yet it says "No task estimates yet". Admins and Users see the same numbers. Passing 75%, 90% and 100% also sends a budget alert (see [Inbox](#inbox)).
  - **Open Dropbox folder** (in the header and Project details) when the project's Dropbox folder has been linked.
  - **List** view: tasks grouped under their milestones. Each milestone shows "3 of 5 done" and its health. Tasks with no milestone are listed under "Not in a milestone".
  - **Board** view: see [Board](#board).
  - Change the status of tasks assigned to you.
- **Admins only:**
  - Change the status of any task.
  - **Add a task:** title, assignees, start, due, estimate (hours), milestone, and whether the task is itself a milestone.
  - **Edit project** (in the Project details card): name parts, status, owner, client, dates, cost code, description, Dropbox folder link and **Billable** (untick for internal projects; the project's logged time switches with it). Save as template and Delete are in the edit view too.
  - **Save as template:** copies the project's top-level tasks (subtasks are skipped), milestones, estimates and assignees into a new template.
  - Delete the project and its tasks.
  - **Create Dropbox folder** (in Project details) for a project with no folder link yet, once Dropbox is connected.

## Board

**Where:** a project page, then **Board** at the top right of Tasks.

- **Everyone:**
  - Columns: To do, In progress, In review, Done. Done shows the 10 most recently finished, with "Show all".
  - Filter by **Everyone** or **Mine**, and by milestone.
  - Move cards that are assigned to you: drag them, or use the status menu on the card (works on phones and keyboards). Other cards show "Assignee or Admin can move".
- **Admins only:** move any card.

## Assignees

A task can have **several people**, like in Workfront.

- **Everyone:** sees all of a task's assignees (lists and the board show "You, Jeremy" or "Cathy +2"). My Work shows every task you're one of the assignees on, and "Mine" filters do the same. **Any** assignee can change the task's status and tick its subtasks done.
- **Admins only:** add or remove assignees with the people picker on any task form (type a name, pick from the list; × removes someone). Each person added gets a "You were assigned" notice. Templates have default assignees the same way, and new projects copy them (inactive people are left off).

## Job roles and open work

People hold one or more **job roles** (Designer, Copywriter, Web Ops, Client Partnership, Digital Strategist to start), one of them their main role. A task can be assigned to a role as well as, or instead of, people, like "Resource: Designer" in Workfront.

- **Everyone:**
  - Open roles show next to a task's people, for example "Jeremy, Designer (open)".
  - **My Work → Open work for your roles** lists unfinished tasks waiting for one of your roles. **Take it** puts you on the task (as that role) and removes the open slot. You can only take work for roles you hold.
  - On a task page, the Details card lists open roles with a **Take it** button when it's one of yours.
- **Admins only:**
  - Manage the roles list on the Admin page (add, rename, reorder, retire). Roles still used on tasks can't be deleted, only retired.
  - Give each person their roles and main role (Admin page, **Roles** on each person).
  - Add open roles to a task (add-task form, or **Edit task**); the same role can be added more than once when several people are needed.
  - **Fill** an open role with a specific person from the task's Details card (people with that role are listed first). They're notified.
  - Templates can have open roles too, and new projects carry them over.

## Task page

**Where:** open any task.

- **Everyone:**
  - Assigned to, due date in plain words ("tomorrow", "overdue by 2 days"), description, subtasks, and for a milestone the tasks in it.
  - Side cards: Details (project, client, a link to the project's Dropbox folder when there is one, status, assignees, milestone), Dates, Hours (planned, logged, yours, remaining), History.
  - Post updates and log time (see below).
- **If you're one of the task's assignees:** a **Your status** bar with one-click To do, In progress, In review and Done.
- **If it isn't:** a note saying who it's assigned to. You can still post updates and log time.
- **Admins only:**
  - **Edit task** (in the Details card): title, status, start and due dates, assignees, milestone, estimate, description, and whether it's a milestone.
  - **+ Add subtask** under the description.
  - Delete the task.
  - Delete updates.

## Subtasks

**Where:** the Subtasks section on a task page.

- **Everyone:**
  - A subtask is a full task under another task: its own page, status, assignees, dates, updates and time. One level deep for now.
  - The parent shows "3 of 5 done" with a progress bar. Tick the box next to a subtask assigned to you to mark it done (tick again to undo).
  - A parent's **start, due and planned hours are calculated from its subtasks** (earliest start, latest due, total hours) whenever its subtasks have them.
  - When every subtask is done, the parent's assignees see "All subtasks are done. Mark this task done?" The parent isn't completed automatically.
  - The parent's Hours card counts time logged on its subtasks too, with an "On subtasks" line.
  - In a project's list view, subtasks appear indented (↳) under their parent, and the parent shows "2/5 subtasks". On the board, each subtask is its own card labelled with its parent. On My Work, subtasks show their parent's name.
- **Admins only:**
  - **Add a subtask** (title, assignees, start, due, planned hours). Dates start as the parent's.
  - Edit or delete subtasks. Deleting a parent also deletes its subtasks, and the button says how many.
  - Calculated dates and hours on a parent can't be edited by hand; change the subtasks instead.
- Milestones can't have subtasks or be subtasks. A subtask follows its parent's milestone.

## Milestones

- **Everyone:** a milestone is a task marked with ◆. Other tasks can belong to it. Health:
  - **On track:** nothing below applies.
  - **At risk:** one of its open tasks is overdue, or due after the milestone date. The reason is shown.
  - **Late:** the milestone date has passed and it isn't done.
- **Admins only:** mark a task as a milestone and choose which milestone a task belongs to. Unmarking a milestone ungroups its tasks.

## Updates and @mentions

**Where:** the Updates section on a task.

- **Everyone:**
  - Post progress notes, questions and handoffs. Updates can't be edited once posted.
  - Type **@** to mention someone (pick from the list by name or email). They get a **Mention** in their inbox, and their name is highlighted in the update.
  - For files, paste a Dropbox link in an update, or open the project's Dropbox folder. Workhub doesn't store files.
- **Admins only:** delete updates.

## Logging time

**Quick log on My Work:** every task row has a **Log time** button. It opens a small form under the row (date, hours, note) and logs it without leaving My Work. Dates in the future can't be picked there.

**Where:** the timesheet grid on the Time page, **Log one entry** on the Time page (a project or a General Time item), a task's Time section, My Work, or the timer.

- **Billable is automatic.** Nobody picks a type:
  - Time on a billable project shows as Billable; time on an internal project as Non-billable.
  - **General Time: Agency** items (General Time, IT Tasks, Management Time, Traffic, Training & Conferences, Visioneer Liftoff Meeting) show as Agency: worked, never billable.
  - **General Time: Non-Client** items (Vacation, Sick Leave, Holiday and the rest) show as Time off.
- **Everyone:**
  - Log hours in 15-minute steps with a date and an optional note.
  - Edit or remove your own entries, unless that week's timesheet is submitted or approved.
- **Admins only:** edit or remove anyone's entries (same lock applies), and view anyone's week on the Time page.
- **Team managers:** can view their team members' weeks on the Time page (pick them under Person).

## Timer

**Where:** **Start timer** on each task row in My Work and in the Time card on a task page.

- **Everyone (Admins and Users):**
  - Run one timer at a time, on any task. It shows in the sidebar with the time so far and a **Stop** button, on every page.
  - **Stop** opens a form with the hours filled in (rounded to the quarter hour), Billable, and the date the timer started. Change anything, then **Log time and stop**, or **Discard timer without logging**.
  - Starting a timer on another task while one is running is blocked: stop the first one, then log or discard it.
  - A timer that ran more than 10 hours shows a warning to check the hours first.
  - Timers are private. Nobody else, Admins included, can see, stop or change your timer.
  - The time you log follows the usual rules: a submitted or approved week stays locked, and the form says so.

## Timesheets

**Where:** the Time page. Weeks run Sunday to Saturday (Pacific time), as in Workfront.

- **Everyone:**
  - **The grid:** one row per task, grouped by project, then the General Time rows (Agency, then Non-Client). Columns are Sunday to Saturday, with totals per row and per day. Type hours into the cells and select **Save week**.
    - Task rows: every open task you're assigned to, anything you logged time on that week, and **Add a task** for any other open task.
    - **Job role** per task row, starting from your main role.
    - Each project's heading shows its **budget bar** (everyone's hours against the task estimates, the same as on the project page). Hours you type count toward it right away, marked "unsaved" until you save, so you can see if the week puts the project over. Projects without estimates show no bar.
    - To add a note, hover an hours box and select the pencil in its corner, or press Enter in the box. The note opens right next to the box; Enter or **Done** closes it, and it's saved with the week. Boxes with a note show a blue pencil, and hovering it shows the note.
    - **Save week** and **Add a task** stay pinned to the bottom of the screen on a long sheet.
    - Changing a cell sets that day's total for the row. If the day had several entries (from the timer, say), they become one, keeping their notes.
    - Holidays from the Admin page are shaded, and their **Holiday** hours are filled in (your daily hours). Save the week to keep them.
    - You're warned before leaving the page with unsaved edits.
  - **Log one entry** under the grid still adds a single entry the old way.
  - The **Timesheet** panel shows the week's status: Open, Submitted, Approved or Returned.
  - **Submit for approval** once you've saved at least your hours per week (40 unless an Admin set something else). Time off and Holiday count. Weeks that haven't started can't be submitted, but you can fill in time off ahead.
  - Submitted and approved weeks are **locked**: no adding, editing or removing time.
  - **Recall to edit** a submitted week until an Admin decides.
  - A **returned** week shows the Admin's note. Fix it and submit again.
  - You get an inbox notice when your week is approved, returned or reopened.
- **Admins only:**
  - **Approvals** (button on the Time page, with a count): every submitted week, with total and billable hours. **Review** opens the week; **Approve** from the list or the week.
  - **Return** a week with a note (required) so the person can fix it.
  - **Reopen** an approved week to allow changes. An Admin must reopen a week before changing its time.
- **Team managers (Admins or Users):** the same Approvals, Return and Reopen for the members of teams they manage, never for their own week. Approvals shows only their team, with a Team filter if they manage more than one.
  - Set each person's **hours per week** on the Admin page (lower it for part-time staff).

## Exports (CSV)

Files open in Excel or Google Sheets.

- **Everyone:**
  - **Projects:** the **Export CSV** button on the Projects page exports the list you're viewing (Open or All): client, owner, status, dates, next milestone, task counts, hours and billable hours.
  - **A project's tasks:** the **Export CSV** button on a project page, next to List | Board: type, milestone, parent task, assignees, status, dates, estimate, hours logged and completed date.
  - **Your time:** **Export to CSV** at the bottom of the Time page. Pick a date range, up to a year. Each row has the date, client, project, task, hours, hour type, billable (yes/no), note and that week's timesheet status.
- **Admins only:** in the time export, choose one person or **Everyone**.

## Teams

- **Everyone:** type **@** in an update and pick a team (for example "@Design team") to mention every member at once. The Assignee filter on a project's list and the Owner filter on the Projects list include teams.
- **Team managers:** approve, return and reopen their members' timesheets (see Timesheets).
- **Admins only:** create teams on the Admin page, set a manager (optional), add or remove members, and make a team inactive. Tasks can't be assigned to a whole team yet; use open roles for that.

## Inbox

**Where:** Inbox in the sidebar (the badge shows unread).

- **Everyone:** notices for tasks assigned to you, new updates on tasks you're involved in (an assignee, the project owner, or you've posted), mentions, and timesheet decisions. Opening one marks it read and takes you to the task, week or project. **Mark all read** clears the badge.
- **Budget alerts** (labelled Budget): sent once when a project's logged hours pass 75%, 90% and 100% of its task estimates (PTO doesn't count). If several levels are passed at once, only the highest is sent. If the estimates go up and the project drops back below a level, that level can be sent again later.
  - **Admins:** get them for every project.
  - **Users:** get them only for projects they own.
- **Notification settings** (Inbox → Settings, or under your name in the sidebar): turn each kind of notice on or off. "Timesheet returned" is always on so a returned week isn't missed.

## Templates (Admins only)

**Where:** Templates in the sidebar.

- Create a template, then add its tasks: title, start day and due day (working days from the project start, Monday to Friday; day 0 is the start), hours, type (Task, Milestone, or part of a milestone), default assignees and description.
- **Preview dates for a start on** shows the real dates for any start date.
- Use a template from **+ New project** on the Projects page. Default assignees who are inactive are left Unassigned.
- Working days skip weekends and the holidays on the Admin page.
- Changing or deleting a template doesn't affect projects already created from it.
- Users don't see templates.

## Reports (Admins only)

**Where:** Reports in the sidebar. Users don't see the link, and the page and its export turn them away.

- **Utilization**, with three views:
  - **By person:** one row per person.
  - **By job role:** people grouped under their main role, with a total per role. Open roles on tasks show as hours "not yet assigned" for that role.
  - **By project:** each project's estimate, planned and worked hours in the dates, hours logged to date and budget used (the same number as the project's budget bar).
- **What the numbers mean:**
  - **Available:** the person's hours per week spread over the working days in the dates (weekends and holidays left out), minus PTO they logged.
  - **Planned:** each task's estimate spread evenly over the working days from its start to its due date, split equally among its people and open roles. A task with only one date puts all its hours on that day. A parent task whose subtasks have estimates is counted through the subtasks.
  - **Worked** (everything but PTO) and **Billable**, as logged, whether or not the week is submitted.
  - **Planned util.** (planned ÷ available, red over 100%), **Actual util.** (worked ÷ available) and **Billable util.** (billable ÷ available).
- **Future dates work:** pick next week or next month to see planned load against capacity before the work happens.
- **Break down** by week or month to see each period side by side. Each cell shows planned ÷ available, the hours, and what was worked so far.
- **Unscheduled:** open tasks with estimates but no dates are listed below the report, since they can't be placed on the calendar.
- **Filters:** this, last or next week; this, last or next month; custom dates; and a team.
- **Export CSV** follows the view, dates, team and breakdown.

## Clients

**Where:** Clients in the sidebar.

- **Everyone:** see each client with its active and total projects. Select a client (or **View projects**) to see its projects on the Projects page.
- **Admins only:** add and rename clients, and set each client's brand used in project names and billing year. **+ New project** on a client opens the new project form with that client picked. **Delete** appears only for a client with no projects; move or delete its projects first. Projects are linked to a client when they're created or edited.

## Admin page (Admins only)

**Where:** Admin in the sidebar.

- **People:** edit name, roles (with a main role), hours per week, access (Admin or User) and Active. You can't remove your own admin access.
- **Job roles:** the list of roles people can hold and tasks can ask for.
- **General Time:** the timesheet rows that aren't on a project, in two groups (Agency and Non-Client). Each counts as Agency work (worked, never billable), Time off or Holiday. Rename, regroup or untick Active to hide one; logged time is kept.
- **Holidays:** days the agency is closed. Add one day, or a From and To range such as Thanksgiving, Nov 25 to Nov 27 (weekends are skipped, days already on the list are left as they are). A range shows as one line and is removed in one click. Template dates skip them, and Reports leave them out of available and planned hours. Adding one doesn't move dates on existing projects. Everyone can see holidays; only Admins add or remove them.
- **Project names:** the next reference number, and the list of project types.
- **Dropbox:** connect Workhub to Dropbox once for the agency. After that, each new project gets a folder (client, then project name) and its link fills in automatically. If a folder can't be made, the project is still created and you see why. Disconnect stops new folders; existing links keep working.
- **Recent changes:** the latest changes across Workhub and who made them.

## Good to know

- **Editing:** everyone sees the same task and project pages. Admins change things with **Edit task** / **Edit project** (top of the Details card), then **Save** or **Cancel**. Clients are edited the same way with **Edit** on each row.
- **Deleting** always asks first ("Delete this task? This can't be undone."), with **Yes, delete** and **Cancel**. Update Delete buttons only show when you point at an update.
- **Messages** like "Saved" or an error pop up in the bottom-right corner. Saved messages fade after a few seconds; errors stay until you close them.

- **Live updates:** pages refresh on their own when someone else changes a task, update, timesheet or your inbox.
- **Safe saves:** if someone else saved first, you'll see a message and nothing is overwritten. Make your change again.
- **Time zone:** "today" and "this week" use Pacific time.
- **Not yet available:** email notifications, Microsoft sign-in, file storage (use Dropbox links).
