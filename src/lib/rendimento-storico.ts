/**
 * La memoria del rendimento SEO — quello che manca senza, per capire se un
 * cliente sta davvero scalando o se il sito è solo "tecnicamente pulito".
 *
 * ⚠️ NIENTE TABELLA NUOVA. `wesion.snapshot` esiste già proprio per questo:
 * generica, `tipo` + `contenuto` JSONB, con indice su `(azienda_id, tipo,
 * creato_at DESC)`. La usa già `router/pubblica.ts` per salvare cosa c'era
 * prima di sovrascrivere un menù. Qui lo stesso principio, per un altro
 * `tipo`: `rendimento_seo`. Una tabella dedicata avrebbe duplicato una cosa
 * che c'era già — vedi [[si-costruisce-tutto-poi-si-prova]] nel non
 * reinventare quello che il repo ha già risolto.
 *
 * ⚠️ SEGNALA, NON MODIFICA. Le query con tante impressioni e pochi clic sono
 * quasi sempre un problema di title/meta description — ma quelli sono
 * "contenuto editoriale" secondo `REGOLE_SEO_GEO`, e quella regola dice
 * esplicitamente che il contenuto editoriale è lavoro umano. Questo modulo
 * calcola il segnale, lo scrive nella PR come testo da leggere: non propone
 * mai un diff su un title. Stessa regola dell'ultimo bottone, applicata alla
 * parte più delicata (le parole che un cliente ha scelto per descriversi).
 */
import { query } from './db';
import type { RigaRendimento } from './search-console';

const TIPO = 'rendimento_seo';

interface ContenutoSnapshot {
  perQuery: RigaRendimento[];
  perPagina: RigaRendimento[];
}

/** Salva lo snapshot di oggi. Va chiamato DOPO aver letto quello precedente,
 *  mai prima — altrimenti il confronto sarebbe di uno snapshot con se stesso. */
export async function salvaSnapshotRendimento(
  aziendaId: number,
  perQuery: RigaRendimento[],
  perPagina: RigaRendimento[]
): Promise<void> {
  const contenuto: ContenutoSnapshot = { perQuery, perPagina };
  await query(
    `INSERT INTO wesion.snapshot (azienda_id, tipo, contenuto, motivo) VALUES ($1, $2, $3, $4)`,
    [aziendaId, TIPO, JSON.stringify(contenuto), 'audit SEO/GEO/AEO']
  );
}

/** L'ultimo snapshot PRIMA di questo giro — null se è il primo audit mai fatto. */
export async function leggiUltimoSnapshot(
  aziendaId: number
): Promise<{ contenuto: ContenutoSnapshot; creato_at: string } | null> {
  const [riga] = await query<{ contenuto: ContenutoSnapshot; creato_at: string }>(
    `SELECT contenuto, creato_at FROM wesion.snapshot
      WHERE azienda_id = $1 AND tipo = $2
      ORDER BY creato_at DESC LIMIT 1`,
    [aziendaId, TIPO]
  );
  return riga ?? null;
}

/**
 * Confronto leggibile fra due giri, per pagine/query che compaiono in
 * entrambi — quelle nuove o sparite non dicono "meglio/peggio", solo che
 * sono entrate o uscite dalla top: si contano ma non si giudicano.
 */
export function confrontaRendimento(
  precedente: ContenutoSnapshot,
  attuale: ContenutoSnapshot,
  dataPrecedente: string
): string {
  const confrontaSet = (prima: RigaRendimento[], dopo: RigaRendimento[], etichetta: string): string => {
    const mappaPrima = new Map(prima.map((r) => [r.chiavi.join(' '), r]));
    const righe: string[] = [];
    for (const r of dopo) {
      const chiave = r.chiavi.join(' ');
      const p = mappaPrima.get(chiave);
      if (!p) continue; // nuova in classifica: non c'è un "prima" con cui confrontarla
      const deltaClic = r.clic - p.clic;
      const deltaPos = p.posizione - r.posizione; // positivo = salita (posizione più bassa è meglio)
      if (deltaClic === 0 && Math.abs(deltaPos) < 0.5) continue; // stabile, non serve dirlo
      const segnoClic = deltaClic > 0 ? '+' : '';
      const segnoPos = deltaPos > 0 ? '↑' : deltaPos < 0 ? '↓' : '=';
      righe.push(`  - ${chiave}: ${segnoClic}${deltaClic} clic, posizione ${segnoPos}${Math.abs(deltaPos).toFixed(1)}`);
    }
    return righe.length ? `${etichetta}:\n${righe.join('\n')}` : '';
  };

  const parti = [
    confrontaSet(precedente.perQuery, attuale.perQuery, 'Query cambiate rispetto al giro precedente'),
    confrontaSet(precedente.perPagina, attuale.perPagina, 'Pagine cambiate rispetto al giro precedente'),
  ].filter(Boolean);

  const data = new Date(dataPrecedente).toLocaleDateString('it-IT');
  if (!parti.length) return `Confronto con l'audit del ${data}: nessuna variazione significativa.`;
  return `Confronto con l'audit del ${data}:\n${parti.join('\n\n')}`;
}

/**
 * Query con tante impressioni e pochi clic: il sintomo classico di un title o
 * una meta description che non convince chi vede il risultato su Google.
 *
 * Soglie basse apposta (10 impressioni, CTR sotto l'1%): un cliente piccolo
 * con poco traffico non deve sparire dalla segnalazione solo perché i numeri
 * assoluti sono piccoli — quello che conta è la SPROPORZIONE fra quanti lo
 * vedono e quanti clic ottiene.
 */
export function segnalaCandidatiTitle(perQuery: RigaRendimento[]): string {
  const candidati = perQuery
    .filter((r) => r.impressioni >= 10 && r.ctr < 0.01)
    .sort((a, b) => b.impressioni - a.impressioni)
    .slice(0, 8);

  if (!candidati.length) return '';

  const righe = candidati.map(
    (r) =>
      `  - "${r.chiavi.join(' ')}": ${r.impressioni} impressioni, ${r.clic} clic (CTR ${(r.ctr * 100).toFixed(2)}%), posizione media ${r.posizione.toFixed(1)}`
  );

  return (
    `\n\n### Query da rivedere (title/meta description)\n` +
    `Google le mostra spesso ma quasi nessuno clicca — di solito è il testo del risultato che non convince, ` +
    `non un problema tecnico. Wesion non tocca title/meta da sola (sono contenuto editoriale): guardale a mano.\n` +
    righe.join('\n')
  );
}
