-- Rapporti d'intervento: listino assistenza (Service Price List) e importo da fatturare per rapporto.
-- Da eseguire una volta in Supabase → SQL Editor.

create table if not exists public.listini_assistenza (
  id         text primary key,                 -- 'EU' oppure 'EXTRA_EU'
  dati       jsonb not null default '{}',      -- nome, anno, prezzi
  creato_il  timestamptz not null default now()
);
alter table public.listini_assistenza enable row level security;
drop policy if exists lettura on public.listini_assistenza;
drop policy if exists scrittura on public.listini_assistenza;
create policy lettura on public.listini_assistenza for select to authenticated using (public.puo('rapporti-intervento', 'legge'));
create policy scrittura on public.listini_assistenza for all to authenticated
  using (public.puo('rapporti-intervento', 'gestisce')) with check (public.puo('rapporti-intervento', 'gestisce'));

create table if not exists public.addebiti_rapporti (
  rapporto_id text primary key references public.rapporti(id) on delete cascade,
  dati        jsonb not null default '{}',     -- listino scelto, veicolo, pasti, spese a costo, ore extra, note
  creato_il   timestamptz not null default now()
);
alter table public.addebiti_rapporti enable row level security;
drop policy if exists lettura on public.addebiti_rapporti;
drop policy if exists scrittura on public.addebiti_rapporti;
create policy lettura on public.addebiti_rapporti for select to authenticated using (public.puo('rapporti-intervento', 'legge'));
create policy scrittura on public.addebiti_rapporti for all to authenticated
  using (public.puo('rapporti-intervento', 'gestisce')) with check (public.puo('rapporti-intervento', 'gestisce'));

drop trigger if exists storico on public.listini_assistenza;
create trigger storico after insert or update or delete on public.listini_assistenza
  for each row execute function public.registra_modifica();
drop trigger if exists storico on public.addebiti_rapporti;
create trigger storico after insert or update or delete on public.addebiti_rapporti
  for each row execute function public.registra_modifica();

-- Prezzi del listino 2024 Extra-Europa (Service_price_list_EU-EXTRA_EU_MASTER.pdf).
-- Il listino UE parte con gli stessi prezzi: correggerli dal gestionale (Da fatturare → Listini).
insert into public.listini_assistenza (id, dati) values
  ('EXTRA_EU', '{"nome":"Extra Europa","anno":"2024","ore":65,"oreExtra":75,"viaggio":35,"viaggioOltre":40,"kmAuto":0.70,"kmFurgone":0.80,"pasto":25,"remoto":55,"officina":55}'),
  ('EU',       '{"nome":"Europa","anno":"2024","daVerificare":true,"ore":65,"oreExtra":75,"viaggio":35,"viaggioOltre":40,"kmAuto":0.70,"kmFurgone":0.80,"pasto":25,"remoto":55,"officina":55}')
on conflict (id) do nothing;
