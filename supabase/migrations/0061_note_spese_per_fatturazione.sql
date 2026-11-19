-- =============================================================
-- Note spese per chi fattura i rapporti d'intervento.
-- Chi ha il permesso «Fatturazione rapporti d'intervento» (il
-- Commerciale) vede, nella scheda «Da fatturare», le note spese
-- chiuse o verificate di ogni trasferta e ne scarica il PDF con le
-- foto degli scontrini. Solo lettura: non vede le bozze e non
-- modifica, verifica o cancella le note.
-- =============================================================

drop policy if exists lettura on public.note_spese;
create policy lettura on public.note_spese for select to authenticated using (
  (public.puo('note-spese', 'legge')
   and (not public.solo_propri('note-spese', 'lettura') or creato_da = auth.uid()))
  or (public.puo('fatturazione-rapporti', 'legge') and stato <> 'bozza')
);

create or replace function public.rapporti_per_note()
returns table (id text, numero text, cliente text, dal text, al text, firma_ts timestamptz, tecnici text)
language sql stable security definer set search_path = public as $$
  select r.id, r.numero, r.dati #>> '{cli,nome}',
         (select min(g ->> 'd') from jsonb_array_elements(coalesce(r.dati -> 'giorni', '[]')) g),
         (select max(g ->> 'd') from jsonb_array_elements(coalesce(r.dati -> 'giorni', '[]')) g),
         r.firma_ts, r.dati ->> 'tecnici'
  from rapporti r
  where (public.puo('note-spese', 'legge')
         and (public.puo('note-spese', 'gestisce') or r.creato_da = auth.uid()
              or public.tecnico_del_rapporto(r.dati ->> 'tecnici')))
     or public.puo('fatturazione-rapporti', 'legge')
  order by r.creato_il desc;
$$;

-- foto degli scontrini: in lettura anche a chi fattura, per le note non più in bozza
create or replace function public.nota_spese_mia(p_path text, p_scrittura boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from note_spese n
    where n.id::text = split_part(p_path, '/', 1)
      and (public.puo('note-spese', 'gestisce')
           or (public.puo('note-spese', (case when p_scrittura then 'modifica' else 'legge' end)::public.livello)
               and n.creato_da = auth.uid()
               and (not p_scrittura or n.stato = 'bozza'))
           or (not p_scrittura and n.stato <> 'bozza' and public.puo('fatturazione-rapporti', 'legge')))
  );
$$;
