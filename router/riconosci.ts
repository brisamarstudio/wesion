/**
 * Di chi è questo messaggio.
 *
 * UN SOLO NUMERO BOT PER TUTTI I CLIENTI. Il locale si riconosce da chi scrive,
 * non dal numero che riceve: il titolare usa il telefono di sempre, senza SIM
 * nuove, senza QR da scansionare, senza WhatsApp Business.
 *
 * Prima questo lookup stava su `automation_clients.senders`, un array di
 * stringhe. Adesso sono righe in `contatto`, e la differenza si vede proprio
 * qui: il LID non e' piu' una toppa dentro l'array, e' un contatto di tipo
 * `lid` come gli altri — e quando se ne scopre uno nuovo lo si IMPARA, invece
 * di richiederlo a WAHA a ogni messaggio per sempre.
 */

import { query } from '../src/lib/db.ts';
import { normalizzaTelefono } from '../src/lib/normalizza.ts';
import { risolviLid } from '../src/lib/waha.ts';

export interface Mittente {
  aziendaId: number;
  nome: string;
  contattoId: number;
  /** Il numero a cui rispondere. */
  telefono: string;
}

export interface EsitoRiconoscimento {
  mittente: Mittente | null;
  /** Perché non è stato riconosciuto: serve al log e alla risposta. */
  motivo: 'trovato' | 'sconosciuto' | 'non_titolare';
  /** Il migliore identificativo che abbiamo, anche quando non si sa di chi è. */
  identificativo: string;
  /** Il nome dell'azienda quando il contatto c'è ma non è del titolare. */
  aziendaNonTitolare?: string;
}

/**
 * Tutti gli identificativi plausibili dentro un payload di WAHA.
 *
 * Se ne raccolgono piu' d'uno perche' a seconda del motore il mittente vero sta
 * in `from`, in `author` o in `participant`: provarli tutti costa una query e
 * risparmia un cliente muto.
 */
export function candidati(payload: Record<string, unknown>): string[] {
  const dati = (payload._data ?? {}) as Record<string, unknown>;
  const grezzi = [payload.from, payload.author, payload.participant, dati.from]
    .filter(Boolean)
    .map(String);

  const fuori = new Set<string>();
  for (const g of grezzi) {
    const senzaDominio = g.split('@')[0];
    fuori.add(senzaDominio);
    const n = normalizzaTelefono(senzaDominio);
    if (n) fuori.add(n);
  }
  return [...fuori];
}

/** Cerca fra i contatti registrati, titolari e non. */
async function cerca(identificativi: string[]) {
  const [riga] = await query<{
    azienda_id: number;
    nome: string;
    contatto_id: number;
    valore: string;
    e_titolare: boolean;
  }>(
    `SELECT c.azienda_id, a.nome, c.id AS contatto_id, c.valore, c.e_titolare
       FROM wesion.contatto c
       JOIN wesion.azienda a ON a.id = c.azienda_id
      WHERE c.tipo IN ('whatsapp', 'lid', 'telefono')
        AND c.normalizzato = ANY($1)
      -- Il titolare vince: se lo stesso numero è censito due volte, quella che
      -- conta è la riga che autorizza, non la prima che capita.
      ORDER BY c.e_titolare DESC, c.id
      LIMIT 1`,
    [identificativi]
  );
  return riga ?? null;
}

/**
 * Impara un LID.
 *
 * La prima volta che un titolare scrive da un dispositivo che si presenta col
 * LID, WAHA ci dice qual e' il numero vero. Invece di richiederglielo per
 * sempre — una chiamata di rete a ogni messaggio, che fallisce quando WAHA e'
 * occupato — si scrive il LID fra i suoi contatti. Dalla seconda volta e' una
 * riga in tabella come tutte le altre.
 *
 * ⚠️ I DUE CAMPI FANNO MESTIERI DIVERSI, E VANNO TENUTI SEPARATI.
 * `normalizzato` e' la chiave con cui si RICONOSCE chi scrive: li' va il LID,
 * perche' e' quello che arriva nel payload. `valore` e' l'indirizzo a cui si
 * RISPONDE: li' va il numero vero, perche' un LID non e' un numero e WhatsApp
 * lo rifiuta (`no LID found for <lid>@s.whatsapp.net`, HTTP 500).
 *
 * Scritti tutti e due col LID — com'era fino al 05/09/2026 — il router si
 * rompeva da solo IMPARANDO: il primo messaggio riceveva risposta (il numero
 * era ancora quello risolto al volo), dal secondo in poi vinceva la riga
 * imparata e ogni risposta falliva. Il titolare vedeva un bot muto, i log
 * dicevano "risposta NON consegnata", e la bozza restava in attesa per sempre.
 * Visto dal vivo su Trattoria La Fenice, primo test end-to-end.
 */
