# Dove siamo arrivati — Wesion

*Ultimo aggiornamento: 01/09/2026. Il commit più recente è ancora quello del
30/08 (`docs(blog)`) — tutto quello che segue in §0.1 è nella working tree,
non ancora committato.*

Se apri questo progetto adesso, **leggi solo questo file**.

---

## 0. In due righe

Wesion sostituisce `leadgen-italia`, `mywebby-automations` e `gbp-autoposter` con un
programma solo. **Il software e' completo**: campagna -> lead -> audit -> cliente -> voce ->
piano -> testi -> approvazione -> pubblicazione. **Niente e' deployato e niente e' mai
uscito davvero** (`pubblicazioni: 0`). I tre vecchi girano ancora, intatti.

```
npm run dev      ->  http://localhost:3015   (NON 3000: quella e' di gbp-autoposter)
npm run router   ->  il router WhatsApp, su 172.17.0.1:3010
npm run cliente  ->  prepara un cliente da riga di comando
npm run utente   ->  crea un accesso alla dashboard
```

## 0.1 Cosa è cambiato dal 27/08 (non ancora committato)

Due giornate di lavoro che questo file non raccontava ancora.

**Il 31/08**, provando a inserire MyWebby stessa come cliente per un primo test
vero, si è visto che un'azienda nasceva SOLO dallo scraper Apify — nessun modo
di aggiungerne una a mano. Da lì:

- **Anagrafica manuale** (`src/lib/anagrafica.ts`, `ModuloAzienda.tsx`,
  `POST/PATCH /api/aziende`): crea e corregge un'azienda dalla dashboard,
  Place ID come identità anche qui (stesso principio di §9).
- **Pubblicazione su WordPress**, non solo sul contratto Astro di
  `CONTRATTO-SITO.md`: un cliente col sito già fatto (WordPress) può ricevere
  articoli via REST API + password per applicazioni, senza toccare il suo
  sito. `src/lib/sito.ts` smista in base a `servizio.blog.config.tipo`.
- **Azioni in blocco** sull'elenco aziende (elimina/archivia righe spuntate,
  elimina un gruppo intero) — proteggono chi ha già lavoro dentro.
- **Bug corretto in audit**: la dashboard mostrava la prosa del modello sotto
  l'etichetta "cosa si è visto", buttando via la scansione deterministica
  (viewport, form...). Aggiunta la colonna `audit.scansione` per tenerle separate.
- **Tema "gothic"** al posto del neutro di Astryx (`src/tema/`): la scelta del
  punto 8 qui sotto è stata presa — scuro, blu-grigi profondi, palette
  semantica alzata di saturazione perché sull'elenco aziende i badge di stato
  si confondevano tutti nello stesso beige.

**Il 01/09** (login e primo giro su "Spie", con MyWebby come primo caso vero):

- **Login rifatto**: split-screen (il modulo a sinistra, la catena
  fatto→voce→bozza→approvazione→pubblicazione a destra), il logo vero di
  MyWebby al posto di una scritta, occhiolino mostra/nascondi password,
  "ricordami" con sessione di 30 giorni invece delle 12 ore di sempre.
  Corretto anche un bug vero nel farlo: i font del tema (`Fustat`,
  `Manufacturing Consent`) erano dichiarati ma mai caricati da nessuna parte —
  ora via `next/font/google`, in tutta l'app, non solo nel login.
- **Il logout non esisteva.** `DELETE /api/entra` c'era da quando c'è il
  login, ma senza un bottone da nessuna parte: chi entrava non poteva uscire.
  Ora è nel `Telaio`, sempre visibile.
- **L'atterraggio è "Da fare" (`/insights`), non più "Aziende".** Chi entra
  vedeva 78 righe di lead senza un rigo di contesto. `/insights` è già "cosa
  faccio adesso" con un numero e un link; sopra ha anche la catena come mappa
  muta, per chi non sa ancora cosa vuol dire "bozza" o "approvazione".
- **"Pubblicazioni recenti" dentro `/spie`.** La tabella `pubblicazione`
  esisteva da sempre ma non aveva mai uno schermo: per vederla per intero
  bisognava aprire il database a mano (è successo, cercando un guasto vero su
  MyWebby — vedi sotto). Non ricontrolla con Google (asincrono: resta legato
  al TODO 1).
