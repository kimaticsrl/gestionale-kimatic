-- =============================================================
-- Gestionale Kimatic — modulo Lettere d'impegno
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0010_registro_modifiche.sql
-- =============================================================

-- Impostazioni dei moduli (per ora: i minimi tabellari delle Lettere d'impegno).
-- id = '<modulo>/<nome>'. Le legge chi ha accesso al modulo, le cambia chi lo Gestisce.
create table public.impostazioni (
  id            text primary key,
  modulo_id     text not null references public.moduli(id) on delete cascade,
  dati          jsonb not null default '{}',
  aggiornato_il timestamptz not null default now(),
  aggiornato_da uuid default auth.uid()
);
alter table public.impostazioni enable row level security;
create policy lettura on public.impostazioni for select to authenticated using (public.puo(modulo_id, 'legge'));
create policy scrittura on public.impostazioni for all to authenticated
  using (public.puo(modulo_id, 'gestisce')) with check (public.puo(modulo_id, 'gestisce'));
create trigger storico after insert or update or delete on public.impostazioni
  for each row execute function public.registra_sessione();

update public.moduli set migrato = true where id = 'lettere-impegno';
