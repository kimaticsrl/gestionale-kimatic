-- =============================================================
-- Mancanti montaggi: elenco delle persone (o gruppi) che seguono i
-- codici, deciso dagli utenti — non tutti gli utenti del gestionale.
-- Può contenere anche chi non ha un accesso (es. «Magazzino»).
-- Il colore di ognuno sta qui; quello dei giacenti resta in mancanti_colori.
-- =============================================================

create table if not exists public.mancanti_persone (
  id      text primary key default gen_random_uuid()::text,
  nome    text not null unique,
  profilo uuid references public.profili(id) on delete set null,   -- se è un utente del gestionale
  colore  text check (colore is null or colore ~ '^#[0-9a-fA-F]{6}$'),
  ordine  int not null default 0
);
alter table public.mancanti_persone enable row level security;
drop policy if exists lettura on public.mancanti_persone;
drop policy if exists scrittura on public.mancanti_persone;
create policy lettura on public.mancanti_persone for select to authenticated using ((select public.puo('mancanti-montaggi', 'legge')));
create policy scrittura on public.mancanti_persone for all to authenticated
  using ((select public.puo('mancanti-montaggi', 'modifica'))) with check ((select public.puo('mancanti-montaggi', 'modifica')));

insert into public.mancanti_persone (nome, ordine, profilo, colore)
select v.nome, v.ordine, p.id, c.colore
from (values ('Sara Bartolini', 1), ('Benedetta Zanetti', 2), ('Leonardo Sabbi', 3), ('Marcello Ferrari', 4),
             ('Edoardo Bernasconi', 5), ('Magazzino', 6), ('Andrea Amadori', 7)) v(nome, ordine)
left join public.profili p on lower(trim(p.nome)) = lower(v.nome)
left join public.mancanti_colori c on c.chiave = p.id::text
on conflict (nome) do nothing;

-- assegnazioni e «chi lo segue» puntano ora a mancanti_persone
alter table public.mancanti_assegnazioni drop constraint if exists mancanti_assegnazioni_persona_fkey;
alter table public.mancanti_assegnazioni alter column persona type text using persona::text;
update public.mancanti_assegnazioni a set persona = mp.id from public.mancanti_persone mp where mp.profilo::text = a.persona;
delete from public.mancanti_assegnazioni a where not exists (select 1 from public.mancanti_persone mp where mp.id = a.persona);
alter table public.mancanti_assegnazioni add constraint mancanti_assegnazioni_persona_fkey
  foreign key (persona) references public.mancanti_persone(id) on delete cascade;

alter table public.mancanti drop constraint if exists mancanti_responsabile_fkey;
alter table public.mancanti alter column responsabile type text using responsabile::text;
update public.mancanti m set responsabile = mp.id from public.mancanti_persone mp where mp.profilo::text = m.responsabile;
update public.mancanti m set responsabile = null where responsabile is not null and not exists (select 1 from public.mancanti_persone mp where mp.id = m.responsabile);
alter table public.mancanti add constraint mancanti_responsabile_fkey
  foreign key (responsabile) references public.mancanti_persone(id) on delete set null;

-- i colori delle persone ora stanno in mancanti_persone
delete from public.mancanti_colori where chiave <> 'giacenti';

select nome, colore, profilo is not null as utente from public.mancanti_persone order by ordine;
