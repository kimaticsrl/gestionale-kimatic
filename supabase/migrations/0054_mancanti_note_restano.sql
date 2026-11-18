-- =============================================================
-- Mancanti montaggi: le note restano sull'articolo.
-- Gli aggiornamenti da SAM non toccano mai nota, prevista e "chi lo segue"
-- delle righe esistenti. Se però lo stesso codice della stessa commessa
-- ricompare su una riga nuova (altra OP o matricola, oppure tolto e
-- rimesso in SAM), la riga nuova eredita nota, data della nota, prevista
-- e persona dall'ultima riga di quel codice che le aveva.
-- =============================================================

create index if not exists mancanti_comm_codice on public.mancanti (commessa, codice);

create or replace function public.eredita_nota_mancante()
returns trigger language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if coalesce(new.nota, '') <> '' or new.responsabile is not null or new.prevista is not null then return new; end if;
  select nota, nota_il, prevista, responsabile into v
  from mancanti
  where commessa = new.commessa and codice = new.codice
    and (coalesce(nota, '') <> '' or responsabile is not null or prevista is not null)
  order by (matricola = new.matricola) desc, aperto desc, coalesce(nota_il, aggiornato_il) desc nulls last
  limit 1;
  if found then
    new.nota := v.nota; new.nota_il := v.nota_il; new.prevista := v.prevista; new.responsabile := v.responsabile;
  end if;
  return new;
end;
$$;

drop trigger if exists eredita_nota on public.mancanti;
create trigger eredita_nota before insert on public.mancanti
  for each row execute function public.eredita_nota_mancante();

select 'ok' as note_restano;