- **Ogni spia porta dove si sistema.** Prima erano solo nomi in una lista;
  ora ogni esempio ha un link — alla linguetta Servizi se manca un id Google o
  un servizio è spento, a "Il mese" se la coda è vuota, a `/bozze` se c'è da
  decidere. Corretto anche il contrasto del banner rosso: il testo scuro
  (`--color-text-red`, tarato per i badge) su un fondo diventato più acceso il
  31/08 era sotto la soglia leggibile — ora usa `--color-on-error`.
- **Il primo caso vero**: MyWebby stessa, cliente in tabella (id 82). Un post
  Google approvato il 31/08 non è mai uscito — non un bug, il router non è mai
  stato acceso in questa working tree e il servizio `post_gbp` di MyWebby è
  spento. È il TODO 1, visto dal vivo invece che sulla carta.

## 1. IL TODO, in ordine

### Adesso — sblocca tutto il resto

1. **Provare il router con WAHA vero.** E' l'unica cosa mai vista funzionare end-to-end.
   Serve: copiare le variabili dal `.env` di `mywebby-automations` su Oracle
   (`WAHA_API_KEY`, `MEDIA_UPLOAD_TOKEN`, i tre `GBP_*`) — **copiarle, non rigenerarle**:
   rigenerare il refresh token di Google romperebbe il vecchio router mentre gira.

2. **Il primo endpoint blog su un sito vero.** Il contratto e' in `CONTRATTO-SITO.md`, con
   l'endpoint Astro pronto da incollare. **Farlo per primo su mywebby.it**: se sbagliamo,
   sbagliamo su di noi.

3. **Configurare un cliente vero** dalla sua scheda (`/aziende/[id]`), non in SQL.

### Poi — deploy

4. Router su **Oracle** (ARM: l'immagine si costruisce LI'), dashboard su **Contabo**.
   Dettagli e trappole in §14.

### Quando serve — non blocca

5. **Arricchimento social (FB/IG)**: non fatto perche' serve sapere quali API usa il tuo
   vecchio — token, permessi, se passa da Graph o da scraping. E' una decisione tua.
6. **La chat** e **sync Instagram**: non ho capito che lavoro fanno nel giro quotidiano.
7. **OAuth Google/Facebook dalla dashboard**: oggi il refresh token sta nel `.env`.
   Serve solo per collegare account nuovi senza toccare il server.
8. ~~**Il look**~~ — deciso il 31/08: tema "gothic" (`src/tema/`), scuro con blu-grigi
   profondi. Vedi §0.1. Fonte: `src/tema/gothicTheme.ts` — ricompilare con
   `npm run astryx -- theme build src/tema/gothicTheme.ts` dopo ogni modifica, l'app legge
   il compilato (`gothic.js`/`gothic.css`), non il sorgente.

## 2. Cosa c'e' in tabella adesso

*Numeri veri, contati il 01/09/2026 — non le stime della sera del 27/08.*

| | |
|---|---|
| aziende | 78, di cui **2 clienti** |
| bozze | 37, di cui 36 da approvare |
| audit | 73 · campagne 2 · utenti 1 |
| **pubblicazioni** | **0 — niente e' mai uscito davvero** |

I due clienti sono entrambi di prova, per motivi diversi:

- **Trattoria La Fenice (prova)**, slug `zzz-piano-fenice`: 8 fatti veri, 18 post di
  dicembre + 1 articolo. Serviva a misurare la catena dei generatori (§5).
- **MyWebby** (id 82, slug `mywebby`), aggiunta il 31/08 con l'anagrafica manuale (§0.1):
  17 post Google generati dal piano del mese, un articolo pronto per il blog, un post
  approvato (id 75) mai pubblicato — vedi il TODO 1 e la nota su `post_gbp` spento.
  ⚠️ **Questa NON si cancella**: è il primo caso vero (agenzia su se stessa), non uno
  scarto di misurazione come La Fenice.

La Fenice, quando non serve più, si cancella con:

```sql
DELETE FROM wesion.evento WHERE azienda_id = (SELECT id FROM wesion.azienda WHERE slug='zzz-piano-fenice');
DELETE FROM wesion.azienda WHERE slug='zzz-piano-fenice';
```

⚠️ L'utente `mywebbyit@gmail.com` ha una **password provvisoria** messa da me. Cambiarla:
`PASSWORD='...' npm run utente -- --email mywebbyit@gmail.com`

## 3. Le pagine

