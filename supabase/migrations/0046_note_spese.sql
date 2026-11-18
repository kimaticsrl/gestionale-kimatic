-- =============================================================
-- Note spese dei trasfertisti (al posto di N2F).
-- Ogni nota spese è legata a un rapporto d'intervento (la trasferta).
-- Il trasfertista fotografa gli scontrini e compila le spese (anche in
-- valuta), poi chiude la nota: parte la notifica e l'Amministrazione la
-- verifica o la rimanda indietro. In euro si converte al cambio BCE del
-- giorno della firma del rapporto (tabella «cambi»).
-- Carta aziendale di default: le ultime cifre stanno nell'Anagrafica
-- dipendenti (campo «carta») e vengono copiate nella nota.
-- =============================================================

insert into public.moduli (id, reparto_id, nome, descrizione, link_attuale, migrato, ordine)
values ('note-spese', 'ser', 'Note spese',
        'Spese di trasferta con foto degli scontrini, legate al rapporto d''intervento.', null, true, 51)
on conflict (id) do nothing;

-- Amministrazione e Direzione gestiscono (vedono tutte, verificano); i trasfertisti compilano le proprie
insert into public.permessi (ruolo_id, modulo_id, livello)
select r.id, 'note-spese',
  case when r.id in ('amministrazione', 'direzione') then 'gestisce'
       when r.id in ('tecnico-service', 'operativo') then 'modifica'
       else 'nessuno' end::public.livello
from public.ruoli r
on conflict (ruolo_id, modulo_id) do nothing;

insert into public.regole_propri (modulo_id, ruolo_id, lettura, modifica)
select 'note-spese', r.id, true, true from public.ruoli r
where r.id not in ('amministrazione', 'direzione')
on conflict do nothing;

-- ---------- cambi BCE (euro → valuta), salvati dal gestionale ----------
create table if not exists public.cambi (
  data   date not null,          -- giorno richiesto
  valuta text not null,
  tasso  numeric not null,       -- 1 € = tasso valuta
  data_bce date,                 -- giorno del fixing BCE usato (festivi: giorno lavorativo prima)
  primary key (data, valuta)
);
alter table public.cambi enable row level security;
drop policy if exists lettura on public.cambi;
create policy lettura on public.cambi for select to authenticated using (true);

-- ---------- ultime cifre della carta aziendale dell'utente collegato ----------
create or replace function public.mia_carta()
returns text language sql stable security definer set search_path = public as $$
  select nullif(trim(d.dati ->> 'carta'), '')
  from dipendenti d, profili p
  where p.id = auth.uid() and public.nome_normalizzato(p.nome) <> ''
    and public.nome_normalizzato(d.dati ->> 'nome') = public.nome_normalizzato(p.nome)
  order by d.attivo desc nulls last
  limit 1;
$$;
grant execute on function public.mia_carta() to authenticated;

-- ---------- note spese ----------
create table if not exists public.note_spese (
  id            uuid primary key default gen_random_uuid(),
  numero        text unique,
  anno          int,
  rapporto_id   text not null references public.rapporti(id) on delete restrict,
  stato         text not null default 'bozza' check (stato in ('bozza', 'chiusa', 'verificata')),
  dati          jsonb not null default '{}',
  creato_da     uuid references public.profili(id) default auth.uid(),
  creato_il     timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);
create index if not exists note_spese_rapporto on public.note_spese (rapporto_id);

create or replace function public.prepara_nota_spese()
returns trigger language plpgsql security definer set search_path = public as $$
declare n int; gest boolean := auth.uid() is null or public.puo('note-spese', 'gestisce');
begin
  new.aggiornato_il := now();
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.creato_da := auth.uid(); end if;
    new.anno := extract(year from now())::int;
    perform pg_advisory_xact_lock(hashtext('ns-numero'), new.anno);
    select coalesce(max(split_part(numero, '-', 3)::int), 0) + 1 into n from note_spese where anno = new.anno;
    new.numero := 'NS-' || new.anno || '-' || lpad(n::text, 3, '0');
    new.stato := 'bozza';
    new.dati := new.dati
      || jsonb_build_object('carta', coalesce(public.mia_carta(), ''))
      || jsonb_build_object('autore', coalesce((select nome from profili where id = new.creato_da), ''));
    return new;
  end if;
  new.id := old.id; new.numero := old.numero; new.anno := old.anno;
  new.creato_da := old.creato_da; new.creato_il := old.creato_il;
  if not gest then
    if old.stato <> 'bozza' then
      raise exception 'La nota spese è già chiusa: per correggerla chiedi all''Amministrazione di rimandarla indietro';
    end if;
    if new.stato not in ('bozza', 'chiusa') then
      raise exception 'Solo l''Amministrazione può verificare la nota spese';
    end if;
    -- la parte di verifica resta com'era
    new.dati := (new.dati - 'verificata_da' - 'verificata_il' - 'rimandata')
      || jsonb_strip_nulls(jsonb_build_object('rimandata', old.dati -> 'rimandata'));
  end if;
  if new.stato = 'chiusa' and old.stato = 'bozza' then
    new.dati := new.dati || jsonb_build_object('chiusa_il', now(), 'chiusa_da', coalesce((select nome from profili where id = auth.uid()), ''));
  end if;
  if new.stato = 'verificata' and old.stato <> 'verificata' then
    new.dati := new.dati || jsonb_build_object('verificata_il', now(), 'verificata_da', coalesce((select nome from profili where id = auth.uid()), ''));
  end if;
  if new.stato <> 'verificata' then new.dati := new.dati - 'verificata_il' - 'verificata_da'; end if;
  return new;
