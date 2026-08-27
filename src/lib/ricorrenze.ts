/**
 * Calendario delle ricorrenze — DATI, non memoria del modello.
 *
 * Perche' un file: se si chiede a un modello quand'e' la Giornata Mondiale
 * dell'Acqua, a volte azzecca e a volte no, e soprattutto si inventa ricorrenze
 * che non esistono. Un post che celebra una giornata inventata, pubblicato a
 * nome del cliente, e' esattamente il tipo di errore che nessuno nota fino a
 * quando lo nota il cliente. Qui le date sono scritte, si leggono e si
 * correggono a mano.
 *
 * COME SI MODIFICA: aggiungi una riga. `giorno` e' [mese, giorno] con mese da 1
 * a 12. Le ricorrenze mobili (Pasqua, festa della mamma) NON stanno qui: si
 * calcolano in fondo al file, perche' cambiano ogni anno.
 *
 * `tag` decide a chi si propone: il pianificatore usa una ricorrenza solo se il
 * cliente ha almeno un tag in comune, oppure se la ricorrenza e' 'tutti'.
 * Meglio poche ricorrenze pertinenti che tante forzate: "Giornata dell'Acqua"
 * per un falegname e' il genere di aggancio che fa sembrare finto tutto il
 * resto.
 */

export type TagAttivita = 'tutti' | 'ristorazione' | 'artigianato' | 'casa' | 'servizi' | 'locale';

export interface Ricorrenza {
  /** [mese, giorno] — mese da 1 a 12. */
  giorno: [number, number];
  nome: string;
  /** A chi si adatta. 'tutti' vale per chiunque. */
  tag: TagAttivita[];
  /**
   * L'angolo suggerito: cosa dovrebbe dire il post, non il testo.
   * Serve a evitare il post-cartolina ("Auguri a tutti!"), che non porta niente.
   */
  angolo: string;
}

export const RICORRENZE: Ricorrenza[] = [
  // --- Festivita' e ricorrenze civili ---
  { giorno: [1, 1], nome: 'Capodanno', tag: ['tutti'], angolo: "Un buon proposito legato a ciò che fai, non gli auguri generici" },
  { giorno: [1, 6], nome: 'Epifania', tag: ['ristorazione', 'locale'], angolo: "Chiusura delle feste, ritorno alla normalità" },
  { giorno: [2, 14], nome: 'San Valentino', tag: ['ristorazione'], angolo: "La cena a due: cosa la rende diversa da una sera qualsiasi" },
  { giorno: [3, 8], nome: 'Festa della donna', tag: ['tutti'], angolo: "Solo se c'è qualcosa di vero da dire, altrimenti si salta" },
  { giorno: [3, 19], nome: 'Festa del papà', tag: ['artigianato', 'ristorazione'], angolo: 'Il regalo fatto a mano contro quello comprato di fretta' },
  { giorno: [4, 25], nome: 'Festa della Liberazione', tag: ['tutti'], angolo: 'Ponte di primavera: come cambia la settimana' },
  { giorno: [5, 1], nome: 'Festa del lavoro', tag: ['artigianato'], angolo: 'Il mestiere, chi lo fa, come si impara' },
  { giorno: [6, 2], nome: 'Festa della Repubblica', tag: ['tutti'], angolo: 'Ponte di inizio estate' },
  { giorno: [8, 15], nome: 'Ferragosto', tag: ['ristorazione', 'locale'], angolo: 'Cosa succede da noi a Ferragosto' },
  { giorno: [11, 1], nome: 'Ognissanti', tag: ['locale'], angolo: 'Ponte d\'autunno' },
  { giorno: [12, 8], nome: 'Immacolata', tag: ['tutti'], angolo: 'Si entra nel periodo natalizio' },
  { giorno: [12, 24], nome: 'Vigilia di Natale', tag: ['ristorazione'], angolo: "La sera più particolare dell'anno" },
  { giorno: [12, 25], nome: 'Natale', tag: ['tutti'], angolo: "Auguri, ma legati a ciò che fai" },
  { giorno: [12, 31], nome: 'San Silvestro', tag: ['ristorazione'], angolo: "L'ultima sera dell'anno" },

  // --- Giornate internazionali (solo quelle con un aggancio reale) ---
  { giorno: [3, 21], nome: 'Giornata internazionale delle foreste', tag: ['artigianato', 'casa'], angolo: 'Da dove viene il legno che si lavora' },
  { giorno: [4, 22], nome: 'Giornata della Terra', tag: ['artigianato', 'casa'], angolo: 'Durata e riparabilità: un oggetto che dura è la scelta più concreta' },
  { giorno: [6, 5], nome: "Giornata mondiale dell'ambiente", tag: ['artigianato', 'casa'], angolo: 'Materiali e scarti: come si lavora davvero' },
  { giorno: [10, 16], nome: "Giornata mondiale dell'alimentazione", tag: ['ristorazione'], angolo: 'Come si sceglie cosa finisce nel piatto' },

  // --- Stagionalita': non sono date celebrative, sono cambi di passo ---
  { giorno: [1, 15], nome: 'Pieno inverno', tag: ['ristorazione', 'casa'], angolo: 'Cosa cambia in questa stagione' },
  { giorno: [3, 21], nome: 'Inizio primavera', tag: ['casa', 'artigianato'], angolo: 'La stagione in cui si rinnova casa' },
  { giorno: [6, 21], nome: 'Inizio estate', tag: ['ristorazione', 'locale'], angolo: "Come cambia il servizio d'estate" },
  { giorno: [9, 15], nome: 'Rientro dalle vacanze', tag: ['tutti'], angolo: 'Si riparte: cosa c\'è in programma' },
  { giorno: [9, 23], nome: 'Inizio autunno', tag: ['ristorazione', 'casa'], angolo: 'Il cambio di stagione nel concreto' },
  { giorno: [11, 15], nome: 'Verso il Natale', tag: ['artigianato'], angolo: 'Chi vuole un pezzo su misura per Natale deve muoversi adesso' },
];