| | |
|---|---|
| `/calendario` | **la vista della mattina**: cosa esce questa settimana su tutti i clienti |
| `/campagne` | scraping per citta' e categoria; la riga apre la lista filtrata |
| `/aziende` | l'imbuto: raggruppato per campagna, filtri, Chiama/WhatsApp/Maps, gancio copiabile |
| `/aziende/[id]` | la scheda: chi e', come parla, cosa e' vero, cosa gli facciamo, il mese |
| `/piano` | l'anteprima del mese, e cosa e' gia' programmato |
| `/bozze` | la consolle: si corregge e si approva |
| `/spie` | guasti, silenzi, impianto |
| `/insights` | dove si e' fermato il lavoro |

## 4. Le cose non ovvie, tutte in un posto

**Wesion sta sulla 3015.** La 3000 e' di gbp-autoposter. Mezz'ora di prove e' finita contro
l'applicazione sbagliata: il sintomo era un redirect a `/login` invece che a `/entra`.

**Dentro `router/` gli import relativi vogliono l'estensione `.ts`** — lo esegue Node con
`--experimental-strip-types`, non Next. E i file di `src/lib` che il router carica (`waha`,
`gbp`, `ocr`, `sito`, `db`, `normalizza`, `leggiSito`) non devono avere import relativi
senza estensione, o l'avvio si rompe.

**Mai un backtick dentro un commento SQL** in un template literal: chiude la stringa.
Sbagliato tre volte in un giorno. Il controllo:
`grep -rn '^\s*--.*`' src router --include=*.ts --include=*.tsx`

**`password.ts` e `sessione.ts` sono separati apposta.** Il middleware gira su Edge, dove
`node:crypto` non esiste: importarlo di la' fa fallire la build.

**Le date si confrontano con `giornoRoma()`**, mai con `toISOString().slice(0,10)`: su una
mezzanotte italiana quest'ultimo da' il giorno prima, e le colonne timestamptz tornano come
`Date` e non come stringhe. Insieme facevano dire "non esce niente" a una settimana piena.

**Gli id di Google non si digitano mai**: si leggono da Google (bottone nella scheda). E' la
regola del guasto del 21/07/2026, e la prima versione di quella pagina la violava.

**Il middleware deve escludere ogni path con un'estensione**, non solo `_next/static` e
`_next/image`. Trovato il 01/09/2026: il logo su `/entra` veniva rimandato su se stesso
(redirect a `/entra` da dentro `/entra`) perche' `public/` non era escluso — e proprio chi
non e' ancora entrato e' l'unico che vede quella pagina.

## 5. La catena dei generatori, misurata

| | Tempo | Costo |
|---|---|---|
| `groq/openai/gpt-oss-120b` | **1,4 s** | gratis |
| `groq/qwen/qwen3.6-27b` | ~1 s | gratis — vuole `reasoning_effort: 'none'`, non 'low' |
| `nara/minimax-m3-free` | 8,5 s | gratis — SOLO i modelli `-free`; dipende da un canale Telegram |
| `zai/glm-4.5-air` | 15 s | forfait |
| `openrouter/gemini-2.5-flash` | — | **a consumo**, ultima spiaggia + OCR |

Scartati col motivo: `glm-4.6` (100 s per una risposta VUOTA), `glm-4.5-flash` (41 s),
`tencent-hy3-free` (vuota), `qwen-3.8-max-free` (41 s), `mimo-v2.5-free` (402).

**Il modello inventa sempre i dettagli di contorno.** Da "farina di un molino di Zinasco" ha
scritto "il grano viene macinato a pietra" e "una crosta di pane". Non e' un errore che un
controllo automatico possa vedere: e' per questo che l'ultimo bottone e' di una persona.

---

## 6. Cos'è Wesion

**Wesion** — *WE* di myWEbby + *vision*, la visione d'insieme. È la regia unica che
sostituisce tre strumenti separati:

| Strumento vecchio | Cosa portava | Dove sta |
|---|---|---|
| `leadgen-italia` | scraping Apify, audit AI dei siti | `SOFTWARE/MyWeClienti/leadgen-italia` |
| `mywebby-automations` | router WhatsApp, menù del giorno, GBP | root dei progetti |
| `gbp-autoposter` | piano editoriale, post e articoli, spie | `SOFTWARE/gbp-autoposter` |

**I vecchi girano ancora e non li abbiamo toccati.** Wesion cresce accanto, non sopra.

## 7. L'idea che regge tutto

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

