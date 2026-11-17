-- =============================================================
-- Gestionale Kimatic — Sicurezza: scadenze aziendali eliminabili solo da chi gestisce
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0035 (si può rieseguire).
-- =============================================================
-- Chi ha il livello «modifica» può creare e cambiare le scadenze aziendali ma non eliminarle:
-- l'eliminazione è riservata a chi ha «gestisce» sul modulo Sicurezza.

create or replace function public.sic_scadenze_fisse()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.coll = 'azienda' and not public.puo('sicurezza', 'gestisce') then
    raise exception 'Le scadenze aziendali le può eliminare solo chi gestisce il modulo Sicurezza.';
  end if;
  return old;
end $$;

drop trigger if exists sic_scadenze_fisse on public.sic_docs;
create trigger sic_scadenze_fisse before delete on public.sic_docs
  for each row execute function public.sic_scadenze_fisse();
