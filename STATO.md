# Dove siamo arrivati — Wesion

*Ultimo aggiornamento: 27/08/2026.*

Se apri questo progetto adesso, **leggi solo questo file**. Dice cos'è, a che punto è,
e le cose non ovvie che altrimenti ti costano un'ora ciascuna.

---

## 1. Cos'è

**Wesion** — *WE* di myWEbby + *vision*, la visione d'insieme. È la regia unica che
sostituisce tre strumenti separati:

| Strumento vecchio | Cosa portava | Dove sta |
|---|---|---|
| `leadgen-italia` | scraping Apify, audit AI dei siti | `SOFTWARE/MyWeClienti/leadgen-italia` |
| `mywebby-automations` | router WhatsApp, menù del giorno, GBP | root dei progetti |
| `gbp-autoposter` | piano editoriale, post e articoli, spie | `SOFTWARE/gbp-autoposter` |

**I vecchi girano ancora e non li abbiamo toccati.** Wesion cresce accanto, non sopra.

## 2. L'idea che regge tutto

I tre strumenti facevano **la stessa cosa con tre ingressi diversi**: prendono dei fatti
veri su un'azienda, li trasformano in un messaggio per una persona, e aspettano che un
umano dica di sì.

```
fatto → voce → bozza → controllo → APPROVAZIONE UMANA → pubblicazione
```

Cambia solo da dove entra il fatto (foto della lavagna / audit del sito / piano del mese)
e da dove arriva il sì (un `SI` su WhatsApp / un click in dashboard).

**Il premio:** l'azienda è **una riga sola che cambia stato**. Il ristorante scrapato a
Vigevano diventa il cliente di cui pubblichi il menù cambiando `stato`, non ricopiando
fra due database.

## 3. Come si accende

```
npm run dev        →  http://localhost:3000
npm run db:schema  →  applica db/schema.sql (idempotente)
npm run db:migra   →  travasa leadgen.* -> wesion.* (idempotente)
npm run db:conta   →  CONFRONTA i numeri fra i due schemi
npm run astryx -- component <Nome>   →  documentazione del design system
```

⚠️ La porta 3000 è occupata anche da `gbp-autoposter` e dal gestionale clienti:
finché convivono, uno dei tre va spostato.

## 4. Il database

Un solo Neon, **quello europeo** (`eu-central-1`), schema `wesion`, 14 tabelle.
Il Neon americano di `mywebby-automations` è stato abbandonato di proposito.

Stato al 25/08/2026: **46 aziende, 125 contatti, 4 audit, 1 campagna**, migrati da
`leadgen.*` con i conteggi verificati da entrambe le parti.

`leadgen.*` **non è stata cancellata**: se qualcosa non torna, la verità è ancora lì.

### Le tre scelte di schema che contano

**Il Place ID di Google è la chiave.** Prima c'erano due chiavi incompatibili —
`UNIQUE(nome,città,telefono)` in leadgen e `UNIQUE(telefono)` nel router — che
disaccordavano in silenzio: un locale con due numeri era un lead di là e due di qua;
due locali con lo stesso centralino erano due di là e **uno solo** di qua, col secondo
che sovrascriveva il primo. Il Place ID identifica *il posto*, non un suo attributo.
Tutti e 46 i lead ce l'avevano già, in coda al `maps_url`.

**I contatti sono righe, non colonne.** Costa una JOIN e toglie di mezzo tre casi
speciali: il LID di GOWS diventa un tipo di contatto come gli altri invece di una toppa
nell'array `senders`; un locale può avere fisso, cellulare del titolare e telefono del
figlio; e il numero smette di essere l'identità dell'azienda.

**`bozza` è il ponte fra Contabo e Oracle.** Contabo non può chiamare il router, che sta
su `172.17.0.1` e non è raggiungibile da internet — ed è una difesa già pagata. Quindi
non si chiamano: la dashboard scrive `stato='approvata'`, il router legge, con un indice
parziale proprio su quello stato. **Nessuna porta nuova su Oracle.**

