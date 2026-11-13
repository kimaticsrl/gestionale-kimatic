-- =============================================================
-- Gestionale Kimatic — storico delle commesse clienti (da SAM), abbinato all'Anagrafica clienti
-- Da eseguire una volta nell'SQL Editor di Supabase, poi 0028_import_commesse_clienti.sql
-- =============================================================
-- Una riga per commessa, con le sue righe (macchine, gruppi, ricambi, servizi).
-- Le commesse intestate a una società di leasing o a una banca si abbinano al cliente
-- che riceve la merce (Destinatario merci).

create table public.commesse_clienti (
  id            text primary key,            -- 'AAAA/NNN'
  anno          integer not null,
  numero        integer not null,
  data          date,
  intestatario  text not null,               -- cliente della commessa in SAM
  destinatario  text,                        -- destinatario merci
  leasing       boolean not null default false,
  codice_sam    text,                        -- codice SAM del cliente da abbinare
  cliente_nome  text not null,               -- nome del cliente da abbinare (destinatario se leasing)
  cliente_id    text references public.clienti(id) on delete set null,
  abbinato_a_mano boolean not null default false,
  tipo          text,                        -- 'macchine', 'ricambi e altro', 'senza codici'
  totale        numeric,
  valuta        text,
  righe         jsonb not null default '[]', -- [{cod, desc, q, um, tipo}]
  importato_il  timestamptz not null default now()
);
create index commesse_clienti_cliente on public.commesse_clienti (cliente_id);

alter table public.commesse_clienti enable row level security;
create policy lettura on public.commesse_clienti for select to authenticated using (public.puo('anagrafica-clienti', 'legge'));
create policy scrittura on public.commesse_clienti for all to authenticated
  using (public.puo('anagrafica-clienti', 'gestisce')) with check (public.puo('anagrafica-clienti', 'gestisce'));

-- Nome ripulito per il confronto: minuscole, senza asterischi, punteggiatura e forme societarie
create or replace function public.nome_confronto(s text)
returns text language sql immutable as $$
  select btrim(regexp_replace(regexp_replace(
    regexp_replace(lower(coalesce(s, '')), '[^a-z0-9àèéìòóùäöüßçñãõâêôł]+', ' ', 'g'),
    '\m(s ?r ?l|s ?p ?a|srls|snc|sas|s ?a ?s|ltd|limited|inc|sp ?z ?o ?o|sp|z|o|sa|s ?a|sl|s ?l|lda|gmbh|ag|ab|oy|zrt|plc|co|corp|bv|nv|sarl|di)\M', ' ', 'g'),
    '\s+', ' ', 'g'));
$$;

-- Abbina le commesse ai clienti in anagrafica: prima per codice SAM, poi per nome.
-- Si può rieseguire (per esempio dopo aver aggiunto clienti): non tocca gli abbinamenti fatti a mano.
create or replace function public.collega_commesse_clienti()
returns integer language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  update commesse_clienti k set cliente_id = c.id
    from clienti c
   where not k.abbinato_a_mano and k.cliente_id is null and k.codice_sam is not null
     and ltrim(c.dati ->> 'codice_sam', '0') = ltrim(k.codice_sam, '0') and ltrim(k.codice_sam, '0') <> '';
  update commesse_clienti k set cliente_id = (
      select c.id from clienti c
       where nome_confronto(c.nome) = nome_confronto(k.cliente_nome)
          or nome_confronto(c.dati ->> 'ragione_sociale') = nome_confronto(k.cliente_nome)
       order by c.id limit 1)
   where not k.abbinato_a_mano and k.cliente_id is null;
  select count(*) into n from commesse_clienti where cliente_id is not null;
  return n;
end;
$$;
grant execute on function public.collega_commesse_clienti() to authenticated;

-- Abbina le commesse quando si aggiunge o si rinomina un cliente in anagrafica
create or replace function public.collega_commesse_cliente_nuovo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update commesse_clienti k set cliente_id = new.id
   where k.cliente_id is null and not k.abbinato_a_mano
     and ((ltrim(new.dati ->> 'codice_sam', '0') <> '' and ltrim(k.codice_sam, '0') = ltrim(new.dati ->> 'codice_sam', '0'))
          or nome_confronto(k.cliente_nome) in (nome_confronto(new.nome), nome_confronto(new.dati ->> 'ragione_sociale')));
  return new;
end;
$$;
create trigger collega_commesse after insert or update of nome, dati on public.clienti
  for each row execute function public.collega_commesse_cliente_nuovo();
