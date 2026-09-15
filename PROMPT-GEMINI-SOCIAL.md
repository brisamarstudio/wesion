# Prompt per Gemini — il modulo Social di Wesion

> Da incollare a Gemini **aperto nella cartella `SOFTWARE/wesion`**. Scritto il 15/09/2026.
> Ispirato al "sistema operativo social" di Charlie Hills (voce → scrittura → visual →
> ideazione → valutazione), **tradotto dentro Wesion**, non installato accanto.

---

## Chi sei e cosa devi fare

Sei lo sviluppatore di **Wesion**, il gestionale dell'agenzia MyWebby (Next.js + `pg` su
CockroachDB, dashboard su Contabo, router su Oracle). Oggi Wesion genera **post per Google
Business Profile, articoli per i blog dei siti e menù del giorno**, sempre con approvazione
umana prima di pubblicare.

Devi aggiungere i **contenuti social** (Facebook e Instagram, poi LinkedIn): post, caroselli,
script per reel, primo commento — per i clienti a cui l'operatore attiva il servizio.

**Non devi costruire un sistema nuovo.** Metà del sistema di Charlie Hills Wesion ce l'ha già,
con regole scoperte sbagliando su clienti veri. Il tuo lavoro è **estendere quello che c'è**.

## Prima di scrivere una riga, leggi (nell'ordine)

1. `STATO.md` — la storia e le decisioni. ⚠️ Ha modifiche non committate di un'altra sessione:
   **non sovrascriverle**, aggiungi in fondo.
2. `db/schema.sql` — tabelle `voce`, `fatto`, `bozza`, `pubblicazione`, `servizio`, e i CHECK.
3. `src/lib/`: `voce.ts`, `materia.ts`, `analizzaVoce.ts`, `pilastri.ts`, `piano.ts`,
   `scrivi.ts`, `regolePost.ts`, `controlloTesto.ts`, `generatore.ts`, `bozze.ts`, `articolo.ts`.
   **Le intestazioni di questi file sono la specifica**: spiegano perché ogni regola esiste.
4. `_MYWEBBY-PLAYBOOK/10-COCKROACHDB.md` (fuori dal repo, cartella padre dei progetti) — le
   trappole del database.

## La mappa: Charlie Hills → cosa c'è già in Wesion

| Skill di Charlie Hills | In Wesion | Cosa fare |
|---|---|---|
| `voice-builder` → `voice.md` | **`wesion.voce`** + `analizzaVoce.ts` («Come parla»): origine, come ragiona, parole sue, da evitare, non fa, mai dire | **Niente di nuovo.** Riusare `vocePerPrompt()`. Semmai un campo per il tono social se diverso da Google |
| `voice-builder` → `about-me.md` | **`wesion.fatto`** + `materia.ts` («Cosa è vero»): ogni fatto ha `fonte`, verifica, scadenza | **Niente di nuovo.** È la regola più importante, vedi sotto |
| `content-matrix` (argomenti × formati) | **`pilastri.ts` + `piano.ts`**: pilastri × fatti, piano deterministico del mese, `ricorrenze.ts` | Aggiungere la dimensione **formato** (post, carosello, reel, domanda…) allo slot del piano |
| `post-writer` | **`scrivi.ts`** (slot → testo, una bozza alla volta, su richiesta) | Un prompt per il canale social accanto a quello GBP, stessa struttura: FATTO → VOCE → CONFINI → REGOLE DEL CANALE |
| `hook-generator` | — | Nuovo: 3-6 ganci proposti **dentro** la bozza, l'operatore sceglie |
| `post-formatter` (PAS, AIDA, BAB, STAR) | — | Nuovo: `contenuto.framework`, scelto dal piano o dall'operatore, righe corte per mobile |
| `pinned-comment` | — | Nuovo: `contenuto.primo_commento` |
| `post-scorer` | **`controlloTesto.ts`** (fatti inventati, regole Google) → `bozza.avvisi` | Aggiungere controlli social (gancio > 40 caratteri, muro di testo, CTA assente, emoji a pioggia, hashtag). **Avvisi, mai blocchi** |
| `gemini-carousel` / `gemini-infographic` | — | Nuovo: slide per slide (1080×1350) con testo e **prompt immagine**, salvati nella bozza |
| `reels-scripting` | — | Nuovo: script (gancio 0-3 s, battute, CTA). Analizzare un reel di riferimento = **fase 3** |
| `niche-research` | — | Fase 3, con i paletti sotto |
| `analytics-dashboard` | `rendimento-storico.ts` (per Search Console) | Fase 3: import CSV da Meta Business Suite |
| `profile-optimizer`, `youtube-thumbnail`, `newsletter-voice` | — | **Fuori scopo** per ora |

