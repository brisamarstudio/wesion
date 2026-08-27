/**
 * Le schede Google dell'agenzia, lette da Google.
 *
 * ⚠️ ESISTE PER RIPARARE UN PASSO INDIETRO. La prima versione della scheda
 * cliente faceva DIGITARE a mano gli id di account e location. Il playbook dice
 * l'opposto, e con parole precise: "si correggono solo rileggendoli da Importa
 * da Google: non si deducono e non si scrivono a mano". E' la regola nata dal
 * guasto del 21/07/2026, quando id sbagliati hanno fatto rispondere 404 a
 * Google per settimane, su clienti a caso.
 *
 * Avere una spia che sorveglia gli id malformati e insieme l'unica cosa che li
 * produce era peggio di non avere ne' l'una ne' l'altra.
 *
 * Il refresh token e' UNO d'agenzia e copre tutte le schede: chi entra in
 * dashboard le vede tutte, ed e' corretto — le gestiamo noi.
 */
import { NextResponse } from 'next/server';
import { elencaSchede } from '@/lib/gbp';

export async function GET() {
  try {
    const schede = await elencaSchede();
    return NextResponse.json({ schede });
  } catch (errore: unknown) {
    const motivo = errore instanceof Error ? errore.message : String(errore);
    return NextResponse.json(
      {
        errore:
          `Google non risponde: ${motivo}. ` +
          'Se dice che il token non vale, va rifatto lo scambio OAuth — e finché non si fa, ' +
          'nessun post esce su nessuna scheda.',
      },
      { status: 502 }
    );
  }
}
