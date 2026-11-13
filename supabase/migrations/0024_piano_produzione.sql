-- =============================================================
-- Gestionale Kimatic — modulo Piano produzione (con Gantt linee produzione)
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0023_nc_numero_modificabile.sql
-- Poi eseguire 0025_import_dati_piano.sql (i dati attuali del Piano su claude.ai).
-- =============================================================
-- Commesse, macchine, persone, agenda, ore, tempi standard, Gantt preliminari, chiusure…
-- restano documenti come nella versione su claude.ai, nella tabella pp_docs.

create table public.pp_docs (
  coll          text not null,   -- 'commesse', 'macchine', 'persone', 'agenda', 'config', …
  id            text not null,
  dati          jsonb not null default '{}',
  aggiornato_il timestamptz not null default now(),
  aggiornato_da uuid default auth.uid(),
  primary key (coll, id)
);
create trigger prepara before insert or update on public.pp_docs
  for each row execute function public.prepara_bm_doc();

-- Vede chi ha almeno Legge sul Piano o sul Gantt linee; modifica chi ha Modifica sul Piano.
-- Utenti e permessi interni al Piano (raccolta 'accessi') solo chi Gestisce.
alter table public.pp_docs enable row level security;
create policy lettura on public.pp_docs for select to authenticated
  using (public.puo('piano-produzione', 'legge') or public.puo('gantt-linee', 'legge'));
create policy scrittura on public.pp_docs for all to authenticated
  using (case when coll = 'accessi' then public.puo('piano-produzione', 'gestisce') else public.puo('piano-produzione', 'modifica') end)
  with check (case when coll = 'accessi' then public.puo('piano-produzione', 'gestisce') else public.puo('piano-produzione', 'modifica') end);

-- Storico delle modifiche (non le copie di sicurezza interne)
create trigger storico_scrittura after insert or update on public.pp_docs
  for each row when (new.coll <> 'backup' and new.coll <> 'tv')
  execute function public.registra_sessione();
create trigger storico_cancellazione after delete on public.pp_docs
  for each row when (old.coll <> 'backup' and old.coll <> 'tv')
  execute function public.registra_sessione();

-- Unione profonda come update() della versione su claude.ai: gli oggetti si uniscono campo per
-- campo, un campo {"__delete__": true} viene tolto, tutto il resto (anche gli elenchi) si sostituisce.
create or replace function public.pp_unisci(a jsonb, b jsonb)
returns jsonb language plpgsql immutable as $$
declare
  r jsonb := case when jsonb_typeof(a) = 'object' then a else '{}'::jsonb end;
  k text;
  v jsonb;
begin
  for k, v in select * from jsonb_each(coalesce(b, '{}'::jsonb)) loop
    if jsonb_typeof(v) = 'object' then
      if v -> '__delete__' = 'true'::jsonb then
        r := r - k;
      else
        r := r || jsonb_build_object(k, public.pp_unisci(r -> k, v));
      end if;
    else
      r := r || jsonb_build_object(k, v);
    end if;
  end loop;
  return r;
end;
$$;

-- Modifica atomica di un documento: due persone che cambiano campi diversi nello stesso
-- momento non si cancellano le modifiche a vicenda. Gira con i permessi di chi la chiama.
create or replace function public.pp_aggiorna(p_coll text, p_id text, p_campi jsonb)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update pp_docs set dati = pp_unisci(dati, p_campi) where coll = p_coll and id = p_id;
  if not found then
    insert into pp_docs (coll, id, dati) values (p_coll, p_id, pp_unisci('{}'::jsonb, p_campi));
  end if;
end;
$$;
grant execute on function public.pp_aggiorna(text, text, jsonb) to authenticated;

-- Le pagine aperte si aggiornano subito quando qualcuno modifica il piano
alter publication supabase_realtime add table public.pp_docs;

-- Il modulo si attiva (migrato = true) con 0025, insieme ai dati.
