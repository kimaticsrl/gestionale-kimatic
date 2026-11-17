-- =============================================================
-- Notifiche via mail (Gmail del gestionale).
-- Il database mette in coda le notifiche (tabella «notifiche»); il
-- gestionale su Vercel le spedisce subito dopo l'evento e, ogni
-- mattina, prepara il riepilogo delle scadenze e rispedisce quelle
-- rimaste in coda. Chi riceve cosa si sceglie nella pagina
-- «Notifiche» (amministratori): ruoli, persone, indirizzi esterni.
-- =============================================================

create table if not exists public.notifiche_regole (
  evento      text primary key,
  nome        text not null,
  descrizione text not null default '',
  attivo      boolean not null default true,
  ruoli       text[] not null default '{}',
  persone     uuid[] not null default '{}',
  email_extra text[] not null default '{}',
  anticipi    int[]  not null default '{}',   -- solo scadenze: giorni prima (0 = il giorno stesso)
  ordine      int not null default 0
);
alter table public.notifiche_regole enable row level security;
drop policy if exists admin on public.notifiche_regole;
create policy admin on public.notifiche_regole for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.notifiche (
  id          bigint generated always as identity primary key,
  chiave      text unique,                       -- evita doppioni (es. stesso riepilogo due volte)
  evento      text not null,
  oggetto     text not null,
  testo       text not null,
  link        text,
  destinatari text[] not null,
  creata_il   timestamptz not null default now(),
  inviata_il  timestamptz,
  tentativi   int not null default 0,
  errore      text
);
create index if not exists notifiche_da_inviare on public.notifiche (creata_il) where inviata_il is null;
alter table public.notifiche enable row level security;
drop policy if exists admin on public.notifiche;
create policy admin on public.notifiche for select to authenticated using (public.is_admin());

insert into public.notifiche_regole (evento, nome, descrizione, ruoli, anticipi, ordine, attivo) values
  ('nc-inserita', 'Non conformità inserita', 'Appena qualcuno segnala una non conformità.',
     coalesce((select array_agg(ruolo_id) from public.permessi where modulo_id = 'non-conformita' and livello = 'gestisce'), '{}'), '{}', 1, true),
  ('nc-chiusa', 'Non conformità chiusa', 'Quando una non conformità passa a «chiusa».', '{}', '{}', 2, false),
  ('rapporto-firmato', 'Rapporto d''intervento firmato', 'Quando il cliente firma un rapporto d''intervento.',
     '{amministrazione}', '{}', 3, true),
  ('scadenze-sicurezza', 'Scadenze sicurezza', 'Riepilogo mattutino: corsi, visite mediche e scadenze aziendali della Sicurezza che scadono tra i giorni indicati.',
     coalesce((select array_agg(ruolo_id) from public.permessi where modulo_id = 'sicurezza' and livello = 'gestisce'), '{}'), '{30,7,0}', 4, true)
on conflict (evento) do nothing;

-- Indirizzi a cui mandare un evento: persone attive dei ruoli scelti, persone scelte, indirizzi esterni
create or replace function public.destinatari_notifica(p_evento text)
returns text[] language sql stable security definer set search_path = public as $$
  with r as (select * from notifiche_regole where evento = p_evento and attivo)
  select coalesce(array_agg(distinct e order by e), '{}') from (
    select lower(p.email) e from profili p, r
    where p.attivo and public.cessato_dal(p.id) is null
      and (p.id = any(r.persone)
           or exists (select 1 from profilo_ruoli pr where pr.profilo_id = p.id and pr.ruolo_id = any(r.ruoli)))
    union
    select lower(trim(x)) from r, unnest(r.email_extra) x where trim(x) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ) t;
$$;

create or replace function public.accoda_notifica(p_evento text, p_chiave text, p_oggetto text, p_testo text, p_link text)
returns void language plpgsql security definer set search_path = public as $$
declare dest text[] := public.destinatari_notifica(p_evento);
begin
  if coalesce(array_length(dest, 1), 0) = 0 then return; end if;
  insert into notifiche (chiave, evento, oggetto, testo, link, destinatari)
  values (p_chiave, p_evento, p_oggetto, p_testo, p_link, dest)
  on conflict (chiave) do nothing;
end;
$$;

