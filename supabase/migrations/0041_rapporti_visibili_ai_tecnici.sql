-- =============================================================
-- Rapporti d'intervento: con la regola «solo i propri» un tecnico
-- vede (e modifica, finché non è firmato) anche i rapporti in cui
-- il suo nome è scritto nel campo «Tecnici BMTEK», non solo quelli
-- che ha creato lui.
-- Il nome si confronta con il nome dell'utente nel gestionale:
-- maiuscole, accenti e ordine nome/cognome non contano.
-- =============================================================

-- «Niccolò  Cavazza» → «cavazza niccolo» (parole senza accenti, in ordine alfabetico)
create or replace function public.nome_normalizzato(p text)
returns text language sql immutable as $$
  select coalesce(string_agg(w, ' ' order by w), '')
  from regexp_split_to_table(
         lower(translate(coalesce(p, ''),
           'àáâäãåèéêëìíîïòóôöõùúûüçñÀÁÂÄÃÅÈÉÊËÌÍÎÏÒÓÔÖÕÙÚÛÜÇÑ''’.',
           'aaaaaaeeeeiiiiooooouuuucnaaaaaaeeeeiiiiooooouuuucn   ')),
         '\s+') w
  where w <> '';
$$;

-- Vero se l'utente collegato è tra i tecnici scritti nel rapporto
-- («Mario Rossi, Luca Bianchi», «Mario Rossi e Luca Bianchi», «… / …»)
create or replace function public.tecnico_del_rapporto(p_tecnici text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profili p
    where p.id = auth.uid() and p.attivo
      and public.nome_normalizzato(p.nome) <> ''
      and public.nome_normalizzato(p.nome) in (
        select public.nome_normalizzato(t)
        from regexp_split_to_table(coalesce(p_tecnici, ''), '\s*(?:,|;|/|\+|&|\me\M|\mand\M)\s*', 'i') t
      )
  );
$$;
grant execute on function public.tecnico_del_rapporto(text) to authenticated;

-- Nomi delle persone che possono compilare i rapporti: servono al modulo per
-- dire, mentre si scrive, chi vedrà il rapporto
create or replace function public.tecnici_rapporti()
returns table (nome text) language sql stable security definer set search_path = public as $$
  select distinct p.nome
  from profili p
  where public.puo('rapporti-intervento', 'legge')
    and p.attivo and coalesce(p.nome, '') <> ''
    and (p.is_admin or exists (
      select 1 from profilo_ruoli pr
      join permessi pe on pe.ruolo_id = pr.ruolo_id and pe.modulo_id = 'rapporti-intervento'
      where pr.profilo_id = p.id and pe.livello >= 'modifica'::livello))
  order by 1;
$$;
grant execute on function public.tecnici_rapporti() to authenticated;

drop policy if exists lettura on public.rapporti;
create policy lettura on public.rapporti for select to authenticated using (
  public.puo('rapporti-intervento', 'legge')
  and (not public.solo_propri('rapporti-intervento', 'lettura')
       or creato_da = auth.uid()
       or public.tecnico_del_rapporto(dati ->> 'tecnici'))
);

drop policy if exists modifica on public.rapporti;
create policy modifica on public.rapporti for update to authenticated using (
  public.puo('rapporti-intervento', 'gestisce')
  or (public.puo('rapporti-intervento', 'modifica') and firma_ts is null
      and (not public.solo_propri('rapporti-intervento', 'modifica')
           or creato_da = auth.uid()
           or public.tecnico_del_rapporto(dati ->> 'tecnici')))
) with check (
  public.puo('rapporti-intervento', 'modifica')
);
