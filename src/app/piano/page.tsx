/**
 * Piano editoriale — la griglia che si guarda prima di creare le bozze.
 *
 * I candidati sono i CLIENTI: per un prospect non ha senso costruire un mese di
 * post. Il conteggio dei fatti viaggia con loro perche' sotto i quattro il
 * piano esce povero, e conviene saperlo prima di guardarlo che dopo.
 */
import { Suspense } from 'react';
import { query } from '@/lib/db';
import { Telaio } from '@/componenti/Telaio';
import { PianoEditoriale, type ClientePiano } from '@/componenti/PianoEditoriale';

export const dynamic = 'force-dynamic';

export default async function PaginaPiano() {
  const clienti = await query<ClientePiano>(`
    SELECT a.id, a.nome, a.settore,
           (SELECT count(*)::int FROM wesion.fatto f
             WHERE f.azienda_id = a.id AND f.attivo
               AND (f.scade_at IS NULL OR f.scade_at > now())) AS fatti
      FROM wesion.azienda a
     WHERE a.stato = 'cliente'
     ORDER BY a.nome
  `);

  return (
    <Telaio attiva="/piano">
      {/* useSearchParams vuole un confine di Suspense, o il build si ferma. */}
      <Suspense>
        <PianoEditoriale clienti={clienti} />
      </Suspense>
    </Telaio>
  );
}