-- Le notifiche non devono mai bloccare il salvataggio: gli errori si ignorano
create or replace function public.notifica_nc()
returns trigger language plpgsql security definer set search_path = public as $$
declare d jsonb := new.dati;
begin
  begin
    if tg_op = 'INSERT' then
      perform public.accoda_notifica('nc-inserita', 'nc-inserita:' || new.id,
        'Nuova non conformità ' || coalesce(new.numero, '') || ' – ' || coalesce(nullif(d ->> 'fornitore', ''), 'fornitore non indicato'),
        concat_ws(E'\n',
          'È stata inserita la non conformità ' || coalesce(new.numero, '') || '.',
          '',
          'Fornitore: ' || coalesce(nullif(d ->> 'fornitore', ''), '—'),
          case when coalesce(d ->> 'commessa', '') <> '' then 'Commessa: ' || (d ->> 'commessa') end,
          case when coalesce(d ->> 'tipo', '') <> '' then 'Tipo di difetto: ' || (d ->> 'tipo') end,
          case when coalesce(d ->> 'gravita', '') <> '' then 'Gravità: ' || (d ->> 'gravita') end,
          'Descrizione: ' || coalesce(nullif(d ->> 'descrizione', ''), '—'),
          'Segnalata da: ' || coalesce((select nome from profili where id = new.creato_da), '—')),
        '/moduli/non-conformita');
    elsif new.stato = 'chiusa' and old.stato is distinct from 'chiusa' then
      perform public.accoda_notifica('nc-chiusa', 'nc-chiusa:' || new.id || ':' || to_char(now(), 'YYYYMMDDHH24MISS'),
        'Non conformità ' || coalesce(new.numero, '') || ' chiusa – ' || coalesce(nullif(d ->> 'fornitore', ''), ''),
        concat_ws(E'\n',
          'La non conformità ' || coalesce(new.numero, '') || ' è stata chiusa.',
          '',
          'Fornitore: ' || coalesce(nullif(d ->> 'fornitore', ''), '—'),
          'Descrizione: ' || coalesce(nullif(d ->> 'descrizione', ''), '—')),
        '/moduli/non-conformita');
    end if;
  exception when others then null;
  end;
  return null;
end;
$$;
drop trigger if exists notifica on public.nc;
create trigger notifica after insert or update on public.nc
  for each row execute function public.notifica_nc();

