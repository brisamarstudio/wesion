/**
 * Elenco aziende — filtrato, RAGGRUPPATO e paginato lato server.
 *
 * ⚠️ IL RAGGRUPPAMENTO NON È DECORAZIONE. Senza, due campagne diverse finiscono
 * nello stesso mucchio: i dentisti di Abbiategrasso in fondo e i ristoranti di
 * Vigevano in cima, perché l'ordine è per punteggio e i dentisti un audit non
 * ce l'hanno ancora. Quaranta righe di seguito senza uno stacco non si leggono:
 * si scorrono, che è un'altra cosa.
 *
 * ⚠️ IL GRUPPO DI DEFAULT È LA CAMPAGNA, e la scelta è misurata, non a naso.
 * Contati sui dati veri (27/08/2026, 77 aziende):
 *
 *   categoria  24 gruppi  ← inutile: le categorie di Google Maps sono granulari
 *                           («Ristorante toscano», «Ristopub», «Pizza da
 *                           asporto»), e vengono fuori venti gruppi da una riga
 *   città       4 gruppi
 *   campagna    3 gruppi  ← 46 ristoranti a Vigevano, 30 dentisti ad
 *                           Abbiategrasso: È la divisione vera
 *
 * «I dentisti mischiati ai food» erano due campagne diverse finite nello stesso
 * elenco. Raggrupparle è la risposta esatta a quel problema; raggruppare per
 * categoria avrebbe prodotto più rumore di prima.
 *
 * Lo stato della vista sta nell'URL: un filtro si manda a qualcuno, si mette
 * nei segnalibri, e il tasto indietro fa quello che ci si aspetta.
 */
import { query } from '@/lib/db';
import { Telaio } from '@/componenti/Telaio';
import { ElencoAziende, type Azienda } from '@/componenti/ElencoAziende';
import { RicercheDaChiamare } from '@/componenti/RicercheDaChiamare';
import type { RiassuntoRicerca } from '@/lib/ricerche';
import { RICETTIVA } from '@/lib/prenotazioni';

export const dynamic = 'force-dynamic';

/**
 * Venticinque e non quaranta.
 *
 * Con quaranta righe si arriva in fondo alla pagina senza aver deciso niente.
 * Venticinque stanno in due schermate e si finiscono.
 */
const PER_PAGINA = 25;

