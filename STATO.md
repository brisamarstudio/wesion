# Dove siamo arrivati — Wesion

*Ultimo aggiornamento: 07/09/2026. **Il terzo cliente è dentro** — M Hotel Don Carlo,
il primo che non è un ristorante — e configurarlo ha fatto uscire due difetti che
nessuno poteva vedere con i due clienti di prima: la rotazione dei fatti nel piano
funzionava solo per chi pubblica tanto, e la scheda in dashboard spegne i fatti che
non stanno nelle sue quattro chiavi. Tutti e due in §0.4.*

*Prima: il menù del giorno è uscito davvero su un sito vero partendo da una foto su
WhatsApp — §0.3, con i tre guasti invisibili che c'erano voluti per arrivarci.*

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

## 0.4 Il terzo cliente, e i due difetti che ha scoperto (07/09/2026)

**M Hotel Don Carlo** (Broni, PV) è il primo cliente che non è un ristorante: hotel,
motel con formula Day Use, ristorante *interno*, sala meeting e area sosta camper.
Entrarci ha fatto emergere due cose che La Fenice e MyWebby non potevano mostrare —
non perché siano fortunate, ma perché sono **simili fra loro**.

### 1. La rotazione dei fatti funzionava solo per chi pubblica tanto

In `piano.ts` il fatto da agganciare a un pilastro ruotava così:

```ts
materiaPerPilastro(materia, pilastro, Math.floor(i / pilastri.length))
```

Cioè il fatto cambia **una volta per giro completo di pilastri**. Con 6 pilastri e 4
post al mese il giro non si chiude mai, `giro` resta `0`, e ogni pilastro pesca sempre
`voci[0]`. Anteprima di settembre per Don Carlo: **tre post su quattro nati dallo
stesso fatto** — «Camere e suite» — mentre in `offerta` ce n'erano cinque, e Day Use,
ristorante, sala meeting e area camper non uscivano **mai**.

Corretto passando `i`: il fatto cambia a ogni slot. Chi fa molti post ruota come prima,
chi ne fa pochi smette di ripetersi.

⚠️ **Perché non si era mai visto.** La Fenice e MyWebby pubblicano abbastanza da
chiudere più giri in un mese, quindi per loro la rotazione funzionava. Il difetto
colpiva solo il cliente che pubblica poco — cioè **ogni cliente nuovo**, che è il
momento peggiore per fare quattro post identici.

### 2. La scheda in dashboard spegne i fatti che non conosce

`SchedaCliente.tsx` conosce quattro chiavi: `cosa_fa`, `offerta`, `materiali`,
`punti_forza`. Il salvataggio manda **l'elenco completo** e quello che non c'è viene
spento (`scheda.ts`, il `DELETE`/`attivo = false`).

Configurando Don Carlo i fatti erano stati scritti con chiavi descrittive
(`sala_meeting`, `area_camper`, `motel_day_use`…). Effetto: il pannello diceva
«solo 0 fatti» mentre la linguetta contava 8, e **premere «Salva la scheda» li avrebbe
spenti tutti** — senza errori, senza conferme.

Non è un bug del salvataggio: è il salvataggio che fa quello che dichiara. È una
**trappola per chi scrive fatti fuori dalla dashboard**, cioè per chi configura un
cliente da uno script. Chi lo fa deve usare le quattro chiavi, non inventarne.

### 3. Cose imparate sulle schede Google che non sono ristoranti

- **Gli hotel non hanno il campo descrizione.** `leggiProfiloGoogle` torna
  `descrizione: ""` e non è un errore: Google lo toglie al settore alberghiero. Ma
  `analizzaVoce.ts` chiama la descrizione «la fonte migliore per la voce» — quindi
  **su un hotel quella fonte non esiste**, e restano recensioni, sito e incollato.
- **Gli hotel non hanno `regularHours`.** Al loro posto ci sono i `moreHoursTypes`
  (Colazione, Pranzo, Cena, Accesso), che dipendono dalle categorie della scheda.
- **`leggiRecensioni` non segue il `nextPageToken`**: vede al massimo le 50 più
  recenti. Su Don Carlo sono 50 su 230 dichiarate, 30 con testo. Per capire com'è il
  posto *oggi* va bene, ma è una scelta, non una lettura completa.
- **Nessun settore fra i cinque descrive l'ospitalità.** Don Carlo sta su
  `locale` + `servizi`: `ristorazione` tirava dentro «Un piatto e come nasce» e «Un
  ingrediente», che su un hotel con **cucina riservata agli ospiti** sono i post da
  non fare — invitano a cena gente che non si può servire.

### 4. Il fatto che il sito è Laravel, scritto in anagrafica

