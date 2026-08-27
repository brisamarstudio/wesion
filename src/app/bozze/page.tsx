/**
 * Bozze — la coda di quello che sta per uscire, di qualunque tipo sia.
 *
 * Gli avvisi si calcolano QUI e non nel browser: sono la stessa funzione che
 * gira sulle spie e che un domani girera' al momento della generazione, e una
 * regola che vale solo dove l'operatore guarda non e' una regola. Costa niente:
 * sono espressioni regolari su testi da mille caratteri.
 */
import { query } from '@/lib/db';
import { Telaio } from '@/componenti/Telaio';
import { ConsolleBozze } from '@/componenti/ConsolleBozze';
import { SQL_BOZZE, testoBozza, type Bozza } from '@/lib/bozze';
import { controllaBozza } from '@/lib/controlloTesto';

export const dynamic = 'force-dynamic';

export default async function PaginaBozze() {
  const righe = await query<Bozza>(SQL_BOZZE);

  const bozze: Bozza[] = righe.map((b) => ({
    ...b,
    avvisi: controllaBozza(b.tipo, testoBozza(b.contenuto)),
  }));

  return (
    <Telaio attiva="/bozze">
      <ConsolleBozze bozze={bozze} />
    </Telaio>
  );
}
