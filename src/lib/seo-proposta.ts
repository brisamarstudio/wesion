/**
 * Leggere quello che il modello propone per un sito: quali file, e come.
 *
 * ⚠️ NON SI CHIEDE UN JSON, E NON È UNA PREFERENZA DI STILE (02/09/2026).
 *
 * La prima versione chiedeva `{"modifiche":[{"contenuto_nuovo": "<il file>"}]}`
 * e si è rotta in produzione con DUE modelli diversi (`gpt-oss-120b` e
 * `gemini-2.5-flash`), tutti e due con "Unterminated string" — e non allo
 * stesso punto per caso: per stare dentro un campo JSON un file intero va
 * escapato riga per riga (`\n`, virgolette, backslash), e su qualche migliaio
 * di caratteri sbagliano tutti. Non era un modello scarso, era chiedere la
 * cosa nel formato sbagliato.
 *
 * Con i delimitatori non c'è niente da escapare: il file è quello che sta fra
 * INIZIO e FINE, byte per byte. I marcatori sono volutamente improbabili
 * dentro un file vero.
 *
 * Sta in `lib/` e non nel route perché è logica, e perché così si prova senza
 * accendere mezzo mondo — vedi `db/prova-seo-proposta.ts`.
 */

export interface ModificaProposta {
  /** Relativo alla radice del repo. */
  percorso: string;
  contenuto_nuovo: string;
  motivo: string;
}

export interface Proposta {
  modifiche: ModificaProposta[];
  riepilogo: string;
}

export const MARCA = {
  riepilogo: 'WESION:RIEPILOGO',
  file: 'WESION:FILE',
  motivo: 'WESION:MOTIVO',
  inizio: 'WESION:INIZIO',
  fine: 'WESION:FINE',
} as const;

export function leggiProposta(risposta: string): Proposta {
  const testo = String(risposta ?? '').replace(/\r\n/g, '\n');

  const riepilogo = testo.match(new RegExp(`^${MARCA.riepilogo}:[ \\t]*(.*)$`, 'm'))?.[1]?.trim() ?? '';

  const modifiche: ModificaProposta[] = [];

  /**
   * ⚠️ FRA `FILE` E `INIZIO` CI STANNO SOLO `MOTIVO` O RIGHE VUOTE, e la
   * ristrettezza è il punto.
   *
   * Con qualcosa di più permissivo (`[^\n]*\n` ripetuto, o peggio `[\s\S]*?`)
   * un blocco a cui il modello dimentica l'INIZIO non fallisce: si allunga
   * fino all'INIZIO del blocco DOPO, e scrive il contenuto di QUEL file sotto
   * il percorso di QUESTO. Il file giusto nel posto sbagliato, senza un errore
   * da nessuna parte — preso dalla prova `db/prova-seo-proposta.ts`, che
   * esiste per questo.
   *
   * Così invece un blocco monco semplicemente non combacia e viene lasciato
   * fuori: si perde una proposta, non si scrive una cosa sbagliata.
   */
  const blocco = new RegExp(
    `^${MARCA.file}:[ \\t]*(.+?)[ \\t]*\\n` + // il percorso
      `((?:(?:${MARCA.motivo}:[^\\n]*|[ \\t]*)\\n)*)` + // MOTIVO e righe vuote, nient'altro
      `${MARCA.inizio}[ \\t]*\\n` + // la riga che apre
      `([\\s\\S]*?)` + // il file, così com'è
      `\\n${MARCA.fine}[ \\t]*$`, // la riga che chiude
    'gm'
  );

  for (const m of testo.matchAll(blocco)) {
    const percorso = m[1].trim();
    const motivo = m[2].match(new RegExp(`^${MARCA.motivo}:[ \\t]*(.*)$`, 'm'))?.[1]?.trim() ?? '';

    /**
     * ⚠️ L'UNICO PUNTO DOVE IL TESTO DI UN MODELLO DIVENTA UNA SCRITTURA SU
     * DISCO. Un percorso assoluto o con `..` scriverebbe fuori dalla copia
     * clonata del repo — sulla macchina che fa girare la dashboard.
     */
    if (!percorso || percorso.startsWith('/') || percorso.includes('..') || /^[a-zA-Z]:/.test(percorso)) {
      continue;
    }

    modifiche.push({ percorso, motivo, contenuto_nuovo: m[3] });
  }

  return { modifiche, riepilogo };
}