`mhoteldoncarlo.com` è Laravel + Blade: 122 rotte, 42 controller, con Stripe, carte
salvate, check-in espresso e PDF firmati. **L'audit SEO/GEO non è applicabile**: cerca
i generatori in `src/pages`, `src/routes`, `src/app`, `app`, `pages`, e le rotte di
Laravel stanno in `routes/web.php`. È la stessa cecità che il 02/09 ha mandato online
il `llms.txt` monco della Fenice (§CONTRATTO-SITO). Sta scritto nelle note
dell'azienda, non solo qui.

### Cosa resta aperto da qui

- **`creaAzienda` non è raggiungibile da riga di comando.** `db/configura-cliente.ts`
  sa solo *modificare* un'azienda che c'è già, e `anagrafica.ts` importa `./db` senza
  estensione, quindi Node non lo carica. Aggiungere un cliente da script obbliga a
  riscrivere a mano la logica di `creaAzienda` (slug libero, dedup sul Place ID,
  evento). Se aggiungere clienti a mano diventa abitudine, quella funzione va messa
  dove la vede anche Node.
- **Il piano non sa che un cliente ha già un piano editoriale altrove.** Don Carlo ha
  due post a settimana su Facebook, scritti a mano dall'agenzia. Su Google non è un
  doppione — sono superfici che non si incontrano — ma Wesion non ha modo di sapere
  cosa è già stato detto, e il rischio è che l'agenzia scriva due volte la stessa cosa
  in due posti.

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

> **Stato la sera del 05/09/2026: 1b, 3b, 4b, 5b e 6b sono chiusi.** Resta **2b** — un
> numero titolare su due aziende — che per ora è una regola operativa e non un vincolo.
> **Niente di tutto questo è ancora in produzione**: il router va deployato su Oracle
> (§14.1) e il sito di La Fenice pubblicato su Cloudflare. Il testo dei chiusi resta qui
> sotto: serve a non ricascarci, e a spiegare perché il codice è fatto così.

1b. ~~⚠️ **I due che bloccano la riaccensione di `post_gbp`.**~~ — **fatti il
   05/09/2026, sera.** `post_gbp` di La Fenice si può riaccendere: manca solo
   farlo con un menù di oggi e il cliente avvisato. Cosa è cambiato:

   - **La presa.** `pubblicaBozza` adesso reclama la bozza prima di parlare con
     chiunque: `UPDATE ... SET stato='pubblicando' WHERE id=$1 AND stato='approvata'
     RETURNING id`. La riga la ottiene una strada sola, l'altra se ne va — e chi
     se ne va, se è il «SI» del titolare, aspetta l'altra (`attendiEsito`) e
     racconta il *suo* esito invece di inventarne uno. Il lucchetto sta nel
     database e non in memoria apposta: un processo che muore col lucchetto in
     mano lo lascia scritto. Per quello c'è `presa_at` — dopo cinque minuti la
     presa si può rubare, e il giro le prese abbandonate le ripesca.
   - **Il ritentativo per destinazione.** `pubblicata` adesso vuol dire
     *arrivata dappertutto*: finché ne manca una la bozza torna `approvata`, che
     è il modo che ha il giro di sapere che c'è ancora lavoro. Quello che era già
     riuscito non si rifà (`destinazioniRiuscite`), quindi riprovare il sito non
     può ripubblicare su Google. Il tetto dei tre tentativi vale per
     destinazione, non per bozza intera.
   - Costo di questa scelta, scritto perché non sorprenda: `'pubblicando'` è uno
     stato nuovo. Sta nel `CHECK` di `bozza`, nelle tre mappe di etichette della
     dashboard, e nella spia `bozze-approvate-ferme` — che ora guarda anche le
     prese, o tacerebbe proprio nel caso in cui il router è morto davvero.
     **Va applicato lo schema (`npm run db:schema`) prima di far girare il router
     nuovo**: senza la colonna `presa_at` non parte niente.

   *Com'erano, per memoria:*

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

3b. ~~**I messaggi di gruppo passano come comandi privati.**~~ — **fatto il
   05/09/2026** (`e576444`): si scarta ogni evento con `from` che finisce in
   `@g.us`, prima di cercare il mittente, in silenzio e senza rispondere — una
   risposta del bot dentro un gruppo la leggerebbero tutti. Il controllo è
   ripetuto dentro `riconosci()`, perché il buco non si riapra il giorno che ci
   si arriva da un'altra strada. Com'era: `candidati()`
   (`riconosci.ts:44-58`) legge anche `author` e `participant` — che nei gruppi dicono
   *chi ha scritto dentro il gruppo* — e non c'è nessun controllo su `@g.us`. Se il numero
   bot finisse in un gruppo col titolare, un «SI» scritto lì pubblicherebbe davvero.
   **Decisione presa il 05/09: un numero = un bot, i gruppi non si usano mai.** Quindi si
   scarta ogni evento con `from` che finisce in `@g.us`, prima di cercare il mittente.