create or replace function public.notifica_rapporto()
returns trigger language plpgsql security definer set search_path = public as $$
declare d jsonb := new.dati;
begin
  begin
    if new.firma_ts is not null and (tg_op = 'INSERT' or old.firma_ts is null) then
      perform public.accoda_notifica('rapporto-firmato', 'rapporto-firmato:' || new.id || ':' || new.firma_ts,
        'Rapporto ' || new.numero || ' firmato – ' || coalesce(d #>> '{cli,nome}', ''),
        concat_ws(E'\n',
          'Il cliente ha firmato il rapporto d''intervento ' || new.numero || '.',
          '',
          'Cliente: ' || coalesce(nullif(d #>> '{cli,nome}', ''), '—'),
          'Tipo: ' || case d ->> 'tipo' when 'inst' then 'Installazione' else 'Manutenzione' end,
          case when coalesce(d ->> 'matr', '') <> '' then 'Macchina: ' || concat_ws(' – ', d ->> 'matr', nullif(d ->> 'macDesc', '')) end,
          'Tecnici: ' || coalesce(nullif(d ->> 'tecnici', ''), '—'),
          'Firmato da: ' || coalesce(nullif(d #>> '{firma,cliNome}', ''), '—') || ' il ' || to_char(new.firma_ts at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI'),
          '',
          'Ora è nella coda «Da fatturare».'),
        '/moduli/rapporti-intervento');
    end if;
  exception when others then null;
  end;
  return null;
end;
$$;
drop trigger if exists notifica on public.rapporti;
create trigger notifica after insert or update on public.rapporti
  for each row execute function public.notifica_rapporto();

-- Riepilogo scadenze della Sicurezza per un giorno (lo chiama il gestionale ogni mattina)
create or replace function public.genera_scadenze(p_giorno date default current_date)
returns int language plpgsql security definer set search_path = public as $$
declare
  ant int[];
  righe text;
  n int;
begin
  select anticipi into ant from notifiche_regole where evento = 'scadenze-sicurezza' and attivo;
  if ant is null or coalesce(array_length(ant, 1), 0) = 0 then return 0; end if;

  with dip as (   -- dipendenti in forza
    select id, dati ->> 'nome' nome from dipendenti
    where attivo and (coalesce(dati ->> 'scadenza', '') = '' or dati ->> 'scadenza' >= to_char(p_giorno, 'YYYY-MM-DD'))
  ), corsi as (   -- l'ultimo corso di ogni tipo per persona
    select distinct on (c.dati ->> 'dip', c.dati ->> 'tipo')
      c.dati ->> 'dip' dip, c.dati ->> 'tipo' tipo, c.dati ->> 'data' data, c.dati ->> 'scadenza' scad,
      coalesce((c.dati ->> 'chiuso')::boolean, false) chiuso
    from sic_docs c where c.coll = 'corso'
    order by c.dati ->> 'dip', c.dati ->> 'tipo', c.dati ->> 'data' desc nulls last
  ), voci as (
    select 1 ord, 'Corso ' || case k.tipo when 'gen' then 'formazione generale' when 'sic' then 'sicurezza' when 'car' then 'carrellisti'
             when 'ps' then 'primo soccorso' when 'ai' then 'antincendio' when 'rls' then 'RLS' when 'pes' then 'PES-PAV-PEI'
             when 'prep' then 'preposto' when 'dirs' then 'dirigente per la sicurezza' when 'rspp' then 'RSPP / ASPP' else k.tipo end
           || ' – ' || d.nome as voce,
           coalesce(case when k.scad ~ '^\d{4}-\d{2}-\d{2}$' then k.scad::date end,
             case when k.data ~ '^\d{4}-\d{2}-\d{2}$' then (k.data::date + make_interval(years =>
               case k.tipo when 'sic' then 5 when 'car' then 5 when 'ps' then 3 when 'ai' then 5 when 'rls' then 1
                 when 'pes' then 5 when 'prep' then 2 when 'dirs' then 5 when 'rspp' then 5 else 0 end))::date end) as scad,
           k.tipo
    from corsi k join dip d on d.id = k.dip where not k.chiuso
    union all
    select 2, 'Visita medica – ' || d.nome, (p.dati ->> 'scadvis')::date, 'vis'
    from sic_docs p join dip d on d.id = p.id
    where p.coll = 'persona' and coalesce(p.dati ->> 'scadvis', '') ~ '^\d{4}-\d{2}-\d{2}$'
    union all
    select 3, 'Scadenza aziendale – ' || coalesce(a.dati ->> 'nome', ''), (a.dati ->> 'prossima')::date, 'az'
    from sic_docs a where a.coll = 'azienda' and coalesce(a.dati ->> 'prossima', '') ~ '^\d{4}-\d{2}-\d{2}$'
  ), oggi as (
    select (scad - p_giorno) gg, ord, voce, scad from voci
    where scad is not null and tipo <> 'gen' and (scad - p_giorno) = any(ant)
  )
  select count(*), string_agg(
           case when riga = 1 then E'\n' || case gg when 0 then 'SCADONO OGGI (' else 'Scadono tra ' || gg || ' giorni (' end
                || to_char(scad, 'DD/MM/YYYY') || E')\n' else '' end || '  • ' || voce, E'\n' order by gg, ord, voce)
    into n, righe
  from (select *, row_number() over (partition by gg order by ord, voce) riga from oggi) t;

  if coalesce(n, 0) = 0 then return 0; end if;
  perform public.accoda_notifica('scadenze-sicurezza', 'scadenze:' || p_giorno,
    'Scadenze sicurezza – ' || n || case when n = 1 then ' scadenza' else ' scadenze' end || ' (' || to_char(p_giorno, 'DD/MM/YYYY') || ')',
    'Riepilogo delle scadenze della Sicurezza e formazione:' || E'\n' || righe,
    '/moduli/sicurezza');
  return n;
end;
$$;

-- Per chi spedisce (il gestionale su Vercel, con la chiave di servizio)
create or replace function public.notifiche_da_inviare()
returns setof public.notifiche language sql security definer set search_path = public as $$
  select * from notifiche where inviata_il is null and tentativi < 5 order by creata_il limit 50;
$$;
create or replace function public.notifica_esito(p_id bigint, p_errore text)
returns void language sql security definer set search_path = public as $$
  update notifiche set inviata_il = case when p_errore is null then now() end,
    tentativi = tentativi + 1, errore = p_errore where id = p_id;
$$;

-- Prova dalla pagina Notifiche (solo amministratori): una mail a sé stessi
create or replace function public.notifica_prova()
returns void language plpgsql security definer set search_path = public as $$
declare io text;
begin
  if not public.is_admin() then raise exception 'Solo amministratori'; end if;
  select lower(email) into io from profili where id = auth.uid();
  insert into notifiche (chiave, evento, oggetto, testo, link, destinatari)
  values ('prova:' || auth.uid() || ':' || extract(epoch from now()), 'prova', 'Prova notifiche del gestionale',
          'Se leggi questa mail, le notifiche del gestionale Kimatic funzionano.', '/admin/notifiche', array[io]);
end;
$$;

revoke all on function public.destinatari_notifica(text), public.accoda_notifica(text, text, text, text, text),
  public.genera_scadenze(date), public.notifiche_da_inviare(), public.notifica_esito(bigint, text) from public, anon, authenticated;
grant execute on function public.genera_scadenze(date), public.notifiche_da_inviare(), public.notifica_esito(bigint, text) to service_role;
grant execute on function public.notifica_prova() to authenticated;
