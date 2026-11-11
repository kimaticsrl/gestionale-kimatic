-- =============================================================
-- Gestionale Kimatic — base: utenti, ruoli, moduli e permessi
-- Da eseguire una sola volta nell'SQL Editor di Supabase.
-- =============================================================

-- Livelli di accesso, dal più basso al più alto
create type public.livello as enum ('nessuno', 'legge', 'modifica', 'gestisce');

-- -------------------------------------------------------------
-- Tabelle
-- -------------------------------------------------------------
create table public.reparti (
  id      text primary key,
  nome    text not null,
  sigla   text not null,
  ordine  int  not null default 0
);

create table public.moduli (
  id           text primary key,
  reparto_id   text not null references public.reparti(id),
  nome         text not null,
  descrizione  text not null default '',
  link_attuale text,             -- versione attuale su claude.ai, finché non è migrato
  migrato      boolean not null default false,
  ordine       int not null default 0
);

create table public.ruoli (
  id          text primary key,
  nome        text not null,
  descrizione text not null default '',
  ordine      int  not null default 0
);

create table public.permessi (
  ruolo_id  text not null references public.ruoli(id) on delete cascade,
  modulo_id text not null references public.moduli(id) on delete cascade,
  livello   public.livello not null default 'nessuno',
  primary key (ruolo_id, modulo_id)
);

create table public.profili (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique,
  nome       text not null default '',
  is_admin   boolean not null default false,
  attivo     boolean not null default true,
  creato_il  timestamptz not null default now()
);

create table public.profilo_ruoli (
  profilo_id uuid not null references public.profili(id) on delete cascade,
  ruolo_id   text not null references public.ruoli(id) on delete cascade,
  primary key (profilo_id, ruolo_id)
);

-- Chi può registrarsi: solo gli indirizzi invitati da un amministratore
create table public.inviti (
  email       text primary key check (email = lower(email)),
  nome        text not null default '',
  ruoli       text[] not null default '{}',
  is_admin    boolean not null default false,
  invitato_da uuid references public.profili(id) on delete set null,
  creato_il   timestamptz not null default now()
);

-- Storico di ogni modifica (usato dai moduli man mano che vengono migrati)
create table public.registro_modifiche (
  id         bigint generated always as identity primary key,
  tabella    text not null,
  record_id  text,
  azione     text not null,
  prima      jsonb,
  dopo       jsonb,
  utente     uuid default auth.uid(),
  quando     timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Funzioni di controllo (usate dalle regole di accesso)
-- -------------------------------------------------------------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin and attivo from profili where id = auth.uid()), false);
$$;

create or replace function public.utente_attivo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select attivo from profili where id = auth.uid()), false);
$$;

-- Il livello più alto che l'utente collegato ha su un modulo (somma dei suoi ruoli)
create or replace function public.livello_modulo(p_modulo text)
returns public.livello language sql stable security definer set search_path = public as $$
  select case
    when not public.utente_attivo() then 'nessuno'::livello
    when public.is_admin() then 'gestisce'::livello
    else coalesce((
      select max(p.livello)
      from profilo_ruoli pr
      join permessi p on p.ruolo_id = pr.ruolo_id and p.modulo_id = p_modulo
      where pr.profilo_id = auth.uid()
    ), 'nessuno'::livello)
  end;
$$;

create or replace function public.puo(p_modulo text, p_minimo public.livello)
returns boolean language sql stable security definer set search_path = public as $$
  select public.livello_modulo(p_modulo) >= p_minimo;
$$;

-- Elenco dei moduli visibili all'utente collegato, con il suo livello
create or replace function public.miei_moduli()
returns table (id text, reparto_id text, nome text, descrizione text, link_attuale text, migrato boolean, ordine int, livello public.livello)
language sql stable security definer set search_path = public as $$
  select m.id, m.reparto_id, m.nome, m.descrizione, m.link_attuale, m.migrato, m.ordine, public.livello_modulo(m.id)
  from moduli m
  where public.livello_modulo(m.id) > 'nessuno'
  order by m.ordine;
$$;

-- -------------------------------------------------------------
-- Registrazione: solo chi è invitato può creare l'account
-- -------------------------------------------------------------
create or replace function public.gestisci_nuovo_utente()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv inviti%rowtype;
begin
  select * into inv from inviti where email = lower(new.email);
  if not found then
    raise exception 'Indirizzo non invitato: chiedi a un amministratore di aggiungerti.';
  end if;

  insert into profili (id, email, nome, is_admin)
  values (new.id, lower(new.email), inv.nome, inv.is_admin);

  insert into profilo_ruoli (profilo_id, ruolo_id)
  select new.id, r from unnest(inv.ruoli) r
  where exists (select 1 from ruoli where id = r);

  delete from inviti where email = inv.email;
  return new;
end;
$$;