end;
$$;
drop trigger if exists prepara on public.note_spese;
create trigger prepara before insert or update on public.note_spese
  for each row execute function public.prepara_nota_spese();

alter table public.note_spese enable row level security;
drop policy if exists lettura on public.note_spese;
drop policy if exists inserimento on public.note_spese;
drop policy if exists modifica on public.note_spese;
drop policy if exists cancellazione on public.note_spese;
create policy lettura on public.note_spese for select to authenticated using (
  public.puo('note-spese', 'legge')
  and (not public.solo_propri('note-spese', 'lettura') or creato_da = auth.uid())
);
create policy inserimento on public.note_spese for insert to authenticated with check (public.puo('note-spese', 'modifica'));
create policy modifica on public.note_spese for update to authenticated using (
  public.puo('note-spese', 'gestisce')
  or (public.puo('note-spese', 'modifica') and stato = 'bozza'
      and (not public.solo_propri('note-spese', 'modifica') or creato_da = auth.uid()))
) with check (public.puo('note-spese', 'modifica'));
create policy cancellazione on public.note_spese for delete to authenticated using (
  public.puo('note-spese', 'gestisce')
  or (public.puo('note-spese', 'modifica') and stato = 'bozza' and creato_da = auth.uid())
);

drop trigger if exists storico on public.note_spese;
create trigger storico after insert or update or delete on public.note_spese
  for each row execute function public.registra_sessione();

-- Rapporti a cui si può legare una nota: i propri o quelli in cui si è tecnici
-- (chi gestisce le note spese li vede tutti). Funziona anche per chi non ha
-- accesso al modulo Rapporti d'intervento.
create or replace function public.rapporti_per_note()
returns table (id text, numero text, cliente text, dal text, al text, firma_ts timestamptz, tecnici text)
language sql stable security definer set search_path = public as $$
  select r.id, r.numero, r.dati #>> '{cli,nome}',
         (select min(g ->> 'd') from jsonb_array_elements(coalesce(r.dati -> 'giorni', '[]')) g),
         (select max(g ->> 'd') from jsonb_array_elements(coalesce(r.dati -> 'giorni', '[]')) g),
         r.firma_ts, r.dati ->> 'tecnici'
  from rapporti r
  where public.puo('note-spese', 'legge')
    and (public.puo('note-spese', 'gestisce') or r.creato_da = auth.uid()
         or public.tecnico_del_rapporto(r.dati ->> 'tecnici'))
  order by r.creato_il desc;
$$;
grant execute on function public.rapporti_per_note() to authenticated;

-- ---------- foto degli scontrini: archivio privato «note-spese» (cartella = id della nota) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('note-spese', 'note-spese', false, 20971520)
on conflict (id) do nothing;

create or replace function public.nota_spese_mia(p_path text, p_scrittura boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from note_spese n
    where n.id::text = split_part(p_path, '/', 1)
      and (public.puo('note-spese', 'gestisce')
           or (public.puo('note-spese', (case when p_scrittura then 'modifica' else 'legge' end)::public.livello)
               and n.creato_da = auth.uid()
               and (not p_scrittura or n.stato = 'bozza')))
  );
$$;
grant execute on function public.nota_spese_mia(text, boolean) to authenticated;

drop policy if exists "ns lettura" on storage.objects;
drop policy if exists "ns scrittura" on storage.objects;
drop policy if exists "ns modifica" on storage.objects;
drop policy if exists "ns cancellazione" on storage.objects;
create policy "ns lettura" on storage.objects for select to authenticated
  using (bucket_id = 'note-spese' and public.nota_spese_mia(name, false));