## 5. Le cinque cose che ti farebbero perdere un'ora

### 5.1 Non serve nessun compilatore StyleX — finché non scrivi StyleX tu

I componenti Astryx arrivano **già compilati**. Ma se fai `astryx swizzle` o scrivi un
tuo `stylex.create()`, ti serve il compilatore, e su Next App Router **il plugin Babel è
la strada sbagliata**: disabilita SWC e rompe `next/font`. Andrebbe usato
`@stylexswc/nextjs-plugin`.

Sintomo se manca: il componente **si compila e appare senza stile**. Nessun errore.

Per questo Wesion non scrive StyleX: solo props dei componenti. Se un domani serve, si
aggiunge il plugin SWC di proposito, non per sbaglio.

### 5.2 Niente Tailwind, apposta

In `gbp-autoposter` Tailwind e Astryx convivono, ma al prezzo di un ordine di `@layer`
delicato: gli import "nudi" di Astryx stanno fuori da ogni layer e quindi battono
**sempre** le utility, a prescindere dalla specificità. C'è un commento in quel
`globals.css` che racconta quanto è costato capirlo.

Qui il problema non esiste perché lo styling passa solo dalle props.

### 5.3 `Table` non ha il click sulla riga

Cercato `onRowClick`: **non esiste**. L'unico plugin di selezione (`useTableSelection`)
disegna caselle di spunta, che è un'altra interazione. In modalità *children* si potrebbe
mettere `onClick` su `TableRow` (eredita gli attributi HTML), ma si perdono le larghezze
di colonna, che richiederebbero StyleX — vedi 5.1.

Per il master-detail si usa **`List` + `ListItem`**, che hanno `onClick` e `isSelected`
nativi. È anche quello che fa il template `incident-console`, che è l'archetipo giusto
per Wesion (tracker/CRM: righe fitte a filo, zero card, ispettore laterale alla selezione).

### 5.4 Gli import di Astryx non sono dove sembrano

Indovinarli costa un giro di build ciascuno. Quelli che ho sbagliato:

| Sbagliato | Giusto |
|---|---|
| `@astryxdesign/core/LinkProvider` | `@astryxdesign/core/Link` |
| `@astryxdesign/core/Layout` per `HStack`/`VStack` | `@astryxdesign/core/HStack`, `/VStack` |
| `@astryxdesign/core/Text` per `Heading` | `@astryxdesign/core/Heading` |

E due props inventate: `SideNavHeading` vuole `heading`, non `label`; `MetadataListItem`
vuole i `children`, non `value`.

**La regola vera: `npm run astryx -- component <Nome>` prima di scrivere.** L'alias in
`package.json` esiste apposta — quello suggerito dalla documentazione ufficiale punta a
un path che in questa versione non c'è.

### 5.5 TypeScript 7 non va con Next 16

TS 7 è il compilatore nuovo scritto in Go. Next 16.2.10 non lo riconosce e fallisce con
`The "id" argument must be of type string. Received undefined`, dicendo che TypeScript
non è installato mentre è lì. **Serve la 5.x** (qui 5.9.3, come in gbp-autoposter).

## 6. Cosa c'è adesso, cosa manca

Fatto:
- schema `wesion` completo e migrazione verificata
- telaio: `AppShell` + `SideNav`, budget delle regioni fissato
- **elenco aziende** con ricerca, pannello di dettaglio e audit su richiesta
- **consolle bozze** (`/bozze`): la coda di tutto quello che sta per uscire, di
  qualunque tipo, con correzione del testo prima di approvare e ricontrollo degli
  avvisi mentre si scrive
- **pannello spie** (`/spie`): dodici controlli divisi in guasti / silenzi / impianto,
  con `dal` persistito in tabella perché "accesa da tre giorni" e "accesa adesso" sono
  due urgenze diverse
