/**
 * Legge l'anagrafica dalla scheda Google del cliente, per non ricopiarla.
 *
 * ⚠️ LEGGE E BASTA: NON SCRIVE NIENTE IN TABELLA (02/09/2026). Restituisce i
 * dati al modulo di modifica, che li mette nei campi vuoti e lascia il
 * salvataggio al bottone «Salva» di sempre.
 *
 * Non è pignoleria: sono FATTI SUL CLIENTE — indirizzo, telefono, Place ID —
 * e la regola di questo programma è che un fatto non cambia senza che qualcuno
 * l'abbia visto cambiare. La stessa ragione per cui l'audit SEO si ferma alla
 * proposta invece di scrivere sul sito. Qui in più c'è che il Place ID è
 * l'IDENTITÀ della riga: scriverlo di nascosto, se fosse quello sbagliato,
 * creerebbe un doppione senza un errore da nessuna parte.
 *
 * L'id della scheda non si chiede all'operatore: sta già nel servizio
 * `post_gbp`, salvato quando è stata collegata.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { leggiSchedaGoogle } from '@/lib/gbp';

export async function GET(_r: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isFinite(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const [servizio] = await query<{ config: { gbp_location_id?: string } | null }>(
    `SELECT config FROM wesion.servizio
      WHERE azienda_id = $1 AND tipo = 'post_gbp'
      ORDER BY attivo DESC, id DESC LIMIT 1`,
    [aziendaId]
  );

  const locationId = servizio?.config?.gbp_location_id;
  if (!locationId) {
    // Un messaggio che dice cosa manca e dove si mette, non "errore".
    return NextResponse.json(
      {
        errore:
          'Questa azienda non ha ancora una scheda Google collegata: si collega dalla linguetta «Servizi» della scheda cliente.',
      },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json({ scheda: await leggiSchedaGoogle(locationId) });
  } catch (errore: unknown) {
    return NextResponse.json(
      { errore: errore instanceof Error ? errore.message : String(errore) },
      { status: 502 }
    );
  }
}
