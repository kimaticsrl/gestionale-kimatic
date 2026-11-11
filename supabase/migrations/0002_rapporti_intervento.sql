-- =============================================================
-- Gestionale Kimatic — modulo Rapporti d'intervento
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0001_base.sql
-- =============================================================

-- -------------------------------------------------------------
-- Regole «solo i propri dati»: per un ruolo in un modulo,
-- limita la lettura e/o la modifica ai record creati dalla persona.
-- -------------------------------------------------------------
create table public.regole_propri (
  modulo_id text not null references public.moduli(id) on delete cascade,
  ruolo_id  text not null references public.ruoli(id) on delete cascade,
  lettura   boolean not null default false,  -- vede solo i propri
  modifica  boolean not null default true,   -- modifica solo i propri
  primary key (modulo_id, ruolo_id)
);
alter table public.regole_propri enable row level security;
create policy lettura on public.regole_propri for select to authenticated using (public.utente_attivo());
create policy admin on public.regole_propri for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Vero se TUTTI i ruoli che danno accesso all'utente sono limitati ai propri record.
-- p_tipo = 'lettura' (conta i ruoli con almeno Legge) o 'modifica' (almeno Modifica).
create or replace function public.solo_propri(p_modulo text, p_tipo text)
returns boolean language sql stable security definer set search_path = public as $$
  select not public.is_admin() and not exists (
    select 1
    from profilo_ruoli pr
    join permessi p on p.ruolo_id = pr.ruolo_id and p.modulo_id = p_modulo
    where pr.profilo_id = auth.uid()
      and p.livello >= case p_tipo when 'modifica' then 'modifica'::livello else 'legge'::livello end
      and not exists (
        select 1 from regole_propri r
        where r.modulo_id = p_modulo and r.ruolo_id = pr.ruolo_id
          and case p_tipo when 'modifica' then r.modifica else r.lettura end
      )
  );
$$;
grant execute on function public.solo_propri(text, text) to authenticated;

-- Il Tecnico service vede e modifica solo i propri rapporti
insert into public.regole_propri (modulo_id, ruolo_id, lettura, modifica)
values ('rapporti-intervento', 'tecnico-service', true, true);

-- -------------------------------------------------------------
-- Anagrafica clienti (condivisa tra i moduli)
-- -------------------------------------------------------------
create table public.clienti (
  id            text primary key,
  nome          text not null,
  dati          jsonb not null default '{}',   -- indirizzo, contatto, email, telefono, piva, lingua, note, fonti, commesse
  aggiornato_il timestamptz not null default now()
);
alter table public.clienti enable row level security;
create policy lettura on public.clienti for select to authenticated using (public.utente_attivo());
create policy scrittura on public.clienti for all to authenticated
  using (public.puo('rapporti-intervento', 'gestisce')) with check (public.puo('rapporti-intervento', 'gestisce'));

-- -------------------------------------------------------------
-- Rapporti d'intervento
-- -------------------------------------------------------------
create table public.rapporti (
  id            text primary key,
  numero        text not null default '',
  dati          jsonb not null default '{}',   -- contenuto del rapporto (giornate, ricambi, firme…)
  firma_ts      timestamptz,                   -- valorizzato quando il cliente firma: da lì il rapporto è bloccato
  creato_da     uuid references public.profili(id) on delete set null default auth.uid(),
  creato_il     timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);
create index on public.rapporti (creato_da);

-- Mantiene coerenti numero, firma e autore a ogni salvataggio
create or replace function public.prepara_rapporto()
returns trigger language plpgsql as $$
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
  return new;
end;
$$;
create trigger prepara before insert or update on public.rapporti
  for each row execute function public.prepara_rapporto();

alter table public.rapporti enable row level security;

create policy lettura on public.rapporti for select to authenticated using (
  public.puo('rapporti-intervento', 'legge')
  and (not public.solo_propri('rapporti-intervento', 'lettura') or creato_da = auth.uid())
);
create policy inserimento on public.rapporti for insert to authenticated with check (
  public.puo('rapporti-intervento', 'modifica')
);
-- Chi ha Modifica cambia solo i rapporti non ancora firmati; chi Gestisce può anche riaprirli
create policy modifica on public.rapporti for update to authenticated using (
  public.puo('rapporti-intervento', 'gestisce')
  or (public.puo('rapporti-intervento', 'modifica') and firma_ts is null
      and (not public.solo_propri('rapporti-intervento', 'modifica') or creato_da = auth.uid()))
) with check (
  public.puo('rapporti-intervento', 'modifica')
);
create policy cancellazione on public.rapporti for delete to authenticated using (
  public.puo('rapporti-intervento', 'gestisce')
  or (public.puo('rapporti-intervento', 'modifica') and firma_ts is null and creato_da = auth.uid())
);

-- -------------------------------------------------------------
-- Fatturazione dei rapporti firmati
-- -------------------------------------------------------------
create table public.fatture_rapporti (
  rapporto_id text primary key references public.rapporti(id) on delete cascade,
  dati        jsonb not null default '{}',     -- nf (numero fattura), df (data), note, by, ts
  creato_il   timestamptz not null default now()
);
alter table public.fatture_rapporti enable row level security;
create policy lettura on public.fatture_rapporti for select to authenticated using (public.puo('rapporti-intervento', 'legge'));
create policy scrittura on public.fatture_rapporti for all to authenticated
  using (public.puo('rapporti-intervento', 'gestisce')) with check (public.puo('rapporti-intervento', 'gestisce'));

-- -------------------------------------------------------------
-- Storico: creazione, firma, riapertura, cancellazione, fatturazione
-- -------------------------------------------------------------
create trigger storico_inserimento after insert on public.rapporti
  for each row execute function public.registra_modifica();
create trigger storico_firma after update on public.rapporti
  for each row when (old.firma_ts is distinct from new.firma_ts) execute function public.registra_modifica();
create trigger storico_cancellazione after delete on public.rapporti
  for each row execute function public.registra_modifica();
create trigger storico after insert or update or delete on public.fatture_rapporti
  for each row execute function public.registra_modifica();
create trigger storico after insert or update or delete on public.clienti
  for each row execute function public.registra_modifica();

-- Il modulo ora vive nel nuovo gestionale
update public.moduli set migrato = true where id = 'rapporti-intervento';