async function imparaLid(
  aziendaId: number,
  lid: string,
  numero: string,
  eTitolare: boolean
): Promise<void> {
  const pulito = String(lid).split('@')[0];
  if (!pulito) return;
  // Senza numero non si impara niente: una riga che riconosce ma non sa
  // rispondere e' peggio di nessuna riga, perche' scavalca la risoluzione al
  // volo — che invece funzionerebbe.
  if (!numero) return;
  await query(
    `INSERT INTO wesion.contatto (azienda_id, tipo, valore, normalizzato, e_titolare, note)
     VALUES ($1, 'lid', $2, $3, $4, 'imparato dal router alla prima ricezione')
     ON CONFLICT (azienda_id, tipo, normalizzato) DO NOTHING`,
    [aziendaId, numero, pulito, eTitolare]
  );
}

/**
 * Chi ha scritto.
 *
 * PERCHE' SERVE `e_titolare`. In `contatto` ci sono anche i 46 numeri raccolti
 * dallo scraper: sono centralini di locali che non sono nostri clienti. Senza
 * questo filtro, chiunque di loro potrebbe pubblicare sul sito di qualcun
 * altro mandando una foto al numero del bot. Il permesso di pubblicare si da'
 * a mano, spuntando il contatto del titolare.
 *
 * Un contatto riconosciuto ma non titolare NON viene trattato come uno
 * sconosciuto: e' un caso diverso e va detto diversamente, o si passa un
 * pomeriggio a chiedersi perche' il bot non risponde a un numero che in
 * tabella c'e'.
 */
export async function riconosci(payload: Record<string, unknown>): Promise<EsitoRiconoscimento> {
  const identificativi = candidati(payload);

  const diretto = await cerca(identificativi);
  if (diretto) {
    if (!diretto.e_titolare) {
      return {
        mittente: null,
        motivo: 'non_titolare',
        identificativo: identificativi[0] ?? '',
        aziendaNonTitolare: diretto.nome,
      };
    }
    return {
      mittente: {
        aziendaId: diretto.azienda_id,
        nome: diretto.nome,
        contattoId: diretto.contatto_id,
        telefono: normalizzaTelefono(diretto.valore) ?? diretto.valore,
      },
      motivo: 'trovato',
      identificativo: identificativi[0] ?? '',
    };
  }

  // Nessuna corrispondenza diretta: se il mittente è un LID, chiediamo a WAHA
  // il numero vero. Senza questo passaggio ogni cliente andrebbe censito due
  // volte, col numero e col LID, e il secondo si scopre solo quando il bot
  // resta muto — cioè quando si lamenta il ristoratore.
  const grezzo = String(payload.from || '');
  if (grezzo.includes('@lid')) {
    const numero = await risolviLid(grezzo);
    if (numero) {
      const normalizzato = normalizzaTelefono(numero);
      const perLid = await cerca([numero, normalizzato ?? numero].filter(Boolean) as string[]);
      if (perLid) {
        await imparaLid(perLid.azienda_id, grezzo, normalizzato ?? numero, perLid.e_titolare);
        console.log(`[router] LID ${grezzo} risolto in ${numero} e imparato`);

        if (!perLid.e_titolare) {
          return {
            mittente: null,
            motivo: 'non_titolare',
            identificativo: normalizzato ?? numero,
            aziendaNonTitolare: perLid.nome,
          };
        }
        return {
          mittente: {
            aziendaId: perLid.azienda_id,
            nome: perLid.nome,
            contattoId: perLid.contatto_id,
            telefono: normalizzato ?? numero,
          },
          motivo: 'trovato',
          identificativo: normalizzato ?? numero,
        };
      }
      console.log(`[router] LID ${grezzo} è il numero ${numero}, ma non è di nessun cliente`);
      return { mittente: null, motivo: 'sconosciuto', identificativo: normalizzato ?? numero };
    }
  }

  return { mittente: null, motivo: 'sconosciuto', identificativo: identificativi[0] ?? '' };
}
