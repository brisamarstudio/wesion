/**
 * Importazione 1-Click da Google Business Profile.
 *
 * Legge tutte le schede GBP gestite dall'Agenzia via API Google,
 * crea/aggiorna le aziende in `wesion.azienda` con stato = 'cliente',
 * e registra la configurazione del servizio 'gbp' in `wesion.servizio`.
 */
import { NextResponse } from 'next/server';
import { elencaSchede, leggiSchedaGoogle } from '@/lib/gbp';
import { creaAzienda } from '@/lib/anagrafica';
import { query } from '@/lib/db';

export async function POST() {
  try {
    const schede = await elencaSchede();
    let importati = 0;
    let giaEsistevano = 0;
    const dettagli: Array<{ nome: string; giaEsisteva: boolean }> = [];

    for (const s of schede) {
      if (!s.locationId) continue;

      let infoGoogle = {
        titolo: s.titolo || '',
        place_id: '',
        maps_url: '',
        sito: '',
        telefono: '',
        indirizzo: '',
        cap: '',
        citta: '',
        provincia: '',
        categoria: '',
        rivendicata: true,
      };

      try {
        infoGoogle = await leggiSchedaGoogle(s.locationId);
      } catch (err) {
        console.warn(`[GBP Import] Impossibile leggere dati estesi per location ${s.locationId}:`, err);
      }

      const nomeAzienda = infoGoogle.titolo || s.titolo || 'Cliente Google';
      const contatti: Array<{ tipo: string; valore: string; e_titolare?: boolean }> = [];
      if (infoGoogle.telefono) {
        contatti.push({ tipo: 'telefono', valore: infoGoogle.telefono, e_titolare: true });
      }
      if (infoGoogle.sito) {
        contatti.push({ tipo: 'sito', valore: infoGoogle.sito });
      }

      const esito = await creaAzienda({
        nome: nomeAzienda,
        categoria: infoGoogle.categoria || null,
        citta: infoGoogle.citta || null,
        provincia: infoGoogle.provincia || null,
        indirizzo: infoGoogle.indirizzo || null,
        cap: infoGoogle.cap || null,
        maps_url: infoGoogle.maps_url || null,
        place_id: infoGoogle.place_id || null,
        stato: 'cliente',
        note: 'Importato automaticamente 1-Click da Google Business Profile',
        contatti,
      });

      if (esito.giaEsisteva) {
        giaEsistevano++;
        await query(
          `UPDATE wesion.azienda SET stato = 'cliente', aggiornata_at = now() WHERE id = $1`,
          [esito.id]
        );
      } else {
        importati++;
      }

      await query(
        `INSERT INTO wesion.servizio (azienda_id, tipo, attivo, config)
         VALUES ($1, 'post_gbp', true, $2::jsonb)
         ON CONFLICT (azienda_id, tipo) DO UPDATE
           SET attivo = true,
               config = wesion.servizio.config || EXCLUDED.config`,
        [
          esito.id,
          JSON.stringify({
            gbp_account_id: s.accountId,
            gbp_location_id: s.locationId,
          }),
        ]
      );

      dettagli.push({ nome: nomeAzienda, giaEsisteva: esito.giaEsisteva });
    }

    return NextResponse.json({
      ok: true,
      importati,
      giaEsistevano,
      totale: schede.length,
      dettagli,
    });
  } catch (errore: unknown) {
    const motivo = errore instanceof Error ? errore.message : String(errore);
    return NextResponse.json({ ok: false, errore: `Importazione GBP fallita: ${motivo}` }, { status: 500 });
  }
}
