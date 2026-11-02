/**
 * Il mese — una card per cliente, un click per prepararlo, uno per approvarlo.
 *
 * ⚠️ DAL 02/11/2026 la prima schermata e' MeseInUnClick (vedi
 * src/lib/mese.ts sul perche'). La griglia di prima — giorni e temi, quantita',
 * social — resta come «strumento avanzato» su ?vista=avanzata: serve per i
 * social e per ritoccare un piano a mano, non per il mese normale.
 */
import { Suspense } from 'react';
import { query } from '@/lib/db';
import { Telaio } from '@/componenti/Telaio';
import { PianoEditoriale, type ClientePiano } from '@/componenti/PianoEditoriale';
import { MeseInUnClick } from '@/componenti/MeseInUnClick';
import { leggiProdotto } from '@/lib/prodotti';
import { statoMese } from '@/lib/mese';
import { giornoRoma } from '@/lib/quando';

export const dynamic = 'force-dynamic';

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

export default async function PaginaPiano({
  searchParams,
}: {
  searchParams: Promise<{ prodotto?: string; vista?: string; mese?: string; cliente?: string }>;
}) {
  const sp = await searchParams;
  const p = leggiProdotto(sp.prodotto);
  const attiva = p ? `/piano?prodotto=${p}` : '/piano';

  // Lo strumento di prima: i social passano ancora da li'.
  if (sp.vista === 'avanzata' || p === 'social') {
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
      <Telaio attiva={attiva}>
        <Suspense>
          <PianoEditoriale clienti={clienti} />
        </Suspense>
      </Telaio>
    );
  }

  /**
   * Quale mese. Dal 20 in poi si apre sul mese DOPO: e' quando si prepara il
   * prossimo, e aprire su un mese quasi finito vuol dire preparare tre giorni.
   * Il giorno si chiede a Roma, non al server (vedi PianoEditoriale sul fuso).
   */
  const [aOggi, mOggi, gOggi] = giornoRoma(new Date()).split('-').map(Number);
  const questo = { anno: aOggi, mese: mOggi };
  const prossimo = mOggi === 12 ? { anno: aOggi + 1, mese: 1 } : { anno: aOggi, mese: mOggi + 1 };
  const chiave = (x: { anno: number; mese: number }) => `${x.anno}-${String(x.mese).padStart(2, '0')}`;
  const chiesto = [questo, prossimo].find((x) => chiave(x) === sp.mese);
  const scelto = chiesto ?? (gOggi >= 20 ? prossimo : questo);

  const clienti = await query<{ id: number; nome: string }>(
    `SELECT a.id, a.nome FROM wesion.azienda a WHERE a.stato = 'cliente' ORDER BY a.nome`
  );
  const conStato = await Promise.all(
    clienti.map(async (c) => ({
      id: Number(c.id),
      nome: c.nome,
      stato: await statoMese(Number(c.id), scelto.anno, scelto.mese),
    }))
  );
  // Prima chi aspetta qualcosa da te, poi il resto.
  const ordine = { da_approvare: 0, in_preparazione: 1, da_preparare: 2, approvato: 3, non_configurato: 4 };
  conStato.sort((a, b) => ordine[a.stato.fase] - ordine[b.stato.fase] || a.nome.localeCompare(b.nome));

  return (
    <Telaio attiva={attiva}>
      <MeseInUnClick
        clienti={conStato}
        anno={scelto.anno}
        mese={scelto.mese}
        mesiScelta={[questo, prossimo].map((x) => ({ valore: chiave(x), etichetta: MESI[x.mese - 1] }))}
        clienteAperto={sp.cliente ? Number(sp.cliente) : null}
      />
    </Telaio>
  );
}
