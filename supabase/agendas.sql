-- Cienega Exec Secretary: agenda stage
-- Paste into Supabase → SQL Editor → New query, then click Run. Safe to run again.

create table if not exists agendas (
  id            uuid primary key default gen_random_uuid(),
  meeting       text not null check (meeting in ('B', 'W')),
  date          date not null,
  attendees     text[] not null default '{}',
  hymn          int,
  open_prayer   text,
  close_prayer  text,
  thought       text,
  thought_note  text not null default '',
  next_thought  text,
  next_note     text not null default '',
  doc_id        text,
  doc_url       text,
  doc_name      text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (meeting, date)
);
alter table agendas enable row level security;

-- Starting history: your Oct 25, 2026 agendas
insert into agendas (meeting, date, attendees, hymn, open_prayer, close_prayer, thought, next_thought, next_note) values
  ('B', '2026-10-25', array['bryner','butler','hughes','olsen','christensen'], 62, 'butler', 'olsen', 'christensen', 'butler', ''),
  ('W', '2026-10-25', array['bryner','butler','hughes','olsen','christensen','cowley','hooper','gamble','holyoak','huish'], 58, 'hooper', 'huish', 'holyoak', 'cowley',
   'General Conference Leadership Meeting – Oct. 2026: Video: Ministering is Discipleship')
on conflict (meeting, date) do nothing;

insert into settings (key, value) values
  ('bishopricFolder', 'https://drive.google.com/drive/folders/12s_uwzZukkzxxxNP6qzD71uS1zwPsNYF'),
  ('councilFolder', 'https://drive.google.com/drive/folders/1Bq2cfzh-0lSVnh-GoPnn3mnP5-7W6bqc'),
  ('tplAgendaSubject', '{meeting} Agenda – {date}'),
  ('tplAgendaEmail', $$Here's the agenda for {meeting} on {date}:
{link}

If there's anything you'd like to discuss, add it right in the agenda.

Thanks,
{me}$$)
on conflict (key) do nothing;