## Le regole che NON si discutono

### 1. Niente fatti inventati. Mai. È il motivo per cui Wesion esiste.

Un post può affermare **solo** ciò che sta in `wesion.fatto` (attivo, non scaduto) o nelle
recensioni (`voce.apprezzato`). Numeri, anni di attività, nomi di persone, provenienze,
quantità, orari, posizioni degli stand: **se non sono un fatto con fonte, non esistono**.

Esempio vero di cosa NON deve succedere. Un'analisi della pagina Facebook di un cliente
(15/09/2026) ha prodotto: *"Padiglione NP01 SUD, Stand 56-59"*, *"oltre 40 anni con
Alessandro Torti"*, *"solo 40 casse di fichi neri pugliesi"*, *"alle 3:30 del mattino"*. Nessuno
di questi dati era verificato. Un post così, pubblicato a nome del cliente, è il danno peggiore
che Wesion può fare. Il 20/07/2026 Google ha già rimosso un post e disattivato la pubblicazione
su una scheda (vedi `regolePost.ts`).

- Il piano deve **scartare** gli slot senza materia prima, come fa già `pilastri.ts`.
- `controllaFattiInventati()` va applicato anche ai testi social.
- Se un'idea richiede un dato che manca, la bozza lo **chiede** ("serve: quanti anni di
  attività?") invece di inventarlo. Quelle domande sono oro: l'operatore le gira al cliente.

### 2. L'ultimo bottone è di una persona

Genera, propone, avvisa. **Non pubblica e non salva conclusioni da solo.** Stessa regola di
`analizzaVoce.ts` ("analizza non salva") e dei post GBP (approvazione in dashboard o WhatsApp).
Nessun automatismo che generi decine di testi mentre nessuno guarda: una bozza alla volta, o un
lotto chiesto esplicitamente.

### 3. I servizi li decide l'operatore

Non tutti i clienti pagano la gestione social, così come non tutti pagano la scheda Google. Il
modulo si attiva **solo** con un servizio `social` acceso a mano sulla scheda cliente. Nessuna
migrazione, import o script deve accenderlo in blocco. **Non spegnere né modificare** i servizi
esistenti (`post_gbp`, `blog`, `menu_del_giorno`, `whatsapp_bot`).

### 4. Quello che non puoi permetterti di veder pubblicato non lo affidi al prompt

Lezione di `generatore.ts` e `controlloTesto.ts`: il modello a volte disobbedisce. Preamboli
("Ecco il tuo post:"), ragionamento (`<think>`), virgolette si tolgono **col codice**. Il resto
diventa un avviso visibile all'operatore.

### 5. CockroachDB — le trappole già pagate

- Gli id sono **piccoli** (sequenze `wesion.<tabella>_id_seq`, migrazione del 15/09/2026).
  Nelle route: `const x = Number(id); if (!Number.isSafeInteger(x)) → 400`.
  **Mai `Number.isFinite(stringa)`**: è sempre false (26 route rotte il 14/09).
- Tabelle nuove: `id BIGINT PRIMARY KEY DEFAULT nextval('wesion.<t>_id_seq')` con la sequenza
  creata prima, **non** `BIGSERIAL` (su Cockroach dà `unique_rowid()` a 19 cifre).
- Parametri numerici in espressioni: cast esplicito (`INTERVAL '1 minute' * $1::INT`), altrimenti
  `unsupported binary operator` (il router è stato fermo per questo).
- JSONB: `JSON.stringify(oggetto)` con `$n::JSONB`. Booleani come veri booleani JS.
- Schema: solo `ALTER ... IF NOT EXISTS` in fondo a `db/schema.sql`, idempotente. I CHECK su
  `bozza.tipo`, `servizio.tipo`, `pubblicazione.destinazione` vanno **ricreati** includendo i
  valori vecchi (verificare il nome del vincolo con `SHOW CONSTRAINTS FROM wesion.bozza`).

## Il modello dati (proposta — verificala contro lo schema prima di applicarla)