4b. ~~**`normalizzaTelefono` è ambiguo sui locali che iniziano per «39».**~~ —
   **fatto il 05/09/2026** (`e576444`): il prefisso si decide dalla **lunghezza**,
   che non è ambigua (un cellulare nazionale ha 9-10 cifre, col 39 davanti ne ha
   11-12; e un numero che inizia per 0 è sempre nazionale). Resta aperto il
   contorno: il modulo della dashboard **continua a non mostrare il normalizzato
   calcolato**, quindi un numero scritto male non si vede ancora compilando.
   Com'era: `src/lib/normalizza.ts:24-32` decideva se anteporre il prefisso guardando se la stringa
   comincia già per `39`: un cellulare il cui numero *nazionale* inizia per 39, scritto
   senza `+`, non viene mai completato — e da WhatsApp arriva invece sempre col prefisso.
   Le due forme non coincidono mai e il titolare **non viene mai riconosciuto, in
   silenzio**. Il modulo della dashboard non mostra il normalizzato calcolato (la CLI sì:
   `db/configura-cliente.ts:161`), quindi non c'è modo di accorgersene compilando.

5b. ~~**Le Spie non controllano `WAHA_API_KEY` né il refresh token di Google.**~~ —
   **fatto il 05/09/2026** (`e576444`). Con una scoperta che vale più della
   correzione: **quel controllo nelle Spie non poteva starci.** Le Spie girano
   sulla dashboard, su Contabo, dove `WAHA_*` non esiste apposta e dove WAHA —
   che ascolta sul `127.0.0.1` di Oracle — non è raggiungibile: si sarebbe accesa
   per sempre a vuoto, e una spia che grida sempre è una spia che si impara a
   ignorare. Quindi il controllo lo fa **chi ha la chiave e la rete per usarla**,
   il router (`router/impianto.ts`, ogni 5 minuti), e il risultato passa dal
   database, che è già l'unico ponte fra le due metà. Il `vista_at` fa da
   **battito**: se smette di arrivare, la dashboard lo dice invece di mostrare
   «tutto bene» — un router fermo non scrive «sono rotto», non scrive niente.
   Il token di Google invece la dashboard può provarlo da sé, e quello è una
   spia normale. Com'era: `src/lib/spie.ts` verificava solo `OPENROUTER_API_KEY`. Se la chiave WAHA
   venisse ruotata di nuovo — è già successo il 29/07 — **si ripeterebbe identico il
   guasto a tre sintomi di §0.3, e lo scoprirebbe il cliente**. È la lezione dell'incidente
   Brace Mia, sullo stesso identico punto. Da fare per primo: è poco codice e chiude un
   buco già costato una volta.

### Le sezioni del menù — **scritte il 05/09/2026, sera**

6b. ~~**Un cliente ha più menù, il contratto ne prevede uno solo.**~~ — **fatto**, in due
   repo. Com'è venuto:

   - **Sito** (`SITI/trattorialafenice/src/pages/api/menu/replace.ts`): la richiesta può
     portare `section`, lo slug della categoria. Manca = si scrive dove si è sempre
     scritto, così i siti già collegati non si rompono. Uno slug che non esiste è un
     `400` con dentro l'elenco di quelli buoni — mai un ripiego su una categoria
     «vicina», che vorrebbe dire distruggerne due. C'è anche `{"action":"sections"}`,
     sola lettura: le sezioni le sa il sito, e chiedergliele evita una lista scritta a
     mano da qualche parte che diverge il giorno che il cliente ne aggiunge una.
     ⚠️ **Committato ma NON ancora pubblicato su Cloudflare.**
   - **Sezioni per cliente**: `servizio.config.menu_sezioni` di `menu_del_giorno`,
     `[{slug, titolo, quando}]`. Per La Fenice sono già scritte, con gli slug veri letti
     dal suo database. Vuoto = cliente con un menù solo, e non cambia niente.
   - **L'OCR sceglie da sé**: al modello si passano le sezioni di quel cliente e si
     chiede anche `section`, che legge dall'intestazione della foto. **Provato il 05/09
     su tre menù**: «SABATO A CENA» → `sabato-a-cena`, «MENU DEL GIORNO» →
     `menu-fisso-del-giorno`, un menù senza intestazione → `null`. Uno slug che il
     modello si inventa vale quanto `null`: si accetta solo quello che esiste davvero.
   - **Il bot la dichiara** nella conferma («lo pubblico nella sezione «Sabato a Cena»»)
     e la ripete nel resoconto finale. **Solo se non ha capito** chiede: «In quale menù
     lo metto? 1 … 2 …», e si risponde col numero (o col titolo). Un «SI» dato prima di
     aver scelto non pubblica: chiede di nuovo, perché scegliere noi la sezione vorrebbe
     dire sovrascrivere il menù vero di quella sezione.

   **Da fare prima di dire a Deborah «manda al bot»:** pubblicare il sito su Cloudflare,
   deployare il router, e provarne uno vero. Prima di allora vale ancora quello che c'è
   scritto qui sotto.

   *Com'era, per memoria:* `replace.ts` del sito aveva
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

