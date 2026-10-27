-- Cienega Exec Secretary: interview stage
-- Paste into Supabase → SQL Editor → New query, then click Run. Safe to run again.

-- When each interviewer is available (several per person, e.g. Sundays and Wednesdays)
create table if not exists iv_windows (
  id              uuid primary key default gen_random_uuid(),
  interviewer_id  text not null references interviewers(id) on delete cascade,
  day             text not null check (day in ('Sun','Mon','Tue','Wed','Thu','Fri','Sat')),
  start_time      text not null,
  end_time        text not null,
  slot_minutes    int not null default 15,
  place           text not null default ''
);

-- Single dates an interviewer isn't available ("No interviews Wed Nov 11")
create table if not exists iv_days_off (
  interviewer_id  text not null references interviewers(id) on delete cascade,
  date            date not null,
  primary key (interviewer_id, date)
);

-- Adult interviews you track (temple recommends, etc.). Youth come from Members automatically.
create table if not exists iv_tracks (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid references households(id) on delete cascade,
  who            text not null default 'p1',     -- p1, p2, or both (who to text)
  name           text not null,                  -- e.g. "Miguel & Rosa Pena"
  type           text not null,                  -- e.g. "Temple recommend"
  interviewer    text,                           -- leader id
  due            date,
  repeat_months  int,                            -- null = one time
  last_date      date,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- Booked interviews (and calendar events you've linked or dismissed)
create table if not exists appointments (
  id            uuid primary key default gen_random_uuid(),
  child_id      uuid references children(id) on delete set null,
  track_id      uuid references iv_tracks(id) on delete set null,
  interviewer   text,
  type          text not null default 'Youth',
  starts_at     timestamptz not null,
  minutes       int not null default 15,
  place         text not null default '',
  calendar_id   text not null default '',
  event_id      text not null default '',
  event_title   text not null default '',
  status        text not null default 'scheduled' check (status in ('scheduled','done','missed','cancelled','ignored')),
  texted_at     timestamptz,
  confirmed_at  timestamptz,
  reminded_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists appointments_starts_idx on appointments(starts_at);

alter table iv_windows   enable row level security;
alter table iv_days_off  enable row level security;
alter table iv_tracks    enable row level security;
alter table appointments enable row level security;

-- Starting availability (change it in the app under Settings → Interviewers and hours)
insert into iv_windows (interviewer_id, day, start_time, end_time, slot_minutes, place)
select i.id, w.day, w.start_time, w.end_time, w.slot, i.place
from interviewers i
join (values
  ('iv-bishop', 'Sun', '11:00', '13:00', 15),
  ('iv-bishop', 'Wed', '19:00', '21:00', 15),
  ('iv-c1',     'Sun', '09:00', '10:00', 15),
  ('iv-c2',     'Sun', '12:00', '13:00', 15)
) as w(iv, day, start_time, end_time, slot) on w.iv = i.id
where not exists (select 1 from iv_windows);

insert into settings (key, value) values
  ('remReminders2Day', 'Tue'), ('remReminders2Time', '18:00')
on conflict (key) do nothing;
