-- =============================================================
-- Gestionale Kimatic — Sicurezza: scadenze aziendali fisse (non eliminabili)
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0035.
-- =============================================================
-- Le scadenze aziendali con "fisso": true (es. cassette di primo soccorso) non si possono
-- eliminare né perdere il segno di "fisse", da nessuno, nemmeno da chi gestisce il modulo.

create or replace function public.sic_scadenze_fisse()
returns trigger language plpgsql as $$
begin
  if old.coll = 'azienda' and coalesce((old.dati->>'fisso')::boolean, false) then
    if tg_op = 'DELETE' then
      raise exception 'Questa scadenza aziendale è fissa e non si può eliminare.';
    end if;
    if not coalesce((new.dati->>'fisso')::boolean, false) then
      new.dati := new.dati || '{"fisso": true}'::jsonb;
    end if;
    return new;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists sic_scadenze_fisse on public.sic_docs;
create trigger sic_scadenze_fisse before update or delete on public.sic_docs
  for each row execute function public.sic_scadenze_fisse();
