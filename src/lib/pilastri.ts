/**
 * Pilastri sempreverdi e divieti di base.
 *
 * I pilastri sono la spina dorsale del mese: le ricorrenze sono il condimento,
 * ma non si costruisce un piano editoriale su Pasqua e Ferragosto. Vanno in
 * rotazione, ed e' la rotazione che evita il difetto tipico — otto post al mese
 * che dicono tutti "vieni a trovarci".
 *
 * Ogni pilastro dichiara da quale voce della scheda fatti attinge. Serve a due
 * cose: il post puo' mostrare il fatto da cui nasce (cosi' la review e' "e'
 * vero?" invece di "e' bello?"), e un pilastro senza materia prima viene
 * scartato invece di produrre genericita'. Se un cliente ha la scheda mezza
 * vuota, si vede subito: escono pochi slot, non trenta post interscambiabili.
 */

import { daFonte, type FonteMateria, type Materia } from './materia';
import type { TagAttivita } from './ricorrenze';

export interface Pilastro {
  id: string;
  nome: string;
  /** A chi si applica. */
  tag: TagAttivita[];
  /** Da dove prende sostanza. Un pilastro senza materia viene scartato. */
  fonte: FonteMateria;
  /** Cosa deve fare il post. Non e' il testo, e' il compito. */
  angolo: string;
}

export const PILASTRI: Pilastro[] = [
  // --- Artigianato ---
  { id: 'art-nascita', nome: 'Come nasce un pezzo', tag: ['artigianato'], fonte: 'offerta', angolo: 'Racconta i passaggi di lavorazione di un pezzo, dal grezzo al finito' },
  { id: 'art-materiale', nome: 'Il materiale e perché quello', tag: ['artigianato', 'casa'], fonte: 'materiali', angolo: 'Spiega perché si usa questo materiale e cosa cambia per chi lo compra' },
  { id: 'art-misura', nome: 'Il su misura', tag: ['artigianato'], fonte: 'punti_forza', angolo: 'Come funziona lavorare su misura e perché il risultato è diverso' },
  { id: 'art-confine', nome: 'Cosa non facciamo', tag: ['artigianato', 'casa'], fonte: 'non_fa', angolo: 'Spiega una scelta di campo e il motivo pratico dietro' },
  { id: 'art-cura', nome: 'Come si cura', tag: ['artigianato', 'casa'], fonte: 'materiali', angolo: 'Consiglio pratico per mantenere nel tempo ciò che si è comprato' },

  // --- Ristorazione ---
  { id: 'ris-piatto', nome: 'Un piatto e come nasce', tag: ['ristorazione'], fonte: 'offerta', angolo: 'Racconta un piatto: come si prepara, cosa lo rende riconoscibile' },
  { id: 'ris-ingrediente', nome: 'Un ingrediente', tag: ['ristorazione'], fonte: 'materiali', angolo: 'Parla di un ingrediente e di come viene scelto' },
  { id: 'ris-ambiente', nome: "L'ambiente", tag: ['ristorazione', 'locale'], fonte: 'punti_forza', angolo: 'Descrivi il posto e per quale occasione è adatto' },
  { id: 'ris-eventi', nome: 'Gli eventi', tag: ['ristorazione'], fonte: 'offerta', angolo: 'Che tipo di eventi si ospitano e come vengono seguiti' },
  { id: 'ris-scelta', nome: 'Come scegliamo', tag: ['ristorazione'], fonte: 'non_fa', angolo: 'Una scelta di cucina e il motivo, senza pretese' },

  // --- Casa e ambienti ---
  { id: 'casa-intervento', nome: 'Un intervento tipo', tag: ['casa'], fonte: 'offerta', angolo: 'Racconta un lavoro tipico dall\'inizio alla fine' },
  { id: 'casa-consiglio', nome: 'Consiglio pratico', tag: ['casa', 'artigianato'], fonte: 'materiali', angolo: 'Un consiglio utile a chi sta valutando un lavoro simile' },

  // --- Servizi ---
  { id: 'ser-problema', nome: 'Un problema tipico', tag: ['servizi'], fonte: 'offerta', angolo: 'Il problema che porta un cliente da noi, e come lo si affronta' },
  { id: 'ser-come', nome: 'Come funziona', tag: ['servizi'], fonte: 'offerta', angolo: 'Spiega in concreto come si svolge il servizio' },
  { id: 'ser-perche', nome: 'Perché noi', tag: ['servizi'], fonte: 'punti_forza', angolo: 'Cosa distingue il modo di lavorare, detto senza slogan' },

  // --- Dalle recensioni: materiale verificato da terzi ---
  // Non c'erano in gbp-autoposter perche' li' le recensioni non entravano da
  // nessuna parte. Sono i pilastri piu' solidi che abbiamo: non diciamo noi che
  // il posto e' cosi', lo dicono i clienti, e non serve chiedere conferma.
  { id: 'rec-apprezzato', nome: 'Quello che notano i clienti', tag: ['tutti'], fonte: 'apprezzato', angolo: 'Parti da una cosa che i clienti apprezzano davvero e spiega come mai viene così' },
  { id: 'rec-dettaglio', nome: 'Il dettaglio che torna sempre', tag: ['ristorazione', 'locale'], fonte: 'apprezzato', angolo: 'Un dettaglio che nelle recensioni ricorre, raccontato dal di dentro' },

  // --- Validi per chiunque ---
  { id: 'gen-cosa', nome: 'Cosa facciamo', tag: ['tutti'], fonte: 'cosa_fa', angolo: 'Presenta l\'attività in concreto, come se parlassi a un vicino' },
  { id: 'gen-pubblico', nome: 'Per chi', tag: ['tutti'], fonte: 'pubblico', angolo: 'A chi è utile ciò che facciamo, con un esempio di situazione' },
  { id: 'gen-forza', nome: 'Il punto di forza', tag: ['tutti'], fonte: 'punti_forza', angolo: 'Un motivo concreto per sceglierci, senza superlativi' },
];

/**
 * Cose che il generatore non puo' MAI affermare.
 *
 * Non e' una questione di scrupoli: e' che sono tutte cose che **cambiano**, e
 * che il modello non ha modo di sapere. Un orario sbagliato in un post fa
 * presentare qualcuno davanti a una porta chiusa, e quel qualcuno chiama il
 * cliente, che chiama te. E' il paracadute che smette di funzionare — non
 * perche' hai mentito, ma perche' hai creato un problema che prima non c'era.
 *
 * Le cose FISSE (cosa fa, materiali, tono) stanno nella scheda fatti e si
 * possono dire. Queste no, mai, nemmeno se sembrano ovvie.
 */
export const DIVIETI_BASE: string[] = [
  'Orari di apertura o chiusura, giorni di riposo, chiusure per ferie',
  'Prezzi, sconti, promozioni, offerte a tempo',
  'Disponibilità: posti liberi, scorte, tempi di consegna, prenotazioni aperte',
  'Premi, riconoscimenti, classifiche, recensioni o punteggi',
  'Certificazioni e denominazioni: bio, DOP, km 0, FSC, marchi di qualità',
  'Numeri e statistiche: anni di attività, clienti serviti, quantità prodotte',
  'Confronti con concorrenti, diretti o allusivi',
];

/** I pilastri utilizzabili per un cliente: giusto settore e materia prima presente. */
export function pilastriDisponibili(m: Materia, tag: TagAttivita[]): Pilastro[] {
  const suoi = new Set<TagAttivita>([...tag, 'tutti']);
  return PILASTRI.filter((p) => p.tag.some((t) => suoi.has(t)) && daFonte(m, p.fonte).length > 0);
}
