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
    gruppo?: string;
    pagina?: string;
  }>;
}) {
  const p = await searchParams;
  const cerca = (p.q ?? '').trim();
  const stato = p.stato && p.stato !== 'tutti' ? p.stato : null;
  const categoria = p.categoria || null;
  const citta = p.citta || null;
  const campagna = p.campagna ? Number(p.campagna) : null;
  // 'no' = solo chi non ha un sito: per chi vende siti è il filtro che conta.
  const sito = p.sito === 'no' ? false : p.sito === 'si' ? true : null;
  const gruppo = ['categoria', 'citta', 'campagna', 'nessuno'].includes(p.gruppo ?? '')
    ? (p.gruppo as string)
    : 'campagna';
  const pagina = Math.max(1, Number(p.pagina) || 1);

  /** Il pezzo di WHERE che tutte le query condividono: scritto una volta. */
  const DOVE = `
    ($1::text IS NULL OR a.stato = $1)
    AND ($2::text = '' OR a.nome ILIKE '%' || $2 || '%' OR a.citta ILIKE '%' || $2 || '%'
         OR a.categoria ILIKE '%' || $2 || '%'
         OR EXISTS (SELECT 1 FROM wesion.contatto c
                     WHERE c.azienda_id = a.id AND c.valore ILIKE '%' || $2 || '%'))
    AND ($3::text IS NULL OR a.categoria = $3)
    AND ($4::text IS NULL OR a.citta = $4)
    AND ($5::bigint IS NULL OR a.campagna_id = $5)
    AND ($6::boolean IS NULL OR
         EXISTS (SELECT 1 FROM wesion.contatto c WHERE c.azienda_id = a.id AND c.tipo = 'sito') = $6)`;

  const filtri = [stato, cerca, categoria, citta, campagna, sito];

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
       (a.raw_json->>'reviewsCount')::int     AS recensioni
     FROM wesion.azienda a
     LEFT JOIN wesion.campagna camp ON camp.id = a.campagna_id
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
         CASE $7::text
           WHEN 'categoria' THEN COALESCE(a.categoria, 'zzz')
           WHEN 'citta'     THEN COALESCE(a.citta, 'zzz')
           WHEN 'campagna'  THEN COALESCE(camp.nome, 'zzz')
           ELSE ''
         END
       ) DESC NULLS LAST,
       CASE $7::text
         WHEN 'categoria' THEN COALESCE(a.categoria, 'zzz')
         WHEN 'citta'     THEN COALESCE(a.citta, 'zzz')
         WHEN 'campagna'  THEN COALESCE(camp.nome, 'zzz')
         ELSE ''
       END,
       /* A parita' di punteggio vince chi ha piu' recensioni: fra due locali
          senza sito, quello con 629 clienti contenti si chiama per primo. */
       ultimo.score DESC NULLS LAST, recensioni DESC NULLS LAST, a.nome
     LIMIT $8 OFFSET $9`,
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
      `SELECT stato, count(*)::int AS quanti FROM wesion.azienda GROUP BY stato`
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
        }}
        opzioni={{ categorie, citte, campagne }}
      />
    </Telaio>
  );
}