- **audit AI unificato** (`src/lib/audit.ts`): una sola copia, storico invece di
  colonna sovrascritta, e un fallimento non inventa più un punteggio
- **scraper Apify in Node** (`src/lib/apify.ts`): avvio e raccolta separati, identità
  sul Place ID
- **il router WhatsApp** (`router/`): menù del giorno da foto, comandi SI/NO/RIPRISTINA,
  riconoscimento del mittente coi contatti, e il giro che raccoglie le approvazioni
  fatte in dashboard

### Cosa è stato verificato davvero (27/08/2026)

Non "compila": `npm run build` passa, e le nove spie che si possono provare con una
query sono state accese e spente una per una con uno scenario finto dentro una
transazione annullata. Due non si accendevano ed **erano corrette**: quella del menù
perché scatta dalle 11 (prima è presto, la lavagna si scrive tardi), quella della coda
vuota perché l'azienda di prova una bozza in coda ce l'aveva. Provate a parte, si
accendono; e quella del menù si spegne appena arriva la foto.

Non è provato con dati veri, perché dati veri non ce ne sono ancora: il database ha 46
prospect, zero clienti, zero servizi, zero bozze. La prima cosa che li produrrà è il
router.

Aperto, in ordine di quanto scotta:

1. **Provare il router con WAHA vero.** Tutto quello che si può provare senza una
   sessione WhatsApp è provato (sotto c'è cosa); quello che manca è una foto vera di
   una lavagna vera. Il vecchio continua a girare finché non è successo.
2. **Configurare i primi clienti** con `npm run cliente` (vedi §6-quater). Oggi in
   tabella non c'è nessun servizio e nessun titolare, quindi il router non ha niente
   da fare per nessuno.
4. **Il piano editoriale** (`pianoEditoriale.ts`, `pilastri.ts`, `ricorrenze.ts` in
   gbp-autoposter): è quello che crea le bozze `origine='piano'`, cioè l'altro ingresso
   della consolle.
5. **Autenticazione**: la tabella `utente` c'è, la pagina di login no. Finché manca,
   `approvata_da` vale `'dashboard'` — vedi la costante in `api/bozze/[id]/route.ts`.
6. **Nessuna pagina per le campagne**: le rotte `/api/campagne` ci sono e funzionano,
   l'interfaccia per lanciarle no. Oggi si chiamano con `curl`.

## 6-bis. Il router

```
npm run router     # node --experimental-strip-types router/index.ts
```

Gira dove girava il vecchio: sull'host dei container WAHA, in ascolto su `172.17.0.1`
(si cambia con `ROUTER_HOST`/`ROUTER_PORT`). Fa tre cose e basta: ascolta WhatsApp, crea
bozze, e pubblica quello che qualcuno ha approvato. La dashboard, la gestione clienti e
le pagine dei siti di prova che stavano dentro `index.js` non ci sono più: le fa Wesion.

**Condivide il codice con la dashboard, non lo ricopia.** Node esegue i `.ts`
direttamente con `--experimental-strip-types`, quindi `router/` importa
`src/lib/normalizza.ts`, `db.ts`, `waha.ts`, `gbp.ts`, `ocr.ts`, `sito.ts` — gli stessi
file che usa Next. Il prezzo è una regola da rispettare: **dentro `router/` gli import
relativi vanno scritti con l'estensione `.ts`**, e i file di `src/lib` che il router
carica non devono avere import relativi senza estensione. Per questo `waha.ts`, `gbp.ts`,
`ocr.ts` e `sito.ts` non importano niente di relativo, e c'è scritto perché in cima a
ognuno.

### Due comportamenti cambiati di proposito

**Il permesso di pubblicare si dà a mano.** Il router accetta comandi solo dai contatti
con `e_titolare = true`. In `contatto` ci sono anche i 46 numeri raccolti dallo scraper:
senza questo filtro, chiunque di loro potrebbe pubblicare sul sito di qualcun altro
mandando una foto al numero del bot. Un numero riconosciuto ma non abilitato riceve una
risposta che lo dice — non è trattato come uno sconosciuto, o si passa un pomeriggio a
chiedersi perché il bot tace con un numero che in tabella c'è.

**Il bot non risponde più da solo ai lead.** `lead_bot.js` generava la risposta e la
mandava. Adesso l'AI scrive una *bozza* `messaggio_lead` che finisce nella consolle, e
parte solo dopo un'approvazione, come tutto il resto — la regola della casa vale anche
qui. L'avviso di lead caldo agli amministratori invece parte subito: è un messaggio
interno, non esce verso nessun cliente, e il suo valore è tutto nell'arrivare mentre il
prospect ha ancora il telefono in mano.

### Cosa è stato provato davvero

Con un cliente finto seminato e poi cancellato (il database è tornato a 46 aziende e
zero di tutto il resto): segreto mancante → rifiutato; evento non-messaggio → ignorato;
messaggio nostro → ignorato; sconosciuto → registrato come orfano con `azienda_id` nullo;
numero non titolare dello stesso locale → rifiutato con spiegazione; titolare con
messaggio corto → istruzioni; `RIPRISTINA` senza sito → lo dice; `SI` → approva, scrive
lo snapshot *prima*, prova a pubblicare, registra il fallimento onesto e **lascia la
bozza in `approvata`** perché il giro la riprenda.

Verificato anche che le due spie non si contano due volte: dopo un tentativo fallito
`bozze-approvate-ferme` resta a 0 (qualcuno ci ha provato) e `pubblicazioni-fallite`
passa a 1.

Nei messaggi in uscita registrati resta scritto `consegnato: false`, perché WAHA non
girava: il guasto di notifica è **dichiarato invece che silenzioso**, che è il punto 2
del playbook.

**Non provato:** una foto vera che passa dall'OCR, la pubblicazione riuscita verso un
sito o una scheda Google, e la risoluzione di un LID — servono WAHA acceso e un cliente
configurato.

## 6-quater. Preparare un cliente

```bash
npm run cliente -- --mostra                    # chi è configurato adesso
npm run cliente -- --azienda <slug> --mostra   # una sola

npm run cliente -- --azienda trattoria-la-fenice-pavia --cliente \
  --titolare "+39 333 1234567" \
  --sito-url https://lafenice.it/api/menu --sito-segreto SEGRETO \
  --sito-pagina https://lafenice.it/menu \
  --gbp-account 123456789 --gbp-scheda 987654321
```

Servono tre cose, e mancarne una vuol dire un bot che tace o che pubblica nel vuoto:
lo **stato** a `cliente` (le spie dei silenzi ignorano i prospect — un prospect che non
riceve post non è un guasto), un **contatto con `e_titolare`**, e almeno un **servizio
attivo**. Alla fine lo script dice se è pronto e, se non lo è, cosa manca.

**È scritto in `.ts` e non in `.mjs` per un motivo:** importa `normalizzaTelefono` dalla
stessa libreria che usa il router. Se normalizzasse il numero anche solo un po'
diversamente scriverebbe una stringa che il router non ritrova mai, e il sintomo sarebbe
"il bot non mi risponde" su un cliente configurato benissimo. Verificato il 27/08/2026:
un numero scritto `+39 333 1234567` viene riconosciuto sia come `393331234567@c.us` sia
come `00393331234567@c.us`.

**Rifiuta gli id Google non numerici** invece di scriverli. È la classe esatta del guasto
del 21/07/2026, bloccata dove c'è ancora qualcuno che guarda invece che con un 404 di
Google settimane dopo.

> Verificato che configurare un cliente **accende da solo** le spie dei silenzi che lo
> riguardano (`coda-vuota`, `voce-mancante`): non serve ricordarsi di attivarle.

Una pagina in dashboard che faccia lo stesso non c'è ancora: quando arriverà, dovrà
chiamare le stesse funzioni, non riscrivere le query.

## 6-ter. Dove gira, e perché lì

Due immagini, due server. **Non serve nessun fornitore nuovo**: misurato il 27/08/2026,
Oracle ha 162 GB liberi su 193 e 20 GB di RAM disponibili su 23; Contabo 82 GB liberi e
42 GB di RAM. Ci sta dieci volte.

```
su Oracle  (92.4.171.2, ARM aarch64)   docker compose up -d router
su Contabo (167.86.125.210, x86_64)    docker compose up -d dashboard
```

**Il router deve stare su Oracle e non è una preferenza.** Ascolta su `172.17.0.1` —
l'interfaccia docker0 — ed è così che resta raggiungibile dai container WAHA e mai da
internet. Spostarlo altrove vorrebbe dire esporre WAHA: buttare via una difesa già
pagata per risolvere un problema che non abbiamo.

**⚠️ `network_mode: host` sul router non è un dettaglio.** Dentro una rete Docker propria
`127.0.0.1:3006` sarebbe il loopback DEL CONTAINER, non l'host: non è "quasi giusto", è
un altro computer. WAHA non risponderebbe e non si capirebbe perché. Con la rete host
tutto quello che era vero per il processo PM2 di prima resta vero.

**⚠️ L'immagine del router si costruisce SUL SERVER.** Oracle è `aarch64`. Costruirla su
Windows e spedirla darebbe un binario x86 che non parte. `node:22-alpine` è multi-arch,
quindi basta fare il build lì — niente buildx.

### Perché `router/package.json` esiste

Il router importa due cose: `node:http` e `pg`. Ma `npm ci --omit=dev` sul package.json
principale installa comunque tutte le dipendenze di *produzione* della dashboard — Next,
React, Astryx, la sua CLI. **Misurato: 1,45 GB invece di 239 MB.** Su ARM, in fondo a una
connessione, è la differenza fra un deploy e un'attesa. La versione di `pg` va tenuta
uguale a quella del package.json principale: è lo stesso pool, con le stesse regole SSL.

### Provato in locale (27/08/2026)

Immagini costruite e fatte girare davvero: dashboard **311 MB**, le tre pagine rispondono
200 contro il Neon vero; router **239 MB**, `/health` risponde e un webhook viene lavorato
fino alla scrittura in tabella. I dati di prova sono stati cancellati — il database è
tornato a 46 aziende, zero messaggi, zero bozze.

**Non provato:** `network_mode: host` (è solo Linux, in locale su Windows si usa
`npm run router`), e il build su ARM.

### Variabili d'ambiente che servono adesso

Dashboard: `DATABASE_URL` (c'era già), `OPENROUTER_API_KEY` (audit e OCR),
`APIFY_API_TOKEN` e `APIFY_ACTOR_ID` (scraper, il secondo ha come valore di scorta
`compass~crawler-google-places`).

Router, in più: `WAHA_BASE`, `WAHA_API_KEY`, `WAHA_SESSION`, `ROUTER_SECRET`,
`MEDIA_UPLOAD_URL` e `MEDIA_UPLOAD_TOKEN` (la foto per il post di Google),
`GBP_CLIENT_ID` / `GBP_CLIENT_SECRET` / `GBP_REFRESH_TOKEN` (il refresh token è **uno
d'agenzia** e copre tutte le schede: sta solo qui), `NUMERI_AMMINISTRATORI` per gli
avvisi di lead caldo. Facoltative: `ROUTER_HOST`, `ROUTER_PORT`, `DRAFT_TTL_MINUTES`
(15), `MAX_ITEMS` (12), `SECONDI_GIRO` (30).

## 7. Il tono, se devi scrivere codice qui

Come in `gbp-autoposter`: i commenti non dicono *cosa* fa il codice — quello si legge —
ma **perché è così**, citando il giorno in cui la strada sbagliata è costata qualcosa.
Fra tre mesi il *cosa* si ricostruisce in dieci minuti, il *perché* no.

Il codice è in italiano, nomi compresi. Mantienilo.
