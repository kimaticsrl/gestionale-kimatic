-- =============================================================
-- Gestionale Kimatic — modulo Catalogo manuali BMTEK
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0018_nc_numerazione.sql
-- =============================================================
-- Catalogo (categorie, lingue, macchine con stato e revisione per lingua) come documenti;
-- i PDF nell'archivio file privato «manuali».

create table public.man_docs (
  coll          text not null,   -- 'config' o 'macchine'
  id            text not null,
  dati          jsonb not null default '{}',
  aggiornato_il timestamptz not null default now(),
  aggiornato_da uuid default auth.uid(),
  primary key (coll, id)
);
create trigger prepara before insert or update on public.man_docs
  for each row execute function public.prepara_bm_doc();

-- Consulta chi ha Legge; aggiunge macchine, lingue e PDF chi ha Modifica
alter table public.man_docs enable row level security;
create policy lettura on public.man_docs for select to authenticated using (public.puo('catalogo-manuali', 'legge'));
create policy scrittura on public.man_docs for all to authenticated
  using (public.puo('catalogo-manuali', 'modifica')) with check (public.puo('catalogo-manuali', 'modifica'));

create trigger storico after insert or update or delete on public.man_docs
  for each row execute function public.registra_sessione();

-- Archivio dei PDF (fino a 50 MB per file)
insert into storage.buckets (id, name, public, file_size_limit)
values ('manuali', 'manuali', false, 52428800)
on conflict (id) do nothing;

create policy "manuali lettura" on storage.objects for select to authenticated
  using (bucket_id = 'manuali' and public.puo('catalogo-manuali', 'legge'));
create policy "manuali caricamento" on storage.objects for insert to authenticated
  with check (bucket_id = 'manuali' and public.puo('catalogo-manuali', 'modifica'));
create policy "manuali cancellazione" on storage.objects for delete to authenticated
  using (bucket_id = 'manuali' and public.puo('catalogo-manuali', 'gestisce'));

update public.moduli set migrato = true where id = 'catalogo-manuali';