7b. **`hasMenu` è solo un link: i piatti non sono in dati strutturati.**
   In `SITI/trattorialafenice/src/layouts/Layout.astro:142` c'è
   `"hasMenu": "https://www.trattorialafenice.it/menu"` — una stringa. Diciamo alle
   macchine **dove** sta il menù, non **cosa** c'è dentro. La versione buona è annidata:
   `Menu` → `MenuSection` → `MenuItem`, con nome, descrizione e prezzo di ogni piatto.

   **Perché ora ha senso e prima no:** si genera dalle **stesse righe** che il router
   scrive pubblicando (`menu_items`), quindi ogni foto di Deborah aggiorna insieme la
   pagina *e* i dati strutturati. Stessa fonte, nessuna possibilità di divergere, e non
   c'è lavoro ricorrente per nessuno. È il formato che motori e AI consumano davvero, ed
   è quello che fa la differenza sui piatti a coda lunga («mezzi paccheri alla messinese»)
   fra essere *leggibili* ed essere *citabili*.

   ⚠️ **Nell'`llms.txt` i piatti NON vanno messi.** `src/pages/llms.txt.ts` è statico,
   generato al build, mentre il menù cambia ogni giorno: ci finirebbe un elenco che
   *mente* dal giorno dopo, cioè una seconda lista che diverge da quella vera — la stessa
   malattia descritta nel playbook. Com'è adesso va bene: dice «qui c'è il menù» e manda
   alla pagina, che i piatti li ha già in chiaro nell'HTML (verificato il 05/09 leggendo
   il sito pubblico). E vale la pena ricordarsi che nessun grande fornitore di AI ha mai
   confermato di leggere `llms.txt`: costa poco e non fa danno, ma la strategia sta nei
   dati strutturati, che invece li usano tutti da anni.

   Da fare prima su La Fenice, poi come modello per gli altri siti.

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

### Come si fa un deploy della dashboard

```
npm run deploy
```

Push, `git pull` sul server, build, e la verifica che il container sia **healthy** e
che `/entra` risponda 200. Le credenziali le legge dal `.env` (`CONTABO_HOST`,
`CONTABO_USER`, `CONTABO_PASS`) — non stanno piu' nel sorgente di un altro progetto.

⚠️ **Il controllo che vale piu' di tutti:** lo script si ferma se il commit arrivato
sul server non e' lo stesso che hai in mano. Ricostruire quando il push non e' andato
vuol dire compilare il codice di ieri e passare il pomeriggio a chiedersi perche' la
modifica non si vede — successo il 07/09/2026, ed e' il motivo per cui lo script esiste.

