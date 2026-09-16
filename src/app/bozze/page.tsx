/**
 * Bozze — la coda di quello che sta per uscire, di qualunque tipo sia.
 *
 * Gli avvisi si calcolano QUI e non nel browser: sono la stessa funzione che
 * gira sulle spie e che un domani girera' al momento della generazione, e una
 * regola che vale solo dove l'operatore guarda non e' una regola. Costa niente:
 * sono espressioni regolari su testi da mille caratteri.
 */
import { Suspense } from 'react';
import { query } from '@/lib/db';
import { Telaio } from '@/componenti/Telaio';
import { ConsolleBozze } from '@/componenti/ConsolleBozze';
import { SQL_BOZZE, testoBozza, type Bozza } from '@/lib/bozze';
import { controllaBozza } from '@/lib/controlloTesto';
import { leggiProdotto } from '@/lib/prodotti';

export const dynamic = 'force-dynamic';

export default async function PaginaBozze({
  searchParams,
}: {
  searchParams: Promise<{ prodotto?: string }>;
}) {
  // Il prodotto serve al MENU, non alla query: la consolle filtra da sola
  // (vedi ConsolleBozze), qui basta dire al telaio quale voce illuminare.
  const { prodotto } = await searchParams;
  const p = leggiProdotto(prodotto);
  const righe = await query<Bozza>(SQL_BOZZE);

  const bozze: Bozza[] = righe.map((b) => ({
    ...b,
    avvisi: controllaBozza(b.tipo, testoBozza(b.contenuto), b.fatti_veri),
  }));

  return (
    <Telaio attiva={p ? `/bozze?prodotto=${p}` : '/bozze'}>
      {/* useSearchParams dentro la consolle vuole un confine di Suspense. */}
      <Suspense>
        <ConsolleBozze bozze={bozze} />
      </Suspense>
    </Telaio>
  );
}
