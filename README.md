# Gestionale Kimatic

Gestionale aziendale di Kimatic Srl: login con email aziendale, ruoli e permessi per modulo.

- **Sito**: Next.js, pubblicato su Vercel
- **Database e login**: Supabase (regione West EU, Parigi)
- **Permessi**: tabella `permessi` (ruolo × modulo × livello), applicata dal database con Row Level Security.
  Si modificano dalla pagina **Permessi** del gestionale, riservata agli amministratori.

## Livelli

| Livello | Cosa permette |
| --- | --- |
| Gestisce | Vede, modifica, cancella, configura il modulo e vede lo storico |
| Modifica | Vede e inserisce o modifica i dati |
| Legge | Vede i dati senza modificarli |
| — | Il modulo non compare e i dati non arrivano |

Chi ha più ruoli ottiene il livello più alto. Gli amministratori gestiscono tutto.

## Accesso

Solo gli indirizzi invitati da un amministratore (pagina **Utenti**) possono registrarsi:
la prima volta si entra da «Primo accesso» e si sceglie una password.

## Prima installazione

1. Supabase → SQL Editor: eseguire in ordine i file in `supabase/migrations/`.
2. Supabase → Authentication → Sign In / Providers → Email: disattivare «Confirm email».
3. Vercel: importare il repository e impostare le variabili di `.env.example`.

## Sviluppo

```bash
cp .env.example .env.local
npm install
npm run dev
node scripts/test-schema.mjs supabase/migrations/0001_base.sql   # prova le regole di accesso
node scripts/test-rapporti.mjs                                   # prova le regole dei Rapporti d'intervento
```

## Moduli migrati

| Modulo | Pagina | Note |
| --- | --- | --- |
| Rapporti d'intervento | `/moduli/rapporti-intervento` | Il Tecnico service vede e modifica solo i propri rapporti; dopo la firma del cliente il rapporto è bloccato (solo chi Gestisce lo riapre). La fatturazione e l'anagrafica clienti sono di chi Gestisce. |
| Kimatic Troubleshooting | `/moduli/troubleshooting` | Foto e PDF nell'archivio file privato `troubleshooting` di Supabase. Elimina un caso chi Gestisce o chi l'ha creato. Import da email/WhatsApp e traduzione automatica non ancora attivi (richiedono Claude via API). |