create policy "ns scrittura" on storage.objects for insert to authenticated
  with check (bucket_id = 'note-spese' and public.nota_spese_mia(name, true));
create policy "ns modifica" on storage.objects for update to authenticated
  using (bucket_id = 'note-spese' and public.nota_spese_mia(name, true));
create policy "ns cancellazione" on storage.objects for delete to authenticated
  using (bucket_id = 'note-spese' and public.nota_spese_mia(name, true));

-- ---------- notifiche: nota chiusa (a chi è scelto in Notifiche) e rimandata (all'autore) ----------
insert into public.notifiche_regole (evento, nome, descrizione, ruoli, ordine, attivo) values
  ('nota-spese-chiusa', 'Nota spese chiusa', 'Quando un trasfertista chiude una nota spese e la manda in verifica.', '{amministrazione}', 5, true)
on conflict (evento) do nothing;

create or replace function public.notifica_nota_spese()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d jsonb := new.dati;
  rap record;
  tot text;
  pers text;
  n int;
  io text;
begin
  begin
    select coalesce(nullif(r.numero, ''), 'senza numero') numero, r.dati #>> '{cli,nome}' cliente into rap from rapporti r where r.id = new.rapporto_id;
    select (select count(*) from jsonb_array_elements(coalesce(d -> 'spese', '[]'))),
           string_agg(replace(to_char(s.t, 'FM999999990.00'), '.', ',') || ' ' || s.v, ' + ' order by s.v)
      into n, tot
      from (select coalesce(nullif(x ->> 'valuta', ''), 'EUR') v, sum(coalesce((x ->> 'importo')::numeric, 0)) t
            from jsonb_array_elements(coalesce(d -> 'spese', '[]')) x group by 1) s;
    select string_agg(replace(to_char(s.t, 'FM999999990.00'), '.', ',') || ' ' || s.v, ' + ' order by s.v) into pers
      from (select coalesce(nullif(x ->> 'valuta', ''), 'EUR') v, sum(coalesce((x ->> 'importo')::numeric, 0)) t
            from jsonb_array_elements(coalesce(d -> 'spese', '[]')) x
            where coalesce(x ->> 'metodo', 'aziendale') <> 'aziendale' group by 1) s;

    if new.stato = 'chiusa' and old.stato = 'bozza' then
      perform public.accoda_notifica('nota-spese-chiusa', 'nota-spese-chiusa:' || new.id || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'),
        'Nota spese ' || new.numero || ' chiusa – ' || coalesce(d ->> 'autore', '') || ' – ' || coalesce(rap.cliente, ''),
        concat_ws(E'\n',
          coalesce(d ->> 'autore', 'Un trasfertista') || ' ha chiuso la nota spese ' || new.numero || ' ed è pronta per la verifica.',
          '',
          'Trasferta: rapporto ' || coalesce(rap.numero, '—') || ' – ' || coalesce(rap.cliente, '—'),
          case when coalesce(d ->> 'titolo', '') <> '' then 'Descrizione: ' || (d ->> 'titolo') end,
          'Spese: ' || n,
          'Totale: ' || coalesce(tot, '0,00 EUR'),
          case when pers is not null then 'ATTENZIONE – pagate con carta personale o contanti (da rimborsare): ' || pers end),
        '/moduli/note-spese');
    elsif new.stato = 'bozza' and old.stato <> 'bozza' and coalesce(d ->> 'rimandata', '') <> '' then
      select lower(email) into io from profili where id = new.creato_da and attivo;
      if io is not null then
        insert into notifiche (chiave, evento, oggetto, testo, link, destinatari)
        values ('nota-spese-rimandata:' || new.id || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS'), 'nota-spese-rimandata',
          'Nota spese ' || new.numero || ' da correggere',
          concat_ws(E'\n',
            'L''Amministrazione ti ha rimandato la nota spese ' || new.numero || ' (rapporto ' || coalesce(rap.numero, '—') || ' – ' || coalesce(rap.cliente, '—') || ').',
            '',
            'Motivo: ' || (d ->> 'rimandata'),
            '',
            'Correggila e chiudila di nuovo.'),
          '/moduli/note-spese', array[io])
        on conflict (chiave) do nothing;
      end if;
    end if;
  exception when others then null;
  end;
  return null;
end;
$$;
drop trigger if exists notifica on public.note_spese;
create trigger notifica after update on public.note_spese
  for each row execute function public.notifica_nota_spese();

select id, nome, reparto_id from public.moduli where id = 'note-spese';