/**
 * Ricorrenze mobili dell'anno richiesto.
 * Stanno a parte perche' la data cambia: calcolarla e' l'unico modo corretto,
 * scriverla a mano significa sbagliarla dall'anno prossimo.
 */
export function ricorrenzeMobili(anno: number): Ricorrenza[] {
  const pasqua = calcolaPasqua(anno);

  // Festa della mamma in Italia: seconda domenica di maggio.
  const maggio = new Date(anno, 4, 1);
  const primaDomenica = 1 + ((7 - maggio.getDay()) % 7);
  const festaMamma = new Date(anno, 4, primaDomenica + 7);

  const giorno = (d: Date): [number, number] => [d.getMonth() + 1, d.getDate()];

  return [
    { giorno: giorno(pasqua), nome: 'Pasqua', tag: ['ristorazione', 'locale'], angolo: 'Il pranzo di Pasqua: cosa lo distingue' },
    {
      giorno: giorno(new Date(pasqua.getTime() + 86400000)),
      nome: 'Pasquetta',
      tag: ['ristorazione', 'locale'],
      angolo: 'La gita fuori porta',
    },
    { giorno: giorno(festaMamma), nome: 'Festa della mamma', tag: ['ristorazione', 'artigianato'], angolo: "Un pensiero che non sia l'ennesimo oggetto" },
  ];
}

/** Algoritmo di Gauss/Meeus per la Pasqua nel calendario gregoriano. */
function calcolaPasqua(anno: number): Date {
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31);
  const giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anno, mese - 1, giorno);
}

/** Ricorrenze di un mese (1-12), fisse e mobili insieme. */
export function ricorrenzeDelMese(anno: number, mese: number): Ricorrenza[] {
  return [...RICORRENZE, ...ricorrenzeMobili(anno)]
    .filter((r) => r.giorno[0] === mese)
    .sort((x, y) => x.giorno[1] - y.giorno[1]);
}
