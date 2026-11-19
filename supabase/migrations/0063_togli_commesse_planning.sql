-- =============================================================
-- Tolto il modulo «Commesse e planning»: era il Piano produzione ridotto
-- alle schede «File commesse Kimatic» e «Planning giornaliero», e tutti i
-- ruoli che lo vedevano hanno già il Piano produzione, tranne
-- «Magazzino e controllo qualità», che ora ha «Modifica» sul Piano
-- (come aveva su «Commesse e planning»). I dati non cambiano: sono del Piano.
-- =============================================================

insert into public.permessi (ruolo_id, modulo_id, livello)
values ('magazzino-qualita', 'piano-produzione', 'modifica')
on conflict (ruolo_id, modulo_id) do update
  set livello = case when public.permessi.livello in ('nessuno', 'legge') then 'modifica'::public.livello else public.permessi.livello end;

-- I dati del Piano: chi ha il Piano produzione o il Controllo di gestione
drop policy if exists lettura on public.pp_docs;
create policy lettura on public.pp_docs for select to authenticated
  using (public.puo('piano-produzione', 'legge') or public.puo('controllo-gestione', 'legge'));

-- Toglie la tessera e i suoi permessi
delete from public.moduli where id = 'commesse-planning';
