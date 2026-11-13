-- =============================================================
-- Gestionale Kimatic — Non conformità: numero proposto ma modificabile
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0022_rapporti_numerazione.sql
-- =============================================================
-- Il gestionale propone il prossimo numero (NC-AAAA-NNN); chi compila può cambiarlo.
-- Il numero resta univoco: se è già usato il salvataggio viene rifiutato.
-- Dopo il salvataggio il numero lo cambia solo chi Gestisce il modulo.
-- Primo numero per anno: impostazione 'non-conformita/partenza' (nel 2026 si parte da 104).

insert into public.impostazioni (id, modulo_id, dati)
values ('non-conformita/partenza', 'non-conformita', '{"2026": 104}')
on conflict (id) do update set dati = public.impostazioni.dati || excluded.dati;

-- Prossimo numero libero dell'anno (solo proposta: si assegna al salvataggio)
create or replace function public.prossimo_numero_nc(p_anno int default null)
returns text language sql stable security definer set search_path = public as $$
  select 'NC-' || a || '-' || lpad(greatest(
           coalesce((select max(nullif(regexp_replace(split_part(numero, '-', 3), '\D', '', 'g'), '')::int) from nc where anno = a), 0) + 1,
           coalesce((select (dati ->> a::text)::int from impostazioni where id = 'non-conformita/partenza'), 1))::text, 3, '0')
  from (select coalesce(p_anno, extract(year from now())::int) as a) x;
$$;
revoke all on function public.prossimo_numero_nc(int) from public;
grant execute on function public.prossimo_numero_nc(int) to authenticated;

create or replace function public.prepara_nc()
returns trigger language plpgsql security definer set search_path = public as $$
declare scelto text := upper(trim(coalesce(new.numero, '')));
begin
  new.aggiornato_il := now();
  if tg_op = 'INSERT' then
    new.creato_il := now();
    if auth.uid() is not null then new.creato_da := auth.uid(); end if;
    if scelto ~ '^NC-\d{4}-\d{1,5}$' then
      new.anno := split_part(scelto, '-', 2)::int;
      new.numero := 'NC-' || new.anno || '-' || lpad(split_part(scelto, '-', 3)::int::text, 3, '0');
    elsif scelto = '' then
      new.anno := extract(year from now())::int;
      perform pg_advisory_xact_lock(hashtext('nc-numero'), new.anno);
      new.numero := public.prossimo_numero_nc(new.anno);
    else
      raise exception 'Numero non valido: usa il formato NC-AAAA-NNN (es. NC-2026-104)';
    end if;
    if exists (select 1 from nc where numero = new.numero) then
      raise exception 'Il numero % è già usato da un''altra non conformità', new.numero;
    end if;
  else
    new.id := old.id; new.creato_da := old.creato_da; new.creato_il := old.creato_il;
    if scelto is distinct from upper(coalesce(old.numero, '')) and auth.uid() is not null and public.puo('non-conformita', 'gestisce') then
      if scelto !~ '^NC-\d{4}-\d{1,5}$' then
        raise exception 'Numero non valido: usa il formato NC-AAAA-NNN (es. NC-2026-104)';
      end if;
      new.anno := split_part(scelto, '-', 2)::int;
      new.numero := 'NC-' || new.anno || '-' || lpad(split_part(scelto, '-', 3)::int::text, 3, '0');
      if exists (select 1 from nc where numero = new.numero and id <> old.id) then
        raise exception 'Il numero % è già usato da un''altra non conformità', new.numero;
      end if;
    else
      new.numero := old.numero; new.anno := old.anno;
    end if;
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

select public.prossimo_numero_nc() as prossima_non_conformita;
