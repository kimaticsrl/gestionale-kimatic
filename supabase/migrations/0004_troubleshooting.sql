-- =============================================================
-- Gestionale Kimatic — modulo Kimatic Troubleshooting
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0002_rapporti_intervento.sql
-- =============================================================

-- Casi risolti: titolo, macchina, argomento, sintomi, causa, soluzione, foto…
create table public.ts_casi (
  id            text primary key default gen_random_uuid()::text,
  dati          jsonb not null default '{}',
  creato_da     uuid references public.profili(id) on delete set null default auth.uid(),
  creato_il     timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);

create or replace function public.prepara_ts_caso()
returns trigger language plpgsql as $$
begin
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
create trigger prepara before insert or update on public.ts_casi
  for each row execute function public.prepara_ts_caso();

alter table public.ts_casi enable row level security;
create policy lettura on public.ts_casi for select to authenticated using (public.puo('troubleshooting', 'legge'));
create policy inserimento on public.ts_casi for insert to authenticated with check (public.puo('troubleshooting', 'modifica'));
create policy modifica on public.ts_casi for update to authenticated
  using (public.puo('troubleshooting', 'modifica')) with check (public.puo('troubleshooting', 'modifica'));
-- Elimina chi Gestisce, oppure chi ha creato il caso
create policy cancellazione on public.ts_casi for delete to authenticated using (
  public.puo('troubleshooting', 'gestisce')
  or (public.puo('troubleshooting', 'modifica') and creato_da = auth.uid())
);

-- Elenchi di macchine e argomenti
create table public.ts_liste (
  id   text primary key,
  dati jsonb not null default '{}'
);
alter table public.ts_liste enable row level security;
create policy lettura on public.ts_liste for select to authenticated using (public.puo('troubleshooting', 'legge'));
create policy scrittura on public.ts_liste for all to authenticated
  using (public.puo('troubleshooting', 'modifica')) with check (public.puo('troubleshooting', 'modifica'));

-- Storico di creazioni, modifiche e cancellazioni
create trigger storico after insert or update or delete on public.ts_casi
  for each row execute function public.registra_modifica();

-- -------------------------------------------------------------
-- Foto e PDF dei casi: archivio file privato «troubleshooting»
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('troubleshooting', 'troubleshooting', false, 20971520)
on conflict (id) do nothing;

create policy "ts lettura" on storage.objects for select to authenticated
  using (bucket_id = 'troubleshooting' and public.puo('troubleshooting', 'legge'));
create policy "ts caricamento" on storage.objects for insert to authenticated
  with check (bucket_id = 'troubleshooting' and public.puo('troubleshooting', 'modifica'));
create policy "ts cancellazione" on storage.objects for delete to authenticated
  using (bucket_id = 'troubleshooting' and public.puo('troubleshooting', 'modifica'));

update public.moduli set migrato = true where id = 'troubleshooting';
