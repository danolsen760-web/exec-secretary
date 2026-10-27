-- Cienega Exec Secretary: stage 1 database
-- Paste this whole file into Supabase → SQL Editor → New query, then click Run.
-- Safe to run again: it only adds what's missing.

create table if not exists leaders (
  id          text primary key,
  first       text not null,
  last        text not null,
  title       text not null default 'Bro.',
  calling     text not null default '',
  email       text not null default '',
  phone       text not null default '',
  bishopric   boolean not null default false,
  council     boolean not null default false,
  active      boolean not null default true,
  sort        int not null default 100,
  created_at  timestamptz not null default now()
);

create table if not exists interviewers (
  id             text primary key,
  leader_id      text references leaders(id),
  kind           text not null check (kind in ('bishop', 'counselor')),
  calendar_name  text not null default '',
  calendar_id    text not null default '',
  place          text not null default '',
  day            text not null default 'Sun',
  start_time     text not null default '09:00',
  end_time       text not null default '10:00',
  slot_minutes   int not null default 15
);

create table if not exists settings (
  key    text primary key,
  value  text not null default ''
);

create table if not exists households (
  id          uuid primary key default gen_random_uuid(),
  family      text not null,
  p1_title    text not null default 'Bro.',
  p1_first    text not null default '',
  p1_phone    text not null default '',
  p1_email    text not null default '',
  p2_title    text not null default 'Sis.',
  p2_first    text not null default '',
  p2_phone    text not null default '',
  p2_email    text not null default '',
  text_to     int not null default 1,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table if not exists children (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  first           text not null,
  birth_month     int not null check (birth_month between 1 and 12),
  birth_day       int not null check (birth_day between 1 and 31),
  birth_year      int not null,
  last_interview  date,
  last_with       text,
  override        text not null default 'auto',
  active          boolean not null default true
);
create index if not exists children_household_idx on children(household_id);

-- Lock every table: only the app's server (service role key) can read or write.
alter table leaders      enable row level security;
alter table interviewers enable row level security;
alter table settings     enable row level security;
alter table households   enable row level security;
alter table children     enable row level security;

-- Your bishopric and ward council, from the Oct 25 agendas
insert into leaders (id, first, last, title, calling, bishopric, council, sort) values
  ('bryner',      'Clark',    'Bryner',      'Bishop', 'Bishop',              true,  true, 1),
  ('butler',      'Jason',    'Butler',      'Bro.',   '1st Counselor',       true,  true, 2),
  ('hughes',      'Johnny',   'Hughes',      'Bro.',   '2nd Counselor',       true,  true, 3),
  ('olsen',       'Daniel',   'Olsen',       'Bro.',   'Executive Secretary', true,  true, 4),
  ('christensen', 'Mark',     'Christensen', 'Bro.',   'Clerk',               true,  true, 5),
  ('cowley',      'Nan',      'Cowley',      'Pres.',  'Relief Society',      false, true, 6),
  ('hooper',      'Morgan',   'Hooper',      'Pres.',  'Elders Quorum',       false, true, 7),
  ('gamble',      'Magdelyn', 'Gamble',      'Pres.',  'Young Women',         false, true, 8),
  ('holyoak',     'Amy',      'Holyoak',     'Pres.',  'Primary',             false, true, 9),
  ('huish',       'Donnie',   'Huish',       'Pres.',  'Sunday School',       false, true, 10)
on conflict (id) do nothing;

-- Placeholder hours: change them in the app under Settings → Interviewers and hours
insert into interviewers (id, leader_id, kind, calendar_name, place, day, start_time, end_time, slot_minutes) values
  ('iv-bishop', 'bryner', 'bishop',    'Bishop''s interviews', 'bishop''s office', 'Sun', '11:00', '13:00', 15),
  ('iv-c1',     'butler', 'counselor', 'Counselor interviews', 'clerk''s office',  'Sun', '09:00', '10:00', 15),
  ('iv-c2',     'hughes', 'counselor', 'Counselor interviews', 'clerk''s office',  'Sun', '12:00', '13:00', 15)
on conflict (id) do nothing;

insert into settings (key, value) values
  ('wardName', 'Cienega Ward'),
  ('me', 'Brother Olsen'),
  ('youngCounselor', 'butler'),
  ('youngMax', '13'),
  ('ageFrom', 'jan1'),
  ('splitConfirmed', 'FALSE'),
  ('hoursConfirmed', 'FALSE'),
  ('tplConfirmParent', $$Hi {parent}, this is {me}, the ward executive secretary. {interviewer} would like to meet with {youth} for a youth interview on {day} at {time} in the {place}. A parent is welcome to join or wait nearby. Does that time work for your family?$$),
  ('tplConfirmAdult', $$Hi {name}, this is {me}, the ward executive secretary. {interviewer} would like to meet with you for your {type} interview on {day} at {time} in the {place}. Does that time work for you?$$),
  ('tplReminderParent', $$Hi {parent}, a reminder that {youth} has a youth interview with {interviewer} tomorrow at {time} in the {place}. See you there!$$),
  ('tplReminderAdult', $$Hi {name}, a reminder that you have an interview with {interviewer} tomorrow at {time} in the {place}. See you there!$$),
  ('tplFollowParent', $$Hi {parent}, just checking whether {day} at {time} works for {youth}'s interview with {interviewer}. Happy to find another time if that's easier.$$),
  ('tplFollowAdult', $$Hi {name}, just checking whether {day} at {time} works for your interview with {interviewer}. Happy to find another time if that's easier.$$),
  ('tplReschedule', $$Hi {name}, {interviewer} needs to move the interview to {day} at {time} in the {place}. Does that still work?$$),
  ('remAgendasDay', 'Sat'),   ('remAgendasTime', '18:00'),
  ('remRemindersDay', 'Sat'), ('remRemindersTime', '18:00'),
  ('remFillDay', 'Tue'),      ('remFillTime', '19:00'),
  ('remConfirmDay', 'Sun'),   ('remConfirmTime', '15:00'),
  ('followUpDays', '3'),
  ('agendaFolder', ''),
  ('filePattern', '{yy}_{MMdd}_Cienega_Ward_{meeting}_Meeting'),
  ('councilSundays', '2,4'),
  ('callingsLink', ''),
  ('calendarLink', '')
on conflict (key) do nothing;
