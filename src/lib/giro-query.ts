/**
 * Il giro sulle query (STATO.md §14.3): non solo leggere Search Console, ma
 * dire a colpo d'occhio dove vale la pena mettere le mani.
 *
 * ⚠️ SEGNALA, NON DECIDE — stessa regola di `rendimento-storico.ts`. Qui non
 * si tocca un title né si scrive una pagina: si smista la lista lunga di
 * query in mucchi leggibili da una persona in due minuti.
 *
 * ⚠️ NIENTE SOGLIA FISSA SUL CTR. La prima versione usava "CTR < 5%" uguale
 * per tutti, ed era sbagliata: "brace mia" (15 clic su 2948 impressioni,
 * CTR 0,5%) è la seconda query per clic del sito, non una query debole — il
 * CTR assoluto di una query da migliaia di impressioni non è confrontabile
 * con quello di una da cinquanta. Il confronto giusto è contro la MEDIA
 * PESATA delle query col nome di QUEL cliente (Σclic/Σimpressioni), e anche
 * lì una query "sotto la media" ma fra i maggiori contributori di clic resta
 * un asset da proteggere, non un problema da segnalare.
 *
 * Le soglie sono un punto di partenza tarato sui primi due clienti veri
 * (Brace Mia, Artigiano il Conte, vedi memoria del 14-16/09/2026), non una
 * legge fisica: si aggiustano quando i numeri di altri clienti le smentiscono.
 */
import type { RigaRendimento } from './search-console';

export type CategoriaQuery = 'miniera' | 'domanda_scoperta' | 'brand_sano' | 'brand_da_guardare' | 'marginale';

export interface RigaGiroQuery {
  query: string;
  pagina: string;
  clic: number;
  impressioni: number;
  ctr: number;
  posizione: number;
  conNome: boolean;
  categoria: CategoriaQuery;
}

/** Sotto questa soglia di impressioni un CTR non dice niente — è rumore, non un segnale. */
const IMPRESSIONI_MINIME = 20;

/** Le parole del nome azienda abbastanza lunghe da contare — "il", "la", "di" non bastano a dire che una query è "col nome". */
function paroleNome(nomeAzienda: string): string[] {
  return nomeAzienda
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 4);
}

interface Riga {
  conNome: boolean;
  clic: number;
  impressioni: number;
  ctr: number;
  posizione: number;
}

function classificaNonBrand(r: Riga): CategoriaQuery {
  if (r.impressioni < 5) return 'marginale';
  if (r.clic === 0 && r.posizione <= 20) return 'domanda_scoperta';
  if (r.clic > 0 && r.posizione >= 4 && r.posizione <= 15) return 'miniera';
  return 'marginale';
}

/**
 * Una query brand è "da guardare" solo se STA MALE su due fronti insieme:
 * CTR ben sotto la media brand del cliente E non è fra chi porta più clic in
 * assoluto. Una sola delle due condizioni non basta — è il caso "brace mia":
 * CTR sotto media ma clic alti, resta "sana".
 */
function classificaBrand(r: Riga, ctrBaselineBrand: number, clicSoglieAltoValore: number): CategoriaQuery {
  if (r.impressioni < IMPRESSIONI_MINIME) return 'marginale'; // notorietà da monitorare, non da giudicare col CTR
  // Baseline piatta a zero = NESSUNA query col nome converte, in nessun punto
  // del sito: non c'è una "media" da cui essere sotto, il problema è il brand
  // intero. Va segnalato lo stesso, non lasciato passare per "sano" solo
  // perché non esiste un termine di paragone migliore da battere.
  if (ctrBaselineBrand <= 0) return 'brand_da_guardare';
  const sottoBaseline = r.ctr < ctrBaselineBrand * 0.5;
  // r.clic > 0 esplicito: se quasi tutte le query brand hanno 0 clic, la soglia
  // sotto può risultare 0 — senza questo controllo "0 >= 0" farebbe passare
  // per "alto valore" proprio le query a zero clic che il giro deve segnalare.
  const altoValore = r.clic > 0 && r.clic >= clicSoglieAltoValore;
  return sottoBaseline && !altoValore ? 'brand_da_guardare' : 'brand_sano';
}

/**
 * Richiede righe da `rendimentoDettagliato(proprieta, giorni, ['query', 'page'])`:
 * `chiavi[0]` la query, `chiavi[1]` la pagina.
 */
