-- =============================================================
-- Rapporti d'intervento: il viaggio di ritorno si compila dopo la
-- firma (il tecnico lascia il cliente dopo aver fatto firmare).
-- Il rapporto firmato resta bloccato: questa funzione cambia solo il
-- viaggio di ritorno (giorni[i].vr) dell'ultima giornata, e solo
-- finché il rapporto non è fatturato.
-- Vale per i rapporti firmati con la nuova regola (firma.v >= 2), che
-- tengono il ritorno dell'ultima giornata fuori dall'impronta SHA-256.
-- Stesse regole di accesso della modifica (0041): chi «modifica» il
-- modulo; con «solo i propri», l'autore o un tecnico del rapporto.
-- =============================================================

create or replace function public.ritorno_rapporto(p_id text, p_giorno int, p_vr jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r rapporti%rowtype; ultimo int;
begin
  if not public.puo('rapporti-intervento', 'modifica') then
    raise exception 'Non hai il permesso di modificare i rapporti d''intervento';
  end if;
  select * into r from rapporti where id = p_id for update;
  if not found then raise exception 'Rapporto non trovato'; end if;
  if not public.puo('rapporti-intervento', 'gestisce')
     and public.solo_propri('rapporti-intervento', 'modifica')
     and r.creato_da is distinct from auth.uid()
     and not public.tecnico_del_rapporto(r.dati ->> 'tecnici') then
    raise exception 'Non puoi modificare questo rapporto';
  end if;
  if r.firma_ts is null then raise exception 'Il rapporto non è firmato: salvalo normalmente'; end if;
  if coalesce((r.dati #>> '{firma,v}')::int, 1) < 2 then
    raise exception 'Rapporto firmato prima di questa funzione: va riaperto per aggiungere il ritorno';
  end if;
  if exists (select 1 from fatture_rapporti where rapporto_id = p_id) then
    raise exception 'Il rapporto è già fatturato';
  end if;
  if jsonb_typeof(p_vr) is distinct from 'object' then raise exception 'Viaggio di ritorno non valido'; end if;
  -- ultima giornata = data più recente (a pari data, l'ultima dell'elenco), come nel modulo
  select g.i - 1 into ultimo
  from jsonb_array_elements(coalesce(r.dati -> 'giorni', '[]')) with ordinality g(x, i)
  order by coalesce(g.x ->> 'd', '') desc, g.i desc limit 1;
  if ultimo is null or p_giorno is distinct from ultimo then
    raise exception 'Dopo la firma si compila solo il viaggio di ritorno dell''ultima giornata';
  end if;
  update rapporti set dati = jsonb_set(dati, array['giorni', p_giorno::text, 'vr'], p_vr) where id = p_id;
end;
$$;
revoke all on function public.ritorno_rapporto(text, int, jsonb) from public;
grant execute on function public.ritorno_rapporto(text, int, jsonb) to authenticated;
