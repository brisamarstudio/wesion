-- Wesion — schema unico. Neon eu-central-1.
-- I commenti dicono PERCHE', non cosa: il cosa si rilegge dal codice, il perche' no.
-- Creato il 25/08/2026.

CREATE SCHEMA IF NOT EXISTS wesion;

-- ============================== CHI ==============================

CREATE TABLE IF NOT EXISTS wesion.campagna (
  id            BIGSERIAL PRIMARY KEY,
  nome          TEXT UNIQUE NOT NULL,
  categoria     TEXT NOT NULL,
  citta         TEXT[] NOT NULL,
  apify_run_id  TEXT,
  creata_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wesion.azienda (
  id            BIGSERIAL PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  nome          TEXT NOT NULL,
  -- Il Place ID identifica IL POSTO, non un suo attributo. Nome e telefono
  -- cambiano, il posto no. Nullo per le aziende inserite a mano.
  -- Sostituisce due chiavi incompatibili: UNIQUE(nome,citta,telefono) di leadgen
  -- e UNIQUE(telefono) del router, che disaccordavano in silenzio.
  place_id      TEXT UNIQUE,
  categoria     TEXT,
  indirizzo     TEXT,
  cap           TEXT,
  citta         TEXT,
  provincia     TEXT,
  regione       TEXT,
  paese         TEXT NOT NULL DEFAULT 'IT',
  lat           DOUBLE PRECISION,
  lon           DOUBLE PRECISION,
  maps_url      TEXT,
  -- Un lead che diventa cliente NON cambia tabella: cambia questo campo.
  stato         TEXT NOT NULL DEFAULT 'prospect'
                CHECK (stato IN ('prospect','contattato','in_trattativa',
                                 'cliente','perso','archiviato')),
  campagna_id   BIGINT REFERENCES wesion.campagna(id) ON DELETE SET NULL,
  fonte         TEXT NOT NULL DEFAULT 'apify_gmaps',
  raw_json      JSONB,
  note          TEXT,
  creata_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggiornata_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_azienda_stato ON wesion.azienda (stato);
CREATE INDEX IF NOT EXISTS idx_azienda_citta ON wesion.azienda (citta);

CREATE TABLE IF NOT EXISTS wesion.contatto (
  id            BIGSERIAL PRIMARY KEY,
  azienda_id    BIGINT NOT NULL REFERENCES wesion.azienda(id) ON DELETE CASCADE,
  -- 'lid' e' un tipo come gli altri: su motore GOWS il mittente arriva a volte
  -- come ...@lid invece del numero. Qui e' un contatto in piu', non un caso speciale.
  tipo          TEXT NOT NULL
                CHECK (tipo IN ('telefono','whatsapp','lid','email',
                                'sito','facebook','instagram')),
  valore        TEXT NOT NULL,
  normalizzato  TEXT,
  -- Il router accetta come mittente solo i contatti del titolare.
  e_titolare    BOOLEAN NOT NULL DEFAULT false,
  verificato_at TIMESTAMPTZ,
  note          TEXT,
  creato_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (azienda_id, tipo, normalizzato)
);
-- Il router cerca qui a ogni messaggio in arrivo: deve essere istantaneo.
CREATE INDEX IF NOT EXISTS idx_contatto_norm ON wesion.contatto (normalizzato)
  WHERE tipo IN ('whatsapp','lid','telefono');

-- ========================= COSA SAPPIAMO =========================

-- Le tre famiglie stanno in colonne separate APPOSTA. Tenerle insieme sotto
-- un unico "non citare" (fino al 25/07/2026) imbavagliava le parole del cliente:
-- il modello obbediva alla lettera e la voce non arrivava mai al testo.
CREATE TABLE IF NOT EXISTS wesion.voce (
  azienda_id    BIGINT PRIMARY KEY REFERENCES wesion.azienda(id) ON DELETE CASCADE,
  -- SFONDO: sceglie il taglio, non si cita mai
  origine       TEXT,
  come_ragiona  TEXT,
  -- MATERIALE: viene dalle recensioni, e' verificato da terzi, SI USA
  apprezzato    TEXT[] NOT NULL DEFAULT '{}',
  -- ISTRUZIONI: come scrivere
  voce          TEXT,
  parole_sue    TEXT[] NOT NULL DEFAULT '{}',
  da_evitare    TEXT[] NOT NULL DEFAULT '{}',
  -- CONFINI: non dipendono dalla piazza, valgono su Google come sul sito
  non_fa        TEXT[] NOT NULL DEFAULT '{}',
  mai_dire      TEXT[] NOT NULL DEFAULT '{}',
  aggiornata_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabella e non JSONB perche' bozza.fatto_id deve poterci puntare: un post
-- deve sapere su quale fatto si reggeva, anche fra sei mesi.
CREATE TABLE IF NOT EXISTS wesion.fatto (
  id            BIGSERIAL PRIMARY KEY,
  azienda_id    BIGINT NOT NULL REFERENCES wesion.azienda(id) ON DELETE CASCADE,
  chiave        TEXT NOT NULL,
  valore        TEXT NOT NULL,
  fonte         TEXT NOT NULL
                CHECK (fonte IN ('detto_dal_cliente','recensioni','sito',
                                 'maps','ricerca')),
  verificato_at TIMESTAMPTZ,
  scade_at      TIMESTAMPTZ,
  attivo        BOOLEAN NOT NULL DEFAULT true,
  creato_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fatto_azienda ON wesion.fatto (azienda_id) WHERE attivo;

-- Storico e non ultima-vince: oggi updateLeadAudit sovrascrive, quindi un audit
-- fallito cancella quello buono di prima e non si vede se un sito e' migliorato.
CREATE TABLE IF NOT EXISTS wesion.audit (
  id            BIGSERIAL PRIMARY KEY,
  azienda_id    BIGINT NOT NULL REFERENCES wesion.azienda(id) ON DELETE CASCADE,
  eseguito_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- I punteggi di modelli diversi non sono confrontabili fra loro.
  modello       TEXT NOT NULL,
  sito_letto    TEXT,
  score         INTEGER CHECK (score BETWEEN 0 AND 100),
  note          TEXT,
  hook          TEXT,
  esito         TEXT NOT NULL DEFAULT 'ok' CHECK (esito IN ('ok','errore')),
  errore        TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_azienda ON wesion.audit (azienda_id, eseguito_at DESC);

CREATE TABLE IF NOT EXISTS wesion.servizio (
  id            BIGSERIAL PRIMARY KEY,
  azienda_id    BIGINT NOT NULL REFERENCES wesion.azienda(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL
                CHECK (tipo IN ('menu_del_giorno','post_gbp','blog','whatsapp_bot')),
  attivo        BOOLEAN NOT NULL DEFAULT true,
  -- menu: site_menu_url, site_secret, site_menu_page
  -- gbp:  gbp_account_id, gbp_location_id
  -- Il segreto e' per-cliente: non puo' stare in un .env.
  config        JSONB NOT NULL DEFAULT '{}',
  attivato_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (azienda_id, tipo)
);

-- ========================== COSA ESCE ============================

CREATE TABLE IF NOT EXISTS wesion.bozza (
  id            BIGSERIAL PRIMARY KEY,
  azienda_id    BIGINT NOT NULL REFERENCES wesion.azienda(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL
                CHECK (tipo IN ('menu','post_gbp','articolo','messaggio_lead')),
  origine       TEXT NOT NULL
                CHECK (origine IN ('foto_whatsapp','piano','manuale','audit')),
  -- Il piano crea bozze VUOTE con dentro il fatto da cui nascono: se il piano
  -- e' sbagliato lo vedi in dieci secondi da una griglia, non da trenta testi.
  fatto_id      BIGINT REFERENCES wesion.fatto(id) ON DELETE SET NULL,
  contenuto     JSONB NOT NULL DEFAULT '{}',
  stato         TEXT NOT NULL DEFAULT 'vuota'
                CHECK (stato IN ('vuota','generata','attesa_approvazione',
                                 'approvata','pubblicata','rifiutata','scaduta')),
  -- Il controllo rilegge il testo generato e accende avvisi. NON blocca, apposta:
  -- un falso positivo che blocca il lavoro viene disattivato entro una settimana.
  avvisi        JSONB NOT NULL DEFAULT '[]',
  modello       TEXT,
  -- 15 minuti per il menu: un SI tardivo non deve pubblicare quello di ieri.
  scade_at      TIMESTAMPTZ,
  approvata_da  TEXT,
  approvata_via TEXT CHECK (approvata_via IN ('whatsapp','dashboard')),
  approvata_at  TIMESTAMPTZ,
  creata_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- IL PONTE. La dashboard su Contabo scrive stato='approvata', il router su
-- Oracle legge da qui. Nessuna porta aperta su 172.17.0.1, nessun nginx, nessun TLS.
CREATE INDEX IF NOT EXISTS idx_bozza_approvate ON wesion.bozza (creata_at)
  WHERE stato = 'approvata';
CREATE INDEX IF NOT EXISTS idx_bozza_azienda ON wesion.bozza (azienda_id, creata_at DESC);

-- Una riga PER DESTINAZIONE: il menu va sul sito E su Google, e ciascuno puo'
-- fallire da solo. Con questa tabella "l'ultima pubblicazione riuscita risale a
-- tre giorni fa" e' una query, quindi una spia. Senza, e' una telefonata fra 32 ore.
CREATE TABLE IF NOT EXISTS wesion.pubblicazione (
  id            BIGSERIAL PRIMARY KEY,
  bozza_id      BIGINT NOT NULL REFERENCES wesion.bozza(id) ON DELETE CASCADE,
  destinazione  TEXT NOT NULL
                CHECK (destinazione IN ('sito','gbp','blog','whatsapp')),
  esito         TEXT NOT NULL CHECK (esito IN ('ok','errore')),
  url_risultato TEXT,
  -- Grezza: quando Google risponde 500 "INTERNAL" senza dire perche', l'unica
  -- cosa che aiuta e' rileggere cosa aveva risposto davvero.
  risposta      JSONB,
  errore        TEXT,
  tentativi     INTEGER NOT NULL DEFAULT 1,
  eseguita_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pubbl_dest ON wesion.pubblicazione (destinazione, eseguita_at DESC);

-- La pubblicazione SOVRASCRIVE. Senza rete, un OCR sbagliato cancella il menu
-- vero e non torna piu'. E' gia' successo: un'AI aveva inventato 16 piatti.
CREATE TABLE IF NOT EXISTS wesion.snapshot (
  id            BIGSERIAL PRIMARY KEY,
  azienda_id    BIGINT NOT NULL REFERENCES wesion.azienda(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL,
  contenuto     JSONB NOT NULL,
  motivo        TEXT,
  creato_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_snapshot ON wesion.snapshot (azienda_id, tipo, creato_at DESC);

CREATE TABLE IF NOT EXISTS wesion.messaggio (
  id            BIGSERIAL PRIMARY KEY,
  -- NULLO di proposito: un messaggio da un mittente sconosciuto e' un dato, non
  -- uno scarto. Di solito e' un titolare che scrive dal LID o da un secondo numero.
  azienda_id    BIGINT REFERENCES wesion.azienda(id) ON DELETE CASCADE,
  contatto_id   BIGINT REFERENCES wesion.contatto(id) ON DELETE SET NULL,
  direzione     TEXT NOT NULL CHECK (direzione IN ('in','out')),
  canale        TEXT NOT NULL DEFAULT 'whatsapp',
  autore        TEXT NOT NULL CHECK (autore IN ('bot','operatore','azienda')),
  testo         TEXT,
  media_url     TEXT,
  payload       JSONB,
  creato_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msg_azienda ON wesion.messaggio (azienda_id, creato_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_orfani ON wesion.messaggio (creato_at DESC)
  WHERE azienda_id IS NULL;

-- ================= COME SAPPIAMO CHE FUNZIONA ====================

CREATE TABLE IF NOT EXISTS wesion.spia (
  chiave        TEXT PRIMARY KEY,
  -- 'silenzio' e' la famiglia che di solito manca: nessun errore, nessun log, ma
  -- il cliente non ha piu' post in arrivo. Nessun sistema scrive una riga per
  -- una cosa che NON e' successa.
  famiglia      TEXT NOT NULL CHECK (famiglia IN ('guasto','silenzio','impianto')),
  -- 'non_eseguibile' esiste perche' una spia rotta non deve tacere: un pannello
  -- vuoto perche' la query e' fallita racconta la stessa bugia di un guasto muto.
  stato         TEXT NOT NULL CHECK (stato IN ('ok','accesa','non_eseguibile')),
  messaggio     TEXT,
  -- "accesa da tre giorni" e "accesa adesso" sono due urgenze diverse.
  dal           TIMESTAMPTZ,
  vista_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wesion.evento (
  id            BIGSERIAL PRIMARY KEY,
  azienda_id    BIGINT REFERENCES wesion.azienda(id) ON DELETE SET NULL,
  tipo          TEXT NOT NULL,
  -- Chi: un'email, 'router', 'watchdog'. Risponde a "perche' e' uscito questo?"
  -- senza leggere i log, che sono in append e mostrano righe vecchie.
  attore        TEXT,
  dettaglio     JSONB,
  creato_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evento_data ON wesion.evento (creato_at DESC);

CREATE TABLE IF NOT EXISTS wesion.utente (
  id                BIGSERIAL PRIMARY KEY,
  email             TEXT UNIQUE NOT NULL,
  password          TEXT NOT NULL,   -- bcrypt, mai in chiaro
  nome              TEXT,
  creato_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_accesso_at TIMESTAMPTZ
);

-- ============ AGGIUNTE DEL 27/08/2026 — il piano editoriale ============
-- Innesto di gbp-autoposter. La sua `SchedaFatti` era un JSONB unico; qui la
-- stessa materia sta gia' divisa fra `voce` (il tono e i confini) e `fatto` (le
-- cose vere, una riga ciascuna, con provenienza e scadenza). Mancavano due
-- informazioni che la scheda aveva e qui non avevano casa.

-- Il settore sceglie pilastri e ricorrenze pertinenti. Esplicito e NON dedotto
-- dalla categoria di Google: indovinare il settore da "Da Andrea" vuol dire
-- sbagliarlo, e l'errore si propaga su tutto il piano del mese.
ALTER TABLE wesion.azienda
  ADD COLUMN IF NOT EXISTS settore TEXT[] NOT NULL DEFAULT '{}';

-- A chi parla: "famiglie, ristoratori del pavese". Sta in `voce` e non fra i
-- fatti perche' non e' una cosa vera sull'azienda, e' un'istruzione su come
-- scrivere — come il tono.
ALTER TABLE wesion.voce
  ADD COLUMN IF NOT EXISTS pubblico TEXT;

-- Cosa si e' VISTO davvero sul sito, separato da cosa ne pensa il modello.
--
-- ⚠️ IL 31/08/2026 LA DASHBOARD MOSTRAVA LA SECONDA COSA COL NOME DELLA PRIMA.
-- La scansione (il sito risponde? ha il viewport? ha un form?) veniva calcolata,
-- data in pasto al modello e poi buttata: in tabella restava solo `note`, cioe'
-- la prosa del modello, che l'elenco presentava sotto l'etichetta "Cosa si e'
-- visto". Sul sito della Trattoria La Fenice — fatto da noi, responsive — ne e'
-- uscito "non ottimizzato per una grafica moderna, poco accattivante su
-- dispositivi recenti", mentre la scansione un secondo prima aveva registrato
-- viewport PRESENTE. Un gancio del genere letto al telefono a un ristoratore
-- che apre il sito dal cellulare mentre parlate fa perdere la chiamata.
--
-- I fatti sono deterministici e non costano niente: si conservano, e restano
-- veri anche quando l'AI e' giu' o dice sciocchezze.
ALTER TABLE wesion.audit
  ADD COLUMN IF NOT EXISTS scansione TEXT;

-- Il piano crea bozze VUOTE, e ne crea molte. Senza questo indice la query che
-- chiede "cosa c'e' da scrivere" scorre tutta la tabella a ogni giro.
CREATE INDEX IF NOT EXISTS idx_bozza_da_scrivere ON wesion.bozza (azienda_id, creata_at)
  WHERE stato = 'vuota';

-- ⚠️ Correzione del 27/08/2026, stesso giorno dell'errore.
--
-- Il piano scriveva la data di pubblicazione in `scade_at`, ma quella colonna
-- vuol dire "dopo questo istante NON pubblicare" — e il giro del router
-- pubblica tutto quello che e' approvato e non ancora scaduto. Un post
-- programmato per Natale e approvato a settembre sarebbe uscito a settembre.
-- Nessun errore, nessun log: il cliente se ne accorge guardando la sua scheda.
--
-- Due colonne, due significati opposti, nessuna ambiguita':
--   pubblica_at  non prima di    (il piano: esci il 25 dicembre)
--   scade_at     non dopo        (il menu: un SI tardivo non pubblica ieri)
ALTER TABLE wesion.bozza
  ADD COLUMN IF NOT EXISTS pubblica_at TIMESTAMPTZ;

-- Il giro del router chiede "cosa e' maturo adesso": deve costare poco.
CREATE INDEX IF NOT EXISTS idx_bozza_da_pubblicare ON wesion.bozza (pubblica_at)
  WHERE stato = 'approvata';

-- Cosa dice GOOGLE ADESSO di un post che abbiamo mandato.
--
-- ⚠️ "ACCETTATO" NON VUOL DIRE "ONLINE". Google risponde 200 e mette il post in
-- `state: PROCESSING`: la revisione arriva dopo, e puo' finire in `REJECTED`
-- senza avvisare nessuno. Il 01/09/2026, alla prima pubblicazione vera, la
-- riga in `pubblicazione` diceva `esito='ok'` mentre il post era ancora in
-- lavorazione — vero al momento dell'invio, e mai piu' riletto.
--
-- Senza queste due colonne un post respinto resta "uscito · ok" per sempre in
-- dashboard: e' il guasto muto applicato all'unica cosa che esce nel mondo. E
-- non e' teorico — il 20/07/2026 Google ha rimosso un post e sospeso la
-- pubblicazione su una scheda (vedi gbp-autoposter/STATO.md).
--
--   stato_remoto   l'ultimo `state` letto da Google (LIVE, PROCESSING, REJECTED...)
--   verificata_at  quando gliel'abbiamo chiesto l'ultima volta
ALTER TABLE wesion.pubblicazione
  ADD COLUMN IF NOT EXISTS stato_remoto  TEXT,
  ADD COLUMN IF NOT EXISTS verificata_at TIMESTAMPTZ;

-- Il giro delle verifiche cerca "quali sono da ricontrollare": le riuscite su
-- Google, mai verificate o verificate da un pezzo.
CREATE INDEX IF NOT EXISTS idx_pubbl_da_verificare
  ON wesion.pubblicazione (verificata_at NULLS FIRST)
  WHERE destinazione = 'gbp' AND esito = 'ok';
