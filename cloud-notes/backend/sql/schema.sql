create table if not exists users (
  id bigserial primary key,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists notes (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_notes_user_created
  on notes(user_id, created_at desc);
