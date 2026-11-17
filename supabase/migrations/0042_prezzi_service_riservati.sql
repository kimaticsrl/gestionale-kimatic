-- =============================================================
-- Rapporti d'intervento: listini assistenza e importi addebitati
-- ai clienti leggibili solo da chi Gestisce il modulo (e dagli
-- amministratori). Prima li poteva leggere chiunque avesse accesso
-- al modulo, anche se la scheda «Da fatturare» non gli compariva.
-- La registrazione «Fatturato» (numero e data fattura, senza importi)
-- resta visibile a tutti quelli del modulo, così i tecnici vedono lo stato.
-- =============================================================

drop policy if exists lettura on public.listini_assistenza;
create policy lettura on public.listini_assistenza for select to authenticated
  using (public.puo('rapporti-intervento', 'gestisce'));

drop policy if exists lettura on public.addebiti_rapporti;
create policy lettura on public.addebiti_rapporti for select to authenticated
  using (public.puo('rapporti-intervento', 'gestisce'));