## 8. Come si accende

```
npm run dev        →  http://localhost:3015
npm run db:schema  →  applica db/schema.sql (idempotente)
npm run db:migra   →  travasa leadgen.* -> wesion.* (idempotente)
npm run db:conta   →  CONFRONTA i numeri fra i due schemi
npm run astryx -- component <Nome>   →  documentazione del design system
```

⚠️ **Wesion sta sulla 3015, non sulla 3000.** La 3000 è di `gbp-autoposter` e del
gestionale clienti, che girano ancora — Wesion è l'ultimo arrivato ed è lui che si
sposta. Non è pignoleria: il 27/08/2026 mezz'ora di prove è finita contro
l'applicazione sbagliata, perché rispondeva sulla porta attesa e *sembrava* la nostra.
Il sintomo era un redirect a `/login` invece che a `/entra`.

## 9. Il database

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

## 10. Le cinque cose che ti farebbero perdere un'ora

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

## 11. Cosa c'è adesso, cosa manca

*Questo capitolo è il dettaglio. Il riassunto in ordine di urgenza è in §1.*

**C'è tutta la catena, dall'inizio alla fine:**

| | |
|---|---|
| trovare | campagne Apify per città e categoria, identità sul Place ID |
| qualificare | audit AI (storico, non colonna sovrascritta) + gancio da leggere al telefono |
| capire chi è | `analizzaVoce`: voce, materiale apprezzato e fatti chiesti separatamente |
| programmare | piano deterministico del mese, 4 a settimana, con `pubblica_at` |
| scrivere | catena di generatori gratis-prima-a-pagamento-dopo |
| controllare | `controlloTesto`: regole + ritiro degli avvisi già giustificati da un fatto |
| **approvare** | consolle bozze, o `SI` su WhatsApp — **sempre una persona** |
| pubblicare | GBP, sito del cliente (contratto), WhatsApp |
| accorgersi | 12 spie, calendario su tutti i clienti, insights |

Anche: login vero (`/entra`, Edge middleware), pagina campagne con la riga cliccabile,
CRUD con protezione di quello che ha lavoro dentro, calendario settimanale, e il router
WhatsApp completo (menù da foto, `SI`/`NO`/`RIPRISTINA`, giro delle approvazioni ogni 30s).

### Cosa è stato verificato davvero

`npm run build` passa. Le nove spie provabili con una query sono state accese e spente una
per una, con uno scenario finto dentro una transazione annullata. Due non si accendevano ed
**erano corrette**: quella del menù scatta dalle 11 (prima è presto, la lavagna si scrive
tardi), quella della coda vuota perché l'azienda di prova una bozza ce l'aveva.

I generatori sono stati misurati uno per uno (§5), e il piano è stato costruito davvero: 18
post di dicembre più un articolo, su un cliente finto, partendo da 8 fatti veri.

### Cosa NON è verificato — ed è la parte che conta

- **il router con WAHA vero.** Mai. Nessuna foto di lavagna vera è mai entrata.
- **una pubblicazione vera.** `pubblicazioni: 0`. Né su GBP, né su un sito.
- **il contratto sito** (`CONTRATTO-SITO.md`) su un sito che esiste.
- **il collaudo intero di fila**, dalla campagna alla pubblicazione, in una volta sola.

### Non costruito, e apposta

Aspettano una decisione di Mariano, non del codice: arricchimento social FB/IG (serve sapere
quali API usa il tool vecchio), la chat, il sync Instagram, l'OAuth Google dalla dashboard.
Vedi §1.

## 12. Il router

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

## 13. Preparare un cliente

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

**Adesso lo si fa anche dalla dashboard**, dalla scheda dell'azienda: la linguetta
«Servizi» attiva i servizi e ci scrive dentro le chiavi. `npm run cliente` resta per il
primo giro e per quando la dashboard non è raggiungibile — le due strade chiamano le
stesse funzioni, apposta: una configurazione fatta da una parte non deve poter risultare
diversa dall'altra.

## 14. Dove gira, e perché lì

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

## 15. Il tono, se devi scrivere codice qui

Come in `gbp-autoposter`: i commenti non dicono *cosa* fa il codice — quello si legge —
ma **perché è così**, citando il giorno in cui la strada sbagliata è costata qualcosa.
Fra tre mesi il *cosa* si ricostruisce in dieci minuti, il *perché* no.

Il codice è in italiano, nomi compresi. Mantienilo.
