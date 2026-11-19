-- =============================================================
-- Piano produzione: organigramma dei responsabili e mail del planning.
--  · config/organigramma (pp_docs): r = {collaboratore: responsabile},
--    con gli id delle persone del Piano. Si modifica dalla scheda
--    «Organigramma» del Piano (amministratori del Piano).
--  · mia_persona_piano(): la persona del Piano dell'utente collegato,
--    dall'Anagrafica dipendenti (campo «persona del Piano»), cercata
--    per e-mail aziendale, e-mail o nome.
--  · tre notifiche del planning, spedite dal giro mattutino:
--    ai responsabili le attività di oggi dei collaboratori, a ogni
--    risorsa le sue attività in ritardo, il lunedì il piano della settimana.
-- =============================================================

-- Bianchi → Sarti; Giulio Roveri → Monti, Cavazza; Amadori → Minghetti, Ghelli, Pingaro, Halungescu; Bergamini → Gnudi
insert into public.pp_docs (coll, id, dati)
values ('config', 'organigramma', '{"r": {"p003": "p001", "p039": "p040", "p038": "p040", "p037": "p044", "p022": "p044", "p019": "p044", "p018": "p044", "p028": "p007"}}')
on conflict (coll, id) do nothing;

create or replace function public.mia_persona_piano()
returns text language sql stable security definer set search_path = public as $$
  select d.dati ->> 'pid'
  from dipendenti d join profili p on p.id = auth.uid()
  where coalesce(d.dati ->> 'pid', '') <> ''
    and (lower(coalesce(d.dati ->> 'emailaz', '')) = lower(p.email)
         or lower(coalesce(d.dati ->> 'email', '')) = lower(p.email)
         or (public.nome_normalizzato(d.dati ->> 'nome') <> '' and public.nome_normalizzato(d.dati ->> 'nome') = public.nome_normalizzato(p.nome)))
  order by d.attivo desc
  limit 1;
$$;
revoke all on function public.mia_persona_piano() from public;
grant execute on function public.mia_persona_piano() to authenticated;

insert into public.notifiche_regole (evento, nome, descrizione, ruoli, anticipi, ordine, attivo) values
  ('planning-responsabili', 'Planning: attività dei collaboratori',
   'Ogni mattina lavorativa, a ogni responsabile dell''organigramma del Piano: le attività di oggi dei suoi collaboratori (e chi è assente) e quelle in ritardo. I ruoli e le persone scelti qui ricevono una copia.', '{}', '{}', 10, true),
  ('planning-ritardi', 'Planning: attività in ritardo',
   'Ogni mattina lavorativa, a ogni persona del Piano che ha attività con la fine prevista passata e non completate. I ruoli e le persone scelti qui ricevono una copia.', '{}', '{}', 11, true),
  ('planning-settimana', 'Planning: piano della settimana',
   'Il lunedì mattina, a ogni persona del Piano: le sue attività della settimana, giorno per giorno (weekly plan). I ruoli e le persone scelti qui ricevono una copia.', '{}', '{}', 12, true)
on conflict (evento) do nothing;
