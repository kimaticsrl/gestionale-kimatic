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
| Rapporti d'intervento | `/moduli/rapporti-intervento` | Il Tecnico service vede e modifica solo i rapporti creati da lui o in cui è scritto il suo nome tra i «Tecnici BMTEK» (migrazione 0041); dopo la firma del cliente il rapporto è bloccato (solo chi Gestisce lo riapre). La fatturazione e l'anagrafica clienti sono di chi Gestisce; listini assistenza e importi addebitati li legge solo chi Gestisce (migrazione 0042). |
| Kimatic Troubleshooting | `/moduli/troubleshooting` | Foto e PDF nell'archivio file privato `troubleshooting` di Supabase. Elimina un caso chi Gestisce o chi l'ha creato. Import da email/WhatsApp e traduzione automatica non ancora attivi (richiedono Claude via API). |
| Offerte BMTEK | `/moduli/offerte-bmtek` | L'app originale gira in un riquadro (`/bmtek/index.html`); `src/moduli/offerte-bmtek/shim.js` le fornisce dati (tabella `bm_docs`), utente e download. I file (listino, descrizioni, immagini, modelli Word) sono in `privato/bmtek/` e si scaricano solo con accesso al modulo. **Da fare:** i costi arrivano ancora al browser di chi ha accesso al modulo (l'app li nasconde a schermo a chi non Gestisce); fase 2 = calcolo prezzi sul server. |
| Anagrafica clienti | `/moduli/anagrafica-clienti` | Tabella `clienti` condivisa; la modifica chi Gestisce il modulo (anche dalla scheda Clienti dei Rapporti). Mostra offerte, rapporti e casi collegati per nome. |
| Rateizzazioni fiscali | `/moduli/rateizzazioni` | La pagina originale gira in un riquadro (`/pagine/rateizzazioni/index.html`); piani nella tabella `rt_docs`. I dati di claude.ai si portano con **Backup** (claude.ai) → **Ripristina backup** (gestionale). |
| Piano di rientro fornitori | `/moduli/rientro-fornitori` | Riquadro (`/pagine/rientro-fornitori/index.html`); fornitori e impostazioni nella tabella `rf_docs`. Stesso passaggio dei dati con Backup → Ripristina backup. |
| Tesserino trasferta | `/moduli/tesserino-trasferta` | Riquadro; i dipendenti in forza arrivano dall'Anagrafica dipendenti tramite la funzione `tesserino_dipendenti()` (solo i dati da stampare, niente RAL o contatti). La foto di ognuno sta nella tabella `tesserini` (id = id del dipendente) e si carica anche dalla scheda del dipendente in Anagrafica. Lo usano Operativi e Tecnici service (Modifica). |
| Organigramma della sicurezza | `/moduli/organigramma-sicurezza` | Costruito dai dati (funzione `organigramma_dati()`): figure dagli incarichi di Sicurezza e formazione, lavoratori in forza dall'Anagrafica dipendenti. Il reparto nell'organigramma sta in `sic_docs` (coll `org`) e lo cambia chi Gestisce («Cambia reparti»); senza, vale il centro di costo. PDF scaricabile (jsPDF). |

## Loghi

I loghi Kimatic e BMTEK si servono da `/logo/kimatic` e `/logo/bmtek` (route pubblica): se un amministratore ne ha caricato uno dalla pagina **Loghi** (tabella `loghi`, migrazione 0040) si usa quello, altrimenti l'originale in `public/`. I loghi dentro i modelli Word (Offerte BMTEK, Lettere d'impegno) restano quelli dei modelli.