`--secco` non pusha (usa quello che c'e' gia' su GitHub), `--forza` ricostruisce anche
se il server era gia' aggiornato (serve dopo aver cambiato il `.env` del server).

#### A mano, se lo script non parte (passo-passo, per non reinventarlo ogni volta)

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

## 14.3 Il giro sulle query: da Search Console ai contenuti (idea del 14/09/2026) — **da costruire**

L'audit del §14.2 sistema la **tecnica** (schema, `llms.txt`, `robots.txt`). Non guarda
**cosa cerca la gente**: quali query portano impressioni ma zero clic, quali domande non
hanno una pagina. È il pezzo che manca per chiudere il cerchio *analizza → decide →
esegue → misura*.

**Da dove nasce.** Due cose della stessa sera:

1. Un post di Fabio Ariotti (Facebook, 12/09/2026) su un «agente SEO» per `weboptech.com`:
   clic da 107 a 2.950 in 28 giorni. Il processo descritto è quello giusto (analisi, keyword,
   mappa degli argomenti, contenuti, linking, pubblicazione, aggiornamento, Search Console).
   **Il grafico però non basta a copiare niente**: i clic salgono ×27 con le impressioni solo
   ×1,7 e la posizione da 11,1 a 9,4, a gradino in 2-3 giorni. Sembra un evento puntuale
   (una query di volume al primo posto, un problema tecnico risolto, sitelink sul brand),
   non la rampa lenta che fanno i contenuti. Mancano query, pagine e conversioni.
2. **Lo stesso lavoro fatto a mano su Artigiano il Conte**, dall'export CSV di Search
   Console (3 mesi, 142 query, 72 clic). Ha prodotto in una sera:

   | Segnale nelle query | Azione | Esito |
   |---|---|---|
   | «armadi su misura»: 57 impressioni, posizione 6,2, **0 clic** | pagina `/armadi-su-misura` | online 14/09 |
   | «falegname…» sono le query con clic; nei title la parola non c'era | «falegname»/«falegnameria» nei title | online 14/09 |
   | «riparazione mobili cucina», «riparazione cassetti milano», «piccole riparazioni» senza pagina | chiesto al cliente se ripara → sì → `/riparazioni-mobili` | online 14/09 |
   | «falegname buccinasco» con clic, Buccinasco non tra i comuni | comune aggiunto a `areaServed` e testi | online 14/09 |
   | «lo conte binasco» 41 impressioni, **0 clic** | `alternateName` nello schema | online 14/09 |
   | «falegname arconate/cuggiono/mesero» in posizione 30-50 | **nessuna**: fuori zona | scartato apposta |
   | 56 clic su 72 da mobile, posizione 4,8 contro 21 da computer | è ricerca locale in giro: velocità mobile prima di tutto | nota |

   Da misurare fra 4-8 settimane sulla property `artigianoilconte.it`: è il primo caso
   di confronto prima/dopo che abbiamo.

3. **Brace Mia, il caso opposto** (Search Console `bracemia.it`, 3 mesi al 14/09/2026):
   3.310 clic, CTR 13,4%, posizione media 3,6 — **ma le prime 10 query sono tutte il nome**
   («brace mia», «bracemia zibido», «brace mia menu»…), circa 2.200 clic su 3.310. Il sito
   vince la ricerca sul brand (e la toglie a TheFork/TripAdvisor: valore vero). Filtrando
   le query **senza** `brace`/`bracemia` il quadro cambia:

   | Query senza il nome | Impressioni | Clic |
   |---|---|---|
   | brace | 427 | 1 |
   | braceria | 233 | 1 |
   | ristorante zibido san giacomo | 191 | 1 |
   | zibido san giacomo ristorante | 60 | 1 |
   | griglieria | 48 | 2 |
   | ristoranti vicino a me | 47 | 1 |
   | bracemia bari | 39 | 1 |
   | braceria rozzano | 29 | 2 |
   | la braceria pugliese | 22 | 2 |

   Lezioni per il giro:
   - **Il filtro brand/non-brand è il primo passo, non un dettaglio.** Senza, un sito che vince
     solo sul nome sembra un successo SEO e il lavoro vero (clienti nuovi) resta invisibile.
     Il report al cliente deve mostrare le due righe separate.
   - Serve **la posizione** per query: «braceria» a 233 impressioni con 1 clic è una miniera se
     sta in posizione 5-12, un muro se sta a 40.
   - «ristoranti vicino a me» si vince con la **scheda Google** (categorie, foto, recensioni),
     non con il sito: il giro deve poter proporre azioni GBP, non solo codice.
   - «bracemia bari», «la braceria pugliese»: possibile omonimo o tratto distintivo (cucina
     pugliese?). Il giro non decide: **chiede al cliente**, come per le riparazioni di Massimo.

**Il giro, come andrebbe costruito:**

1. **Lettura mensile** per cliente: `search-console.ts` c'è già. Query × pagina × dispositivo,
   ultimi 3 mesi, con posizione e CTR.
2. **Classificazione**, in codice e non a sensazione:
   - *miniera*: impressioni alte, 0 clic, posizione 4-12 → title/description o pagina dedicata
   - *domanda scoperta*: gruppo di query simili senza una pagina che le copra → pagina o articolo
   - *brand debole*: query col nome del cliente fuori dal primo posto → `alternateName`, scheda Google
   - *fuori zona*: comuni lontani dall'`areaServed` → **si ignorano**, non si inseguono
3. **Proposta**, con lo stesso bottone del §14.2 (PR, «Applica» / «Scarta»): title, FAQ,
   pagina nuova, oppure una **bozza di articolo** nel calendario, dove Wesion pubblica già.
4. **Domande al cliente prima di scrivere fatti.** Su Artigiano il Conte la pagina Riparazioni
   è nata solo dopo il «sì, ripara». Prezzi, tempi, garanzie, servizi non confermati: la
   proposta li chiede, non li scrive. Stessa famiglia di `CHIAVI_DI_FATTO`.
5. **Misura il mese dopo**: per ogni proposta applicata, le query collegate prima e dopo.
   Senza questo punto il giro è solo un generatore di contenuti.

⚠️ **Il punto 4 non si toglie per andare più veloci.** Quella sera il dato vero ha corretto
due volte chi lavorava (il relay email e «falegname» dimenticato nei title). Un agente senza
controllo avrebbe riempito ogni FAQ di prezzi e tempi inventati, e le AI li avrebbero
ripetuti ai clienti come promesse.

**Aspettative da dire al cliente:** per un artigiano locale non sono migliaia di clic.
L'obiettivo misurabile è **richieste di preventivo in più al mese** (su Artigiano il Conte
arrivano in `leads`, con la data: si confrontano con le curve di Search Console).

