-- =============================================================
-- Mancanti montaggi: celle e conto deposito in automatico.
-- Il PC manda, dopo la vista dei materiali da prelevare, anche la vista
-- KI_ANALISI_COMMESSE_MANCANTI (celle, ultima lavorazione chiusa, conto
-- deposito). Quando un caricamento non porta gli ordini (celle o
-- estrazione Excel) aggiorna solo le righe che ci sono già e non tocca
-- quantità, descrizione e giacenza: le decide la vista dei prelievi.
-- =============================================================

create or replace function public.importa_mancanti(p_righe jsonb, p_origine text default '', p_file text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  comm text[]; n_nuovi int; n_chiusi int; n_riaperti int; n_righe int; adesso timestamptz := now();
  con_celle boolean; con_ordini boolean;
begin
  if auth.uid() is not null and not public.puo('mancanti-montaggi', 'modifica') then
    raise exception 'Non hai il permesso di caricare i mancanti';
  end if;
  perform set_config('mancanti.import', 'si', true);

  create temp table if not exists _mi (
    chiave text primary key, commessa text, matricola text, macchina text, op text, op_descr text, codice text, descr text,
    qta numeric, giac_mp numeric, giac_mg numeric, fornitore text, cella text, cdep text, ultima_lav text,
    op_num text, giac_grezzi numeric, ordini jsonb, consegna date
  ) on commit drop;
  truncate _mi;
  insert into _mi (chiave, commessa, matricola, macchina, op, op_descr, codice, descr, qta, giac_mp, giac_mg, fornitore, cella, cdep, ultima_lav, op_num, giac_grezzi, ordini, consegna)
  select distinct on (k)
    k, c, m, coalesce(r ->> 'macchina', ''), o, coalesce(r ->> 'op_descr', ''), cod, coalesce(r ->> 'descr', ''),
    nullif(r ->> 'qta', '')::numeric, nullif(r ->> 'giac_mp', '')::numeric, nullif(r ->> 'giac_mg', '')::numeric,
    coalesce(r ->> 'fornitore', ''), coalesce(r ->> 'cella', ''), coalesce(r ->> 'cdep', ''), coalesce(r ->> 'ultima_lav', ''),
    coalesce(r ->> 'op_num', ''), nullif(r ->> 'giac_grezzi', '')::numeric, coalesce(r -> 'ordini', '[]'::jsonb),
    case when coalesce(r ->> 'consegna', '') ~ '^\d{4}-\d{2}-\d{2}' then left(r ->> 'consegna', 10)::date end
  from jsonb_array_elements(p_righe) r,
       lateral (select trim(coalesce(r ->> 'commessa', '')) c, trim(coalesce(r ->> 'matricola', '')) m,
                       trim(coalesce(r ->> 'op', '')) o, trim(coalesce(r ->> 'codice', '')) cod) x,
       lateral (select c || '|' || m || '|' || o || '|' || cod k) y
  where c <> '' and cod <> ''
  order by k;

  select array_agg(distinct commessa order by commessa), count(*) into comm, n_righe from _mi;
  if n_righe = 0 then raise exception 'Nel file non ho trovato righe di mancanti'; end if;

  -- ogni fonte porta solo alcune informazioni: quelle che mancano nel file restano quelle già salvate
  -- (la vista automatica di SAM non ha celle e conto deposito; l'estrazione Excel non ha gli ordini)
  select exists (select 1 from _mi where cella <> '' or cdep <> '' or ultima_lav <> ''),
         exists (select 1 from _mi where op_num <> '' or ordini <> '[]'::jsonb)
    into con_celle, con_ordini;

  -- senza ordini non si creano righe nuove: solo la vista dei prelievi dice cosa manca
  if not con_ordini then
    delete from _mi i where not exists (select 1 from mancanti m where m.chiave = i.chiave);
    select array_agg(distinct commessa order by commessa) into comm from _mi;
  end if;
  select count(*) into n_nuovi from _mi i where not exists (select 1 from mancanti m where m.chiave = i.chiave);
  select count(*) into n_riaperti from _mi i join mancanti m on m.chiave = i.chiave and not m.aperto;

  insert into mancanti (chiave, commessa, matricola, macchina, op, op_descr, codice, descr, qta, giac_mp, giac_mg, fornitore, cella, cdep, ultima_lav, op_num, giac_grezzi, ordini, consegna, aperto, primo_il, visto_il)
  select chiave, commessa, matricola, macchina, op, op_descr, codice, descr, qta, giac_mp, giac_mg, fornitore, cella, cdep, ultima_lav, op_num, giac_grezzi, ordini, consegna, true, adesso, adesso from _mi
  on conflict (chiave) do update set
    op_num      = case when con_ordini then excluded.op_num else mancanti.op_num end,
    giac_grezzi = case when con_ordini then excluded.giac_grezzi else mancanti.giac_grezzi end,
    ordini      = case when con_ordini then excluded.ordini else mancanti.ordini end,
    consegna    = case when con_ordini then excluded.consegna else mancanti.consegna end,
    fornitore   = case when con_ordini then excluded.fornitore else coalesce(nullif(excluded.fornitore, ''), mancanti.fornitore) end,
    cella       = case when con_celle then excluded.cella else mancanti.cella end,
    cdep        = case when con_celle then excluded.cdep else mancanti.cdep end,
    ultima_lav  = case when con_celle then excluded.ultima_lav else mancanti.ultima_lav end,
    giac_mg     = coalesce(excluded.giac_mg, mancanti.giac_mg),
    macchina = coalesce(nullif(excluded.macchina, ''), mancanti.macchina), op_descr = coalesce(nullif(excluded.op_descr, ''), mancanti.op_descr),
    descr   = case when con_ordini then excluded.descr else mancanti.descr end,
    qta     = case when con_ordini then excluded.qta else mancanti.qta end,
    giac_mp = case when con_ordini then excluded.giac_mp else mancanti.giac_mp end,
    aperto = case when con_ordini then true else mancanti.aperto end,
    visto_il = adesso,
    chiuso_il = case when con_ordini then null else mancanti.chiuso_il end;

  -- delle commesse presenti nel file, quello che non c'è più è stato prelevato
  -- (solo con la vista di SAM, che è sempre aggiornata: l'estrazione Excel caricata a mano può essere di qualche giorno prima)
  update mancanti m set aperto = false, chiuso_il = adesso
  where con_ordini and m.aperto and m.commessa = any(comm) and not exists (select 1 from _mi i where i.chiave = m.chiave);
  get diagnostics n_chiusi = row_count;

  insert into mancanti_commesse (commessa) select unnest(comm) on conflict do nothing;
  insert into mancanti_import (origine, file, commesse, righe, nuovi, chiusi, riaperti)
  values (coalesce(nullif(p_origine, ''), (select nome from profili where id = auth.uid()), ''), coalesce(p_file, ''), comm, n_righe, n_nuovi, n_chiusi, n_riaperti);
  perform set_config('mancanti.import', '', true);
  return jsonb_build_object('commesse', comm, 'righe', n_righe, 'nuovi', n_nuovi, 'chiusi', n_chiusi, 'riaperti', n_riaperti);
end;
$$;
select 'ok' as celle_automatiche;
