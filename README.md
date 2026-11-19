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

### Vedi come (amministratori)

In cima a ogni pagina gli amministratori scelgono un ruolo e usano il gestionale con i soli
permessi di quel ruolo, anche nel database (migrazione 0043): menu, moduli, livelli e dati sono
quelli che vede chi ha il ruolo. Le modifiche fatte in simulazione sono vere. «Torna amministratore»
ripristina tutto. Con le regole «solo i propri» contano i record creati dall'amministratore.

### Password dimenticata

Dalla pagina di accesso «Password dimenticata?» manda una mail con il link a `/reimposta`,
dove si sceglie la nuova password (da collegati la stessa pagina serve per cambiarla).
Le mail le spedisce Supabase con la Gmail del gestionale (Authentication → SMTP).

### Utenti cessati

Dal giorno dopo la cessazione nell'Anagrafica dipendenti (o se il dipendente è segnato non attivo)
l'utente con lo stesso nome e cognome è disattivato da solo (migrazione 0044).

## Notifiche

Il database mette in coda le mail (tabella `notifiche`, migrazione 0045): non conformità inserita o
chiusa, rapporto d'intervento firmato, riepilogo mattutino delle scadenze della Sicurezza. Chi le
riceve si sceglie nella pagina **Notifiche** (amministratori). Le spedisce `/api/notifiche` con la
Gmail del gestionale: subito dopo l'evento e ogni mattina (Vercel Cron, `vercel.json`).
Variabili su Vercel: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `SUPABASE_SECRET_KEY`, `CRON_SECRET`.

## Note spese

Modulo **Note spese** (migrazione 0046, al posto di N2F). Ogni nota è legata a un rapporto d'intervento
(la trasferta): il trasfertista fotografa gli scontrini e compila le spese (anche in valuta), poi chiude
la nota → notifica «Nota spese chiusa» → l'Amministrazione la verifica o la rimanda indietro (mail
all'autore). Di default si paga con la carta aziendale (ultime cifre nell'Anagrafica dipendenti, campo
«carta»); carta personale e contanti sono evidenziati come «da rimborsare». Per il carburante si indica
il mezzo aziendale. I totali in euro usano il cambio BCE del giorno della firma del rapporto
(`/api/cambi`, salvati nella tabella `cambi`). Nel «Da fatturare» dei rapporti c'è la colonna Note spese
con il PDF, e l'export Excel ha le righe delle note e il foglio «Note spese».
Lettura automatica degli scontrini (`/api/scontrino`, Claude): con `ANTHROPIC_API_KEY` su Vercel, alla prima
foto si compilano importo, valuta, data, esercente e categoria; le ultime cifre della carta lette sullo
scontrino si confrontano con la carta aziendale.

## Rapporti d'intervento: viaggio di ritorno

Il cliente firma prima che il tecnico riparta, quindi il viaggio di ritorno si compila dopo la firma
(il testo della firma e il PDF lo dicono al cliente). Il rapporto firmato resta bloccato: finché non è
fatturato si può cambiare solo il viaggio di ritorno dell'ultima giornata, con la funzione
`ritorno_rapporto` (migrazione 0059). Per i rapporti firmati da allora (`firma.v = 2`) il ritorno
dell'ultima giornata è fuori dall'impronta SHA-256, quindi il controllo d'integrità resta valido.

## Rapporti d'intervento: fatturazione

La scheda «Da fatturare» ha un permesso a sé, **Fatturazione rapporti d'intervento** (migrazione 0060),
così il Commerciale fattura senza gestire tutto il modulo: Legge = vede coda, importi e listini;
Modifica = compila gli importi e segna fatturato; Gestisce = anche i prezzi dei listini. Di default:
Commerciale Modifica, Amministrazione Gestisce. Chi gestisce Rapporti d'intervento continua a fare tutto.
Il modulo nel menu apre la scheda; per vedere i rapporti serve anche l'accesso a Rapporti d'intervento.
Chi fattura vede anche le note spese chiuse o verificate delle trasferte e ne scarica il PDF con gli
scontrini (migrazione 0061), in sola lettura.

## Mancanti montaggi

Modulo **Mancanti montaggi** (migrazione 0048): i codici ancora da prelevare delle commesse, per commessa,
fornitore e reparto, con note, data prevista, responsabile e priorità che restano tra un aggiornamento e
l'altro; i codici che spariscono dall'estrazione risultano prelevati. Fonte: la vista di SAM
`GSTPIVOT.dbo.EXT_KIMATIC_MATERIALI_DA_PRELEVARE`, mandata dal PC dell'ufficio con
`strumenti/InviaMancanti.ps1` (Utilità di pianificazione: all'accesso e alle 13:00) a `/api/mancanti`
(variabile su Vercel `MANCANTI_TOKEN`), oppure il file Excel caricato a mano dal modulo.

Lo stesso invio manda anche `dbo.KI_ANALISI_COMMESSE_MANCANTI` (celle, ultima lavorazione chiusa, conto
deposito: aggiornano solo le righe esistenti, migrazione 0056) e le fasi delle OP di produzione dei codici
mancanti da `sA1.CS_OP_FASI_LAVORAZIONI` (tabella `mancanti_op`, migrazione 0058). Le note restano
sull'articolo (0054); il conto deposito, le celle (anche per parte del nome) e i fornitori si assegnano a una
persona (0057, tipo `cdep`); i gruppi 21.5… senza figli nel file mostrano la distinta del Controllo di
gestione se c'è (`mancanti_distinte()`). Filtri per commessa, fornitore e persona, liste pronte ed Excel di
quello che si vede.

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
node scripts/test-ritorno.mjs                                    # prova il viaggio di ritorno dopo la firma
node scripts/test-fatturazione.mjs                               # prova il permesso di fatturazione dei rapporti
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