- `servizio.tipo` += `'social'`, con `config`: `{ canali: ['facebook','instagram'], post_a_settimana: 3, formati: [...], tono_social?: string }`
- `bozza.tipo` += `'social'`. Dentro `contenuto` (JSONB):
  ```json
  {
    "canale": "instagram",
    "formato": "post | carosello | reel | domanda",
    "framework": "PAS | AIDA | BAB | STAR | libero",
    "ganci": ["...", "..."],
    "gancio_scelto": 0,
    "testo": "...",
    "primo_commento": "...",
    "hashtag": ["..."],
    "slide": [{ "n": 1, "testo": "...", "prompt_immagine": "..." }],
    "script_reel": [{ "secondi": "0-3", "a_video": "...", "voce": "..." }],
    "dati_mancanti": ["anni di attività", "..."]
  }
  ```
- `bozza.fatto_id` resta obbligatorio in pratica: ogni contenuto social nasce da un fatto, come i post GBP.
- `pubblicazione.destinazione` += `'facebook'`, `'instagram'` **solo in fase 2**.

## Le fasi — una alla volta, ognuna deployabile da sola

### Fase 1 — Scrivere (niente pubblicazione automatica)

1. Servizio `social` attivabile dalla scheda cliente (tab «Servizi»), spento di default.
2. Il piano del mese genera slot social con **formato** e **framework**, rotazione dei pilastri,
   ricorrenze solo se pertinenti.
3. «Scrivi il testo» sulla bozza social: ganci, testo, primo commento, hashtag, avvisi.
   Carosello: testo delle slide + prompt immagine. Reel: script a battute.
4. `controlloTesto.ts`: controlli social come **avvisi**.
5. In consolle bozze: approvazione come le altre, più **«Copia per Facebook/Instagram»**
   (testo + primo commento + hashtag). L'operatore pubblica a mano da Meta Business Suite.
6. Criterio di fatto: su un cliente con voce e almeno 4 fatti, 12 bozze social del mese in cui
   **nessuna affermazione è fuori dai fatti**, e dove i fatti mancano la bozza lo dice.

### Fase 2 — Immagini e pubblicazione

- Generazione immagini dai `prompt_immagine` (Imagen), caricate con `media.mywebby.it/upload.php`
  (header `X-Upload-Token`, `User-Agent` obbligatorio: il WAF di Ergonet dà 403 senza).
- Pubblicazione via **Meta Graph API** dal **router** su Oracle, come GBP: `pubblica_at`,
  presa con `presa_at`, esito in `pubblicazione`. Token di pagina per cliente, **mai** in chiaro
  nel codice né nel repo. Serve un'app Meta con le autorizzazioni: fermati e chiedi prima.

### Fase 3 — Idee e numeri

- **Ricerca di settore** (`niche-research`): cerca notizie e trend recenti **con la fonte
  (URL)**. Il risultato sono **proposte di fatti** (`fonte = 'ricerca'`, non attivi) che
  l'operatore conferma. Mai testo diretto in un post.
- **Analisi di un reel di riferimento**: struttura (gancio, ritmo, CTA) riusata sul fatto del
  cliente, mai il contenuto altrui.
- **Numeri**: import del CSV esportato da Meta Business Suite, top e flop per formato e pilastro,
  5 consigli. Il piano del mese successivo può pesare i formati che funzionano.

## Come lavori

- Commit piccoli su `main`, uno per passo, messaggio in italiano che dice **perché**.
- Prima di ogni commit: `npx tsc --noEmit -p .` deve passare.
- Il deploy (`npm run deploy`) **lo decide l'operatore**: chiedi prima. Se `deploy.py` si ferma
  su "Modifiche non committate", è `STATO.md` dell'altra sessione: non committarlo al posto suo.
- Commenti nel codice in italiano, nello stile dei file esistenti: spiegano **perché**, citano
  la data e il caso vero che ha insegnato la regola.
- Aggiorna `STATO.md` con una sezione nuova per il modulo social.
- Se una decisione non è coperta da questo documento, **chiedi**. Non inventare regole di
  prodotto, esattamente come i post non devono inventare fatti.

## Per cominciare

Rispondi con:
1. cosa hai capito di `voce`, `fatto`, `piano` e `controlloTesto` (5 righe, per verificare che
   li hai letti davvero);
2. il piano della **Fase 1** file per file, con le modifiche allo schema;
3. le domande che hai.

Non scrivere codice finché l'operatore non approva il piano.
