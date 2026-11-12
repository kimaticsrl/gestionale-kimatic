-- =============================================================
-- Gestionale Kimatic — Rapporti d'intervento: numero progressivo univoco per anno
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0021_listino_assistenza.sql
-- =============================================================
-- Il numero definitivo (RI-2026-0001, RI-2026-0002…) si assegna quando il cliente firma.
-- Le bozze hanno un codice provvisorio, quindi bozze cancellate non lasciano buchi.
-- Un numero assegnato resta legato al suo rapporto per sempre: se il rapporto viene riaperto
-- e firmato di nuovo tiene lo stesso numero; se viene cancellato il numero non si riusa.
-- I rapporti firmati prima di questa modifica tengono il loro numero.
-- Primo numero per anno: impostazione 'rapporti-intervento/partenza', es. {"2026": 1, "2027": 1}.

insert into public.impostazioni (id, modulo_id, dati)
values ('rapporti-intervento/partenza', 'rapporti-intervento', '{"2026": 1}')
on conflict (id) do nothing;

create table if not exists public.numeri_rapporti (
  numero       text primary key,               -- RI-2026-0001
  anno         int  not null,
  n            int  not null,
  rapporto_id  text not null unique,           -- senza vincolo: il numero resta anche se il rapporto si cancella
  assegnato_da uuid default auth.uid(),
  assegnato_il timestamptz not null default now(),
  unique (anno, n)
);
alter table public.numeri_rapporti enable row level security;
drop policy if exists lettura on public.numeri_rapporti;
create policy lettura on public.numeri_rapporti for select to authenticated using (public.puo('rapporti-intervento', 'legge'));
-- nessuna scrittura diretta: i numeri li assegna solo la funzione qui sotto

create or replace function public.numero_rapporto(p_id text)
returns text language plpgsql security definer set search_path = public as $$
declare a int := extract(year from now())::int; primo int; k int; num text;
begin
  if not public.puo('rapporti-intervento', 'modifica') then
    raise exception 'Non hai il permesso di firmare i rapporti d''intervento';
  end if;
  select numero into num from numeri_rapporti where rapporto_id = p_id;
  if num is not null then return num; end if;
  if not exists (select 1 from rapporti where id = p_id) then
    raise exception 'Rapporto non trovato: salvalo prima di firmarlo';
  end if;
  perform pg_advisory_xact_lock(hashtext('ri-numero'), a);
  select coalesce((dati ->> a::text)::int, 1) into primo from impostazioni where id = 'rapporti-intervento/partenza';
  select greatest(coalesce(max(n), 0) + 1, coalesce(primo, 1)) into k from numeri_rapporti where anno = a;
  num := 'RI-' || a || '-' || lpad(k::text, 4, '0');
  insert into numeri_rapporti (numero, anno, n, rapporto_id) values (num, a, k, p_id);
  return num;
end;
$$;
revoke all on function public.numero_rapporto(text) from public;
grant execute on function public.numero_rapporto(text) to authenticated;

-- Un rapporto firmato che ha un numero assegnato deve portare quel numero
create or replace function public.prepara_rapporto()
returns trigger language plpgsql as $$
declare assegnato text;
begin
  new.numero := coalesce(new.dati ->> 'num', '');
  new.firma_ts := nullif(new.dati #>> '{firma,ts}', '')::timestamptz;
  new.aggiornato_il := now();
  if tg_op = 'UPDATE' then
    new.creato_da := old.creato_da;
    new.creato_il := old.creato_il;
  elsif auth.uid() is not null then
    new.creato_da := auth.uid();
  end if;
  if new.firma_ts is not null then
    select numero into assegnato from public.numeri_rapporti where rapporto_id = new.id;
    if assegnato is not null and assegnato <> new.numero then
      raise exception 'Il numero del rapporto firmato deve essere %', assegnato;
    end if;
  end if;
  return new;
end;
$$;

create index if not exists rapporti_numero on public.rapporti (numero);

select 'Prossimo rapporto firmato: RI-' || extract(year from now())::int || '-' ||
       lpad(greatest(coalesce((select max(n) from public.numeri_rapporti where anno = extract(year from now())::int), 0) + 1,
                     coalesce((select (dati ->> extract(year from now())::int::text)::int from public.impostazioni where id = 'rapporti-intervento/partenza'), 1))::text, 4, '0') as numerazione;
