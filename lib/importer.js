import { db } from './supabase';
import { fail } from './auth';
import { loadAll } from './data';

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}
const t = (v, n = 80) => String(v == null ? '' : v).trim().slice(0, n);
const firstWord = s => t(s).toLowerCase().split(/\s+/)[0] || '';

/**
 * Saves families from the LCR import.
 * New families are added. Families you already entered are filled in, never overwritten:
 * blank phones/emails get filled, birthdays are corrected to the exact date, missing children are added,
 * and last interview dates are left alone.
 */
export async function importFamilies(b) {
  const fams = Array.isArray(b.families) ? b.families.slice(0, 60) : [];
  if (!fams.length) throw fail('Nothing to import.');
  const s = db();
  const sum = { added: 0, updated: 0, kidsAdded: 0, kidsUpdated: 0, skipped: [] };

  for (const f of fams) {
    const parents = (f.parents || []).slice(0, 2).map(p => ({ title: t(p.title, 10) || 'Bro.', first: t(p.first, 60), phone: t(p.phone, 40), email: t(p.email, 120) }));
    const kids = (f.kids || []).filter(k => k.birth && k.birth.month && k.birth.day && k.birth.year);
    (f.kids || []).filter(k => !(k.birth && k.birth.year)).forEach(k => sum.skipped.push(`${k.first} ${f.family} (no birthday)`));
    const kidRow = k => ({
      first: t(k.first, 60), birth_month: Number(k.birth.month), birth_day: Number(k.birth.day), birth_year: Number(k.birth.year),
      phone: t(k.phone, 40), text_self: !!k.textSelf, flags: (k.flags || []).join(', ').slice(0, 80)
    });

    if (!f.existingId) {
      const row = { family: t(f.family, 60), import_key: t(f.key, 120), text_to: Number(f.textTo) === 2 ? 2 : 1, active: true, updated_at: new Date().toISOString() };
      parents.forEach((p, i) => Object.assign(row, { [`p${i + 1}_title`]: p.title, [`p${i + 1}_first`]: p.first, [`p${i + 1}_phone`]: p.phone, [`p${i + 1}_email`]: p.email }));
      if (!parents.length && !kids.length) continue;
      const h = await q(s.from('households').insert(row).select('id').single());
      if (kids.length) await q(s.from('children').insert(kids.map(k => ({ ...kidRow(k), household_id: h.id, text_self: !parents.length || !!k.textSelf }))).select());
      sum.added++; sum.kidsAdded += kids.length;
      continue;
    }

    // Already in the app: fill in what's missing
    const h = (await q(s.from('households').select('*').eq('id', f.existingId)))[0];
    if (!h) continue;
    const patch = { import_key: t(f.key, 120), updated_at: new Date().toISOString() };
    const slots = [1, 2];
    const unmatched = [];
    parents.forEach(p => {
      const n = slots.find(i => h[`p${i}_first`] && firstWord(h[`p${i}_first`]) === firstWord(p.first));
      if (!n) return unmatched.push(p);
      if (!h[`p${n}_phone`] && p.phone) patch[`p${n}_phone`] = p.phone;
      if (!h[`p${n}_email`] && p.email) patch[`p${n}_email`] = p.email;
    });
    unmatched.forEach(p => {
      const n = slots.find(i => !h[`p${i}_first`] && !patch[`p${i}_first`]);
      if (n) Object.assign(patch, { [`p${n}_title`]: p.title, [`p${n}_first`]: p.first, [`p${n}_phone`]: p.phone, [`p${n}_email`]: p.email });
    });
    await q(s.from('households').update(patch).eq('id', h.id).select());

    const existingKids = await q(s.from('children').select('*').eq('household_id', h.id));
    for (const k of kids) {
      const match = existingKids.find(c => firstWord(c.first) === firstWord(k.first));
      const r = kidRow(k);
      if (match) {
        await q(s.from('children').update({
          birth_month: r.birth_month, birth_day: r.birth_day, birth_year: r.birth_year,
          phone: match.phone || r.phone, flags: r.flags
        }).eq('id', match.id).select());
        sum.kidsUpdated++;
      } else {
        await q(s.from('children').insert({ ...r, household_id: h.id }).select());
        sum.kidsAdded++;
      }
    }
    sum.updated++;
  }
  return { data: await loadAll(), summary: sum };
}
