-- Cienega Exec Secretary: LCR import + youth phones
-- Paste into Supabase → SQL Editor → New query, then click Run. Safe to run again.

alter table children   add column if not exists phone      text    not null default '';
alter table children   add column if not exists text_self  boolean not null default false;  -- text this youth instead of a parent
alter table children   add column if not exists flags      text    not null default '';     -- e.g. "Not Baptized"
alter table households add column if not exists import_key text    not null default '';     -- the LCR heading, to match on later imports
