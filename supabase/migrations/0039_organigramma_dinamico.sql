-- =============================================================
-- Gestionale Kimatic — Organigramma della sicurezza costruito dai dati
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0038_tesserino_da_anagrafica.sql
-- =============================================================
-- Figure (datore di lavoro, RSPP, medico competente, RLS, dirigente, preposti, addetti):
--   dagli incarichi di «Sicurezza e formazione» (sic_docs, coll 'incarico').
-- Lavoratori: dipendenti in forza dell'Anagrafica dipendenti, raggruppati per reparto.
-- Il reparto dell'organigramma (più dettagliato del centro di costo) sta in sic_docs, coll 'org',
-- id = id del dipendente; chi non ce l'ha usa il centro di costo.

create or replace function public.organigramma_dati()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.puo('organigramma-sicurezza', 'legge') then null else jsonb_build_object(
    'dipendenti', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.dati ->> 'nome', 'cc', d.dati ->> 'cc',
                                          'mansione', d.dati ->> 'mansione', 'reparto', o.dati ->> 'reparto')
                       order by d.dati ->> 'nome')
      from public.dipendenti d
      left join public.sic_docs o on o.coll = 'org' and o.id = d.id
      where d.attivo and (coalesce(d.dati ->> 'scadenza', '') = '' or d.dati ->> 'scadenza' >= to_char(current_date, 'YYYY-MM-DD'))
    ), '[]'::jsonb),
    'incarichi', coalesce((
      select jsonb_agg(jsonb_build_object('ruolo', i.dati ->> 'ruolo', 'dip', i.dati ->> 'dip',
                                          'esterno', i.dati ->> 'esterno', 'note', i.dati ->> 'note'))
      from public.sic_docs i
      where i.coll = 'incarico' and i.dati ->> 'ruolo' in ('dl', 'rspp', 'mc', 'rls', 'dirs', 'prep', 'ps', 'ai')
    ), '[]'::jsonb)
  ) end;
$$;
revoke all on function public.organigramma_dati() from public, anon;
grant execute on function public.organigramma_dati() to authenticated;

