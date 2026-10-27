-- Cienega Exec Secretary: Meeting Mode + skip week
-- Paste into Supabase → SQL Editor → New query, then click Run. Safe to run again.

-- Sundays with no meeting (stake conference, etc.)
alter table agendas add column if not exists skipped boolean not null default false;
alter table agendas add column if not exists skip_reason text not null default '';

-- Changes you make while conducting. They're applied when next week's agenda is created.
create table if not exists meeting_marks (
  id          uuid primary key default gen_random_uuid(),
  meeting     text not null check (meeting in ('B', 'W')),
  date        date not null,                    -- the meeting you were conducting
  kind        text not null check (kind in ('done', 'edit', 'add', 'action')),
  text        text not null,                    -- the item (or the new item / task)
  anchor      text not null default '',         -- for 'add': the item it goes under
  new_text    text not null default '',         -- for 'edit'
  who         text not null default '',         -- for 'action': assigned to
  applied_to  date,                             -- the agenda it was carried into
  created_at  timestamptz not null default now()
);
create index if not exists meeting_marks_pending_idx on meeting_marks(meeting, applied_to);
alter table meeting_marks enable row level security;
