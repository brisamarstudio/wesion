/**
 * L'impianto visto da QUESTA macchina: la chiave WAHA risponde ancora?
 *
 * ⚠️ PERCHE' STA NEL ROUTER E NON FRA LE ALTRE SPIE (05/09/2026).
 * Le Spie girano nella dashboard, su Contabo, dove `WAHA_*` non esiste apposta
 * (vedi il commento in cima a `docker-compose.dashboard.yml`: la dashboard non
 * pubblica, quindi non ha credenziali di pubblicazione). Un controllo scritto
 * la' non avrebbe la chiave da provare ne' potrebbe raggiungere WAHA, che
 * ascolta su `127.0.0.1` di Oracle: si accenderebbe per sempre a vuoto, e una
 * spia che grida sempre e' una spia che si impara a ignorare.
 *
 * Quindi il controllo lo fa chi ha la chiave e la rete per usarla — il router —
 * e il risultato passa dal database, che e' gia' l'unico ponte fra le due meta'.
 * La dashboard lo legge e lo mostra insieme alle altre.
 *
 * PERCHE' ESISTE. Il 29/07/2026 la rotazione delle chiavi WAHA ha dimenticato
 * dei consumatori, e Wesion e' stato il quinto: `401` su ogni chiamata, quindi
 * LID non risolto, foto non scaricabile e risposte non consegnabili — tre
 * sintomi diversi, una causa sola, e nessuno se n'e' accorto finche' non si e'
 * provato a mandare una foto vera. Vedi §0.3 di STATO.md. Questo controllo
 * esiste perche' quel guasto non si scopra un'altra volta dal cliente.
 */

import { query } from '../src/lib/db.ts';

const BASE = process.env.WAHA_BASE || 'http://127.0.0.1:3006';
const API_KEY = process.env.WAHA_API_KEY || '';
const SESSIONE = process.env.WAHA_SESSION || 'default';

/** La chiave con cui la dashboard ritrova questa spia. Se cambia, cambiarla anche la'. */
export const CHIAVE_SPIA_WAHA = 'chiave-waha';

interface Esito {
  accesa: boolean;
  messaggio: string;
}

/**
 * Una GET sulla sessione: non manda niente a nessuno e distingue i due guasti
 * che contano. `401` vuol dire che la chiave non vale piu' — il guasto del
 * 29/07. Un errore di rete vuol dire che WAHA non c'e': stesso effetto per il
 * cliente, causa diversa, e dirlo giusto risparmia mezz'ora di ricerca.
 */
async function provaChiave(): Promise<Esito> {
  if (!API_KEY) {
    return {
      accesa: true,
      messaggio:
        'WAHA_API_KEY non e\u2019 configurata sul router: niente lettura dei men\u00f9 dalle foto ' +
        'e nessuna risposta ai titolari.',
    };
  }

  try {
    const risposta = await fetch(`${BASE}/api/sessions/${SESSIONE}`, {
      headers: { 'X-Api-Key': API_KEY },
      signal: AbortSignal.timeout(5000),
    });

    if (risposta.status === 401 || risposta.status === 403) {
      return {
        accesa: true,
        messaggio:
          'La chiave WAHA non e\u2019 piu\u2019 valida (risponde ' + risposta.status + '): il bot non ' +
          'riesce ne\u2019 a scaricare le foto ne\u2019 a rispondere. E\u2019 il guasto del 29/07, identico.',
      };
    }
    if (!risposta.ok) {
      return { accesa: true, messaggio: `WAHA risponde ${risposta.status} sulla sessione ${SESSIONE}.` };
    }
    return { accesa: false, messaggio: '' };
  } catch (errore: unknown) {
    const motivo = errore instanceof Error ? errore.message : String(errore);
    return {
      accesa: true,
      messaggio: `WAHA non risponde su ${BASE} (${motivo}): il bot e\u2019 muto su tutti i clienti.`,
    };
  }
}

/**
 * Scrive l'esito in `wesion.spia`, con la stessa cura di `registra()` sul
 * `dal`: se la spia era gia' accesa la data resta quella di allora, perche'
 * "accesa da tre giorni" e "accesa adesso" sono due urgenze diverse.
 *
 * `vista_at` si aggiorna SEMPRE, anche quando va tutto bene: e' il battito che
 * permette alla dashboard di distinguere "il router dice che sta bene" da "il
 * router non dice piu' niente".
 */
export async function controllaImpianto(): Promise<void> {
  const esito = await provaChiave();

  if (esito.accesa) {
    console.error(`[router] impianto: ${esito.messaggio}`);
    await query(
      `INSERT INTO wesion.spia (chiave, famiglia, stato, messaggio, dal, vista_at)
       VALUES ($1, 'impianto', 'accesa', $2, now(), now())
       ON CONFLICT (chiave) DO UPDATE
         SET messaggio = EXCLUDED.messaggio,
             dal       = CASE WHEN wesion.spia.stato = 'accesa'
                              THEN wesion.spia.dal ELSE now() END,
             stato     = 'accesa',
             vista_at  = now()`,
      [CHIAVE_SPIA_WAHA, esito.messaggio]
    );
    return;
  }

  await query(
    `INSERT INTO wesion.spia (chiave, famiglia, stato, messaggio, dal, vista_at)
     VALUES ($1, 'impianto', 'ok', NULL, NULL, now())
     ON CONFLICT (chiave) DO UPDATE
       SET stato = 'ok', messaggio = NULL, dal = NULL, vista_at = now()`,
    [CHIAVE_SPIA_WAHA]
  );
}
