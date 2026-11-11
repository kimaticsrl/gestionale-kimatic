-- =============================================================
-- Gestionale Kimatic — modulo Anagrafica clienti
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0006_offerte_bmtek.sql
-- =============================================================
-- La tabella «clienti» esiste già (creata con i Rapporti d'intervento): diventa un modulo
-- a sé, con i suoi permessi. Tutti i moduli continuano a leggerla.

insert into public.moduli (id, reparto_id, nome, descrizione, migrato, ordine)
values ('anagrafica-clienti', 'com', 'Anagrafica clienti',
        'Dati, contatti, commesse e matricole dei clienti, con le loro offerte, interventi e casi.', true, 5)
on conflict (id) do nothing;

-- Gestiscono: Direzione, Commerciale, Tecnico service. Consultano: Amministrazione,
-- Ufficio tecnico, Pianificatore. Si possono cambiare dalla pagina Permessi.
insert into public.permessi (ruolo_id, modulo_id, livello) values
  ('direzione',       'anagrafica-clienti', 'gestisce'),
  ('commerciale',     'anagrafica-clienti', 'gestisce'),
  ('tecnico-service', 'anagrafica-clienti', 'gestisce'),
  ('amministrazione', 'anagrafica-clienti', 'legge'),
  ('ufficio-tecnico', 'anagrafica-clienti', 'legge'),
  ('pianificatore',   'anagrafica-clienti', 'legge'),
  ('acquisti',        'anagrafica-clienti', 'nessuno'),
  ('operativo',       'anagrafica-clienti', 'nessuno')
on conflict (ruolo_id, modulo_id) do update set livello = excluded.livello;

-- Chi può modificare i clienti: chi gestisce l'Anagrafica clienti
drop policy if exists scrittura on public.clienti;
create policy scrittura on public.clienti for all to authenticated
  using (public.puo('anagrafica-clienti', 'gestisce')) with check (public.puo('anagrafica-clienti', 'gestisce'));

-- Aggiorna la data di modifica a ogni salvataggio
create or replace function public.prepara_cliente()
returns trigger language plpgsql as $$
begin new.aggiornato_il := now(); return new; end;
$$;
create trigger prepara before insert or update on public.clienti
  for each row execute function public.prepara_cliente();