-- Cambia il reparto di un dipendente nell'organigramma (chi Gestisce il modulo). Vuoto = centro di costo.
create or replace function public.organigramma_reparto(p_dip text, p_reparto text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.puo('organigramma-sicurezza', 'gestisce') then
    raise exception 'Serve il livello Gestisce sull''Organigramma della sicurezza';
  end if;
  if coalesce(trim(p_reparto), '') = '' then
    delete from public.sic_docs where coll = 'org' and id = p_dip;
  else
    insert into public.sic_docs (coll, id, dati) values ('org', p_dip, jsonb_build_object('reparto', trim(p_reparto)))
    on conflict (coll, id) do update set dati = excluded.dati;
  end if;
end;
$$;
revoke all on function public.organigramma_reparto(text, text) from public, anon;
grant execute on function public.organigramma_reparto(text, text) to authenticated;

-- ---------- Foto dei dipendenti ----------
-- La foto per il tesserino (tabella «tesserini», id = id del dipendente) si carica anche dall'Anagrafica dipendenti.
drop policy if exists lettura on public.tesserini;
drop policy if exists scrittura on public.tesserini;
create policy lettura on public.tesserini for select to authenticated
  using (public.puo('tesserino-trasferta', 'legge') or public.puo('anagrafica-dipendenti', 'legge'));
create policy scrittura on public.tesserini for all to authenticated
  using (public.puo('tesserino-trasferta', 'modifica') or public.puo('anagrafica-dipendenti', 'modifica'))
  with check (public.puo('tesserino-trasferta', 'modifica') or public.puo('anagrafica-dipendenti', 'modifica'));

-- ---------- Reparti dell'organigramma (dalla versione precedente, con le correzioni del 17/11/2026) ----------
insert into public.sic_docs (coll, id, dati)
select 'org', d.id, jsonb_build_object('reparto', v.reparto)
from (values
  ('1b5baf0e-5f17-497f-9cdc-e1851a23c8d9', 'Amministrazione'),        -- Balboni Barbara
  ('b143c35c-a2ca-4b88-b6e7-9605a1f4fb76', 'Commerciale'),            -- Farinella Erika
  ('2fd4a319-16a1-4f65-8ed0-0d2488b6ee32', 'Commerciale'),            -- Passerini Sofia
  ('f36f5be9-aef3-4aaf-acee-fc574a7794a7', 'Commerciale'),            -- Lodi Veronica
  ('b6e6cf18-2aec-4704-bde5-9b876b99d491', 'Acquisti e logistica'),   -- Bartolini Sara
  ('6b15f695-21b5-43df-9fdb-3bb215b90885', 'Acquisti e logistica'),   -- Sabbi Leonardo
  ('9fe75a08-1409-477e-8c52-d2461be2195b', 'Acquisti e logistica'),   -- Zanetti Benedetta
  ('8a7a26ef-1ec1-455b-8afd-203e8bfb1a14', 'Acquisti e logistica'),   -- Bartolini Giorgio
  ('da514948-0e9d-49a1-bbfb-ea393285187e', 'Acquisti e logistica'),   -- Ferrari Marcello
  ('b9fafa07-68dc-4ab6-b541-19cc8de3615f', 'Acquisti e logistica'),   -- Di Benedetto Silvia
  ('af26d46d-9fde-4b3b-9561-3a1ef0fd07fc', 'Ufficio tecnico'),        -- Ruffo Francesco Maria
  ('ddb51b82-7a66-4aa5-b84c-54eca6eae510', 'Ufficio tecnico'),        -- Sarti Federico
  ('0793ec8d-e685-4d89-9513-0a31a7289a19', 'Ufficio tecnico'),        -- Bergamini Alessandro
  ('402e9562-cc95-47ca-99b4-f1e073bbab2b', 'Produzione — tornitura e fresatura'), -- De Falco Alessandro
  ('288c1919-15e5-429c-a08f-1b3834624524', 'Produzione — tornitura e fresatura'), -- Facchini Massimo
  ('7389c092-0d08-4c5c-8145-0fff8b67db06', 'Produzione — tornitura e fresatura'), -- Palacios Huaman Bikri Josue'
  ('0e0a0df7-702a-462d-bfce-f781b497bf7f', 'Produzione — tornitura e fresatura'), -- Lelli Andrea
  ('9c51646d-d74e-4313-9df6-1bae8782992a', 'Produzione — tornitura e fresatura'), -- Morotti Massimo (somministrato, officina)
  ('53930604-ebd5-4f6d-898c-05cfca7db318', 'Montaggio e cablaggio'),  -- Ghelli Tommaso
  ('9b8ff64c-0413-4391-9c29-d654878286c0', 'Montaggio e cablaggio'),  -- Halungescu Gheorghe
  ('42291cb8-0b37-4a70-abca-3e0e824fb7a0', 'Montaggio e cablaggio'),  -- Pingaro Vittorio
  ('940e0efa-571e-4396-938b-4e9a0db4e9c8', 'Montaggio e cablaggio'),  -- Tinarelli Maurizio
  ('48bf4570-dbe0-4d97-bdf4-5c991bb854dc', 'Montaggio e cablaggio'),  -- Gnudi Simone
  ('42902f77-cf3b-4b3f-be98-2ddb7a1f7da9', 'Collaudo e service'),     -- Cavazza Niccolò
  ('2fdce380-6f9b-4017-b8da-556c88a9f895', 'Collaudo e service'),     -- Monti Massimo
  ('53e5c466-5bc5-4eab-9275-ce4a9469aafc', 'Collaudo e service'),     -- Minghetti Alessio
  ('268d60e9-f5df-480d-8896-351f578bdeee', 'Controllo qualità'),      -- Ibrahimi Arlind
  ('3e85e53e-b1fd-4a1e-8295-6d884010d5fd', 'Controllo qualità'),      -- Bernasconi Edoardo
  ('2a870539-f647-4a76-8b5f-890c89a6dcdd', 'Magazzino'),              -- Morelli Simone
  ('75305553-ac41-4365-85a1-f791448aa2b4', 'Magazzino'),              -- Gadani Andrea
  ('4ad1db11-dc4e-4e1f-8eba-4bba599a61e2', 'Magazzino')               -- Sanna Yuri
) as v(id, reparto)
join public.dipendenti d on d.id = v.id
on conflict (coll, id) do nothing;

-- ---------- Dirigente e preposti in «Sicurezza e formazione» (se non ci sono già) ----------
insert into public.sic_docs (coll, id, dati)
select 'incarico', gen_random_uuid()::text, jsonb_build_object('ruolo', v.ruolo, 'dip', v.dip, 'note', v.note)
from (values
  ('dirs', '04b19138-0405-4d88-8726-04c2a7b9d6d2', 'Direttore'),                        -- Greiner Matthias
  ('prep', '91428dc2-ca48-46d4-b729-b936823b2d3d', 'Responsabile produzione'),          -- Amadori Andrea
  ('prep', '1be22f05-73ed-450a-90fe-9ac336e5fc28', 'Responsabile ufficio tecnico'),     -- Bianchi Luca
  ('prep', '9a311d49-deb9-4c9a-92b5-f155810d13a3', 'Responsabile collaudo')             -- Roveri Giulio
) as v(ruolo, dip, note)
where exists (select 1 from public.dipendenti d where d.id = v.dip)
  and not exists (select 1 from public.sic_docs s where s.coll = 'incarico'
                  and s.dati ->> 'ruolo' = v.ruolo and s.dati ->> 'dip' = v.dip);

select d.dati ->> 'nome' as dipendente, coalesce(o.dati ->> 'reparto', '— da assegnare —') as reparto_organigramma
from public.dipendenti d left join public.sic_docs o on o.coll = 'org' and o.id = d.id
where d.attivo and (coalesce(d.dati ->> 'scadenza', '') = '' or d.dati ->> 'scadenza' >= to_char(current_date, 'YYYY-MM-DD'))
order by 2, 1;
