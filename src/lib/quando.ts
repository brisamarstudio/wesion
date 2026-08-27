/**
 * Le date, dette in italiano e nell'ora italiana.
 *
 * ⚠️ IL FUSO SI SCRIVE, NON SI EREDITA. `toLocaleString` senza `timeZone` usa
 * quello della macchina che esegue: il PC in ufficio è Europe/Rome, un server
 * è quasi sempre UTC. Due conseguenze, e la seconda è peggio della prima:
 *
 *   1. In un componente client renderizzato anche sul server, i due lati
 *      producono stringhe diverse e React se ne lamenta all'idratazione.
 *   2. Molto peggio: al ristoratore verrebbe mostrata un'ora sbagliata di
 *      un'ora d'estate e di nessuna d'inverno. Nessun errore, nessun avviso —
 *      solo un orario che non torna, che è il genere di cosa che si scopre
 *      quando qualcuno si presenta nel momento sbagliato.
 *
 * I clienti sono ristoranti italiani e l'ora che conta è la loro, non quella
 * del server: `Europe/Rome` è scritto, non dedotto.
 */

const FUSO = 'Europe/Rome';

/** "25/12 10:00" — per le righe di una lista, dove lo spazio è poco. */
export function quandoBreve(iso: string): string {
  const d = new Date(iso);
  const data = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', timeZone: FUSO });
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: FUSO });
  return `${data} ${ora}`;
}

/** "25/12/2026" — quando serve solo il giorno. */
export function soloData(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { timeZone: FUSO });
}

/**
 * Quanto manca, detto a voce.
 *
 * ⚠️ `adesso` si passa, non si prende da `Date.now()` qui dentro.
 *
 * La prima versione aveva `adesso = Date.now()` come valore di scorta, ed era
 * un errore silenzioso: chiamata durante il render di un componente client, sul
 * server calcolava "scade fra 12 min" e nel browser, un istante dopo, "scade
 * fra 11 min". Due HTML diversi per la stessa riga.
 *
 * Chi chiama deve prendere l'ora DOPO il montaggio (vedi `useAdesso`), così il
 * primo disegno è identico da tutte e due le parti. `null` finché non si sa che
 * ora è: meglio non dire niente che dire un numero che cambia sotto gli occhi.
 */
export function scadenza(
  scadeAt: string | null,
  adesso: number | null
): { scaduta: boolean; testo: string } | null {
  if (!scadeAt || adesso === null) return null;
  const minuti = Math.round((new Date(scadeAt).getTime() - adesso) / 60000);
  if (minuti <= 0) return { scaduta: true, testo: 'scaduta' };
  if (minuti < 60) return { scaduta: false, testo: `scade fra ${minuti} min` };
  const ore = Math.round(minuti / 60);
  if (ore < 48) return { scaduta: false, testo: `scade fra ${ore} h` };
  return { scaduta: false, testo: `scade fra ${Math.round(ore / 24)} giorni` };
}

/**
 * Da quanto è accesa una spia, detto come lo direbbe una persona.
 *
 * Non è un dettaglio di stile: "accesa da tre giorni" dice due cose — che il
 * guasto c'è, e che per tre giorni nessuno l'ha guardato.
 */
export function daQuando(dal: string | null, adesso: number): string | null {
  if (!dal) return null;
  const minuti = Math.round((adesso - new Date(dal).getTime()) / 60000);
  if (minuti < 2) return 'appena accesa';
  if (minuti < 60) return `accesa da ${minuti} minuti`;
  const ore = Math.round(minuti / 60);
  if (ore < 24) return `accesa da ${ore} ${ore === 1 ? 'ora' : 'ore'}`;
  const giorni = Math.round(ore / 24);
  return `accesa da ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}`;
}

/**
 * Il giorno di un istante, in ora italiana, come AAAA-MM-GG.
 *
 * ⚠️ NASCE DA DUE BUG INSIEME, trovati il 27/08/2026 sul calendario, che
 * facevano dire "questa settimana non esce niente" a una settimana piena.
 *
 * 1. `toISOString()` su una mezzanotte italiana restituisce il GIORNO PRIMA.
 *    Il 14 dicembre alle 00:00 a Roma sono le 23:00 del 13 in UTC, quindi la
 *    chiave del gruppo diventava "2026-12-13" e non combaciava con niente.
 *
 * 2. Le colonne timestamptz tornano da node-postgres come oggetti `Date`, non
 *    come stringhe. `String(quellaData).slice(0,10)` dava "Tue Dec 15" invece
 *    di "2026-12-15": due formati diversi confrontati fra loro, sempre falso.
 *
 * `en-CA` non e' un vezzo: e' l'unico locale comune che formata le date proprio
 * come AAAA-MM-GG, che e' quello che serve per confrontarle come stringhe.
 */
export function giornoRoma(v: string | Date | null | undefined): string {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
}
