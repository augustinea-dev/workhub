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

- **Everyone:** see your open tasks, grouped into Overdue, Due this week, Later and No due date. Change a task's status from the list. The "Logged this week" card shows your hours for Monday to Sunday and links to the Time page.

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
  - On each client: set **Name on projects** and **Billing year** (calendar, or fiscal from a given month). Changing them updates that client's project names.
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
  - **List** view: tasks grouped under their milestones. Each milestone shows "3 of 5 done" and its health. Tasks with no milestone are listed under "Not in a milestone".
  - **Board** view: see [Board](#board).
  - Change the status of tasks assigned to you.
- **Admins only:**
  - Change the status of any task.
  - **Add a task:** title, assignees, start, due, milestone, and whether the task is itself a milestone.
  - **Edit project** (in the Project details card): name parts, status, owner, client, dates, cost code and description. Save as template and Delete are in the edit view too.
  - **Save as template:** copies the project's top-level tasks (subtasks are skipped), milestones, estimates and assignees into a new template.
  - Delete the project and its tasks.

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
  - Side cards: Details (project, client, status, assignees, milestone), Dates, Hours (planned, logged, yours, remaining), History.
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
  - For files, paste a Dropbox link in an update. Workhub doesn't store files.
- **Admins only:** delete updates.

## Logging time

**Quick log on My Work:** every task row has a **Log time** button. It opens a small form under the row (date, hours, type, note) and logs it without leaving My Work. Dates in the future can't be picked there.

**Where:** a task's Time section, or the Time page (for project-level time).

- **Everyone:**
  - Log hours in 15-minute steps with a date, hour type (Billable, Non-billable, Admin, Meeting, PTO) and optional note.
  - Edit or remove your own entries, unless that week's timesheet is submitted or approved.
- **Admins only:** edit or remove anyone's entries (same lock applies), and view anyone's week on the Time page.
- **Team managers:** can view their team members' weeks on the Time page (pick them under Person).

## Timesheets

**Where:** the Time page. Weeks run Monday to Sunday (Pacific time).

- **Everyone:**
  - The **Timesheet** panel shows the week's status: Open, Submitted, Approved or Returned.
  - **Submit week** once you've logged at least your hours per week (40 unless an Admin set something else). PTO counts. Weeks that haven't started can't be submitted.
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

- **Everyone:** notices for tasks assigned to you, new updates on tasks you're involved in (an assignee, the project owner, or you've posted), mentions, and timesheet decisions. Opening one marks it read and takes you to the task or week. **Mark all read** clears the badge.
- **Notification settings** (Inbox → Settings, or under your name in the sidebar): turn each kind of notice on or off. "Timesheet returned" is always on so a returned week isn't missed.

## Templates (Admins only)

**Where:** Templates in the sidebar.

- Create a template, then add its tasks: title, start day and due day (working days from the project start, Monday to Friday; day 0 is the start), hours, type (Task, Milestone, or part of a milestone), default assignees and description.
- **Preview dates for a start on** shows the real dates for any start date.
- Use a template from **+ New project** on the Projects page. Default assignees who are inactive are left Unassigned.
- Changing or deleting a template doesn't affect projects already created from it.
- Users don't see templates.

## Clients

**Where:** Clients in the sidebar.

- **Everyone:** see each client with its active and total projects. Select a client (or **View projects**) to see its projects on the Projects page.
- **Admins only:** add and rename clients, and set each client's name on projects and billing year. **Delete** appears only for a client with no projects; move or delete its projects first. Projects are linked to a client when they're created or edited.

## Admin page (Admins only)

**Where:** Admin in the sidebar.

- **People:** edit name, roles (with a main role), hours per week, access (Admin or User) and Active. You can't remove your own admin access.
- **Job roles:** the list of roles people can hold and tasks can ask for.
- **Project names:** the next reference number, and the list of project types.
- **Recent changes:** the latest changes across Workhub and who made them.

## Good to know

- **Editing:** everyone sees the same task and project pages. Admins change things with **Edit task** / **Edit project** (top of the Details card), then **Save** or **Cancel**. Clients are edited the same way with **Edit** on each row.
- **Deleting** always asks first ("Delete this task? This can't be undone."), with **Yes, delete** and **Cancel**. Update Delete buttons only show when you point at an update.
- **Messages** like "Saved" or an error pop up in the bottom-right corner. Saved messages fade after a few seconds; errors stay until you close them.

- **Live updates:** pages refresh on their own when someone else changes a task, update, timesheet or your inbox.
- **Safe saves:** if someone else saved first, you'll see a message and nothing is overwritten. Make your change again.
- **Time zone:** "today" and "this week" use Pacific time.
- **Not yet available:** email notifications, Microsoft sign-in, file storage (use Dropbox links).
