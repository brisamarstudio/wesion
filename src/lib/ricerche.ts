/**
 * Il verdetto su una ricerca di lead: due o tre frasi che dicono se vale la
 * pena e da dove partire.
 *
 * ⚠️ PERCHE' ESISTE (02/11/2026). «Da chiamare» era un elenco di 41 righe con
 * punteggi, stelle, recensioni e tre etichette colorate, e la reazione era «io
 * UMANO non ci capisco niente… pensa se creo 5 o 6 ricerche tutte li', diventa
 * un macello». Stesso difetto del giro sulle query del 17/09: i dati classificati
 * lasciano all'operatore il lavoro di interpretarli. Qui il giudizio si scrive.
 *
 * Codice puro, nessuna AI: le regole sono poche e si leggono. Una AI qui
 * aggiungerebbe un pezzo da mantenere e il rischio di inventare.
 */

export interface RiassuntoRicerca {
  id: string | number;
  nome: string;
  categoria: string | null;
  citta: string[] | null;
  creata_at: string;
  /** Tutte quelle entrate dalla ricerca, clienti esclusi. */
  totale: number;
  da_chiamare: number;
  contattati: number;
  in_trattativa: number;
  persi: number;
  /** Fra quelle da chiamare: non hanno un sito. */
  senza_sito: number;
  /** Fra quelle da chiamare: la scheda Google non e' di nessuno. */
  scheda_nessuno: number;
  /** Fra quelle da chiamare: senza sito OPPURE scheda di nessuno (contate una volta). */
  calde: number;
  /** Fra quelle da chiamare: hanno un sito, e l'audit dice che e' debole (score >= 70). */
  sito_debole: number;
  /** Fra quelle da chiamare: mai passate dall'audit. */
  da_controllare: number;
  /** Quante sono strutture ricettive (hotel, B&B…): se sono la maggioranza, il verdetto cambia. */
  ricettive: number;
  /** Fra le ricettive da chiamare: hanno un sito, ma «Prenota» porta a Booking/Airbnb. */
  pren_a_portale: number;
  /** Fra le ricettive da chiamare: nessun sito, o il sito e' la pagina di un portale. */
  pren_solo_portali: number;
  /** Fra le ricettive da chiamare: sito senza prenotazione online. */
  pren_nessun_motore: number;
  /** Fra le ricettive da chiamare: hanno gia' un motore loro. */
  pren_motore: number;
  /** Fra le ricettive da chiamare: non ancora controllate (o non lette). */
  pren_da_verificare: number;
  /** I nomi dei motori trovati, separati da virgola. */
  pren_motori: string | null;
  /** I primi tre da chiamare, gia' ordinati. */
  primi: { id: string | number; nome: string; perche: string }[] | null;
}

/** «hotel · vigevano» non e' un titolo: «Hotel a Vigevano» si'. */
export function titoloRicerca(r: RiassuntoRicerca): string {
  const cosa = (r.categoria ?? '').trim();
  const dove = (r.citta ?? []).filter(Boolean).map(maiuscola).join(', ');
  if (!cosa) return maiuscola(r.nome);
  return dove ? `${maiuscola(cosa)} a ${dove}` : maiuscola(cosa);
}

