-- =============================================================
-- Gestionale Kimatic — anagrafiche Articoli e Fornitori (da SAM)
-- Da eseguire una volta nell'SQL Editor di Supabase, dopo 0015_non_conformita.sql
-- =============================================================
-- Le leggono tutti gli utenti attivi (per proporre codici e fornitori nei moduli);
-- le aggiorna l'amministratore (import da SAM).

create extension if not exists pg_trgm;

create table public.articoli (
  codice      text primary key,
  descrizione text not null default '',
  um          text not null default 'PZ'
);
-- ricerca veloce per parte del codice o della descrizione
create index articoli_codice_trgm on public.articoli using gin (codice gin_trgm_ops);
create index articoli_descrizione_trgm on public.articoli using gin (descrizione gin_trgm_ops);

alter table public.articoli enable row level security;
create policy lettura on public.articoli for select to authenticated using (public.utente_attivo());
create policy scrittura on public.articoli for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table public.fornitori (
  codice        text primary key,          -- codice SAM
  nome          text not null,
  dati          jsonb not null default '{}', -- indirizzo, città, provincia, P.IVA, telefono, contatto, pagamento…
  aggiornato_il timestamptz not null default now()
);
create index fornitori_nome_trgm on public.fornitori using gin (nome gin_trgm_ops);

alter table public.fornitori enable row level security;
create policy lettura on public.fornitori for select to authenticated using (public.utente_attivo());
create policy scrittura on public.fornitori for all to authenticated using (public.is_admin()) with check (public.is_admin());