## 15. Il tono, se devi scrivere codice qui

Come in `gbp-autoposter`: i commenti non dicono *cosa* fa il codice — quello si legge —
ma **perché è così**, citando il giorno in cui la strada sbagliata è costata qualcosa.
Fra tre mesi il *cosa* si ricostruisce in dieci minuti, il *perché* no.

Il codice è in italiano, nomi compresi. Mantienilo.

## 16. Modulo Social (Fase 1 — 15/09/2026)

Portato dentro Wesion il sistema operativo social (voce → ideazione → scrittura → formattazione → pubblicazione assistita).

### 16.1 Principi e vincoli della Fase 1
1. **Nessun bot o API Meta runtime non testata:** in Fase 1 non si aprono connessioni verso le Graph API di Facebook/Instagram. La pubblicazione è manuale e assistita: in consolle l'operatore copia il post e il primo commento con un click, li incolla nella Meta Business Suite, e segna la bozza come `segna_pubblicata_a_mano`.
2. **Il router WhatsApp/Oracle non tocca le social:** in `router/pubblica.ts` (`reclama` e `giroPubblicazioni`) è stato aggiunto il filtro `AND b.tipo <> 'social'`. Una bozza social non entra mai nel giro automatico del router. Il deploy del router su Oracle è gestito separatamente dall'amministratore (checkout parziale).
3. **Nessun fatto inventato:** se un post richiede informazioni non presenti in `wesion.fatto`, il generatore popola `dati_mancanti` e la consolle mostra un banner di avviso giallo che blocca l'approvazione inconsapevole.
4. **Piano GBP e Piano Social separati ma convergenti:** `costruisciPiano()` per GBP non è stato toccato. È stato creato `costruisciPianoSocial()` in `src/lib/piano-social.ts`, riutilizzando la stessa materia prima (fatti, pilastri, ricorrenze). Il regression test su MyWebby (82) e Don Carlo (234) per ottobre 2026 ha confermato la completa identità (18 slot ciascuno, date e fatti identici).

### 16.2 Modifiche effettuate
- **Database (`db/schema.sql`):** Esteso il CHECK constraint di `wesion.servizio.tipo` e `wesion.bozza.tipo` per includere `'social'`.
- **Modelli e regole (`src/lib/social.ts`, `src/lib/regoleSocial.ts`):** Definite le interfacce `ContenutoSocial`, formati (`post`, `carosello`, `reel`, `domanda`), framework di copywriting (`PAS`, `AIDA`, `BAB`, `STAR`, `libero`), regole di formattazione mobile (spaziature, max 3-5 hashtag nel primo commento, no muri di testo).
- **Scrittura e controllo qualità (`src/lib/scrivi-social.ts`, `src/lib/scrivi.ts`, `src/lib/controlloTesto.ts`):** `scriviBozzaSocial()` integrato nella catena `generaJson()`, con validazione del gancio (<55 caratteri), controllo emoji, conteggio hashtag e parsing di slide/reel.
- **API Bozze (`src/app/api/bozze/[id]/route.ts`):** Implementata l'azione `segna_pubblicata_a_mano` (imposta `stato='pubblicata'`, registra `bozza.contenuto.pubblicata_a_mano` ed emette l'evento `bozza_pubblicata_a_mano`), con supporto per `gancio_scelto` e `primo_commento`.
- **Scheda Cliente (`src/componenti/SchedaCliente.tsx`):** Aggiunta la sezione di configurazione del servizio `Social Media` sotto al Blog (canali, post a settimana).
- **Consolle Bozze (`src/componenti/ConsolleBozze.tsx`):**
  - Pulsante «Copia per Facebook / Instagram» con testo pulito e hashtag.
  - Pulsante «Copia 1° commento» per link e tag.
  - Pulsante «Segna come pubblicata a mano».
  - Ispettore visuale per ganci alternativi (cliccabili per sostituzione immediata), slide del carosello con prompt grafici, sceneggiatura reel a tabella e banner per dati mancanti da verificare.
- **Piano Editoriale (`src/componenti/PianoEditoriale.tsx` e `src/app/api/aziende/[id]/piano/route.ts`):** Selettore di destinazione (GBP vs Social Media FB/IG), con anteprima e generazione bozze vuote dedicate.


## 17. La Plancia e le Impostazioni (16/09/2026)

Detto da chi la usa il 15/09: «avete costruito in AIchese invece che in umanese.
Mille cose e non c'è un click». La scheda cliente si apriva su «Chi è» — una
anagrafica — e lo stato dei canali si doveva dedurre da account id ed endpoint
sparsi in «Servizi». Brief completo in `PROMPT-GEMINI-UX-PLANCIA.md`.