create trigger su_nuovo_utente
  after insert on auth.users
  for each row execute function public.gestisci_nuovo_utente();

-- Storico generico: da agganciare alle tabelle dei moduli
create or replace function public.registra_modifica()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into registro_modifiche (tabella, record_id, azione, prima, dopo)
  values (
    tg_table_name,
    coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id')),
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger storico_permessi after insert or update or delete on public.permessi
  for each row execute function public.registra_modifica();
create trigger storico_profilo_ruoli after insert or update or delete on public.profilo_ruoli
  for each row execute function public.registra_modifica();
create trigger storico_profili after update or delete on public.profili
  for each row execute function public.registra_modifica();

-- Un utente non può togliersi da solo i poteri di amministratore
create or replace function public.proteggi_profilo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.id = auth.uid() and (new.is_admin is distinct from old.is_admin or new.attivo is distinct from old.attivo) then
    raise exception 'Non puoi cambiare il tuo stato di amministratore o disattivarti da solo.';
  end if;
  if not public.is_admin() and (new.is_admin is distinct from old.is_admin or new.attivo is distinct from old.attivo or new.email is distinct from old.email) then
    raise exception 'Solo un amministratore può cambiare questi campi.';
  end if;
  return new;
end;
$$;

create trigger protezione_profilo before update on public.profili
  for each row execute function public.proteggi_profilo();

-- -------------------------------------------------------------
-- Regole di accesso (Row Level Security)
-- -------------------------------------------------------------
alter table public.reparti            enable row level security;
alter table public.moduli             enable row level security;
alter table public.ruoli              enable row level security;
alter table public.permessi           enable row level security;
alter table public.profili            enable row level security;
alter table public.profilo_ruoli      enable row level security;
alter table public.inviti             enable row level security;
alter table public.registro_modifiche enable row level security;

-- Elenchi di base: li legge ogni utente attivo, li cambia solo un amministratore
create policy lettura on public.reparti for select to authenticated using (public.utente_attivo());
create policy scrittura on public.reparti for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy lettura on public.moduli for select to authenticated using (public.utente_attivo());
create policy scrittura on public.moduli for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy lettura on public.ruoli for select to authenticated using (public.utente_attivo());
create policy scrittura on public.ruoli for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- La griglia dei permessi la vede e la cambia solo un amministratore
create policy admin on public.permessi for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Profili: ognuno vede il proprio e i nomi dei colleghi; un amministratore li cambia tutti
create policy lettura on public.profili for select to authenticated using (public.utente_attivo());
create policy modifica_propria on public.profili for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy admin on public.profili for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_cancella on public.profili for delete to authenticated using (public.is_admin() and id <> auth.uid());

create policy propri on public.profilo_ruoli for select to authenticated using (profilo_id = auth.uid() or public.is_admin());
create policy admin on public.profilo_ruoli for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy admin on public.inviti for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy admin on public.registro_modifiche for select to authenticated using (public.is_admin());

-- Le funzioni le può chiamare solo chi ha fatto l'accesso
revoke execute on function public.livello_modulo(text), public.puo(text, public.livello), public.miei_moduli() from public, anon;
grant execute on function public.livello_modulo(text), public.puo(text, public.livello), public.miei_moduli(), public.is_admin(), public.utente_attivo() to authenticated;

-- -------------------------------------------------------------
-- Dati iniziali (dal documento «Ruoli e permessi», 11 novembre 2026)
-- -------------------------------------------------------------
insert into public.reparti (id, nome, sigla, ordine) values
  ('com', 'Commerciale',     'COM', 1),
  ('acq', 'Acquisti',        'ACQ', 2),
  ('pro', 'Produzione',      'PRO', 3),
  ('amm', 'Amministrazione', 'AMM', 4),
  ('ser', 'Service',         'SER', 5);

insert into public.moduli (id, reparto_id, nome, descrizione, link_attuale, ordine) values
  ('offerte-bmtek',      'com', 'Offerte BMTEK',                'Offerte emesse per conto di BMTEK.',                                   'https://claude.ai/artifact/Ax1GGSiz2LNAb9d2LyrmcZ', 10),
  ('costificatore',      'acq', 'Costificatore pezzi meccanici','Stima di materiale, lavorazioni e tempi per pezzo.',                   'https://claude.ai/artifact/9c4jsXczKLDN6FsG8pWKwg', 20),
  ('piano-produzione',   'pro', 'Piano produzione',             'Commesse in lavorazione e carico delle linee.',                        'https://claude.ai/artifact/PTGXNwELjw3CCtWrHvavv5', 30),
  ('gantt-linee',        'pro', 'Gantt linee produzione',       'Sequenza temporale delle lavorazioni per linea.',                      'https://claude.ai/artifact/LMAaW5PfBqEfBhXPKhRh2C', 31),
  ('planning-kimatic',   'pro', 'Planning giornaliero Kimatic', 'Attività e assegnazioni della giornata.',                               'https://claude.ai/artifact/Lj41HCuqRM45HJiGjjpRTd', 32),
  ('planning-operativi', 'pro', 'Planning giornaliero operativi','Turni e compiti del personale operativo.',                            'https://claude.ai/artifact/Mr2RQkTGUP8nmwNWornJkG', 33),
  ('catalogo-manuali',   'pro', 'Catalogo manuali BMTEK',       'Manuali delle macchine per lingua, con stato di traduzione e revisione.','https://claude.ai/artifact/Ni5DzxvyuBeiRHvCeiUo2v', 34),
  ('lettere-impegno',    'amm', 'Lettere d''impegno',           'Lettere d''impegno con i clienti.',                                    'https://claude.ai/artifact/AoQH8qScvhUFm58m3MrxcV', 40),
  ('controllo-gestione', 'amm', 'Controllo di gestione',        'Ricavi, costi e margini per periodo.',                                 'https://claude.ai/artifact/9ymt65LWyzoi1tkvbmFQN5', 41),
  ('rateizzazioni',      'amm', 'Rateizzazioni fiscali',        'Interessi di dilazione, rateo passivo e debito residuo dei piani fiscali.','https://claude.ai/artifact/KaT9UG8vJQDaxxY9doxPkq', 42),
  ('rientro-fornitori',  'amm', 'Piano di rientro fornitori',   'Scadenze e rate concordate con i fornitori.',                          'https://claude.ai/artifact/QWSYuX7o35aXdgfbDxNxBi', 43),
  ('rapporti-intervento','ser', 'Rapporti d''intervento',       'Giornate dei trasfertisti, firma del cliente e coda da fatturare.',    'https://claude.ai/artifact/TNcUV2ospAPtxWEB89L5yw', 50),
  ('troubleshooting',    'ser', 'Kimatic Troubleshooting',      'Problemi già risolti per macchina e argomento, con la soluzione.',     'https://claude.ai/artifact/J8VWf9ykvB81JA99tYf6KG', 51);

insert into public.ruoli (id, nome, descrizione, ordine) values
  ('direzione',       'Direzione',       'Modifica tutti i moduli, gestisce quelli economici',            1),
  ('amministrazione', 'Amministrazione', 'Contabilità, fiscale, fornitori, fatturazione interventi',      2),
  ('commerciale',     'Commerciale',     'Offerte e rapporti con i clienti',                              3),
  ('ufficio-tecnico', 'Ufficio tecnico', 'Listino, costi dei pezzi, manuali, soluzioni tecniche',         4),
  ('acquisti',        'Acquisti',        'Approvvigionamenti e costi dei pezzi',                          5),
  ('pianificatore',   'Pianificatore',   'Commesse, linee, turni e regole di pianificazione',             6),
  ('operativo',       'Operativo',       'Personale di reparto: vede il piano, aggiorna la propria giornata', 7),
  ('tecnico-service', 'Tecnico service', 'Trasfertisti: rapporti d''intervento e troubleshooting',       8);

-- Matrice: G = gestisce, M = modifica, L = legge, - = nessuno
-- Colonne: direzione, amministrazione, commerciale, ufficio-tecnico, acquisti, pianificatore, operativo, tecnico-service
with matrice(modulo, livelli) as (values
  ('offerte-bmtek',       'G L M - - - - -'),
  ('costificatore',       'M L L M G L - -'),
  ('piano-produzione',    'M L L L M G M M'),
  ('gantt-linee',         'M - L L L G L L'),
  ('planning-kimatic',    'M - L M L G M L'),
  ('planning-operativi',  'M - L M L G M M'),
  ('catalogo-manuali',    'M - L G - L L L'),
  ('lettere-impegno',     'G - - - - - - -'),
  ('controllo-gestione',  'G M - - - - - -'),
  ('rateizzazioni',       'G M - - - - - -'),
  ('rientro-fornitori',   'G M - - - - - -'),
  ('rapporti-intervento', 'M G M - L L - M'),
  ('troubleshooting',     'M - L G - L L M')
),
colonne(pos, ruolo) as (values
  (1,'direzione'),(2,'amministrazione'),(3,'commerciale'),(4,'ufficio-tecnico'),
  (5,'acquisti'),(6,'pianificatore'),(7,'operativo'),(8,'tecnico-service')
)
insert into public.permessi (ruolo_id, modulo_id, livello)
select c.ruolo, m.modulo,
  case split_part(m.livelli, ' ', c.pos)
    when 'G' then 'gestisce' when 'M' then 'modifica' when 'L' then 'legge' else 'nessuno'
  end::public.livello
from matrice m cross join colonne c;

-- Primo amministratore: Sara
insert into public.inviti (email, nome, ruoli, is_admin)
values ('s.bartolini@kimatic.it', 'Sara Bartolini', '{direzione}', true);
