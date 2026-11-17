-- =============================================================
-- Gestionale Kimatic — loghi caricabili (Kimatic e BMTEK)
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0039_organigramma_dinamico.sql
-- =============================================================
-- Un logo per riga (id 'kimatic' o 'bmtek'), salvato come immagine in base64.
-- Lo legge chiunque, anche dalla pagina di accesso (i loghi non sono riservati);
-- lo cambiano solo gli amministratori dalla pagina «Loghi». Senza riga vale il logo originale.
create table if not exists public.loghi (
  id            text primary key check (id in ('kimatic', 'bmtek')),
  tipo          text not null,              -- 'image/png' o 'image/jpeg'
  dati          text not null,              -- immagine in base64 (senza il prefisso data:)
  aggiornato_il timestamptz not null default now(),
  aggiornato_da uuid default auth.uid()
);
alter table public.loghi enable row level security;
drop policy if exists lettura on public.loghi;
drop policy if exists scrittura on public.loghi;
create policy lettura on public.loghi for select to anon, authenticated using (true);
create policy scrittura on public.loghi for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.loghi to anon;
