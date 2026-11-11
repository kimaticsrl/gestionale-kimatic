-- =============================================================
-- Gestionale Kimatic — registro delle modifiche esteso
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0008_anagrafica_clienti.sql
-- =============================================================
-- Registra chi crea, modifica ed elimina offerte, rapporti, clienti e casi.
-- Le modifiche che arrivano col salvataggio automatico (offerte e rapporti si salvano
-- mentre si scrive) vengono raggruppate: tutte le modifiche della stessa persona sullo
-- stesso documento entro 15 minuti formano una sola voce, con lo stato «prima» e «dopo».

create index if not exists registro_modifiche_quando on public.registro_modifiche (quando desc);
create index if not exists registro_modifiche_record on public.registro_modifiche (tabella, record_id, quando desc);

create or replace function public.registra_sessione()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r      jsonb := to_jsonb(coalesce(new, old));
  rid    text  := case when r ? 'coll' then (r ->> 'coll') || '/' || (r ->> 'id') else r ->> 'id' end;
  ultimo bigint;
begin
  if tg_op = 'UPDATE' then
    if to_jsonb(new) - 'aggiornato_il' - 'aggiornato_da' = to_jsonb(old) - 'aggiornato_il' - 'aggiornato_da' then
      return new;  -- niente di cambiato
    end if;
    select id into ultimo from registro_modifiche
     where tabella = tg_table_name and record_id = rid and utente is not distinct from auth.uid()
       and azione in ('UPDATE', 'INSERT') and quando > now() - interval '15 minutes'
     order by quando desc limit 1;
    if ultimo is not null then
      update registro_modifiche set dopo = to_jsonb(new), quando = now() where id = ultimo;
      return new;
    end if;
  end if;
  insert into registro_modifiche (tabella, record_id, azione, prima, dopo)
  values (tg_table_name, rid, tg_op,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end;
$$;

-- Offerte BMTEK: offerte, listino, impostazioni… (non le copie di sicurezza interne né le immagini)
create trigger storico_scrittura after insert or update on public.bm_docs
  for each row when (new.coll not like 'backup%' and new.coll not like 'immagini%')
  execute function public.registra_sessione();
create trigger storico_cancellazione after delete on public.bm_docs
  for each row when (old.coll not like 'backup%' and old.coll not like 'immagini%')
  execute function public.registra_sessione();

-- Rapporti d'intervento: ora anche le modifiche (prima solo creazione, firma e cancellazione)
drop trigger if exists storico_inserimento on public.rapporti;
drop trigger if exists storico_cancellazione on public.rapporti;
create trigger storico after insert or update or delete on public.rapporti
  for each row execute function public.registra_sessione();

-- Clienti, casi di Troubleshooting ed elenchi: stessa regola
drop trigger if exists storico on public.clienti;
create trigger storico after insert or update or delete on public.clienti
  for each row execute function public.registra_sessione();
drop trigger if exists storico on public.ts_casi;
create trigger storico after insert or update or delete on public.ts_casi
  for each row execute function public.registra_sessione();
create trigger storico after insert or update or delete on public.ts_liste
  for each row execute function public.registra_sessione();
