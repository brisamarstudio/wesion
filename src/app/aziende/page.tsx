/**
 * Elenco aziende — ricerca, filtri e paginazione LATO SERVER.
 *
 * ⚠️ PERCHÉ NON PIÙ TUTTO NEL BROWSER. La prima versione caricava ogni riga e
 * filtrava in memoria: con 46 aziende va, con cinquecento la pagina impiega
 * secondi a disegnarsi e la ricerca trova solo quello che è già stato scaricato.
 * E cinquecento non è un'ipotesi — una campagna su tre città le fa in un
 * pomeriggio.
 *
 * Lo stato della vista sta nell'URL e non in `useState`, di proposito: così un
 * filtro si può mandare a qualcuno, tenere in un segnalibro, e il tasto
 * indietro fa quello che ci si aspetta.
 *
 * Il punteggio è l'ultimo audit RIUSCITO, non l'ultimo in assoluto: è tutto il
 * motivo per cui gli audit sono uno storico invece di una colonna sovrascritta.
 */
import { query } from '@/lib/db';
import { Telaio } from '@/componenti/Telaio';
import { ElencoAziende, type Azienda } from '@/componenti/ElencoAziende';

export const dynamic = 'force-dynamic';

const PER_PAGINA = 40;

export default async function PaginaAziende({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stato?: string; pagina?: string }>;
}) {
  const p = await searchParams;
  const cerca = (p.q ?? '').trim();
  const stato = p.stato && p.stato !== 'tutti' ? p.stato : null;
  const pagina = Math.max(1, Number(p.pagina) || 1);

  /**
   * I conteggi per stato si leggono SEMPRE su tutte le aziende, non sulla
   * pagina: servono a decidere dove andare, quindi devono dire quanto c'è di
   * là, non quanto se ne vede di qua.
   */
  const conteggi = await query<{ stato: string; quanti: number }>(
    `SELECT stato, count(*)::int AS quanti FROM wesion.azienda GROUP BY stato`
  );

  const aziende = await query<Azienda>(
    `SELECT
       a.id, a.slug, a.nome, a.categoria, a.citta, a.provincia, a.stato, a.maps_url,
       ultimo.score,
       ultimo.note        AS audit_note,
       ultimo.hook        AS audit_hook,
       ultimo.eseguito_at AS audit_quando,
       (SELECT y.errore FROM wesion.audit y
         WHERE y.azienda_id = a.id ORDER BY y.eseguito_at DESC LIMIT 1) AS audit_errore,
       (SELECT c.valore FROM wesion.contatto c
         WHERE c.azienda_id = a.id AND c.tipo = 'telefono'
         ORDER BY c.e_titolare DESC, c.id LIMIT 1)                      AS telefono,
       -- Il normalizzato serve per wa.me, che vuole solo cifre col prefisso:
       -- passargli "+39 0382 12 34" apre una chat con un numero inesistente.
       (SELECT c.normalizzato FROM wesion.contatto c
         WHERE c.azienda_id = a.id AND c.tipo IN ('telefono','whatsapp')
         ORDER BY c.e_titolare DESC, c.id LIMIT 1)                      AS telefono_normalizzato,
       (SELECT c.valore FROM wesion.contatto c
         WHERE c.azienda_id = a.id AND c.tipo = 'email'
         ORDER BY c.id LIMIT 1)                                         AS email,
       (SELECT c.normalizzato FROM wesion.contatto c
         WHERE c.azienda_id = a.id AND c.tipo = 'sito'
         ORDER BY c.id LIMIT 1)                                         AS sito
     FROM wesion.azienda a
     -- LATERAL e non tre sottoquery uguali: punteggio, note e gancio devono
     -- venire tutti DALLO STESSO audit. Presi separati, un giorno il punteggio
     -- sarebbe di un giro e il gancio di un altro, e nessuno se ne accorgerebbe
     -- fino a leggere al telefono una frase che non c'entra.
     LEFT JOIN LATERAL (
       SELECT x.score, x.note, x.hook, x.eseguito_at
         FROM wesion.audit x
        WHERE x.azienda_id = a.id AND x.esito = 'ok'
        ORDER BY x.eseguito_at DESC LIMIT 1
     ) ultimo ON true
     WHERE ($1::text IS NULL OR a.stato = $1)
       AND ($2::text = '' OR
            a.nome ILIKE '%' || $2 || '%' OR
            a.citta ILIKE '%' || $2 || '%' OR
            a.categoria ILIKE '%' || $2 || '%' OR
            EXISTS (SELECT 1 FROM wesion.contatto c
                     WHERE c.azienda_id = a.id AND c.valore ILIKE '%' || $2 || '%'))
     -- Chi ha il punteggio più alto va chiamato per primo: è il senso di averlo.
     ORDER BY ultimo.score DESC NULLS LAST, a.nome
     LIMIT $3 OFFSET $4`,
    [stato, cerca, PER_PAGINA, (pagina - 1) * PER_PAGINA]
  );

  const [{ quante }] = await query<{ quante: number }>(
    `SELECT count(*)::int AS quante FROM wesion.azienda a
      WHERE ($1::text IS NULL OR a.stato = $1)
        AND ($2::text = '' OR
             a.nome ILIKE '%' || $2 || '%' OR
             a.citta ILIKE '%' || $2 || '%' OR
             a.categoria ILIKE '%' || $2 || '%' OR
             EXISTS (SELECT 1 FROM wesion.contatto c
                      WHERE c.azienda_id = a.id AND c.valore ILIKE '%' || $2 || '%'))`,
    [stato, cerca]
  );

  return (
    <Telaio attiva="/aziende">
      <ElencoAziende
        aziende={aziende}
        conteggi={Object.fromEntries(conteggi.map((c) => [c.stato, c.quanti]))}
        quante={quante}
        pagina={pagina}
        perPagina={PER_PAGINA}
        cerca={cerca}
        stato={p.stato ?? 'tutti'}
      />
    </Telaio>
  );
}
