/**
 * I prodotti: quello che vendi, e da oggi anche come è fatto il menù.
 *
 * ⚠️ DECISIONE DI CHI LO USA (16/09/2026), E CAMBIA L'IMPIANTO. Il menù era
 * organizzato per FASE DEL LAVORO (le bozze, il calendario, il piano), e metteva
 * nella stessa coda due gesti che non sono lo stesso gesto: un post di Google
 * lo approvi ed **esce da solo**, un post social lo approvi e poi **lo incolli
 * a mano** (Fase 1, vedi STATO §16.1). Chiamarle entrambe «bozze» è comodo per
 * il codice e falso per chi lavora.
 *
 * Adesso il menù è per prodotto — Google, Social, Sito — e dentro ognuno c'è il
 * suo giro completo. «Non è detto che tutto sia intrecciato»: nel codice già non
 * lo era (`costruisciPiano` e `costruisciPianoSocial` sono due funzioni diverse,
 * provate separatamente il 15/09).
 *
 * ⚠️ L'ECCEZIONE CHE TIENE IN PIEDI LA REGOLA: la Plancia del cliente. Lì i
 * prodotti si vedono uno accanto all'altro, perché la domanda al telefono è
 * «come sta questo cliente», non «come sta Google».
 *
 * Questo file è l'unico posto dove sta scritto quale tipo di bozza appartiene a
 * quale prodotto. Se nasce un tipo nuovo e non lo si mette qui, non comparirà in
 * nessuna coda: è voluto, meglio invisibile che nel posto sbagliato — ma il
 * conto in fondo (`SENZA_PRODOTTO`) lo dice.
 */

export type Prodotto = 'google' | 'social' | 'sito' | 'nuovi';

export interface DescrizioneProdotto {
  /** Come lo chiami tu, non come si chiama la tabella. */
  label: string;
  /** Una riga che dice cosa succede dopo l'approvazione: non è uguale per tutti. */
  cosaSucedeDopo: string;
  /** I tipi di `wesion.bozza` che finiscono in questa coda. */
  tipi: string[];
}

export const PRODOTTI: Record<Prodotto, DescrizioneProdotto> = {
  google: {
    label: 'Google',
    // Il menù del giorno sta qui e non in una voce sua: il suo risultato è un
    // post sulla scheda Google più una pagina sul sito, e riguarda solo i
    // ristoranti. Una voce di menù che vale per due clienti su quindici è una
    // voce che quindici persone imparano a saltare.
    cosaSucedeDopo: 'approvi ed esce da solo sulla scheda Google',
    tipi: ['post_gbp', 'menu'],
  },
  social: {
    label: 'Social',
    cosaSucedeDopo: 'approvi, copi e incolli su Facebook o Instagram',
    tipi: ['social'],
  },
  sito: {
    label: 'Sito',
    cosaSucedeDopo: 'approvi ed esce sul blog del cliente',
    tipi: ['articolo'],
  },
  nuovi: {
    label: 'Nuovi clienti',
    cosaSucedeDopo: 'approvi e parte il messaggio WhatsApp al lead',
    tipi: ['messaggio_lead'],
  },
};

/** L'elenco nell'ordine in cui compare nel menù. */
export const ORDINE: Prodotto[] = ['google', 'social', 'sito', 'nuovi'];

/** Da stringa qualunque (un `?prodotto=` in indirizzo) a prodotto, o niente. */
export function leggiProdotto(v: string | null | undefined): Prodotto | null {
  return v && v in PRODOTTI ? (v as Prodotto) : null;
}

/** A quale prodotto appartiene una bozza. Nullo per i tipi non assegnati. */
export function prodottoDelTipo(tipo: string): Prodotto | null {
  for (const p of ORDINE) if (PRODOTTI[p].tipi.includes(tipo)) return p;
  return null;
}

/** Vero se questa bozza va mostrata in quel prodotto. */
export function eDelProdotto(tipo: string, prodotto: Prodotto | null): boolean {
  return prodotto === null || PRODOTTI[prodotto].tipi.includes(tipo);
}
