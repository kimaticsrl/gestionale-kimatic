-- =============================================================
-- Gestionale Kimatic — Sicurezza: verifiche firmate dall'app, con note e foto
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0034_sicurezza_scadenza_contratto.sql
-- =============================================================
-- Chi vede la Sicurezza (anche solo in lettura, per esempio l'incaricato di un controllo)
-- può registrare una verifica: data, esito, note, firma e foto. Correggere o cancellare
-- le verifiche resta a chi ha Modifica.

-- Archivio privato per firme e foto delle verifiche
insert into storage.buckets (id, name, public, file_size_limit)
values ('sicurezza', 'sicurezza', false, 15728640)
on conflict (id) do nothing;

create policy "sic lettura" on storage.objects for select to authenticated
  using (bucket_id = 'sicurezza' and public.puo('sicurezza', 'legge'));
create policy "sic caricamento" on storage.objects for insert to authenticated
  with check (bucket_id = 'sicurezza' and public.puo('sicurezza', 'legge') and (storage.foldername(name))[1] = 'verifiche');
create policy "sic cancellazione" on storage.objects for delete to authenticated
  using (bucket_id = 'sicurezza' and public.puo('sicurezza', 'modifica'));

-- Registra una verifica e aggiorna ultimo controllo e prossima scadenza della voce aziendale
create or replace function public.sic_registra_verifica(p_id text, p_az text, p_dati jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_az jsonb;
  v_data date := (p_dati->>'data')::date;
  v_mesi int;
begin
  if not public.puo('sicurezza', 'legge') then raise exception 'Non hai accesso alla Sicurezza'; end if;
  select dati into v_az from public.sic_docs where coll = 'azienda' and id = p_az;
  if v_az is null then raise exception 'Voce aziendale non trovata'; end if;
  insert into public.sic_docs (coll, id, dati)
  values ('verifica', p_id, p_dati || jsonb_build_object('az', p_az, 'utente', auth.uid()));
  v_mesi := nullif(v_az->>'mesi', '')::int;
  if v_az->>'ultimo' is null or v_data >= (v_az->>'ultimo')::date then
    update public.sic_docs
       set dati = dati || jsonb_build_object('ultimo', to_char(v_data, 'YYYY-MM-DD'))
                       || case when v_mesi is not null
                               then jsonb_build_object('prossima', to_char(v_data + make_interval(months => v_mesi), 'YYYY-MM-DD'))
                               else '{}'::jsonb end
     where coll = 'azienda' and id = p_az;
  end if;
end;
$$;
revoke all on function public.sic_registra_verifica(text, text, jsonb) from public, anon;
grant execute on function public.sic_registra_verifica(text, text, jsonb) to authenticated;
