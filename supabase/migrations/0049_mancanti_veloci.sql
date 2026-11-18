-- =============================================================
-- Mancanti montaggi: lettura veloce con molte righe (≈10.000).
-- Il permesso si controlla una volta per richiesta e non riga per
-- riga: (select public.puo(...)) viene calcolato una sola volta.
-- =============================================================
drop policy if exists lettura on public.mancanti;
drop policy if exists modifica on public.mancanti;
create policy lettura on public.mancanti for select to authenticated using ((select public.puo('mancanti-montaggi', 'legge')));
create policy modifica on public.mancanti for update to authenticated
  using ((select public.puo('mancanti-montaggi', 'modifica'))) with check ((select public.puo('mancanti-montaggi', 'modifica')));
create index if not exists mancanti_aperto_id on public.mancanti (aperto, id);
create index if not exists mancanti_chiuso_il on public.mancanti (chiuso_il) where not aperto;
select count(*) as mancanti_aperti from public.mancanti where aperto;
