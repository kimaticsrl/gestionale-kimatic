-- =============================================================
-- Mancanti delle commesse in procinto di montaggio.
-- I materiali da prelevare arrivano da SAM (vista EXT_KIMATIC_MATERIALI_DA_PRELEVARE)
-- con il programma di invio automatico dal PC dell'ufficio, oppure caricati
-- a mano (estrazione Excel dei mancanti). Ogni riga = un codice mancante di
-- un OP di una macchina; gli ordini di acquisto aperti sul codice stanno in «ordini».
-- Note, responsabile, data prevista e priorità si scrivono nel
-- gestionale e restano tra un caricamento e l'altro. Le righe che non
-- compaiono più nell'estrazione (per le commesse presenti nel file)
-- risultano prelevate.
-- =============================================================

insert into public.moduli (id, reparto_id, nome, descrizione, link_attuale, migrato, ordine)
values ('mancanti-montaggi', 'pro', 'Mancanti montaggi',
        'Codici ancora da prelevare delle commesse in procinto di montaggio, per commessa, fornitore e reparto.', null, true, 35)
on conflict (id) do nothing;

insert into public.permessi (ruolo_id, modulo_id, livello)
select r.id, 'mancanti-montaggi',
  case when r.id = 'direzione' then 'gestisce'
       when r.id in ('acquisti', 'pianificatore') then 'modifica'
       when r.id in ('operativo', 'ufficio-tecnico', 'magazzino-qualita') then 'legge'
       else 'nessuno' end::public.livello
from public.ruoli r
on conflict (ruolo_id, modulo_id) do nothing;

create table if not exists public.mancanti (
  id          bigint generated always as identity primary key,
  chiave      text not null unique,               -- commessa|matricola|op|codice
  commessa    text not null,
  matricola   text not null default '',
  macchina    text not null default '',
  op          text not null default '',
  op_descr    text not null default '',
  codice      text not null,
  descr       text not null default '',
  qta         numeric,
  giac_mp     numeric,                            -- giacenza MP+MV
  giac_mg     numeric,
  fornitore   text not null default '',
  cella       text not null default '',
  cdep        text not null default '',
  ultima_lav  text not null default '',
  op_num      text not null default '',             -- numero OP (es. 5806/2026)
  giac_grezzi numeric,
  ordini      jsonb not null default '[]',          -- [{num, fornitore, consegna, qta, tipo}]
  consegna    date,                                 -- consegna più vicina degli ordini aperti
  aperto      boolean not null default true,
  primo_il    timestamptz not null default now(),  -- prima volta nell'estrazione
  visto_il    timestamptz not null default now(),  -- ultima estrazione in cui c'era
  chiuso_il   timestamptz,                         -- sparito dall'estrazione = prelevato
  -- gestione (scritta nel gestionale)
  nota        text not null default '',
  responsabile uuid references public.profili(id) on delete set null,
  prevista    date,
  priorita    text not null default '' check (priorita in ('', 'alta', 'bassa')),
  aggiornato_il timestamptz,
  aggiornato_da uuid
);
create index if not exists mancanti_commessa on public.mancanti (commessa) where aperto;

create table if not exists public.mancanti_commesse (
  commessa  text primary key,
  cliente   text not null default '',
  montaggio date,                                   -- inizio montaggio previsto
  note      text not null default '',
  nascosta  boolean not null default false          -- tolta dal quadro (es. commessa spedita)
);

create table if not exists public.mancanti_import (
  id        bigint generated always as identity primary key,
  il        timestamptz not null default now(),
  origine   text not null default '',              -- «automatico» o nome dell'utente
  file      text not null default '',
  commesse  text[] not null default '{}',
  righe     int not null default 0,
  nuovi     int not null default 0,
  chiusi    int not null default 0,
  riaperti  int not null default 0
);

-- solo i campi di gestione si modificano dal gestionale; quelli di SAM li scrive l'import
create or replace function public.prepara_mancante()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('mancanti.import', true) = 'si' then return new; end if;
  new.id := old.id; new.chiave := old.chiave; new.commessa := old.commessa; new.matricola := old.matricola;
  new.macchina := old.macchina; new.op := old.op; new.op_descr := old.op_descr; new.codice := old.codice; new.descr := old.descr;
  new.qta := old.qta; new.giac_mp := old.giac_mp; new.giac_mg := old.giac_mg; new.fornitore := old.fornitore;
  new.cella := old.cella; new.cdep := old.cdep; new.ultima_lav := old.ultima_lav; new.aperto := old.aperto;
  new.op_num := old.op_num; new.giac_grezzi := old.giac_grezzi; new.ordini := old.ordini; new.consegna := old.consegna;
  new.primo_il := old.primo_il; new.visto_il := old.visto_il; new.chiuso_il := old.chiuso_il;
  new.aggiornato_il := now(); new.aggiornato_da := auth.uid();
  return new;
