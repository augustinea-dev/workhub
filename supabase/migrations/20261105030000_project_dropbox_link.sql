-- A link to the project's Dropbox folder, pasted by an admin. No files are stored in Workhub.

alter table public.projects
  add column dropbox_url text
  check (dropbox_url ~* '^https://([a-z0-9-]+\.)*dropbox\.com/');
