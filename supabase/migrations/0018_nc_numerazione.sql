-- =============================================================
-- Gestionale Kimatic — Non conformità: numerazione che parte da un numero scelto
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0016_articoli_fornitori.sql
-- =============================================================
-- Primo numero per anno (es. nel 2026 si parte da 104, perché fino a 103 sono su carta).
-- Per cambiarlo: aggiornare l'impostazione 'non-conformita/partenza', es. {"2026": 104, "2027": 1}.
insert into public.impostazioni (id, modulo_id, dati)
values ('non-conformita/partenza', 'non-conformita', '{"2026": 104}')
on conflict (id) do update set dati = public.impostazioni.dati || excluded.dati;

create or replace function public.prepara_nc()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int; primo int;
begin
  new.aggiornato_il := now();
  if tg_op = 'INSERT' then
    new.creato_il := now();
    if auth.uid() is not null then new.creato_da := auth.uid(); end if;
    new.anno := extract(year from now())::int;
    perform pg_advisory_xact_lock(hashtext('nc-numero'), new.anno);
    select coalesce((dati ->> new.anno::text)::int, 1) into primo from impostazioni where id = 'non-conformita/partenza';
    select greatest(coalesce(max(split_part(numero, '-', 3)::int), 0) + 1, coalesce(primo, 1)) into n from nc where anno = new.anno;
    new.numero := 'NC-' || new.anno || '-' || lpad(n::text, 3, '0');
  else
    new.id := old.id; new.numero := old.numero; new.anno := old.anno;
    new.creato_da := old.creato_da; new.creato_il := old.creato_il;
  end if;
  -- La parte di gestione e lo stato li cambia solo chi Gestisce
  if auth.uid() is not null and not public.puo('non-conformita', 'gestisce') then
    if tg_op = 'INSERT' then
      new.stato := 'aperta';
      new.dati := new.dati - 'gestione';
    else
      if new.stato is distinct from old.stato or (new.dati -> 'gestione') is distinct from (old.dati -> 'gestione') then
        raise exception 'Solo Magazzino e controllo qualità può gestire o chiudere la non conformità';
      end if;
      if old.stato <> 'aperta' then
        raise exception 'La non conformità è già in gestione: non si può più modificare la segnalazione';
      end if;
    end if;
  end if;
  return new;
end;
$$;

select 'Prossima non conformità: NC-' || extract(year from now())::int || '-' ||
       lpad(greatest(coalesce((select max(split_part(numero, '-', 3)::int) from public.nc where anno = extract(year from now())::int), 0) + 1,
                     coalesce((select (dati ->> extract(year from now())::int::text)::int from public.impostazioni where id = 'non-conformita/partenza'), 1))::text, 3, '0') as numerazione;
