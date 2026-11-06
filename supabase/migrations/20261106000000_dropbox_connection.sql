-- The agency's Dropbox connection. Only the server (secret key) can read or change it.

create table public.dropbox_connection (
  id             boolean primary key default true check (id),
  account_name   text not null,
  account_email  text,
  refresh_token  text not null,
  connected_by   uuid references public.profiles (id) on delete set null,
  connected_at   timestamptz not null default now()
);

alter table public.dropbox_connection enable row level security;
revoke all on public.dropbox_connection from anon, authenticated;