**Cosa c'è adesso**

- **Plancia**, prima linguetta e predefinita **sui clienti** (su un lead resta
  «Chi è»: la Plancia non avrebbe niente da dire). In cima «Da fare oggi», sotto
  una scheda per canale — Google, Sito e blog, Social, WhatsApp, Menù del giorno
  (solo ristorazione) — con **tre stati soli** e un bottone per scheda.
- **Impostazioni** (era «Servizi»): un blocco richiudibile per canale, chiuso di
  default; dentro prima le scelte umane, poi «Avanzate» con id, indirizzi tecnici
  e segreti. I segreti in campo mascherato con Mostra/Copia.
- Parole: «Cosa è vero» → **Cosa sappiamo**, «Il mese» → **Calendario dei post**,
  «Cosa è uscito» → **Pubblicati**, il tag di attività → **Settore**. Fuori
  dall'interfaccia visibile: router, endpoint, REST API, account id, token.

**Le tre cose da sapere prima di toccarlo**

1. **Lo stato si calcola, non si dichiara.** `src/lib/plancia.ts`, funzioni pure,
   niente database: un blog acceso su `localhost` è ⚠️, non ●. È la stessa regola
   di `servizi_pronti` in `bozze.ts`, che però sta in SQL — **sono due copie della
   stessa frase, se ne cambi una cambia l'altra.** In TypeScript perché la
   Plancia gira nel browser e la `config` non deve arrivarci.
2. **I valori delle linguette NON sono cambiati, solo le etichette.** `?tab=servizi`
   e `?tab=storico` sono negli href delle spie (`src/lib/spie.ts`): rinominare i
   valori romperebbe ogni link «vai a sistemarlo».
3. **I segreti mascherati sono mezza cosa.** `leggiScheda` manda al browser
   `servizio.config` intera: la password di WordPress è già nell'HTML della
   pagina. Il campo serve a chi condivide lo schermo. Toglierli davvero vuol dire
   non mandarli al client — modifica al server, **ancora da fare**.

## 18. Il menù è fatto di prodotti (16/09/2026)

Stessa giornata della Plancia, e stessa fonte: chi lo usa. «Il tool è talmente
AIchese che solo tu riesci a trovare una logica di navigazione».

**Primo giro** (sbagliato a metà): nove voci accorpate in tre per FASE DEL LAVORO
— Oggi, Clienti, Nuovi. Risolveva il numero, non il problema: «Oggi» metteva
nella stessa coda un post di Google (si approva ed esce da solo) e uno social (si
approva e poi si incolla a mano). Due gesti diversi con lo stesso nome.

