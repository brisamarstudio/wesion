# Dove siamo arrivati — Wesion

*Ultimo aggiornamento: 05/09/2026, sera. **Il TODO 1 è chiuso**: il menù del giorno
è uscito davvero su un sito di un cliente vero, partendo da una foto su WhatsApp —
§0.3. Per arrivarci sono venuti fuori tre guasti che il codice non poteva mostrare
(un firewall mai aperto, la chiave WAHA sbagliata, e il router che si rompeva da solo
imparando un LID): stanno tutti e tre in §0.3, con il motivo per cui erano invisibili.*

Se apri questo progetto adesso, **leggi solo questo file**.

> Questo file dice **com'e' fatto** Wesion. Come si **usa** — pagina per pagina,
> cosa serve a cosa, dove sono le trappole — sta in **`MANUALE.md`**, ed e'
> scritto per chi lo apre in dashboard, non per chi ci mette le mani dentro.
> Quando aggiungi qualcosa che l'operatore vede, aggiorna anche quello.

---

## 0. In due righe

Wesion sostituisce `leadgen-italia`, `mywebby-automations` e `gbp-autoposter` con un
programma solo. **Il software e' completo**: campagna -> lead -> audit -> cliente -> voce ->
piano -> testi -> approvazione -> pubblicazione.

Dal 01/09/2026 **la dashboard e' online** (<https://wesion.mywebby.it>, Contabo dietro
nginx), **il router gira su Oracle**, e — sempre il 01/09 — **il primo post e' uscito
davvero**: vedi §0.2. I tre vecchi girano ancora, intatti.

```
npm run dev      ->  http://localhost:3015   (NON 3000: quella e' di gbp-autoposter)
npm run router   ->  il router WhatsApp, su 172.17.0.1:3010
npm run cliente  ->  prepara un cliente da riga di comando
npm run utente   ->  crea un accesso alla dashboard
```

## 0.3 Il primo menù del giorno vero (05/09/2026, 17:15)

**Il TODO 1 è chiuso.** Trattoria La Fenice: una foto della lavagna mandata al numero
bot su WhatsApp, letta dall'OCR, approvata con un «SI», e nove piatti comparsi sulla
sezione «Pausa Pranzo» di `trattorialafenice.it`. La catena intera, dal telefono alla
pagina pubblica, per la prima volta.

```
foto WhatsApp → WAHA → wesion-router → OCR → «SI» del titolare → sito del cliente
17:14 «Sto leggendo il menù...»   17:15 nove piatti letti   17:15 «MENÙ PUBBLICATO»
```

**Cosa era rotto, e perché nessuno dei tre si vedeva dal codice.** Sulla carta questa
catena era «finita» dal 01/09. In realtà non aveva mai portato un solo messaggio:

| Cosa | Perché non si vedeva |
|---|---|
| **Il firewall non aveva mai aperto la 3011** | C'era una regola scritta a mano per la 3010 (il router vecchio) e nessuna per la 3011. Tutto il resto cadeva nel `REJECT --icmp-host-prohibited`: WAHA riprovava 15 volte e rinunciava, **nei suoi log, che nessuno guardava**. Dal lato di Wesion non arrivava niente e non c'era niente da vedere: un silenzio, non un errore. |
| **La chiave WAHA nel `.env` era quella vecchia** | È il **quinto** consumatore dimenticato dalla rotazione del 29/07 — vedi `04-CHIAVI.md`. Il `.env` del router è stato *copiato* da `mywebby-automations`, che però la chiave la legge a runtime da `waha_instances`: la copia ha preso una variabile che lì dentro non serviva più. Effetto: `401` su ogni chiamata, quindi LID non risolto, foto non scaricabile e **risposte non consegnabili**. Tre sintomi diversi, una causa sola. |
| **Il router si rompeva da solo IMPARANDO il LID** | `imparaLid` scriveva il LID sia in `normalizzato` (giusto: è la chiave con cui si riconosce) sia in `valore` (sbagliato: è l'indirizzo a cui si risponde). Il **primo** messaggio funzionava — il numero era ancora quello risolto al volo — e dal secondo in poi vinceva la riga imparata e ogni risposta falliva. Un bug che si manifesta solo dalla seconda interazione non lo trova nessun test manuale che ne prova una. |

**La lezione, che vale oltre questi tre.** Tutti e tre erano invisibili leggendo il
codice, e tutti e tre fallivano **in silenzio o nei log di qualcun altro**. Li ha
trovati solo il fatto di mandare una foto vera da un telefono vero e pretendere di
vederla comparire su una pagina vera.

**Cosa resta aperto da qui:**

- **`RIPRISTINA` non è mai stato collaudato.** Lo snapshot viene scritto (verificato),
  ma il ritorno indietro non l'abbiamo visto funzionare. È l'unico anello della catena
  ancora mai provato, ed è proprio quello che serve quando l'OCR legge male.
- **Wesion tiene UNA sola `WAHA_API_KEY` nel `.env`**, mentre ogni tenant ha la sua:
  così com'è parla con un container WAHA alla volta. Per più clienti va fatto come fa
  il vecchio router — chiave presa per tenant, non dal `.env`. È la toppa di stasera,
  non la cura.
- **Il numero bot condiviso `weareqr-bot` non è la strada per i clienti veri.** Su
  quel numero rispondono anche l'assistente WeMenuQR e il router vecchio: durante il
  test tre bot rispondevano insieme allo stesso messaggio. Un cliente vero vuole il
  suo numero, collegato solo a Wesion.
- **`post_gbp` di La Fenice è stato spento apposta** per il test: sul sito si torna
  indietro, su Google no (il post va tolto a mano dalla scheda). Riaccenderlo è una
  riga, ma va fatto con un menù del giorno *di oggi* e un cliente che lo sa.

## 0.2 La prima pubblicazione vera (01/09/2026, 15:07)

**`pubblicazioni: 0` non è più vero.** MyWebby, post «Un problema tipico», uscito sulla
scheda Google reale con la sua copertina:

```
approvata in dashboard   15:07:43
uscita su Google         15:07:48      (cinque secondi, un tentativo, esito ok)
localPosts/843509859251901975 · state: PROCESSING · media: PHOTO
```

La catena intera, per la prima volta dall'inizio alla fine: piano del mese → testo
generato da `groq/openai/gpt-oss-120b` → copertina caricata a mano dalla consolle →
**una persona ha detto sì** → router su Oracle → scheda Google.

**Cosa ha rotto questa giornata, in ordine di scoperta.** Sono tutti guasti che il build
non poteva vedere, e che si sono visti solo usando la cosa per davvero:

| Cosa | Perché |
|---|---|
| Il logo dava 404 online | `standalone` di Next non porta `public/` con sé |
| Il compose non si divideva | Compose interpola tutto il file: su Contabo chiedeva `ROUTER_SECRET` |
| Il router partiva senza segreto | La guardia era solo nel compose, non nel programma |
| La spia diceva «il router è fermo» | Le mancava il vincolo su `pubblica_at` che il router invece ha |
| La consolle: 17 righe identiche | Mostrava cliente + tipo + data di *creazione*, uguali per tutto un piano |
| «Choose file» in italiano | Astryx spedisce solo `en`/`fr`: ora c'è `src/tema/it.json` |
| La copertina non si caricava | Alla dashboard mancava `MEDIA_UPLOAD_TOKEN`: caricare non è pubblicare |
| Si poteva approvare l'impossibile | Un articolo verso un blog inesistente: ora il bottone è spento e dice perché |
| Non c'era uno storico | «Cosa abbiamo fatto per questo cliente?» non aveva risposta: ora è una linguetta |

**Cosa resta aperto, e conta:** `state: PROCESSING` vuol dire che Google l'ha accettato ma
lo sta ancora revisionando. **Wesion non ricontrolla mai**: se Google lo respingesse dopo,
resteremmo convinti che sia andata bene. `gbp-autoposter` questa lezione l'ha già pagata —
vedi §14.1.

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

1. ~~**Provare il router con WAHA vero.**~~ — **fatto il 05/09/2026**, vedi §0.3.
   Il menù del giorno e' uscito su un sito di un cliente vero, partendo da una foto
   su WhatsApp. Restava aperto da sempre, ed era l'unica cosa mai vista funzionare
   end-to-end: adesso non lo e' piu'.

2. **Il primo endpoint blog su un sito vero.** Il contratto e' in `CONTRATTO-SITO.md`, con
   l'endpoint Astro pronto da incollare. **Farlo per primo su mywebby.it**: se sbagliamo,
   sbagliamo su di noi.

3. **Configurare un cliente vero** dalla sua scheda (`/aziende/[id]`), non in SQL.

### Adesso — trovati il 05/09/2026, dopo il primo test vero

Il test end-to-end di §0.3 ha lasciato aperte queste. In ordine di quanto mordono
*oggi*, non di gravità teorica. I primi due riguardano solo Google, che per La Fenice
è spenta apposta: **sono la condizione per riaccenderla**.

1b. ⚠️ **I due che bloccano la riaccensione di `post_gbp`.**

   - **Doppio post su Google.** `pubblicaBozza` (`router/pubblica.ts:105-207`) non
     controlla lo stato della bozza e non c'è nessun lucchetto fra le due strade che la
     chiamano: `conferma()` (`index.ts:171`) e il giro dei 30s (`index.ts:482`). La riga
     in `pubblicazione` — quella che impedisce al giro di ripescarla — si scrive **dopo**
     il ritorno della chiamata a Google: se Google è lenta e nel frattempo scatta il tick,
     esce due volte. Stesso esito se il processo muore fra `pubblicaPost` e `segna`.
     Google non deduplica. Sul sito non succede: lì l'azione è `replace`, quindi
     riscrivere è innocuo. **Correzione**: reclamare la bozza con un
     `UPDATE ... SET stato='pubblicando' WHERE id=$1 AND stato='approvata' RETURNING id`
     prima di chiamare le destinazioni.
   - **Pubblicazione parziale mai ritentata.** `uscito = destinazioni.some(esito==='ok')`
     (`pubblica.ts:308`): basta **una** destinazione riuscita perché la bozza diventi
     `pubblicata`, e il giro esclude chi ha già un `ok` qualsiasi (`pubblica.ts:347`).
     Quindi Google riuscita + sito fallito = **il sito resta col menù di ieri per sempre**,
     e nessuno riprova. Il titolare legge «PUBBLICAZIONE PARZIALE» ma *non* si sente dire
     «ce ne occupiamo noi» (quella frase esce solo a fallimento totale) — ed è giusto così,
     perché nessuno se ne sta occupando. **Correzione**: il giro deve guardare «manca un
     `ok` per *quella* destinazione», non per la bozza intera.

2b. **Un numero titolare su due aziende → sceglie sempre la prima, in silenzio.**
   `UNIQUE(azienda_id, tipo, normalizzato)` (`db/schema.sql:66`) impedisce i doppioni
   dentro un'azienda, non fra aziende diverse. `cerca()` fa `ORDER BY e_titolare DESC,
   c.id LIMIT 1` (`riconosci.ts:61-81`): con lo stesso numero titolare su due clienti,
   foto e «SI» del secondo locale pubblicano **sul primo**, senza un errore da nessuna
   parte. Scenario realissimo: un ristoratore con due locali. Vale anche per noi, se si
   registra lo stesso numero su due clienti per provare. **Regola operativa intanto: un
   numero, un cliente.**

3b. **I messaggi di gruppo passano come comandi privati.** `candidati()`
   (`riconosci.ts:44-58`) legge anche `author` e `participant` — che nei gruppi dicono
   *chi ha scritto dentro il gruppo* — e non c'è nessun controllo su `@g.us`. Se il numero
   bot finisse in un gruppo col titolare, un «SI» scritto lì pubblicherebbe davvero.
   **Decisione presa il 05/09: un numero = un bot, i gruppi non si usano mai.** Quindi si
   scarta ogni evento con `from` che finisce in `@g.us`, prima di cercare il mittente.

4b. **`normalizzaTelefono` è ambiguo sui locali che iniziano per «39».**
   `src/lib/normalizza.ts:24-32` decide se anteporre il prefisso guardando se la stringa
   comincia già per `39`: un cellulare il cui numero *nazionale* inizia per 39, scritto
   senza `+`, non viene mai completato — e da WhatsApp arriva invece sempre col prefisso.
   Le due forme non coincidono mai e il titolare **non viene mai riconosciuto, in
   silenzio**. Il modulo della dashboard non mostra il normalizzato calcolato (la CLI sì:
   `db/configura-cliente.ts:161`), quindi non c'è modo di accorgersene compilando.

5b. **Le Spie non controllano `WAHA_API_KEY` né il refresh token di Google.**
   `src/lib/spie.ts` verifica solo `OPENROUTER_API_KEY` (righe 564-600). Se la chiave WAHA
   venisse ruotata di nuovo — è già successo il 29/07 — **si ripeterebbe identico il
   guasto a tre sintomi di §0.3, e lo scoprirebbe il cliente**. È la lezione dell'incidente
   Brace Mia, sullo stesso identico punto. Da fare per primo: è poco codice e chiude un
   buco già costato una volta.

### Adesso — le sezioni del menù (deciso il 05/09, non ancora scritto)

6b. **Un cliente ha più menù, il contratto ne prevede uno solo.** `replace.ts` del sito ha
   `const MENU_CATEGORY_TYPE = 'pranzo'` **fisso**: qualunque foto il router legga finisce
   nella *Pausa Pranzo*. Ma La Fenice ha quattro sezioni (pausa pranzo, venerdì cena,
   sabato cena, domenica pranzo) e manda le foto di tutte; altri clienti ne hanno una sola
   (hamburger, pizze, alla carta). Se Deborah manda «Sabato a Cena», i piatti della cena
   atterrano nel menù del pranzo.

   **Il disegno deciso** — il principio è che il ristoratore non deve imparare niente:
   continua a fotografare e mandare come fa già, solo a un numero diverso. Le scelte a
   valle (quale sezione, se anche su Google, per il ranking) sono nostre e a lui non
   interessano.

   1. le **sezioni sono per cliente**, nella config del servizio `menu_del_giorno`;
   2. l'**OCR restituisce anche la sezione**, scegliendo fra quelle di quel cliente: il
      titolo sta già scritto nella foto («Sabato a Cena», «Domenica a Pranzo»), e il
      modello lo sta già leggendo;
   3. il bot **la dichiara nella conferma** («lo pubblico nella sezione Sabato a Cena»),
      così una sezione sbagliata si ferma prima di uscire — la rete di sicurezza è quella
      che c'è già;
   4. **solo se non capisce**, chiede.

   Fuori da Wesion cambia un file solo: `replace.ts` deve accettare la sezione dalla
   richiesta, con `'pranzo'` come default — così i siti già collegati non si rompono.

### Poi — deploy

4. ~~Router su Oracle, dashboard su Contabo~~ — **fatto il 01/09/2026**, vedi §14.1.

5. **Il blog di mywebby.it: rilascio del SITO, non di Wesion.** ⚠️ Da fare con calma,
   guardandolo — non in coda a un'altra cosa.

   L'endpoint `POST /api/blog` **esiste già** in `SITI/SitoMyWebby/server/routes/blog.js`,
   scritto col contratto giusto (header `x-blog-secret`, e senza segreto è *spento, non
   aperto*). Online però non c'è: `https://mywebby.it/api/blog` risponde **404**, perché il
   container `mywebby-backend:20260718` è fermo al 18 luglio.

   **Perché non l'abbiamo fatto al volo il 01/09:**

   - il lavoro sul blog è **non committato**: `server/routes/blog.js`, `server/paginaBlog.js`,
     `src/pages/blog/ArticoloDinamico.jsx` sono nuovi, e `server/database.js`,
     `server/index.js`, `src/App.jsx`, `src/pages/Blog.jsx` sono modificati;
   - sopra ci sono **12 commit mai deployati** dal 18/07 — prerendering SEO, modifiche a
     **nginx**, portfolio, `llms.txt`, notifiche WhatsApp sui lead;
   - `deploy.sh` di quel progetto avverte in testa che una sua versione precedente
     «avrebbe RIPORTATO INDIETRO IL SITO DI DUE MESI», che il repo è privato e il server
     non ha credenziali git, e che il container fu creato a mano da un'immagine buildata
     altrove.

   Quindi l'ordine è: guardare cosa fanno quei 12 commit → capire se `database.js` vuole
   una migrazione sul DB di produzione → rilasciare → **solo allora** mettere `BLOG_SECRET`
   nel container `mywebby-backend` e incollarlo nella scheda di MyWebby in Wesion.

   > Nota: **Trattoria La Fenice è già collegata e verificata** (01/09/2026). Il suo
   > endpoint è online e il segreto in Wesion è quello vero: `POST` con segreto giusto
   > risponde 400 sul corpo vuoto, con segreto sbagliato 401. Se serve provare la catena
   > del blog prima di sistemare mywebby.it, si prova lì senza rischiare niente.

### Prima che entri altra gente

6. **I ruoli non esistono: chi entra può fare tutto.** ⚠️ Deciso il 01/09/2026 di
   procedere lo stesso — due collaboratori commerciali con accesso pieno — ma è una
   scelta con una data di scadenza, non una conclusione.

   Un accesso oggi permette di: **pubblicare sulle schede Google dei clienti**,
   cancellare **gruppi interi** di aziende, cambiare i segreti dei servizi. A chi fa
   ricerca clienti serve solo Campagne e Aziende: chiamare, segnare com'è andata,
   portare un lead a cliente.

   Il ruolo da fare si chiama **commerciale**: vede Campagne e Aziende, modifica lo stato
   e i contatti, e non vede Bozze/Piano/Servizi. È la stessa regola dell'ultimo bottone,
   applicata a chi lo preme: *chi non deve, non può*. Oggi la protezione è la fiducia, che
   funziona finché qualcuno non clicca «Elimina il gruppo» per sbaglio.

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

## 14.1 Cosa è deployato davvero (01/09/2026)

**Dashboard su Contabo — online e funzionante.**

```
https://wesion.mywebby.it      → nginx (vhost `wesion`) → 127.0.0.1:3020 → container wesion-dashboard
```

Repo su GitHub (`brisamarstudio/wesion`), tre deploy key: una per macchina, e solo
quella del PC di sviluppo scrive. Il codice arriva sui server con `git pull`, l'immagine
si costruisce lì. `/opt/wesion` su Contabo, `~/wesion-app/wesion` su Oracle.

Il `.env` di ciascun server contiene **solo quello che quel server deve poter fare**: su
Contabo non ci sono né `GBP_*` né `WAHA_*`, perché la dashboard non pubblica. Le chiavi di
Oracle sono **copiate** dal `.env` di `mywebby-automations`, che è sulla stessa macchina —
mai rigenerate, o il router vecchio si romperebbe mentre serve sei numeri veri.

**Due cose scoperte deployando, che il build non poteva vedere:**

1. **`public/` non finisce nell'immagine.** L'output `standalone` di Next porta il server e
   i moduli, non i file statici: il logo rispondeva 404 con l'healthcheck verde. Corretto
   nel `Dockerfile` con una `COPY` esplicita.
2. **Il `docker-compose.yml` unico non permetteva quello che dichiarava.** Compose interpola
   tutto il file prima di guardare quale servizio gli hai chiesto, quindi su Contabo
   pretendeva `ROUTER_SECRET`. Ora sono due file, uno per server.

### Come si fa un deploy della dashboard (passo-passo, per non reinventarlo ogni volta)

Non è on-the-fly: Astryx è solo la libreria di componenti React usata scrivendo il
codice, il container gira da `node server.js` (l'output **standalone** di `next build`,
niente `next dev`). Cambiare un file locale non basta finché non lo si builda e non si
riavvia il container.

1. **Push del codice** (dal PC di sviluppo, dove sta la deploy key che scrive):
   ```bash
   git push origin main
   ```
   ⚠️ Se il branch locale è `master` (capita, vedi lo storico), il push va indirizzato
   esplicitamente: `git push origin master:main` — altrimenti si crea un branch `master`
   separato su GitHub che il server non legge mai.

2. **Collegarsi al Contabo.** Niente chiave SSH: password a `root`, presa da
   `WeMenuQR/backup_contabo_v2.py` (costante `PASS`), via paramiko — vedi
   `_MYWEBBY-PLAYBOOK/02-INFRASTRUTTURA.md` per lo snippet Python pronto.

3. **Aggiornare i sorgenti sul server:**
   ```bash
   cd /opt/wesion && git pull
   ```

4. **Ricostruire e riavviare SOLO la dashboard** (il file è mirato: build dal contesto
   `.`, un solo servizio `dashboard` / container `wesion-dashboard`, porta
   `127.0.0.1:3020` — non tocca `mywebby-frontend`, `puntiplus-*` né altro sulla stessa
   macchina):
   ```bash
   cd /opt/wesion && docker compose -f docker-compose.dashboard.yml up -d --build
   ```

5. **Verificare che sia davvero su, non solo "up":**
   ```bash
   docker ps --filter name=wesion-dashboard --format "{{.Status}}"
   wget -qO- -S http://127.0.0.1:3020/entra   # 200 OK atteso — NON /aziende, redirige al login
   ```

   Lo stato deve dire **`healthy`**. Se dice `unhealthy` mentre la dashboard risponde 200,
   guarda `ENV HOSTNAME=0.0.0.0` nel `Dockerfile` prima di cercare altrove: il `server.js`
   standalone di Next si lega a `process.env.HOSTNAME`, che **Docker imposta da solo
   all'ID del container**. Senza quella riga il processo ascolta su `172.22.0.2:3000` e
   basta — dall'host via port mapping funziona tutto, ma il healthcheck chiama
   `127.0.0.1:3000` da dentro e si prende `Connection refused`. Trovato il 02/09/2026 dopo
   cinque ore di `unhealthy` su un container sanissimo. Un healthcheck rotto non sbaglia
   dicendo «sano»: dice «malato» **sempre**, e il giorno che la dashboard muore davvero lo
   stato non cambia e non se ne accorge nessuno — lo stesso danno della riga che dava per
   spento il router mentre girava, qui sotto.

Tutto il ciclo (push → pull → build → verifica) richiede un paio di minuti, quasi tutti
per il build Docker.

**Router su Oracle — ACCESO** (verificato il 02/09/2026: `wesion-router`, up e healthy).

⚠️ Questa riga diceva "container NON avviato" fino al 02/09/2026, quando il router girava
già da un pezzo. Una documentazione che dice spento quello che è acceso è peggio di nessuna
documentazione: fa ragionare su un impianto che non esiste. **Conseguenza pratica, oggi: una
bozza approvata ESCE davvero, entro il giro del router (30 secondi).**

Sotto, com'era la nota di quando non era ancora partito — si tiene perché la ragione per cui
non lo si avviava resta valida ogni volta che si riparte da fermi:

⚠️ **Non è una dimenticanza.** Appena parte, entro 30 secondi fa il primo giro e pubblica
la bozza approvata che sta in coda (MyWebby #75) sulla **scheda Google vera**. Quello è un
bottone che preme una persona, non un deploy.

```bash
# su Oracle, quando si decide di farlo:
cd ~/wesion-app/wesion && docker compose -f docker-compose.router.yml up -d
docker logs -f wesion-router      # "[router] bozza 75: pubblicata" oppure "NON pubblicata"
```

⚠️ **Gira sulla 3011, non sulla 3010.** Sulla 3010 c'è ancora il router vecchio, con sei
container WAHA attaccati. I due convivono: leggono database diversi (Neon europeo contro
quello vecchio), quindi non pubblicano mai la stessa cosa. **I webhook di WAHA puntano
ancora al vecchio**: spostarli è un'operazione a sé, tenant per tenant, e finché non si fa
il router nuovo riceve zero messaggi WhatsApp — fa solo il giro delle pubblicazioni.

## 14.2 L'audit SEO/GEO/AEO automatico (02/09/2026) — **acceso**, tre PR vere

L'idea: Wesion legge Search Console + il repo del sito di un cliente, propone da sola le
correzioni SEO/GEO/AEO (grafo JSON-LD, `llms.txt`, `robots.txt` — regole in
`src/lib/regole-seo.ts`, copiate a mano dal playbook perché quello non arriva sul server),
e apre una Pull Request. **Non pubblica mai da sola**: si ferma alla PR, il merge lo decide
un umano — stessa regola del bottone dell'operatore, applicata al codice invece che a una
bozza GBP. Vedi la nota in cima a `src/lib/seo-git.ts`.

**Cosa c'è:**
- `wesion.sito` (repo_url, gsc_proprieta, ultima_pr_url, ultimo_audit_at, ultimo_errore) —
  compilata da "Modifica" sulla scheda azienda, campi «Repository del sito» e «Property
  Search Console».
- `src/lib/search-console.ts` — legge Search Console con un token OAuth SEPARATO da quello
  di GBP (stesso client id/secret, scope diverso).
- `src/lib/seo-git.ts` — clona il repo (via HTTPS+token, MAI l'alias SSH incollato nel
  campo: si estrae sempre `owner/repo` con una regex), scrive le modifiche, apre la PR via
  API GitHub.
- `POST /api/aziende/[id]/seo-audit` — il giro intero. **Manuale per ora**, non un cron: il
  primo lotto di PR va guardato uno per uno prima di lasciarlo andare da solo ogni mese —
  e la tabella qui sotto dice perché non è prudenza per modo di dire.
- `/api/aziende/[id]/seo-pr` — `GET` legge la PR aperta, `POST` la applica, **`DELETE` la
  scarta**: commento col motivo, PR chiusa, ramo `wesion-seo-*` cancellato (solo i nostri:
  sul repo di un cliente non si cancella un ramo che non abbiamo creato noi).
- Il tutto sta nella **scheda cliente**, linguetta «Chi è», blocco «Audit SEO/GEO/AEO»
  (`SchedaCliente.tsx`): "Analizza SEO" → "Guarda la proposta" (diff file per file, con gli
  scarti) → **"Applica al sito" oppure "Scarta la proposta"**. Il giro si chiude dove è
  cominciato, senza passare da GitHub — che resta lì per chi vuole leggere la PR per
  intero.

  ⚠️ **Il «no» è arrivato dopo il «sì», ed era il buco più grosso** (02/09/2026, sera).
  Fino a quella sera la scheda sapeva dire solo «applica»: per rifiutare bisognava uscire
  da Wesion e chiudere la PR su GitHub. Un bottone che ha solo il sì non è una decisione,
  è un modulo di consenso — e le prime tre proposte su La Fenice andavano buttate tutte e
  tre. Se il no costa un giro fuori dal programma, prima o poi qualcuno applica per
  stanchezza. Il motivo dello scarto è facoltativo ma finisce come commento sulla PR:
  «closed» da solo, fra sei mesi, non dice se era sbagliata o solo arrivata male.

**Le due credenziali ci sono** (procurate il 02/09). Non si generano da sole — servono un
consenso OAuth nel browser e una scelta di scope su GitHub — quindi il procedimento resta
scritto qui: serve daccapo il giorno che si cambia server, o che scade il token.

1. **`GSC_REFRESH_TOKEN`** — un token Search Console, di sola lettura, SEPARATO da
   `GBP_REFRESH_TOKEN` (quello ha solo lo scope `business.manage`, non basta).
   Si ottiene con **Google OAuth Playground** (developers.google.com/oauthplayground):
   1. Icona ingranaggio (in alto a destra) → spunta "Use your own OAuth credentials" →
      incolla `GBP_CLIENT_ID` e `GBP_CLIENT_SECRET` (sono già in `.env`).
   2. Nel campo scope personalizzato in basso a sinistra scrivi
      `https://www.googleapis.com/auth/webmasters.readonly`, poi "Authorize APIs".
   3. Accedi con **l'account Google che vede Search Console dei clienti** (quello
      dell'agenzia).
   4. Step 2 della pagina: "Exchange authorization code for tokens".
   5. Copia il valore di "Refresh token" → va in `GSC_REFRESH_TOKEN` nel `.env` di
      Contabo (non quello di Oracle: questa parte gira solo sulla dashboard).

2. **`GITHUB_TOKEN`** — un Personal Access Token *fine-grained* che possa leggere i repo
   dei clienti e aprire Pull Request (MAI push su un branch protetto: il codice non lo fa,
   ma il token va comunque dato con lo scope minimo).
   Da github.com/settings/tokens?type=beta:
   - Resource owner: l'account/org che possiede i repo dei clienti.
   - Repository access: quelli da abilitare (almeno quello del cliente su cui si testa).
   - Permissions: **Contents: Read and write**, **Pull requests: Read and write**.
   - Il token generato → `GITHUB_TOKEN` nel `.env` di Contabo.

Senza queste due, il bottone "Analizza SEO" risponde con un errore che dice esattamente
cosa manca (non un fallimento muto) — vedi i controlli in cima alla rotta.

### Il primo cliente vero: Trattoria La Fenice, tre PR e tre lezioni

Il giro ha girato davvero (`repo_url` + `gsc_proprieta` compilati da "Modifica", `git` nel
`Dockerfile` — mancava — e le due variabili nel `.env` di Contabo). Ne sono uscite tre PR
in un pomeriggio, e **nessuna delle tre è stata mergiata così com'era**: ognuna ha
insegnato una cosa, ed è per questo che il primo lotto si guarda uno per uno invece di
mettere un cron.

| PR | Cosa ha provato a fare | Difesa che ne è nata |
|---|---|---|
| #1 | Rigenerare `Layout.astro` intero: 85 righe tolte, schema BlogPosting, skip-link e cambio lingua spariti, una variabile inesistente — un sito che non compila | Un file che esiste si tocca **solo** con sostituzioni mirate, che falliscono da sole se l'aggancio non combacia (`applicaModifiche`) |
| #2 | Proposta buona (`containedInPlace`, `knowsAbout`) con dentro, di nascosto, `priceRange` da `$$` a `$` | `CHIAVI_DI_FATTO`: un blocco che cambia un fatto sul cliente viene buttato **intero**, anche se il resto era giusto (`fattiAlterati`) |
| #3 | Coprire un `llms.txt` buono con un elenco piatto di URL | `leggiStatico` + il pavimento sulla lunghezza — sotto |
| #3 bis | La stessa #3, ma **applicata** e finita online: aveva coperto un generatore | `trovaGeneratore` + il rifiuto di creare un file statico che copre codice |

**La #3 merita il dettaglio, perché la colpa non era del modello.** `llms.txt` lo cercavamo
solo nella radice del repo; su un sito Astro sta in `public/`. Quindi nel prompt gli
scrivevamo, testuale, «llms.txt attuale: (non esiste)» — e uno che non esiste si crea da
zero. Ha fatto la cosa giusta rispetto alla fotografia del sito che gli avevamo dato. Che
la fotografia fosse sbagliata era colpa nostra, e `robots.txt` due righe sotto era già
cercato in tutti e due i posti.

Da lì, tre cambi:

- **`leggiStatico`** (`seo-git.ts`): i file statici si cercano in `public/`, poi `static/`,
  poi radice, per `llms.txt` e `robots.txt` insieme — così l'asimmetria non torna su uno
  solo dei due. Torna anche **il percorso** in cui il file è stato trovato, e finisce nel
  prompt: senza, il modello riscrive nella radice e il sito si ritrova due `llms.txt`, con
  quello servito online che resta il vecchio. Nessun errore, nessuno se ne accorge.
- **Il pavimento**: un file «riscrivibile intero» che **esiste già** non può essere
  sostituito da uno più corto. `RISCRIVIBILI_INTERI` nasceva da «lì non c'è nulla da
  perdere», vero finché quei file non esistevano, falso il giorno dopo che li scriviamo
  noi. Lo scarto finisce nella PR coi numeri, quindi chi legge lo vede.
- **`db/prova-seo-git.ts`** (`npm run prova:seo-git`): 17 prove su cartelle finte — i
  quattro layout di repo, «ci sono tutti e due, vince `public/`», la riscrittura più povera
  respinta col file originale intatto, e le difese di #1 e #2 ancora in piedi. Non c'erano
  prove su questo modulo perché `seo-git.ts` importava `./seo-proposta` senza estensione e
  Node non riusciva a caricarlo: ora ce l'ha, come in `router/`. **È il modulo che scrive
  sui repo dei clienti: deve restare provabile fuori dall'app.**

**La regola che tengono insieme tutte e tre:** meglio perdere una proposta buona che
cambiare qualcosa in silenzio. Uno scarto si legge nella PR e si rifà a mano in due minuti;
un file coperto senza dirlo non lo scopre nessuno finché non serve.

### Il quarto guasto, quello vero: `llms.txt` non era un file

Aprendo il repo della Fenice a mano, la sera del 02/09, si è visto che lì `llms.txt` **è
codice**: `src/pages/llms.txt.ts`, una rotta Astro che a ogni richiesta rilegge gli
articoli da Neon — quelli che pubblica Wesion — e produce un documento con FAQ per
assistenti AI, contatti, orari e blog aggiornato.

Online però usciva un `public/llms.txt` di 14 righe. **In Astro un file in `public/` vince
sulla rotta con lo stesso nome**: il generatore girava e non lo leggeva più nessuno.

E quel file l'aveva messo Wesion: commit `7f31b01` sul repo del cliente, «SEO/GEO/AEO da
Wesion — Trattoria La Fenice (prova)», applicato a mano dalla dashboard alle 11:41. La
catena intera: *Wesion cerca nel posto sbagliato → dice al modello «non esiste» → il
modello crea in buona fede → una persona applica come prova → il sito perde una funzione,
in silenzio.*

L'ultimo bottone ha funzionato come previsto. Il problema è che **quel diff sembrava
innocuo**: aggiungeva un file, non ne toglieva nessuno. Nessuno poteva vedere, guardandolo,
che stava spegnendo qualcosa.

**Riparato:**
- `trovaGeneratore` (`seo-git.ts`) cerca `<nome>.{ts,js,mjs,astro,tsx}` in `src/pages`,
  `src/routes`, `src/app`, `app`, `pages` — Astro, SvelteKit e Next.
- Il prompt ha **tre** stati invece di due (`descriviTestuale` nel route): non esiste,
  esiste come file, è generato da codice. Nel terzo caso il modello riceve il codice e il
  divieto esplicito di creare un file statico.
- `applicaModifiche` **rifiuta** di creare un `llms.txt`/`robots.txt` statico quando esiste
  un generatore, e lo scarto dice dove sta.
- Sul sito del cliente: `public/llms.txt` rimosso (commit `a065236`). `llms.txt` è tornato
  da 14 righe a 38, con i sei articoli, le tre FAQ, contatti e orari. Non è servito altro:
  la rotta rilegge il database da sola.

Il contratto completo — cosa Wesion può toccare del repo di un cliente e cosa no — sta in
`CONTRATTO-SITO.md`, sezione «L'audit SEO/GEO/AEO».

### Dove sono le PR, e come ci si arriva

I rami `wesion-seo-*` restano sul repo del cliente anche a PR chiusa: chiudere non cancella
il ramo, e il nuovo «Scarta la proposta» cancella solo i rami che iniziano per
`wesion-seo-` — su un repo di un cliente non si tocca un ramo che non abbiamo creato noi.

⚠️ **Per arrivare al repo di un cliente da questo PC non basta una chiave globale**: ogni
sito in `SITI/` ha la sua deploy key configurata in locale con `core.sshcommand` (per la
Fenice: `SITI/trattorialafenice/.ssh/id_ed25519`). Un `git clone` normale fallisce con
«Repository not found», che sembra un problema di permessi e invece è la chiave sbagliata.
Si clona così:

```bash
GIT_SSH_COMMAND="ssh -i '<percorso>/.ssh/id_ed25519' -o IdentitiesOnly=yes" git clone git@github.com:...
```

## 15. Il tono, se devi scrivere codice qui

Come in `gbp-autoposter`: i commenti non dicono *cosa* fa il codice — quello si legge —
ma **perché è così**, citando il giorno in cui la strada sbagliata è costata qualcosa.
Fra tre mesi il *cosa* si ricostruisce in dieci minuti, il *perché* no.

Il codice è in italiano, nomi compresi. Mantienilo.