export function classificaGiroQuery(nomeAzienda: string, righe: RigaRendimento[]): RigaGiroQuery[] {
  const parole = paroleNome(nomeAzienda);
  const grezze = righe.map((r) => {
    const query = r.chiavi[0] ?? '';
    const pagina = r.chiavi[1] ?? '';
    const conNome = parole.some((p) => query.toLowerCase().includes(p));
    return { query, pagina, conNome, clic: r.clic, impressioni: r.impressioni, ctr: r.ctr, posizione: r.posizione };
  });

  // Baseline pesata (non media aritmetica): Σclic/Σimpressioni delle query col nome.
  const brand = grezze.filter((r) => r.conNome);
  const clicBrandTotali = brand.reduce((s, r) => s + r.clic, 0);
  const impressioniBrandTotali = brand.reduce((s, r) => s + r.impressioni, 0);
  const ctrBaselineBrand = impressioniBrandTotali > 0 ? clicBrandTotali / impressioniBrandTotali : 0;
  // "Alto valore" = fra il quartile più cliccato delle query brand — relativo al cliente, non un numero assoluto uguale per tutti.
  const clicOrdinati = [...brand.map((r) => r.clic)].sort((a, b) => b - a);
  const clicSoglieAltoValore = clicOrdinati[Math.max(0, Math.ceil(clicOrdinati.length * 0.25) - 1)] ?? Infinity;

  return grezze.map((r) => ({
    ...r,
    categoria: r.conNome ? classificaBrand(r, ctrBaselineBrand, clicSoglieAltoValore) : classificaNonBrand(r),
  }));
}

export interface GruppiGiroQuery {
  miniere: RigaGiroQuery[];
  domandeScoperte: RigaGiroQuery[];
  brandSano: RigaGiroQuery[];
  brandDaGuardare: RigaGiroQuery[];
}

/**
 * La versione strutturata per la UI (bottone "Giro query" nella scheda
 * cliente). Ogni mucchio ha l'ordinamento che lo rende leggibile in due
 * minuti — non tutti "per impressioni", perché non tutti i mucchi rispondono
 * alla stessa domanda:
 *  - miniere: dove Google espone di più, a parità mostra prima chi ha anche
 *    più clic (già un minimo di prova che funziona);
 *  - domande scoperte: più visibile e più vicina alla prima pagina prima;
 *  - brand sano: chi porta più clic — gli asset da non toccare per primi;
 *  - brand da guardare: più esposizione e più margine di CTR da guadagnare.
 */
export function raggruppaGiroQuery(righe: RigaGiroQuery[]): GruppiGiroQuery {
  const per = (cat: CategoriaQuery) => righe.filter((r) => r.categoria === cat);

  return {
    miniere: per('miniera')
      .sort((a, b) => b.impressioni - a.impressioni || b.clic - a.clic)
      .slice(0, 10),
    domandeScoperte: per('domanda_scoperta')
      .sort((a, b) => b.impressioni - a.impressioni || a.posizione - b.posizione)
      .slice(0, 10),
    brandSano: per('brand_sano')
      .sort((a, b) => b.clic - a.clic)
      .slice(0, 10),
    brandDaGuardare: per('brand_da_guardare')
      .sort((a, b) => b.impressioni - a.impressioni || a.ctr - b.ctr)
      .slice(0, 10),
  };
}

/** Un riassunto in italiano, diviso per mucchio — quello che finisce sotto gli occhi di una persona. */
export function riassumiGiroQuery(righe: RigaGiroQuery[]): string {
  const gruppo = (cat: CategoriaQuery, n: number) =>
    righe
      .filter((r) => r.categoria === cat)
      .sort((a, b) => b.impressioni - a.impressioni)
      .slice(0, n);

  const riga = (r: RigaGiroQuery) =>
    `  - "${r.query}" → ${r.pagina}: ${r.clic} clic / ${r.impressioni} impr., CTR ${(r.ctr * 100).toFixed(2)}%, pos. media ${r.posizione.toFixed(1)}`;

  const sezioni: Array<[string, string, RigaGiroQuery[]]> = [
    ['Miniere', 'già cliccate, in posizione recuperabile (4-15): più contenuto/interlink qui rende subito', gruppo('miniera', 10)],
    ['Domande scoperte', 'Google le mostra ma zero clic, senza il nome del locale: manca una pagina che risponda', gruppo('domanda_scoperta', 10)],
    ['Brand da guardare', 'CTR ben sotto la media delle query col nome di questo cliente, e non fra le maggiori fonti di clic: guardare title/snippet', gruppo('brand_da_guardare', 8)],
  ];

  const parti = sezioni
    .filter(([, , righeGruppo]) => righeGruppo.length)
    .map(([titolo, spiegazione, righeGruppo]) => `### ${titolo}\n${spiegazione}\n${righeGruppo.map(riga).join('\n')}`);

  return parti.length ? parti.join('\n\n') : '(nessuna query classificabile in questo periodo — troppo poco traffico o dati insufficienti)';
}
