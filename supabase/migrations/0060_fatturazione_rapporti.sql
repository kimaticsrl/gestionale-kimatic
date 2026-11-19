-- =============================================================
-- Fatturazione dei rapporti d'intervento come permesso a sé.
-- I rapporti li fattura il Commerciale: con questo permesso vede
-- la scheda «Da fatturare» senza dover gestire tutto il modulo
-- (riaprire firme, modificare o cancellare i rapporti).
--   Legge     → vede la coda, gli importi e i listini
--   Modifica  → compila gli importi e segna fatturato
--   Gestisce  → anche i prezzi dei listini assistenza
-- Chi gestisce il modulo Rapporti d'intervento continua a fare tutto.
-- Il modulo nel menu porta alla scheda «Da fatturare»; per vedere i
-- rapporti serve anche l'accesso a Rapporti d'intervento (il
-- Commerciale ha già «Modifica»).
-- =============================================================

insert into public.moduli (id, reparto_id, nome, descrizione, link_attuale, migrato, ordine)
values ('fatturazione-rapporti', 'amm', 'Fatturazione rapporti d''intervento',
        'Rapporti firmati da fatturare: importi da listino, riepilogo addebiti e registrazione della fattura.', null, true, 44)
on conflict (id) do nothing;

insert into public.permessi (ruolo_id, modulo_id, livello)
select r.id, 'fatturazione-rapporti',
  case when r.id = 'amministrazione' then 'gestisce'
       when r.id = 'commerciale' then 'modifica'
       else 'nessuno' end::public.livello
from public.ruoli r
on conflict (ruolo_id, modulo_id) do nothing;

-- listini assistenza
drop policy if exists lettura on public.listini_assistenza;
create policy lettura on public.listini_assistenza for select to authenticated
  using (public.puo('rapporti-intervento', 'gestisce') or public.puo('fatturazione-rapporti', 'legge'));
drop policy if exists scrittura on public.listini_assistenza;
create policy scrittura on public.listini_assistenza for all to authenticated
  using (public.puo('rapporti-intervento', 'gestisce') or public.puo('fatturazione-rapporti', 'gestisce'))
  with check (public.puo('rapporti-intervento', 'gestisce') or public.puo('fatturazione-rapporti', 'gestisce'));

-- importi da addebitare per rapporto
drop policy if exists lettura on public.addebiti_rapporti;
create policy lettura on public.addebiti_rapporti for select to authenticated
  using (public.puo('rapporti-intervento', 'gestisce') or public.puo('fatturazione-rapporti', 'legge'));
drop policy if exists scrittura on public.addebiti_rapporti;
create policy scrittura on public.addebiti_rapporti for all to authenticated
  using (public.puo('rapporti-intervento', 'gestisce') or public.puo('fatturazione-rapporti', 'modifica'))
  with check (public.puo('rapporti-intervento', 'gestisce') or public.puo('fatturazione-rapporti', 'modifica'));

-- registrazione «Fatturato» (la lettura resta a tutti quelli del modulo Rapporti)
drop policy if exists scrittura on public.fatture_rapporti;
create policy scrittura on public.fatture_rapporti for all to authenticated
  using (public.puo('rapporti-intervento', 'gestisce') or public.puo('fatturazione-rapporti', 'modifica'))
  with check (public.puo('rapporti-intervento', 'gestisce') or public.puo('fatturazione-rapporti', 'modifica'));