end;
$$;
drop trigger if exists prepara on public.mancanti;
create trigger prepara before update on public.mancanti
  for each row execute function public.prepara_mancante();

alter table public.mancanti enable row level security;
alter table public.mancanti_commesse enable row level security;
alter table public.mancanti_import enable row level security;
drop policy if exists lettura on public.mancanti;
drop policy if exists modifica on public.mancanti;
create policy lettura on public.mancanti for select to authenticated using (public.puo('mancanti-montaggi', 'legge'));
create policy modifica on public.mancanti for update to authenticated
  using (public.puo('mancanti-montaggi', 'modifica')) with check (public.puo('mancanti-montaggi', 'modifica'));
drop policy if exists lettura on public.mancanti_commesse;
drop policy if exists scrittura on public.mancanti_commesse;
create policy lettura on public.mancanti_commesse for select to authenticated using (public.puo('mancanti-montaggi', 'legge'));
create policy scrittura on public.mancanti_commesse for all to authenticated
  using (public.puo('mancanti-montaggi', 'modifica')) with check (public.puo('mancanti-montaggi', 'modifica'));
drop policy if exists lettura on public.mancanti_import;
create policy lettura on public.mancanti_import for select to authenticated using (public.puo('mancanti-montaggi', 'legge'));

drop trigger if exists storico on public.mancanti_commesse;
create trigger storico after insert or update or delete on public.mancanti_commesse
  for each row execute function public.registra_sessione();

-- Import di un'estrazione: p_righe = [{commessa, matricola, macchina, op, op_descr, codice, descr, qta, giac_mp, giac_mg, fornitore, cella, cdep, ultima_lav}]
-- Lo chiama il gestionale (chiave di servizio) per l'invio automatico, o un utente che può modificare.
create or replace function public.importa_mancanti(p_righe jsonb, p_origine text default '', p_file text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  comm text[]; n_nuovi int; n_chiusi int; n_riaperti int; n_righe int; adesso timestamptz := now();
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

  select count(*) into n_nuovi from _mi i where not exists (select 1 from mancanti m where m.chiave = i.chiave);
  select count(*) into n_riaperti from _mi i join mancanti m on m.chiave = i.chiave and not m.aperto;

  insert into mancanti (chiave, commessa, matricola, macchina, op, op_descr, codice, descr, qta, giac_mp, giac_mg, fornitore, cella, cdep, ultima_lav, op_num, giac_grezzi, ordini, consegna, aperto, primo_il, visto_il)
  select chiave, commessa, matricola, macchina, op, op_descr, codice, descr, qta, giac_mp, giac_mg, fornitore, cella, cdep, ultima_lav, op_num, giac_grezzi, ordini, consegna, true, adesso, adesso from _mi
  on conflict (chiave) do update set
    op_num = excluded.op_num, giac_grezzi = excluded.giac_grezzi, ordini = excluded.ordini, consegna = excluded.consegna,
    macchina = excluded.macchina, op_descr = excluded.op_descr, descr = excluded.descr, qta = excluded.qta,
    giac_mp = excluded.giac_mp, giac_mg = excluded.giac_mg, fornitore = excluded.fornitore, cella = excluded.cella,
    cdep = excluded.cdep, ultima_lav = excluded.ultima_lav, aperto = true, visto_il = adesso, chiuso_il = null;

  -- delle commesse presenti nel file, quello che non c'è più è stato prelevato
  update mancanti m set aperto = false, chiuso_il = adesso
  where m.aperto and m.commessa = any(comm) and not exists (select 1 from _mi i where i.chiave = m.chiave);
  get diagnostics n_chiusi = row_count;

  insert into mancanti_commesse (commessa) select unnest(comm) on conflict do nothing;
  insert into mancanti_import (origine, file, commesse, righe, nuovi, chiusi, riaperti)
  values (coalesce(nullif(p_origine, ''), (select nome from profili where id = auth.uid()), ''), coalesce(p_file, ''), comm, n_righe, n_nuovi, n_chiusi, n_riaperti);
  perform set_config('mancanti.import', '', true);
  return jsonb_build_object('commesse', comm, 'righe', n_righe, 'nuovi', n_nuovi, 'chiusi', n_chiusi, 'riaperti', n_riaperti);
end;
$$;
revoke all on function public.importa_mancanti(jsonb, text, text) from public, anon;
grant execute on function public.importa_mancanti(jsonb, text, text) to authenticated, service_role;

select id, nome, reparto_id from public.moduli where id = 'mancanti-montaggi';