export default async function PaginaAziende({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    stato?: string;
    categoria?: string;
    citta?: string;
    campagna?: string;
    sito?: string;
    scheda?: string;
    gruppo?: string;
    pagina?: string;
    vista?: string;
  }>;
}) {
  const p = await searchParams;

  /**
   * ⚠️ LA PRIMA SCHERMATA SONO LE RICERCHE, NON LE AZIENDE (02/11/2026).
   *
   * Senza una ricerca scelta, una cerca o «?vista=elenco», la pagina mostra una
   * scheda per ricerca con il verdetto scritto (vedi RicercheDaChiamare). Il
   * vecchio elenco unico resta dietro «Tutto in un elenco»: con cinque o sei
   * ricerche nello stesso mucchio non si leggeva piu'.
   */
  const conFiltri = Boolean(
    p.campagna || p.q || p.categoria || p.citta || p.sito || p.scheda || (p.stato && p.stato !== 'tutti')
  );
  if (!conFiltri && p.vista !== 'elenco') {
    const [ricerche, senza] = await Promise.all([
      query<RiassuntoRicerca>(`
        WITH a AS (
          SELECT a.id, a.nome, a.campagna_id, a.stato,
                 COALESCE(a.categoria, '') ~* $1                      AS ricettiva,
                 a.prenotazione->>'tipo'                              AS pren,
                 a.prenotazione->>'nome'                              AS pren_nome,
                 (a.raw_json->>'totalScore')::numeric AS voto,
                 (a.raw_json->>'reviewsCount')::int   AS recensioni,
                 NOT EXISTS (SELECT 1 FROM wesion.contatto c
                              WHERE c.azienda_id = a.id AND c.tipo = 'sito') AS senza_sito,
                 (a.raw_json->>'claimThisBusiness') = 'true'                AS scheda_nessuno,
                 (SELECT x.score FROM wesion.audit x
                   WHERE x.azienda_id = a.id AND x.esito = 'ok'
                   ORDER BY x.eseguito_at DESC LIMIT 1)                      AS score
            FROM wesion.azienda a
           WHERE a.stato <> 'cliente' AND a.campagna_id IS NOT NULL
        ),
        b AS (
          SELECT a.*,
                 -- Ordine di chiamata: prima chi ha un problema che si vede in
                 -- trenta secondi (scheda di nessuno, nessun sito), poi i siti
                 -- deboli, poi gli altri. A parita' vince chi ha piu' clienti.
                 --
                 -- Per le strutture ricettive conta un'altra cosa: dove va chi
                 -- vuole prenotare (vedi src/lib/prenotazioni.ts). Chi ha gia'
                 -- un motore suo va in fondo, non in cima.
                 CASE WHEN a.ricettiva THEN
                        CASE a.pren
                          WHEN 'manda_a_portale' THEN 0
                          WHEN 'portale'         THEN 1
                          WHEN 'senza_sito'      THEN 1
                          WHEN 'nessun_motore'   THEN 2
                          WHEN 'motore'          THEN 4
                          ELSE 3 END
                      WHEN a.scheda_nessuno THEN 0
                      WHEN a.senza_sito THEN 1
                      WHEN a.score >= 70 THEN 2
                      ELSE 3 END AS fascia
            FROM a
        )
        SELECT c.id, c.nome, c.categoria, c.citta, c.creata_at,
               count(b.id)::int                                                         AS totale,
               count(b.id) FILTER (WHERE b.stato = 'prospect')::int                     AS da_chiamare,
               count(b.id) FILTER (WHERE b.stato = 'contattato')::int                   AS contattati,
               count(b.id) FILTER (WHERE b.stato = 'in_trattativa')::int                AS in_trattativa,
               count(b.id) FILTER (WHERE b.stato = 'perso')::int                        AS persi,
               count(b.id) FILTER (WHERE b.stato = 'prospect' AND b.senza_sito)::int    AS senza_sito,
               count(b.id) FILTER (WHERE b.stato = 'prospect' AND b.scheda_nessuno)::int AS scheda_nessuno,
               count(b.id) FILTER (WHERE b.stato = 'prospect' AND b.fascia <= 1)::int   AS calde,
               count(b.id) FILTER (WHERE b.stato = 'prospect' AND b.fascia = 2)::int    AS sito_debole,
               count(b.id) FILTER (WHERE b.stato = 'prospect' AND b.fascia = 3
                                     AND b.score IS NULL)::int                          AS da_controllare,
               count(b.id) FILTER (WHERE b.ricettiva)::int                              AS ricettive,
               count(b.id) FILTER (WHERE b.stato = 'prospect' AND b.ricettiva
                                     AND b.pren = 'manda_a_portale')::int               AS pren_a_portale,
               count(b.id) FILTER (WHERE b.stato = 'prospect' AND b.ricettiva
                                     AND b.pren IN ('portale','senza_sito'))::int       AS pren_solo_portali,
               count(b.id) FILTER (WHERE b.stato = 'prospect' AND b.ricettiva
                                     AND b.pren = 'nessun_motore')::int                 AS pren_nessun_motore,
               count(b.id) FILTER (WHERE b.stato = 'prospect' AND b.ricettiva
                                     AND b.pren = 'motore')::int                        AS pren_motore,
               count(b.id) FILTER (WHERE b.stato = 'prospect' AND b.ricettiva
                                     AND (b.pren IS NULL OR b.pren = 'non_letto'))::int AS pren_da_verificare,
               (SELECT string_agg(DISTINCT x.pren_nome, ', ') FROM b x
                 WHERE x.campagna_id = c.id AND x.pren = 'motore'
                   AND x.pren_nome NOT LIKE 'motore su %')                              AS pren_motori,
               (SELECT json_agg(json_build_object('id', t.id, 'nome', t.nome, 'perche', t.perche))
                  FROM (SELECT x.id, x.nome,
                               CASE
                                 WHEN x.ricettiva THEN
                                   CASE x.pren
                                     WHEN 'manda_a_portale' THEN 'Prenota porta a ' || COALESCE(x.pren_nome, 'un portale')
                                     WHEN 'portale'         THEN 'nessun sito suo: ' || COALESCE(x.pren_nome, 'un portale')
                                     WHEN 'senza_sito'      THEN 'nessun sito'
                                     WHEN 'nessun_motore'   THEN 'nessuna prenotazione online'
                                     WHEN 'motore'          THEN 'ha già ' || COALESCE(x.pren_nome, 'un motore')
                                     ELSE 'da verificare'
                                   END
                                 WHEN x.fascia = 0 THEN 'scheda Google di nessuno'
                                 WHEN x.fascia = 1 THEN 'nessun sito'
                                 WHEN x.fascia = 2 THEN 'sito debole'
                                 ELSE ''
                               END
                               || CASE WHEN x.recensioni >= 50
                                       THEN ' · ' || x.recensioni || ' recensioni' ELSE '' END AS perche
                          FROM b x
                         WHERE x.campagna_id = c.id AND x.stato = 'prospect'
                         ORDER BY x.fascia, x.recensioni DESC NULLS LAST, x.voto DESC NULLS LAST
                         LIMIT 3) t)                                                    AS primi
          FROM wesion.campagna c
          LEFT JOIN b ON b.campagna_id = c.id
         GROUP BY c.id
         ORDER BY c.creata_at DESC
         LIMIT 50`, [RICETTIVA.source]),
      query<{ quante: number }>(
        `SELECT count(*)::int AS quante FROM wesion.azienda
          WHERE stato <> 'cliente' AND campagna_id IS NULL`
      ),
    ]);
    return (
      <Telaio attiva="/aziende">
        <RicercheDaChiamare ricerche={ricerche} senzaRicerca={senza[0].quante} />
      </Telaio>
    );
  }

  const cerca = (p.q ?? '').trim();
  const stato = p.stato && p.stato !== 'tutti' ? p.stato : null;
  const categoria = p.categoria || null;
  const citta = p.citta || null;
  const campagna = p.campagna ? Number(p.campagna) : null;
  // 'no' = solo chi non ha un sito: per chi vende siti è il filtro che conta.
  const sito = p.sito === 'no' ? false : p.sito === 'si' ? true : null;
  // La scheda Google c'e' ma non l'ha rivendicata nessuno: e' un filtro a se'
  // perche' e' un'altra vendita. "Senza sito" e' un problema che il cliente ha
  // imparato a tollerare; la scheda di nessuno e' un problema che non sa di
  // avere, e finche' resta cosi' NON PUO' comprare Wesion nemmeno volendo.
  const scheda = p.scheda === 'nessuno' ? true : null;
  const gruppo = ['categoria', 'citta', 'campagna', 'nessuno'].includes(p.gruppo ?? '')
    ? (p.gruppo as string)
    : 'campagna';
  const pagina = Math.max(1, Number(p.pagina) || 1);

  /**
   * Il pezzo di WHERE che tutte le query condividono: scritto una volta.
   *
   * ⚠️ SE AGGIUNGI UN FILTRO QUI, RINUMERA QUELLO CHE VIENE DOPO. I segnaposto
   * sono posizionali e continuano DENTRO la query principale: `DOVE` occupa
   * $1..$7, poi vengono $8 (il raggruppamento), $9 e $10 (LIMIT e OFFSET).
   *
   * Il 02/09/2026 il filtro «scheda di nessuno» si è preso $7, che era già del
   * raggruppamento, e la pagina è morta in produzione con «bind message
   * supplies 10 parameters, but prepared statement requires 9». Né TypeScript
   * né `next build` possono vederlo: per loro è una stringa. L'unico controllo
   * che lo trova è contare i segnaposto e i parametri, oppure APRIRE LA PAGINA
   * — e quella volta non l'avevo aperta.
   */
  const DOVE = `
    /*
     * ⚠️ I CLIENTI NON STANNO QUI (02/09/2026). Questa pagina serve a decidere
     * chi chiamare, e chi ha gia' firmato non e' una telefonata da fare: era
     * una riga da saltare ogni volta, con accanto un pannello che gli proponeva
     * di "aprire il discorso". Hanno la loro pagina, /clienti, dove
     * l'ispettore parla la lingua giusta.
     *
     * Si escludono QUI e non nella vista, cosi' valgono per tutte le query
     * insieme - elenco, conteggio e paginazione dicono lo stesso numero. E si
     * puo' comunque PROMUOVERE un lead a cliente dal pannello: dopo quel click
     * la riga sparisce di qua e compare di la', che e' esattamente quello che
     * deve succedere.
     */
    a.stato <> 'cliente'
    AND ($1::text IS NULL OR a.stato = $1)
    AND ($2::text = '' OR a.nome ILIKE '%' || $2 || '%' OR a.citta ILIKE '%' || $2 || '%'
         OR a.categoria ILIKE '%' || $2 || '%'
         OR EXISTS (SELECT 1 FROM wesion.contatto c
                     WHERE c.azienda_id = a.id AND c.valore ILIKE '%' || $2 || '%'))
    AND ($3::text IS NULL OR a.categoria = $3)
    AND ($4::text IS NULL OR a.citta = $4)
    AND ($5::bigint IS NULL OR a.campagna_id = $5)
    AND ($6::boolean IS NULL OR
         EXISTS (SELECT 1 FROM wesion.contatto c WHERE c.azienda_id = a.id AND c.tipo = 'sito') = $6)
    AND ($7::boolean IS NULL OR (a.raw_json->>'claimThisBusiness' = 'true') = $7)`;

  const filtri = [stato, cerca, categoria, citta, campagna, sito, scheda];

  /**
   * ⚠️ TUTTE INSIEME, non una dietro l'altra.
   *
   * Sono sei query e nessuna usa il risultato di un'altra, ma erano scritte in
   * fila con un `await` ciascuna: sei viaggi a Neon uno dopo l'altro. Misurato
   * il 27/08/2026, un round trip a Francoforte costa 38 ms — quindi 230 ms
   * spesi ad aspettare, su una pagina che ne impiegava 440 in tutto. Metà del
   * tempo era coda.
   *
   * `Promise.all` le manda insieme: il costo diventa quello della più lenta.
   */
  const [aziende, conteggioTotale, senzaAudit, conteggi, categorie, citte, campagne] = await Promise.all([
    query<Azienda>(
    `SELECT
       a.id, a.slug, a.nome, a.categoria, a.citta, a.provincia, a.stato, a.maps_url,
       a.ultimo_contatto_canale, a.ultimo_contatto_at,
       sito.repo_url AS sito_repo_url, sito.gsc_proprieta AS sito_gsc_proprieta,
       sito.ultima_pr_url AS sito_ultima_pr_url, sito.ultimo_audit_at AS sito_ultimo_audit_at,
       sito.ultimo_errore AS sito_ultimo_errore,
       camp.nome AS campagna,
       ultimo.score, ultimo.note AS audit_note, ultimo.hook AS audit_hook,
       ultimo.scansione AS audit_scansione, ultimo.modello AS audit_modello,
       ultimo.eseguito_at AS audit_quando,
       (SELECT y.errore FROM wesion.audit y
         WHERE y.azienda_id = a.id ORDER BY y.eseguito_at DESC LIMIT 1) AS audit_errore,
       (SELECT c.valore FROM wesion.contatto c
         WHERE c.azienda_id = a.id AND c.tipo = 'telefono'
         ORDER BY c.e_titolare DESC, c.id LIMIT 1)                      AS telefono,
       -- Il normalizzato serve a wa.me, che vuole solo cifre col prefisso.
       (SELECT c.normalizzato FROM wesion.contatto c
         WHERE c.azienda_id = a.id AND c.tipo IN ('telefono','whatsapp')
         ORDER BY c.e_titolare DESC, c.id LIMIT 1)                      AS telefono_normalizzato,
       (SELECT c.valore FROM wesion.contatto c
         WHERE c.azienda_id = a.id AND c.tipo = 'email'
         ORDER BY c.id LIMIT 1)                                         AS email,
       (SELECT c.normalizzato FROM wesion.contatto c
         WHERE c.azienda_id = a.id AND c.tipo = 'sito'
         ORDER BY c.id LIMIT 1)                                         AS sito,
       /*
        * Il voto e le recensioni di Google, che lo scraper porta a casa da
        * sempre dentro raw_json e che nessuno guardava.
        * (Niente backtick qui dentro: chiuderebbero il template literal.)
        *
        * ⚠️ E' il segnale piu' forte che abbiamo per scegliere chi chiamare, ed
        * era li' inutilizzato: un'attivita' con 4.7 stelle su 629 recensioni e
        * nessun sito ha gia' i clienti e la reputazione — le manca solo la
        * vetrina. Il punteggio dell'audit da solo non lo dice: quello guarda il
        * sito, non quanta gente li' dentro ci va contenta.
        */
       (a.raw_json->>'totalScore')::numeric   AS voto,
       (a.raw_json->>'reviewsCount')::int     AS recensioni,
       /*
        * ⚠️ LA SCHEDA GOOGLE ESISTE MA NON E' DI NESSUNO (02/09/2026).
        *
        * Google se le genera da sola, le schede: nome, foto, orari, recensioni.
        * Averla non vuol dire possederla. Finche' nessuno la rivendica il
        * titolare non puo' rispondere a una recensione, non puo' pubblicare un
        * post — cioe' il prodotto centrale di Wesion e' per lui impossibile —
        * e chiunque puo' suggerire una modifica ai suoi orari.
        *
        * Ludovico Il Moro, Vigevano: 677 recensioni, 361 foto, nessun
        * proprietario. Verificato a mano su Maps, che gli chiede ancora "Sei il
        * proprietario di quest'attivita'?" — quella riga Google la mostra solo
        * sulle schede non rivendicate. Due fonti indipendenti, stesso verdetto.
        *
        * Perche' vale piu' di "senza sito": senza sito e' un problema che il
        * cliente ha imparato a tollerare, la scheda di nessuno e' un problema
        * che non sa di avere e che gli dimostri in trenta secondi.
        */
       (a.raw_json->>'claimThisBusiness') = 'true' AS scheda_da_rivendicare,
       a.prenotazione
     FROM wesion.azienda a
     LEFT JOIN wesion.campagna camp ON camp.id = a.campagna_id
     LEFT JOIN wesion.sito sito ON sito.azienda_id = a.id
     -- LATERAL e non tre sottoquery uguali: punteggio, note e gancio devono
     -- venire tutti DALLO STESSO audit, o un giorno il punteggio è di un giro
     -- e il gancio di un altro e nessuno se ne accorge.
     LEFT JOIN LATERAL (
       SELECT x.score, x.note, x.scansione, x.modello, x.hook, x.eseguito_at FROM wesion.audit x
        WHERE x.azienda_id = a.id AND x.esito = 'ok'
        ORDER BY x.eseguito_at DESC LIMIT 1
     ) ultimo ON true
     WHERE ${DOVE}
     /*
      * ⚠️ I GRUPPI SI ORDINANO PER QUANTO RENDONO, NON IN ALFABETICO.
      *
      * Raggruppare da solo non basta: con l'ordine alfabetico i 21 dentisti —
      * che un audit non ce l'hanno ancora — finivano in prima pagina e i
      * ristoranti col punteggio 95 in seconda. Separato il mucchio, sepolti i
      * lead migliori: un difetto peggiore di quello che curava.
      *
      * La finestra calcola il punteggio più alto DI TUTTO IL GRUPPO e ordina i
      * gruppi con quello. Poi, dentro, si scende per punteggio. Così la prima
      * schermata è sempre "la categoria su cui conviene lavorare oggi".
      */
     ORDER BY
       MAX(ultimo.score) OVER (PARTITION BY
         CASE $8::text
           WHEN 'categoria' THEN COALESCE(a.categoria, 'zzz')
           WHEN 'citta'     THEN COALESCE(a.citta, 'zzz')
           WHEN 'campagna'  THEN COALESCE(camp.nome, 'zzz')
           ELSE ''
         END
       ) DESC NULLS LAST,
       CASE $8::text
         WHEN 'categoria' THEN COALESCE(a.categoria, 'zzz')
         WHEN 'citta'     THEN COALESCE(a.citta, 'zzz')
         WHEN 'campagna'  THEN COALESCE(camp.nome, 'zzz')
         ELSE ''
       END,
       /* A parita' di punteggio vince chi ha piu' recensioni: fra due locali
          senza sito, quello con 629 clienti contenti si chiama per primo. */
       ultimo.score DESC NULLS LAST, recensioni DESC NULLS LAST, a.nome
     LIMIT $9 OFFSET $10`,
      [...filtri, gruppo, PER_PAGINA, (pagina - 1) * PER_PAGINA]
    ),

    query<{ quante: number }>(`SELECT count(*)::int AS quante FROM wesion.azienda a WHERE ${DOVE}`, filtri),

    /**
     * Quante non sono mai state analizzate.
     *
     * Serve a scrivere il numero SUL BOTTONE: "Analizza le mancanti" non
     * diceva mancanti di cosa, ne' quante — si cliccava alla cieca e si
     * aspettava minuti senza sapere se stesse lavorando su tre aziende o su
     * trenta. Il conteggio guarda TUTTE le aziende e non solo la pagina: il
     * giro dell'audit fa lo stesso.
     */
    query<{ quante: number }>(
      `SELECT count(*)::int AS quante FROM wesion.azienda a
        WHERE NOT EXISTS (SELECT 1 FROM wesion.audit x
                           WHERE x.azienda_id = a.id AND x.esito = 'ok')`
    ),

    // I conteggi per stato guardano SEMPRE tutte le aziende: dicono quanto c'è
    // di là, non quanto se ne vede di qua.
    query<{ stato: string; quanti: number }>(
      `SELECT stato, count(*)::int AS quanti FROM wesion.azienda
        WHERE stato <> 'cliente' GROUP BY stato`
    ),

    query<{ valore: string; quanti: number }>(
      `SELECT categoria AS valore, count(*)::int AS quanti FROM wesion.azienda
        WHERE COALESCE(categoria,'') <> '' GROUP BY 1 HAVING count(*) > 1 ORDER BY 2 DESC, 1`
    ),
    query<{ valore: string; quanti: number }>(
      `SELECT citta AS valore, count(*)::int AS quanti FROM wesion.azienda
        WHERE COALESCE(citta,'') <> '' GROUP BY 1 HAVING count(*) > 1 ORDER BY 2 DESC, 1`
    ),
    query<{ id: number; nome: string; quanti: number }>(
      `SELECT c.id, c.nome, count(a.id)::int AS quanti
         FROM wesion.campagna c JOIN wesion.azienda a ON a.campagna_id = c.id
        GROUP BY c.id, c.nome ORDER BY c.creata_at DESC LIMIT 20`
    ),
  ]);

  const quante = conteggioTotale[0].quante;
  const daAnalizzare = senzaAudit[0].quante;

  return (
    <Telaio attiva="/aziende">
      <ElencoAziende
        aziende={aziende}
        conteggi={Object.fromEntries(conteggi.map((c) => [c.stato, c.quanti]))}
        quante={quante}
        daAnalizzare={daAnalizzare}
        pagina={pagina}
        perPagina={PER_PAGINA}
        gruppo={gruppo}
        vista={{
          q: cerca,
          stato: p.stato ?? 'tutti',
          categoria: categoria ?? '',
          citta: citta ?? '',
          campagna: p.campagna ?? '',
          sito: p.sito ?? '',
          scheda: p.scheda ?? '',
        }}
        opzioni={{ categorie, citte, campagne }}
      />
    </Telaio>
  );
}