**Secondo giro** (quello buono, deciso dall'operatore): il menù è fatto di
**prodotti** — Google, Social, Sito — e dentro ognuno c'è il suo giro completo.
Poi Clienti (con filtro per prodotto) e Nuovi clienti. In fondo Spie, Cose ferme,
Manuale.

**Le cose da sapere prima di toccarlo**

1. **`src/lib/prodotti.ts` è l'unico posto** dove sta scritto quale `bozza.tipo`
   appartiene a quale prodotto. Un tipo nuovo che non finisce lì non compare in
   nessuna coda — è voluto (meglio invisibile che nel posto sbagliato).
2. **Gli indirizzi non sono cambiati.** `/bozze`, `/calendario`, `/piano`,
   `/insights` rispondono come prima; il prodotto viaggia come `?prodotto=`, e
   senza vuol dire «tutto». Ci puntano i segnalibri e gli href delle spie.
3. **`/api/conteggi` gira su OGNI pagina**: due query e basta. Metterci il numero
   delle spie vuol dire far girare tutte le query di `spie.ts` a ogni click.
4. **La Plancia del cliente è l'eccezione voluta**: lì i prodotti si vedono uno
   accanto all'altro, perché la domanda al telefono è «come sta questo cliente».
5. Pagina nuova: **`/proposte`**, l'audit SEO di tutti i clienti in fila. Prima
   esisteva solo dentro la scheda del singolo.

## 19. Il guasto delle CTE su CockroachDB (16/09/2026) — **leggere prima di scrivere SQL**

Sintomo: in consolle «Non è andata, e non si sa perché» premendo **Approva**.
Sembrava il generatore («il modello non ha fatto fallback?»). Era SQL.

`PATCH /api/bozze/[id]` scrive la decisione e la sua traccia in una CTE sola. Su
Neon funzionava; su CockroachDB:

```
WITH clause "tracciata" does not return any columns
```

cioè 500 → HTML → nessun campo `errore` → messaggio vuoto. **Dalla migrazione del
15/09 al pomeriggio del 16/09 nessuno ha potuto approvare, rifiutare o cancellare
dalla dashboard.**

**La regola, per la prossima volta:** su CockroachDB una CTE che scrive vuole
`RETURNING` **e** vuole essere referenziata nella query principale — una CTE di
sola scrittura mai guardata può non essere eseguita affatto, e la traccia
sparirebbe in silenzio. Da qui il `(SELECT count(*) FROM tracciata)`.

**E la lezione di contorno, che vale di più:** «non si sa perché» compariva
PROPRIO quando il motivo esisteva ed era nei log. Un messaggio d'errore che si
arrende manda a cercare nel posto sbagliato — quella volta nel modello che scrive
i testi. Ora dice almeno la famiglia del guasto e dove sta scritto il resto.

**`npm run log`** (nuovo): le ultime righe del container, senza il rito dell'SSH.
`npm run log -- 500 --cerca 429`. Stessa ragione di `npm run deploy`. Legge SOLO
la dashboard: il router sta su Oracle, è un'altra macchina.

## 20. Chi ha scritto un post (16/09/2026)

`bozza.modello` diceva una bugia: un post di M Hotel Don Carlo è uscito su Google
con un testo riscritto a mano, e in tabella risultava di `groq/gpt-oss-120b`.
Quel campo esiste per una ragione sola (vedi `generatore.ts`): fra sei mesi
«questo post fa schifo» è inutile se non si sa chi l'ha scritto. **Un campo che
risponde il nome sbagliato è peggio di un campo vuoto: il vuoto ti fa cercare, la
bugia ti fa smettere di cercare.**

Adesso una correzione a mano mette `modello = 'mano'` e conserva il primo autore
in `contenuto.scritto_prima_da`; in consolle la voce si chiama «Chi l'ha
scritto». ⚠️ **Resta da correggere la riga della bozza 85**, già pubblicata prima
della modifica: va fatto con un UPDATE sul database, non dall'interfaccia.

## 21. Il fuso del piano era sbagliato in produzione, e nessuno se n'era accorto (16/09/2026)

Un piano ricostruito il 16 settembre alle 21:49 ha prodotto uno slot per **oggi
alle 12:00**, quando l'operatore aveva chiesto le 10 di default (e comunque
un'ora già passata). Due bug distinti, trovati insieme.

**1. `costruisciPiano` costruiva l'istante nel fuso di chi esegue il codice, non
in quello italiano.** `new Date(anno, mese-1, giorno, ora, 0, 0).toISOString()`
sembra la correzione del bug di gbp-autoposter (quello raccontato nel commento
originale della funzione) ma non lo era: sul portatile a Pavia il fuso di chi
esegue è già quello giusto, e il bug non si vedeva mai. **Nel container Linux di
produzione, che gira in UTC (nessun `ENV TZ` nel Dockerfile), «ore 10»
diventavano 10:00 UTC, cioè le 12:00 vere in Italia d'estate.** Ogni post
generato dal piano da quando esiste questa funzione è uscito 1-2 ore dopo
l'orario richiesto, in silenzio. Corretto riusando `istanteRoma` (che il fuso
lo SCRIVE, +02:00/+01:00, invece di ereditarlo dall'ambiente) — la stessa
regola già in uso ovunque nel progetto, che qui non era stata applicata.

⚠️ **Non toccati i post già usciti**: sono fatti, non si riscrivono. Le bozze
ancora in coda costruite prima di questa correzione possono avere l'ora storta
— si svuotano («Svuota la coda», vedi sopra) e si ricostruiscono.

**2. Il filtro «non nel passato» guardava solo il GIORNO, non l'istante.** Un
primo giro (la stessa sera) filtrava `giorno >= oggi`: corretto a metà. Un piano
ricostruito alle 21:49 vedeva «oggi» come giorno valido e ci metteva comunque uno
slot alle 10 — dodici ore nel passato. Corretto confrontando l'istante vero
(`iso(anno,mese,giorno,ora)` contro `Date.now()`), non solo la data.

**3. Il `min` sul calendario in consolle è stato tolto**, non aggiunto meglio.
Impediva di scegliere una data passata, giusto in teoria — ma su una bozza GIÀ
ferma nel passato rompeva la digitazione di un orario nuovo, cioè esattamente
il gesto che serve per correggerla. Il server rifiuta comunque un PATCH con una
data passata (§19 non basta più, vedi il nuovo controllo in
`/api/bozze/[id]/route.ts`): quel vincolo basta, un vincolo lato client non deve
mai impedire la correzione del caso che deve correggere.

**`piano-social.ts` ha lo stesso bug nell'`iso()` e nel filtro giorni, non
toccato**: il calendario social si rifa' da capo più avanti, per scelta
dell'operatore (vedi §18).