function maiuscola(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function n(x: number, uno: string, tanti: string): string {
  return `${x} ${x === 1 ? uno : tanti}`;
}

/** Una ricerca di hotel e B&B: la domanda giusta e' dove si prenota, non il sito. */
export function eRicercaRicettiva(r: RiassuntoRicerca): boolean {
  return r.totale > 0 && r.ricettive * 2 >= r.totale;
}

/**
 * ⚠️ IL VERDETTO DEGLI HOTEL (02/11/2026). Con un hotel non si vende «un sito»,
 * si vende il 18% che smette di dare a Booking. Quindi le fasce sono quelle di
 * src/lib/prenotazioni.ts, e chi ha gia' un motore suo (all'Hotel del Parco
 * c'e' RoomCloud) va detto chiaramente, o lo si chiama per vendergli quello che
 * ha.
 */
function verdettoRicettive(r: RiassuntoRicerca): { tono: Tono; frasi: string[] } {
  const frasi: string[] = [];
  const controllate = r.da_chiamare - r.pren_da_verificare;
  if (controllate === 0) {
    return {
      tono: 'da_vedere',
      frasi: [
        'Non sappiamo ancora dove prenotano. Premi «Controlla le prenotazioni»: apre il sito di ognuna come farebbe un cliente.',
      ],
    };
  }

  if (r.pren_solo_portali) {
    frasi.push(
      `${r.pren_solo_portali === 1 ? '1 esiste' : `${r.pren_solo_portali} esistono`} solo sui portali (niente sito, o il sito è la pagina di una guida): ` +
        'ogni prenotazione passa da Booking o Airbnb. È il pacchetto completo.'
    );
  }
  if (r.pren_a_portale) {
    frasi.push(
      `${r.pren_a_portale === 1 ? '1 ha' : `${r.pren_a_portale} hanno`} un sito, ma «Prenota» porta a Booking: ` +
        'pagano la commissione anche su chi li cerca per nome.'
    );
  }
  if (r.pren_nessun_motore) {
    frasi.push(
      `${r.pren_nessun_motore === 1 ? '1 ha' : `${r.pren_nessun_motore} hanno`} un sito senza prenotazione online, al massimo un modulo di richiesta: ` +
        'chi vuole prenotare la sera torna su Booking.'
    );
  }
  if (r.pren_motore) {
    frasi.push(
      `${r.pren_motore === 1 ? '1 ha' : `${r.pren_motore} hanno`} già un motore suo${r.pren_motori ? ` (${r.pren_motori})` : ''}: ` +
        `${r.pren_motore === 1 ? 'chiamalo per ultimo' : 'chiamali per ultimi'}, al massimo per il widget.`
    );
  }
  if (r.pren_da_verificare) {
    frasi.push(`${r.pren_da_verificare} ancora da verificare: premi «Controlla le prenotazioni».`);
  }

  const calde = r.pren_solo_portali + r.pren_a_portale + r.pren_nessun_motore;
  if (calde > 0) {
    frasi.unshift(`Parti da ${calde === 1 ? 'una' : calde}: ${calde === 1 ? 'oggi paga' : 'oggi pagano'} a Booking anche quello che potrebbe essere ${calde === 1 ? 'suo' : 'loro'}.`);
  } else {
    frasi.unshift('Poco da vendere qui: chi abbiamo controllato ha già un motore di prenotazione.');
  }
  const tono: Tono =
    calde === 0 ? 'magra' : calde >= 5 || calde / Math.max(1, controllate) >= 0.3 ? 'buona' : 'media';
  return { tono, frasi };
}

export type Tono = 'buona' | 'media' | 'da_vedere' | 'magra' | 'finita' | 'vuota';

export function verdettoRicerca(r: RiassuntoRicerca): { tono: Tono; frasi: string[] } {
  if (r.totale === 0) {
    return {
      tono: 'vuota',
      frasi: [
        'Non ha portato nessuno. Se l’hai appena lanciata, raccogli i risultati da «Campagne»; altrimenti cancellala.',
      ],
    };
  }

  if (r.da_chiamare === 0) {
    const aperti = r.contattati + r.in_trattativa;
    return {
      tono: 'finita',
      frasi: [
        'Hai già sentito tutti.',
        aperti
          ? `Resta da seguire ${n(aperti, 'contatto aperto', 'contatti aperti')}${r.in_trattativa ? `, di cui ${r.in_trattativa} in trattativa` : ''}.`
          : 'Non c’è niente di aperto: puoi archiviarla.',
      ],
    };
  }

  if (eRicercaRicettiva(r)) return verdettoRicettive(r);

  const frasi: string[] = [];
  const caldeVere = r.calde;
  const subito = caldeVere + r.sito_debole;

  if (caldeVere > 0) {
    // Le due cose si sovrappongono: «7 senza sito, 13 scheda di nessuno» su 15
    // non torna a occhio, quindi lo si dice.
    const motivi: string[] = [];
    if (r.scheda_nessuno) motivi.push(`${r.scheda_nessuno} hanno la scheda Google di nessuno`);
    if (r.senza_sito) motivi.push(`${r.senza_sito} non hanno il sito`);
    const doppie = r.senza_sito + r.scheda_nessuno - caldeVere;
    frasi.push(
      caldeVere === 1
        ? `Parti da una: ${r.scheda_nessuno ? 'la sua scheda Google non è di nessuno' : 'non ha il sito'}. È il problema più facile da far vedere al telefono.`
        : `Parti da ${caldeVere}: ${motivi.join(' e ')}${doppie > 0 ? ` (${doppie} tutte e due)` : ''}. ` +
            'È il problema più facile da far vedere al telefono.'
    );
  }
  if (r.sito_debole > 0) {
    frasi.push(
      `${caldeVere ? 'Poi' : 'Parti da'} ${n(r.sito_debole, 'attività che ha', 'attività che hanno')} un sito debole: lì serve l’audit sotto mano.`
    );
  }
  const resto = r.da_chiamare - subito - r.da_controllare;
  if (resto > 0) {
    frasi.push(
      `${subito ? n(resto, 'altra ha', 'altre hanno') : `${resto} ${resto === 1 ? 'ha' : 'hanno'}`} sito e scheda in ordine: ${resto === 1 ? 'chiamala' : 'chiamale'} per ultime, o lasciale stare.`
    );
  }
  if (r.da_controllare > 0) {
    frasi.push(
      `${n(r.da_controllare, 'sito non è', 'siti non sono')} ancora ${r.da_controllare === 1 ? 'stato controllato' : 'stati controllati'}: apri e premi «Controlla siti», poi torna qui.`
    );
  }

  const quota = subito / r.da_chiamare;
  // Se quasi tutto e' ancora da controllare, dire «poco da fare» sarebbe un
  // verdetto senza dati: prima si controlla.
  const tono: Tono =
    subito === 0 && r.da_controllare >= r.da_chiamare / 2
      ? 'da_vedere'
      : subito === 0
        ? 'magra'
        : quota >= 0.3 || subito >= 5
          ? 'buona'
          : 'media';
  if (tono === 'magra' && r.da_controllare === 0) {
    frasi.unshift('Poco da vendere qui: hanno quasi tutti sito e scheda a posto.');
  }
  return { tono, frasi };
}

export const ETICHETTA_TONO: Record<Tono, string> = {
  buona: 'Vale la pena',
  media: 'Qualcosa c’è',
  da_vedere: 'Ancora da controllare',
  magra: 'Poco da fare',
  finita: 'Già lavorata',
  vuota: 'Vuota',
};
