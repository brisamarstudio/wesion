/**
 * Elenco aziende — componente server: legge il database e passa righe pronte.
 *
 * Il punteggio e' l'ultimo audit RIUSCITO, non l'ultimo in assoluto: e' tutto il
 * motivo per cui gli audit sono uno storico invece di una colonna sovrascritta.
 * Un tentativo fallito non deve cancellare il giudizio buono di ieri.
 */
import { query } from '@/lib/db';
import { Telaio } from '@/componenti/Telaio';
import { ElencoAziende, type Azienda } from '@/componenti/ElencoAziende';

export const dynamic = 'force-dynamic';

export default async function PaginaAziende() {
  const aziende = await query<Azienda>(`
    SELECT
      a.id, a.slug, a.nome, a.categoria, a.citta, a.provincia, a.stato,
      ultimo.score,
      ultimo.note        AS audit_note,
      ultimo.hook        AS audit_hook,
      ultimo.eseguito_at AS audit_quando,
      -- Se l'ULTIMO tentativo e' fallito lo si dice, anche quando sopra resta
      -- il punteggio buono di ieri: sapere che l'ultimo giro non e' riuscito
      -- e' un'informazione diversa da non avere punteggio.
      (SELECT y.errore FROM wesion.audit y
        WHERE y.azienda_id = a.id
        ORDER BY y.eseguito_at DESC LIMIT 1)                        AS audit_errore,
      (SELECT c.valore FROM wesion.contatto c
        WHERE c.azienda_id = a.id AND c.tipo = 'telefono'
        ORDER BY c.e_titolare DESC, c.id LIMIT 1)                   AS telefono,
      (SELECT c.normalizzato FROM wesion.contatto c
        WHERE c.azienda_id = a.id AND c.tipo = 'sito'
        ORDER BY c.id LIMIT 1)                                      AS sito
    FROM wesion.azienda a
    -- LATERAL e non tre sottoquery uguali: il punteggio, le note e il gancio
    -- devono venire tutti DALLO STESSO audit. Prese separate, un giorno il
    -- punteggio sarebbe di un giro e il gancio di un altro, e nessuno se ne
    -- accorgerebbe fino a leggere al telefono una frase che non c'entra.
    LEFT JOIN LATERAL (
      SELECT x.score, x.note, x.hook, x.eseguito_at
        FROM wesion.audit x
       WHERE x.azienda_id = a.id AND x.esito = 'ok'
       ORDER BY x.eseguito_at DESC LIMIT 1
    ) ultimo ON true
    ORDER BY a.nome
  `);

  return (
    <Telaio attiva="/aziende">
      <ElencoAziende aziende={aziende} />
    </Telaio>
  );
}
