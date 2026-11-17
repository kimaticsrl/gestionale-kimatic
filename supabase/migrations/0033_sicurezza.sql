-- =============================================================
-- Gestionale Kimatic — scheda Sicurezza con il modulo «Sicurezza e formazione»
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0032_scheda_personale.sql
-- =============================================================
-- Corsi, visite mediche, DPI, scadenze aziendali e infortuni.
-- Le persone NON stanno qui: arrivano dall'Anagrafica dipendenti, che resta l'unico posto dove si
-- inseriscono e si modificano. Chi vede la Sicurezza legge solo nome, mansione, reparto e date
-- di assunzione/uscita (non RAL, livello, codice fiscale o contatti).

insert into public.reparti (id, nome, sigla, ordine)
values ('sic', 'Sicurezza', 'SIC', 7)
on conflict (id) do nothing;

insert into public.moduli (id, reparto_id, nome, descrizione, link_attuale, migrato, ordine)
values ('sicurezza', 'sic', 'Sicurezza e formazione',
        'Corsi dei dipendenti, visite mediche, DPI, scadenze aziendali e infortuni.', null, true, 10)
on conflict (id) do nothing;

-- Direzione gestisce, tutti gli altri ruoli vedono. Si cambia dalla pagina Permessi.
insert into public.permessi (ruolo_id, modulo_id, livello)
select r.id, 'sicurezza', case r.id when 'direzione' then 'gestisce' else 'legge' end::public.livello
from public.ruoli r
on conflict (ruolo_id, modulo_id) do update set livello = excluded.livello;

-- Documenti della sicurezza: coll = 'persona' (rischio, visite, DPI…; id = id del dipendente),
-- 'corso', 'azienda' (scadenze aziendali), 'sanitari' (idoneità e prescrizioni), 'infortunio'.
create table public.sic_docs (
  coll          text not null,
  id            text not null,
  dati          jsonb not null default '{}',
  aggiornato_il timestamptz not null default now(),
  aggiornato_da uuid default auth.uid(),
  primary key (coll, id)
);
create trigger prepara before insert or update on public.sic_docs
  for each row execute function public.prepara_bm_doc();
create trigger storico after insert or update or delete on public.sic_docs
  for each row execute function public.registra_sessione();

-- Idoneità/prescrizioni e infortuni sono dati sanitari: li vede solo chi ha almeno Modifica.
alter table public.sic_docs enable row level security;
create policy lettura on public.sic_docs for select to authenticated using (
  case when coll in ('sanitari', 'infortunio') then public.puo('sicurezza', 'modifica')
       else public.puo('sicurezza', 'legge') end);
create policy scrittura on public.sic_docs for all to authenticated
  using (public.puo('sicurezza', 'modifica')) with check (public.puo('sicurezza', 'modifica'));

-- Elenco delle persone per la Sicurezza, letto dall'Anagrafica dipendenti (sola lettura, campi ridotti)
create or replace function public.sic_dipendenti()
returns table (id text, nome text, mansione text, reparto text, contratto text, attivo boolean, assunzione text, fine text)
language sql stable security definer set search_path = public as $$
  select d.id, d.dati->>'nome', d.dati->>'mansione', d.dati->>'cc', d.dati->>'contratto', d.attivo,
         d.dati->>'assunzione', d.dati->>'scadenza'
  from public.dipendenti d
  where public.puo('sicurezza', 'legge')
  order by d.dati->>'nome';
$$;
revoke all on function public.sic_dipendenti() from public, anon;
grant execute on function public.sic_dipendenti() to authenticated;

select id, nome, migrato from public.moduli where id = 'sicurezza';
