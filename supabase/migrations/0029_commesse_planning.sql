-- =============================================================
-- Gestionale Kimatic — pagina «Commesse e planning» per gli operativi
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0028_togli_moduli_doppi.sql
-- =============================================================
-- Mostra solo le schede «File commesse Kimatic» e «Planning giornaliero» del Piano
-- produzione, in sola lettura. I dati sono quelli del Piano (tabella pp_docs).

insert into public.moduli (id, reparto_id, nome, descrizione, link_attuale, migrato, ordine)
values ('commesse-planning', 'pro', 'Commesse e planning',
        'File commesse Kimatic e planning prelievi e montaggi, in sola lettura.', null, true, 31)
on conflict (id) do nothing;

-- Chi la vede: operativi, pianificatore e direzione (gli altri ruoli si aggiungono da Permessi)
insert into public.permessi (ruolo_id, modulo_id, livello)
select r.id, 'commesse-planning',
  case r.id when 'operativo' then 'legge' when 'pianificatore' then 'legge' when 'direzione' then 'legge' else 'nessuno' end::public.livello
from public.ruoli r
on conflict do nothing;

-- I dati del Piano li legge anche chi ha accesso solo a questa pagina
drop policy if exists lettura on public.pp_docs;
create policy lettura on public.pp_docs for select to authenticated
  using (public.puo('piano-produzione', 'legge') or public.puo('commesse-planning', 'legge'));

select id, nome from public.moduli where reparto_id = 'pro' order by ordine;
