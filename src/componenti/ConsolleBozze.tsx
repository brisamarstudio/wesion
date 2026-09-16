'use client';

/**
 * La consolle delle bozze: una coda sola per tutto quello che sta per uscire.
 *
 * Stesso archetipo dell'elenco aziende — righe fitte, ispettore laterale, zero
 * card — perche' e' lo stesso mestiere: si scorre una coda e si decide una riga
 * per volta. Il template di riferimento resta `incident-console`.
 *
 * TRE COSE DECISE QUI E NON ALTROVE:
 *
 * 1. Il testo si CORREGGE prima di approvare. Senza, l'operatore che trova un
 *    telefono dentro un post di Google ha due sole strade: rifiutare e
 *    rigenerare sperando che stavolta il modello obbedisca, oppure approvarlo
 *    com'e'. La seconda e' quella che si sceglie di venerdi' alle sette, ed e'
 *    esattamente come il 20/07/2026 e' stata sospesa una scheda.
 *
 * 2. Gli avvisi si RICALCOLANO mentre si scrive. Vedere la spia rossa sparire
 *    quando togli il numero e' quello che insegna la regola; un elenco fisso
 *    calcolato ieri no.
 *
 * 3. Approvare dice "approvata", non "pubblicata". La pubblicazione la fa il
 *    router leggendo lo stato, e puo' fallire dopo. Scrivere "fatto" qui
 *    sarebbe la stessa bugia dei guasti muti: rassicurante e non verificata.
 */
import { useMemo, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Layout, LayoutContent, LayoutHeader, LayoutPanel } from '@astryxdesign/core/Layout';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Card } from '@astryxdesign/core/Card';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { FileInput } from '@astryxdesign/core/FileInput';
import { Thumbnail } from '@astryxdesign/core/Thumbnail';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import {
  ETICHETTA_ORIGINE,
  ETICHETTA_STATO,
  ETICHETTA_TIPO,
  destinazioneBozza,
  testoBozza,
  titoloBozza,
  vociMenu,
  type Bozza,
} from '@/lib/bozze';
import { controllaBozza } from '@/lib/controlloTesto';
import { leggiProdotto, eDelProdotto, PRODOTTI } from '@/lib/prodotti';
import { quandoBreve, scadenza, perCampoLocale } from '@/lib/quando';
import { DateTimeInput, type ISODateTimeString } from '@astryxdesign/core/DateTimeInput';
import { AZIONI_BOTTONE, VUOLE_URL, type AzioneBottone } from '@/lib/gbp';
import { useAdesso } from './useAdesso';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { ModaleNuovoPost } from './ModaleNuovoPost';
import { Plus, Copy, Check } from 'lucide-react';

/** Il colore dice a colpo d'occhio se la riga aspetta una persona o no. */
const COLORE_STATO: Record<string, 'success' | 'warning' | 'error' | 'accent' | 'neutral'> = {
  vuota: 'neutral',
  generata: 'accent',
  attesa_approvazione: 'warning',
  approvata: 'accent',
  pubblicando: 'accent',
  pubblicata: 'success',
  rifiutata: 'neutral',
  scaduta: 'error',
};

const DECIDIBILI = new Set(['vuota', 'generata', 'attesa_approvazione']);

/**
 * Cosa succede ADESSO a una bozza approvata, in una frase.
 *
 * ⚠️ IL 31/08/2026 QUESTA SCHERMATA HA INGANNATO IL SUO PRIMO UTENTE, che
 * eravamo noi. Diceva «Approvata — il router deve ancora pubblicarla» e, sei
 * righe più sotto, in un'altra voce, «Esce il 27/09 10:00». Le due frasi sono
 * vere tutte e due e non si toccano mai: si legge la prima, si aspetta, e non
 * succede niente per un mese. Chi approva vuole sapere UNA cosa — quando esce —
 * e deve leggerla dove ha appena premuto il bottone, non ricostruirla
 * mettendo insieme due voci lontane.
 *
 * Le tre risposte possibili sono tre stati diversi del mondo, non sfumature:
 * il momento è passato (tocca al router, ~30s), il momento deve arrivare
 * (aspetta, e si dice quanto), oppure non c'è un momento (esce adesso).
 */
function cosaSuccedeOra(b: Bozza, adesso: number | null): string {
  if (!b.pubblica_at) return 'esce al prossimo giro del router, entro mezzo minuto';

  // Prima del montaggio l'ora non si sa (vedi `useAdesso`: saperla sul server
  // vorrebbe dire scrivere due HTML diversi e litigare in idratazione). Si dice
  // la data, che è vera sempre, e il «fra quanto» arriva un istante dopo.
  if (adesso === null) return `programmata per il ${quandoBreve(b.pubblica_at)}`;

  const quando = new Date(b.pubblica_at).getTime();
  if (quando <= adesso) return 'in coda: esce al prossimo giro del router, entro mezzo minuto';

  const giorni = Math.round((quando - adesso) / 86_400_000);
  const fra =
    giorni >= 2 ? `fra ${giorni} giorni` : giorni === 1 ? 'domani' : `fra ${Math.max(1, Math.round((quando - adesso) / 3_600_000))} ore`;
  return `NON esce ancora: è programmata per il ${quandoBreve(b.pubblica_at)} (${fra})`;
}


/**
 * Cosa scrivere quando una chiamata non e' andata.
 *
 * ⚠️ «Non è andata, e non si sa perché» E' COSTATO UN GIORNO (16/09/2026).
 * Le rotte un motivo lo dicono sempre — in JSON, in italiano. Quel testo
 * compariva solo quando la risposta NON era JSON, cioe' quando il server era
 * esploso (500) o non aveva risposto affatto (502/504): esattamente il caso in
 * cui il motivo esiste ed e' nei log. Detto «non si sa perche'», si finisce a
 * cercarlo nel posto sbagliato — quella volta nel modello che scrive i testi,
 * mentre era una query rotta dalla migrazione a CockroachDB.
 *
 * Adesso dice almeno DI CHE FAMIGLIA e' il guasto, e dove sta scritto il resto.
 */
function perche(risposta: Response, esito: { errore?: string } | null): string {
  if (esito?.errore) return esito.errore;
  if (risposta.status >= 500) {
    return `Il server è andato in errore (${risposta.status}). Non è il testo e non sei tu: il motivo è nei log del server (npm run log).`;
  }
  return `Il server ha risposto ${risposta.status} senza spiegare. Il motivo è nei log (npm run log).`;
}

export function ConsolleBozze({ bozze: tutte }: { bozze: Bozza[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  /**
   * Il prodotto, letto dall'indirizzo: `?prodotto=google`.
   *
   * ⚠️ IL FILTRO SI APPLICA QUI, PRIMA DI TUTTO IL RESTO, e non fra i filtri
   * della pagina: e' un CONFINE, non una preferenza. Dentro «Google» i post
   * social non esistono — non sono nascosti, non ci sono — e cosi' i conti, la
   * ricerca e l'elenco dei clienti parlano tutti della stessa cosa. Senza
   * prodotto (`/bozze` liscio, i vecchi segnalibri) si vede tutto, come prima.
   */
  const prodotto = leggiProdotto(searchParams?.get('prodotto'));
  const bozze = useMemo(() => tutte.filter((b) => eDelProdotto(b.tipo, prodotto)), [tutte, prodotto]);
  // L'ora arriva dopo il montaggio: prima non si sa, e va bene cosi'.
  const adesso = useAdesso();
  const [filtro, setFiltro] = useState('da_decidere');
  /**
   * Si parte da «tutti», e prima non era cosi'.
   *
   * Il ragionamento di partenza (01/09/2026) era buono: le bozze si decidono un
   * cliente per volta, guardando le sue date di fila. Ma obbligava a scegliere
   * un nome PRIMA di vedere qualunque cosa, e con trentotto in coda la domanda
   * di chi apre non e' «di chi», e' «cosa approvo adesso» — detto da chi lo usa
   * il 16/09/2026, davanti a una pagina che si apriva vuota.
   *
   * Funziona perche' l'elenco e' gia' ordinato per quello che conta: prima cio'
   * che aspetta una persona, e fra quelle prima quelle il cui turno e' arrivato
   * (vedi l'ORDER BY di `SQL_BOZZE`). Il cliente resta nella riga, e il
   * selettore resta li' per quando si vuole davvero fare la fila di uno solo.
   */
  const [cliente, setCliente] = useState('tutti');
  const [cerca, setCerca] = useState('');
  /**
   * La rassegna: le bozze passano davanti una per volta.
   *
   * ⚠️ NASCE DA UNA CODA DI 36 (16/09/2026). La lista mostrava trentasei righe
   * con la stessa descrizione — «MyWebby · Post Google · Piano del mese» — e
   * titoli che si ripetono, perché sono gli angoli del piano e non i post. Per
   * decidere bisognava aprirle una per una: tre click a bozza, centootto in
   * tutto. «La logica esiste, la UX no».
   *
   * `saltate` non e' un filtro: sono quelle messe in fondo con «Salta», e
   * tornano da sole quando le altre sono finite — saltare non deve voler dire
   * perdere.
   */
  const [saltate, setSaltate] = useState<Array<string | number>>([]);
  const [ultimaDecisa, setUltimaDecisa] = useState<{
    id: string | number;
    azione: 'approva' | 'rifiuta';
    titolo: string;
  } | null>(null);
  const [selezionataId, setSelezionataId] = useState<string | number | null>(null);
  /** Le correzioni in corso, per id: si perdono cambiando riga, apposta. */
  const [correzioni, setCorrezioni] = useState<Record<string | number, string>>({});
  const [errore, setErrore] = useState<string | null>(null);
  /** Vero mentre la foto sale: il media server ci mette qualche secondo. */
  const [caricando, setCaricando] = useState(false);
  const [apertoModaleNuovo, setApertoModaleNuovo] = useState(false);
  /** La conferma della cancellazione: un bottone che ha solo il sì non è una decisione. */
  const [daCancellare, setDaCancellare] = useState(false);
  const [inScrittura, setInScrittura] = useState(false);
  const [copiato, setCopiato] = useState(false);
  const [copiatoCommento, setCopiatoCommento] = useState(false);

  useEffect(() => {
    if (searchParams?.get('nuovo') === '1') {
      setApertoModaleNuovo(true);
    }
  }, [searchParams]);

  /**
   * Arrivare qui gia' su UNA bozza: `/bozze?bozza=84`.
   *
   * ⚠️ Serve al calendario. Prima una riga del calendario portava alla scheda
   * dell'AZIENDA: vedevi «da approvare» e finivi in un posto dove quella bozza
   * non c'era. Un pianificatore da cui non si puo' agire e' un rapporto.
   *
   * Sceglie anche il cliente e il filtro giusti, perche' altrimenti la riga
   * sarebbe nascosta da un filtro che non hai messo tu: «Tutte» copre anche le
   * gia' decise, che dal calendario si aprono per rileggerle.
   */
  useEffect(() => {
    const chiesta = Number(searchParams?.get('bozza'));
    if (!Number.isFinite(chiesta) || chiesta <= 0) return;
    const b = bozze.find((x) => x.id === chiesta);
    if (!b) return;
    setCliente(String(b.azienda_id));
    setFiltro('tutte');
    setSelezionataId(chiesta);
  }, [searchParams, bozze]);

  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return bozze.filter((b) => {
      if (cliente && cliente !== 'tutti' && String(b.azienda_id) !== cliente) return false;
      if (filtro === 'da_decidere' && !DECIDIBILI.has(b.stato)) return false;
      if (filtro === 'attenzione' && !b.avvisi.some((a) => a.gravita === 'grave')) return false;
      if (filtro === 'pubblicate' && b.stato !== 'pubblicata') return false;
      if (filtro === 'fallite' && !b.pubblicazioni.some((p) => p.esito === 'errore')) return false;
      if (!q) return true;
      // Il titolo va cercato a parte: `testoBozza` restituisce il CORPO, e per
      // un post di Google il titolo non ci sta dentro. Cercare "problema" non
      // trovava "Un problema tipico" — cioe' la ricerca non trovava le righe
      // con il nome che si legge nella lista.
      return [b.azienda, b.citta, ETICHETTA_TIPO[b.tipo] ?? b.tipo, titoloBozza(b.contenuto, b.tipo), testoBozza(b.contenuto)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [bozze, filtro, cliente, cerca]);

  /**
   * Cosa passa in rassegna: le decidibili di questo filtro, NELLO STESSO ORDINE
   * della lista (che gia' mette in cima quelle il cui turno è arrivato).
   *
   * ⚠️ Fuori le bozze senza testo: quello che si legge in una bozza vuota è il
   * COMPITO, non il post, e il server rifiuta di approvarla (giustamente). In
   * rassegna sarebbero trenta schermate con un bottone che non funziona: si
   * scrivono, non si approvano — e per quelle c'è il pannello, con «Scrivi».
   */
  const coda = useMemo(
    () => filtrate.filter((b) => DECIDIBILI.has(b.stato) && testoBozza(b.contenuto).trim().length > 0),
    [filtrate]
  );
  const corrente = useMemo(() => {
    const nonSaltate = coda.filter((b) => !saltate.some((x) => String(x) === String(b.id)));
    // Finite le altre, tornano quelle saltate: il giro si chiude, non si perde.
    return nonSaltate[0] ?? coda[0] ?? null;
  }, [coda, saltate]);

  const selezionata = bozze.find((b) => b.id === selezionataId) ?? null;

  // Il testo mostrato: la correzione in corso se c'e', altrimenti l'originale.
  const testoOriginale = selezionata ? testoBozza(selezionata.contenuto) : '';
  const testoCorrente =
    selezionata && correzioni[selezionata.id] !== undefined
      ? correzioni[selezionata.id]
      : testoOriginale;
  const modificato = testoCorrente !== testoOriginale;

  // Ricalcolati sul testo CORRENTE: e' il punto 2 del commento in cima.
  const avvisiCorrenti = useMemo(
    () => (selezionata ? controllaBozza(selezionata.tipo, testoCorrente, selezionata.fatti_veri) : []),
    [selezionata, testoCorrente]
  );
  const gravi = avvisiCorrenti.filter((a) => a.gravita === 'grave');
  const attenzioni = avvisiCorrenti.filter((a) => a.gravita === 'attenzione');

  const voci = selezionata ? vociMenu(selezionata.contenuto) : [];
  const scade = selezionata ? scadenza(selezionata.scade_at, adesso) : null;
  const destinazione = selezionata ? destinazioneBozza(selezionata) : null;

  /**
   * La copertina.
   *
   * ⚠️ IL FILE NON PASSA DAL NOSTRO DATABASE e non resta nemmeno qui: sale su
   * `media.mywebby.it` e di ritorno arriva una URL pubblica. Deve essere
   * pubblica perche' Google il file non lo riceve — gli passiamo un indirizzo e
   * se lo scarica da solo (`localPosts` -> `media[].sourceUrl`). Un percorso
   * locale tipo /uploads/foo.jpg si vedrebbe benissimo nel browser e farebbe
   * fallire la pubblicazione con un errore che non spiega niente.
   *
   * Il tetto di 8 MB e il controllo sul tipo li rifa' anche il server: qui
   * servono a dirlo subito invece che dopo trenta secondi di attesa.
   */
  async function caricaFoto(file: File | File[] | null) {
    if (!selezionata || !file || Array.isArray(file)) return;
    setErrore(null);
    setCaricando(true);
    try {
      const modulo = new FormData();
      modulo.append('file', file);
      const risposta = await fetch(`/api/bozze/${selezionata.id}/immagine`, { method: 'POST', body: modulo });
      const esito = await risposta.json().catch(() => ({}));
      if (!risposta.ok) {
        setErrore(esito?.errore ?? 'Il caricamento non è riuscito.');
        return;
      }
      router.refresh();
    } finally {
      setCaricando(false);
    }
  }

  async function togliFoto() {
    if (!selezionata) return;
    await fetch(`/api/bozze/${selezionata.id}/immagine`, { method: 'DELETE' });
    router.refresh();
  }

  /**
   * Il bottone di QUESTA bozza. Si salva subito, senza aspettare l'approvazione:
   * è una scelta sul contenuto, non una decisione sul suo destino.
   *
   * Vuoto = «usa quello del cliente», che è diverso da «nessun bottone»: il
   * primo eredita, il secondo lo toglie apposta. Per questo l'elenco ha due
   * voci distinte e non una sola casella.
   */
  async function cambiaCta(tipo: string, url: string) {
    if (!selezionata) return;
    const cta = tipo === '' ? null : { tipo, url };
    await fetch(`/api/bozze/${selezionata.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ azione: 'nessuna', cta }),
    }).catch(() => undefined);
    router.refresh();
  }

  /**
   * Cancellare non e' rifiutare.
   *
   * «Rifiuta» e' una decisione che resta scritta; «Cancella» toglie una bozza
   * che non doveva esistere — uno slot nato da un piano rifatto, una data gia'
   * passata. Senza questo, l'unico modo di ripulire era lasciare in archivio
   * decine di righe rifiutate che nascondono le decisioni vere.
   */
  /**
   * Scrivere il testo di QUESTA bozza.
   *
   * La rotta c'era dal principio, ma non la chiamava nessuno: l'unica strada
   * era «Scrivi i testi mancanti» nella scheda del cliente, che le fa tutte
   * insieme. Ma qui si guarda una bozza per volta — e uno slot che si vuole
   * riempire adesso non deve obbligare a spendere una generazione anche per
   * gli altri sei che magari si vogliono ancora cambiare.
   */
  async function scrivi() {
    if (!selezionata) return;
    setErrore(null);
    setInScrittura(true);
    const risposta = await fetch(`/api/bozze/${selezionata.id}/scrivi`, { method: 'POST' });
    const esito = await risposta.json().catch(() => ({}));
    setInScrittura(false);
    if (!risposta.ok) {
      setErrore(perche(risposta, esito));
      return;
    }
    router.refresh();
  }

  /**
   * Spostare la data di uscita.
   *
   * ⚠️ Prima non si poteva: una bozza nasceva con la sua data e per farla
   * uscire un altro giorno bisognava cancellarla e rifarla — cioe' buttare via
   * un testo gia' scritto, gia' letto e gia' corretto per spostare un'ora.
   */
  async function cambiaQuando(valore: string) {
    if (!selezionata) return;
    setErrore(null);
    const risposta = await fetch(`/api/bozze/${selezionata.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ azione: 'nessuna', pubblica_at: valore || null }),
    });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      setErrore(perche(risposta, esito));
      return;
    }
    router.refresh();
  }

  async function cancella() {
    if (!selezionata) return;
    setErrore(null);
    const risposta = await fetch(`/api/bozze/${selezionata.id}`, { method: 'DELETE' });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      setErrore(perche(risposta, esito));
      router.refresh();
      return;
    }
    setDaCancellare(false);
    setSelezionataId(null);
    router.refresh();
  }

  /**
   * Decidere. Di solito la bozza aperta nel pannello, ma la rassegna passa la
   * SUA: li' si decide senza aprire niente, una riga dopo l'altra.
   */
  async function decidi(azione: 'approva' | 'rifiuta', quale: Bozza | null = selezionata) {
    if (!quale) return;
    setErrore(null);
    // La correzione in corso si manda solo se riguarda QUESTA bozza: in
    // rassegna la bozza decisa e quella aperta nel pannello possono essere due.
    const suQuestaCorretto = quale.id === selezionata?.id && modificato;
    const risposta = await fetch(`/api/bozze/${quale.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        azione,
        // Il testo si manda solo se e' stato davvero toccato: cosi' una
        // riapprovazione non riscrive `contenuto` con quello che c'era gia'.
        ...(suQuestaCorretto ? { testo: testoCorrente } : {}),
      }),
    });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      setErrore(perche(risposta, esito));
      router.refresh();
      return;
    }
    setCorrezioni((c) => {
      const { [quale.id]: _tolta, ...resto } = c;
      return resto;
    });
    setUltimaDecisa({ id: quale.id, azione, titolo: titoloBozza(quale.contenuto, quale.tipo) });
    router.refresh();
  }

  /**
   * Disfare l'ultima decisione, finche' il router non l'ha presa in mano.
   *
   * Un gesto che si ripete trenta volte deve avere il suo contrario, o la
   * trentesima si fa con la paura. Quanto duri la finestra non lo decide questa
   * pagina: lo dice il server, e se è tardi lo scrive («È già uscita»).
   */
  async function tornaIndietro() {
    if (!ultimaDecisa) return;
    setErrore(null);
    const risposta = await fetch(`/api/bozze/${ultimaDecisa.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ azione: 'torna_indietro' }),
    });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      setErrore(perche(risposta, esito));
      setUltimaDecisa(null);
      router.refresh();
      return;
    }
    setSaltate((s) => s.filter((x) => String(x) !== String(ultimaDecisa.id)));
    setUltimaDecisa(null);
    router.refresh();
  }

  async function copiaPostSocial(testo: string, hashtag?: string[]) {
    const base = testo.trim();
    const tag =
      Array.isArray(hashtag) && hashtag.length > 0
        ? '\n\n' + hashtag.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')
        : '';
    await navigator.clipboard.writeText(base + tag);
    setCopiato(true);
    setTimeout(() => setCopiato(false), 2500);
  }

  async function copiaPrimoCommento(commento: string) {
    await navigator.clipboard.writeText(commento);
    setCopiatoCommento(true);
    setTimeout(() => setCopiatoCommento(false), 2500);
  }

  async function segnaPubblicataAMano() {
    if (!selezionata) return;
    setErrore(null);
    const risposta = await fetch(`/api/bozze/${selezionata.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        azione: 'segna_pubblicata_a_mano',
        ...(modificato ? { testo: testoCorrente } : {}),
      }),
    });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      setErrore(perche(risposta, esito));
      router.refresh();
      return;
    }
    setCorrezioni((c) => {
      const { [selezionata.id]: _tolta, ...resto } = c;
      return resto;
    });
    router.refresh();
  }

  async function impostaGancio(gancioTesto: string) {
    if (!selezionata) return;
    const righe = testoCorrente.split('\n');
    righe[0] = gancioTesto;
    const nuovoTesto = righe.join('\n');
    setCorrezioni((c) => ({ ...c, [selezionata.id]: nuovoTesto }));
    await fetch(`/api/bozze/${selezionata.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        azione: 'nessuna',
        gancio_scelto: gancioTesto,
        testo: nuovoTesto,
      }),
    }).catch(() => undefined);
  }

  /**
   * I conteggi si fanno su TUTTE le bozze, non su quelle filtrate.
   *
   * Servono a decidere dove guardare: un filtro che dice "0" mentre stai
   * guardando altro e' un'informazione, un filtro che dice "0" perche' lo stai
   * gia' escludendo non e' niente.
   */
  const conta = {
    daDecidere: bozze.filter((b) => DECIDIBILI.has(b.stato)).length,
    conAvvisi: bozze.filter((b) => b.avvisi.some((a) => a.gravita === 'grave')).length,
    pubblicate: bozze.filter((b) => b.stato === 'pubblicata').length,
    fallite: bozze.filter((b) => b.pubblicazioni.some((p) => p.esito === 'errore')).length,
  };
  const daDecidere = conta.daDecidere;

  /** I clienti che hanno almeno una bozza: gli altri non servono nel filtro. */
  const clienti = [...new Map(bozze.map((b) => [String(b.azienda_id), b.azienda])).entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <>
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack gap={3} align="center">
            <Heading level={2}>{prodotto ? PRODOTTI[prodotto].label : 'Da approvare'}</Heading>
            <Text color="secondary">
              {daDecidere === 0
                ? 'niente da decidere'
                : daDecidere === 1
                  ? 'una cosa da decidere'
                  : `${daDecidere} da decidere`}
            </Text>
            {/* Cosa succede quando premi «Approva»: non è uguale per tutti i
                prodotti, e su un post social — che va incollato a mano — darlo
                per scontato vuol dire lasciarlo fermo per una settimana. */}
            {prodotto ? <Text type="supporting">{PRODOTTI[prodotto].cosaSucedeDopo}</Text> : null}
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <VStack gap={0}>
            <VStack padding={3} gap={3}>
              <HStack justify="between" align="center" wrap="wrap" gap={3}>
                <SegmentedControl label="Cosa mostrare" value={filtro} onChange={setFiltro} size="sm">
                  <SegmentedControlItem value="da_decidere" label={`Da decidere (${conta.daDecidere})`} />
                  <SegmentedControlItem value="attenzione" label={`Con avvisi (${conta.conAvvisi})`} />
                  <SegmentedControlItem value="pubblicate" label={`Pubblicate (${conta.pubblicate})`} />
                  <SegmentedControlItem value="fallite" label={`Fallite (${conta.fallite})`} />
                  <SegmentedControlItem value="tutte" label={`Tutte (${bozze.length})`} />
                </SegmentedControl>
                <Button
                  label="+ Post al volo"
                  variant="primary"
                  size="sm"
                  icon={<Plus size={16} />}
                  onClick={() => setApertoModaleNuovo(true)}
                />
              </HStack>

              {clienti.length > 1 ? (
                <Selector
                  label="Cliente"
                  value={cliente}
                  onChange={setCliente}
                  size="sm"
                  hasSearch={clienti.length > 8}
                  options={[
                    { value: 'tutti', label: `Tutti i clienti (${clienti.length})` },
                    ...clienti.map((c) => ({ value: c.id, label: c.nome })),
                  ]}
                />
              ) : null}
              <TextInput
                label="Cerca"
                isLabelHidden
                placeholder="Azienda, città, tipo, testo…"
                value={cerca}
                onChange={setCerca}
                size="sm"
                startIcon="search"
              />
            </VStack>

            {/* ── LA RASSEGNA ───────────────────────────────────
                Una bozza per volta, sopra la lista. Solo in «Da decidere»: le
                altre viste si guardano, non si decidono. La lista resta sotto
                — serve quando cerchi una cosa precisa, non quando devi
                svuotare la coda. */}
            {filtro === 'da_decidere' && corrente ? (
              <VStack paddingInline={3} gap={2}>
                {ultimaDecisa ? (
                  <Banner
                    status="success"
                    title={`${ultimaDecisa.azione === 'approva' ? 'Approvata' : 'Rifiutata'}: «${ultimaDecisa.titolo}»`}
                    description={
                      ultimaDecisa.azione === 'approva'
                        ? 'Esce al prossimo giro del router. Finché non è uscita si può disfare.'
                        : 'Resta in archivio come decisione: si può disfare.'
                    }
                    endContent={<Button label="Torna indietro" size="sm" clickAction={tornaIndietro} />}
                  />
                ) : null}

                <Card>
                  <VStack gap={3} padding={4}>
                    <HStack justify="between" align="center" wrap="wrap" gap={2}>
                      <HStack gap={2} align="center" wrap="wrap">
                        <Text weight="medium">{corrente.azienda}</Text>
                        <Text type="supporting" color="secondary">
                          {cosaSuccedeOra(corrente, adesso)}
                        </Text>
                      </HStack>
                      <Text type="supporting" color="secondary">
                        {coda.length === 1 ? 'l’ultima' : `${coda.length} da decidere`}
                        {saltate.length ? ` · ${saltate.length} saltate` : ''}
                      </Text>
                    </HStack>

                    <Heading level={3}>{titoloBozza(corrente.contenuto, corrente.tipo)}</Heading>

                    {/* Il testo intero, non un'anteprima: si sta decidendo se
                        farlo uscire. `pre-wrap` perché gli a capo sono parte del
                        post — su Google si vedono. */}
                    <Text style={{ whiteSpace: 'pre-wrap' }}>{testoBozza(corrente.contenuto)}</Text>

                    {corrente.avvisi.some((a) => a.gravita === 'grave') ? (
                      <Banner
                        status="warning"
                        title="C’è qualcosa da controllare prima"
                        description={corrente.avvisi
                          .filter((a) => a.gravita === 'grave')
                          .map((a) => a.messaggio)
                          .join(' · ')}
                      />
                    ) : null}

                    <HStack gap={2} wrap="wrap">
                      <Button
                        label="Approva e avanti"
                        variant="primary"
                        clickAction={() => decidi('approva', corrente)}
                      />
                      <Button
                        label="Salta"
                        variant="secondary"
                        onClick={() => setSaltate((s) => [...s, corrente.id])}
                      />
                      <Button
                        label="Rifiuta"
                        variant="ghost"
                        clickAction={() => decidi('rifiuta', corrente)}
                      />
                      {/* Correggere è un altro mestiere: si apre il pannello,
                          dove ci sono il testo modificabile, la foto e la data. */}
                      <Button
                        label="Apri per correggere"
                        variant="ghost"
                        onClick={() => {
                          setSelezionataId(corrente.id);
                          setErrore(null);
                        }}
                      />
                    </HStack>
                  </VStack>
                </Card>
              </VStack>
            ) : null}

            {filtrate.length === 0 ? (
              <EmptyState
                title={filtro === 'da_decidere' ? 'Nessuna bozza da decidere' : 'Nessuna bozza'}
                description={
                  filtro === 'da_decidere'
                    ? 'La coda è vuota: tutto quello che era in attesa è stato deciso.'
                    : 'Cambia filtro o svuota la ricerca.'
                }
              />
            ) : (
              <List hasDividers density="balanced">
                {filtrate.map((b) => {
                  const s = scadenza(b.scade_at, adesso);
                  const graviQui = b.avvisi.filter((a) => a.gravita === 'grave').length;
                  return (
                    <ListItem
                      key={b.id}
                      /* ⚠️ IL TITOLO, NON IL NOME DEL CLIENTE (01/09/2026).
                         Con label=azienda un piano del mese dava diciassette
                         righe identiche: stesso cliente, stesso tipo, stessa
                         ora di creazione (nascono tutte insieme). Il cliente
                         resta leggibile nella descrizione — e la colonna con
                         cui si sceglie dev'essere quella che cambia. */
                      label={titoloBozza(b.contenuto, b.tipo)}
                      /* ⚠️ LA DESCRIZIONE DEVE DISTINGUERE, NON RIPETERE
                         (16/09/2026). Era «MyWebby · Post Google · Piano del
                         mese» su trentasei righe di fila: dentro «Google» il tipo
                         e' gia' detto dalla voce di menu, e l'origine e' la
                         stessa per tutto un piano. Il pezzo che cambia è il
                         testo, e i titoli invece si ripetono (sono gli angoli
                         del piano: «Cosa facciamo» esce una volta al mese). */
                      description={
                        [
                          b.azienda,
                          prodotto ? null : ETICHETTA_TIPO[b.tipo] ?? b.tipo,
                          testoBozza(b.contenuto).replace(/\s+/g, ' ').trim().slice(0, 90) || null,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      }
                      isSelected={b.id === selezionataId}
                      onClick={() => {
                        setSelezionataId(b.id);
                        setErrore(null);
                      }}
                      startContent={
                        <StatusDot
                          variant={COLORE_STATO[b.stato] ?? 'neutral'}
                          label={ETICHETTA_STATO[b.stato] ?? b.stato}
                          tooltip={ETICHETTA_STATO[b.stato] ?? b.stato}
                        />
                      }
                      endContent={
                        <HStack gap={3} align="center">
                          {/* Badge solo dove serve notarlo: gli avvisi gravi e
                              una scadenza che sta per passare. Non sullo stato,
                              che ce l'hanno tutte le righe. */}
                          {graviQui > 0 ? <Badge variant="error" label={String(graviQui)} /> : null}
                          {/* Scaduta e' uno stato eccezionale che chiede
                              un'azione, quindi Badge. Il conto alla rovescia
                              invece e' metadato: testo, non badge. */}
                          {s?.scaduta ? (
                            <Badge variant="error" label="scaduta" />
                          ) : s ? (
                            <Text type="supporting">{s.testo}</Text>
                          ) : null}
                          {/* ⚠️ QUANDO ESCE, non quando e' stata creata. La data
                              di creazione e' identica per tutto un piano del
                              mese e non serve a decidere niente; quella di
                              uscita dice se questa riga tocca a oggi o fra tre
                              settimane — che e' l'unica domanda che si fa chi
                              guarda questa colonna. */}
                          {b.pubblica_at ? (
                            adesso !== null && new Date(b.pubblica_at).getTime() <= adesso ? (
                              <Badge variant="warning" label="tocca a oggi" />
                            ) : (
                              <Text type="supporting">esce il {quandoBreve(b.pubblica_at)}</Text>
                            )
                          ) : (
                            <Text type="supporting">esce subito</Text>
                          )}
                        </HStack>
                      }
                    />
                  );
                })}
              </List>
            )}
          </VStack>
        </LayoutContent>
      }
      /* ⚠️ IL PANNELLO NON C'E' SE NON SERVE (16/09/2026). Erano 560px fissi
         che dicevano «Nessuna bozza selezionata» mentre in rassegna stavi gia'
         leggendo una bozza: un terzo dello schermo occupato per dirti che non
         c'e' niente. Compare quando apri una riga, e allora serve tutto. */
      end={
        !selezionata && corrente && filtro === 'da_decidere' ? undefined : (
        <LayoutPanel width={560} hasDivider isScrollable label="Dettaglio bozza" padding={4}>
          {!selezionata ? (
            <EmptyState
              isCompact
              title="Nessuna bozza selezionata"
              description="Scegli una riga per leggerla e decidere."
            />
          ) : (
            <VStack gap={5}>
              <VStack gap={1}>
                <Heading level={3}>{selezionata.azienda}</Heading>
                <Text color="secondary">
                  {ETICHETTA_TIPO[selezionata.tipo] ?? selezionata.tipo}
                  {selezionata.citta ? ` · ${selezionata.citta}` : ''}
                </Text>
              </VStack>

              {errore ? <Banner status="error" title="Non è stato possibile" description={errore} /> : null}

              {scade?.scaduta ? (
                <Banner
                  status="error"
                  title="Questa bozza è scaduta"
                  description="Il tempo per dire di sì è passato: pubblicarla adesso vorrebbe dire mandare fuori roba di ieri. Va rigenerata."
                />
              ) : null}

              {gravi.map((a, i) => (
                <Banner key={`g${i}`} status="error" title="Da controllare" description={a.messaggio} />
              ))}
              {attenzioni.map((a, i) => (
                <Banner key={`a${i}`} status="warning" title="Forse" description={a.messaggio} />
              ))}

              {/* ── I DUE BOTTONI STANNO QUI, IN CIMA ────────────────────────
                  Fino al 31/08/2026 erano in fondo, sotto il testo, l'elenco
                  dei piatti e il caricamento della copertina: su un articolo di
                  seicento parole finivano OLTRE il bordo del pannello, e per
                  approvare bisognava scorrere fino in fondo — quando li si
                  trovava. È la stessa scelta già presa nell'elenco aziende: le
                  azioni sono il motivo per cui si apre una riga, non la
                  conclusione di una lettura.

                  Sopra restano solo gli avvisi, ed è voluto: se c'è qualcosa da
                  sapere prima di dire di sì, si legge prima del bottone. */}
              {/* ── DOVE VA A FINIRE ─────────────────────────────────────────
                  Chiesto da chi la usa, davanti alla schermata: «ma per
                  pubblicare su Google sono nel posto giusto?». Non c'era
                  scritto da nessuna parte. Chi sta per far uscire una cosa nel
                  mondo ha diritto di sapere dove va, prima di premere — e se
                  quel posto non esiste, ha diritto di saperlo adesso e non da
                  un errore rosso mezz'ora dopo. */}
              {destinazione && DECIDIBILI.has(selezionata.stato) && !scade?.scaduta ? (
                destinazione.pronta ? (
                  <Banner
                    status="info"
                    title={`Approvando, questo esce su: ${destinazione.dove}`}
                    description={cosaSuccedeOra(selezionata, adesso)}
                  />
                ) : (
                  <Banner
                    status="warning"
                    title={`Non può uscire: ${destinazione.perche}`}
                    description={`Dovrebbe andare su ${destinazione.dove}. Si sistema qui: ${destinazione.rimedio}`}
                  />
                )
              ) : null}

              {/* ── E RESTANO IN CIMA ANCHE SCORRENDO (07/09/2026) ──────────
                  Il 31/08 i bottoni furono portati sopra il testo, e per un
                  post di quattro righe bastava. Ma su un articolo di seicento
                  parole si scende a leggere e i bottoni scorrono via: si finisce
                  di leggere, si e' deciso, e si deve risalire per dirlo.

                  `sticky` invece di spostarli ancora: la decisione si prende
                  DAVANTI a quello che si sta approvando, e una barra fissa
                  tiene tutti e due sullo schermo insieme. Le linguette, che
                  erano l'altra strada, avrebbero nascosto il testo proprio nel
                  momento in cui si preme il bottone.

                  ⚠️ UN <div>, CONTRO LA REGOLA, E IL MOTIVO. AGENTS.md dice
                  «niente div: i componenti fanno tutto il layout». Ma nessuno
                  di questi espone la POSIZIONE: `HStack` accetta solo `xstyle`
                  (StyleX), e qui il compilatore StyleX non c'e' — passargli
                  `style` non da' errore, lo butta via in silenzio, che e' il
                  peggiore dei due esiti. Stessa scelta gia' fatta in
                  `ModaleNuovoPost` e `ModuloIngresso`.

                  Lo sfondo NON e' facoltativo: senza, il testo scorre sotto i
                  bottoni e si legge attraverso. */}
              {/* ── BARRA DELLE AZIONI ────────────────────────────────────── */}
              {selezionata.tipo === 'social' ? (
                <div
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    background: 'var(--color-background-surface)',
                    paddingBlock: 'var(--spacing-2)',
                  }}
                >
                  <HStack gap={2} align="center" wrap="wrap">
                    <Button
                      label={copiato ? 'Copiato!' : 'Copia per Facebook / Instagram'}
                      variant="primary"
                      icon={copiato ? <Check size={16} /> : <Copy size={16} />}
                      isDisabled={!testoCorrente?.trim()}
                      clickAction={() =>
                        copiaPostSocial(
                          testoCorrente,
                          selezionata.contenuto.hashtag as string[] | undefined
                        )
                      }
                    />
                    {selezionata.contenuto.primo_commento ? (
                      <Button
                        label={copiatoCommento ? 'Commento copiato!' : 'Copia 1° commento'}
                        variant="secondary"
                        clickAction={() =>
                          copiaPrimoCommento(String(selezionata.contenuto.primo_commento))
                        }
                      />
                    ) : null}
                    {selezionata.stato !== 'pubblicata' ? (
                      <Button
                        label="Segna come pubblicata a mano"
                        variant={selezionata.stato === 'approvata' ? 'primary' : 'secondary'}
                        isDisabled={!testoCorrente?.trim()}
                        clickAction={segnaPubblicataAMano}
                      />
                    ) : null}
                    {DECIDIBILI.has(selezionata.stato) && !scade?.scaduta ? (
                      <>
                        <Button
                          label="Approva"
                          variant="secondary"
                          isDisabled={!testoCorrente?.trim()}
                          clickAction={() => decidi('approva')}
                        />
                        <Button
                          label="Rifiuta"
                          variant="secondary"
                          clickAction={() => decidi('rifiuta')}
                        />
                        <Button
                          label="Cancella"
                          variant="ghost"
                          clickAction={() => setDaCancellare(true)}
                        />
                      </>
                    ) : null}
                    {selezionata.stato === 'vuota' ? (
                      <Button
                        label="Scrivi il post"
                        variant="primary"
                        isLoading={inScrittura}
                        clickAction={scrivi}
                      />
                    ) : null}
                    {modificato ? <Badge variant="warning" label="testo modificato" /> : null}
                  </HStack>
                </div>
              ) : DECIDIBILI.has(selezionata.stato) && !scade?.scaduta ? (
                <div
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    background: 'var(--color-background-surface)',
                    paddingBlock: 'var(--spacing-2)',
                  }}
                >
                  <HStack gap={2} align="center" wrap="wrap">
                  {/* Spento quando la destinazione non c'e': approvare
                      scriverebbe "approvata" e basta, e mezz'ora dopo il router
                      registrerebbe un errore. Il perche' non sta in un tooltip
                      — un bottone disabilitato non riceve nemmeno il passaggio
                      del mouse — ma nel banner qui sopra, che si legge sempre. */}
                  <Button
                    label={gravi.length > 0 ? 'Approva lo stesso' : 'Approva'}
                    variant="primary"
                    isDisabled={destinazione ? !destinazione.pronta : false}
                    clickAction={() => decidi('approva')}
                    tooltip={
                      gravi.length > 0
                        ? 'Ci sono avvisi gravi. Puoi approvare comunque: decidi tu.'
                        : undefined
                    }
                  />
                  <Button label="Rifiuta" variant="secondary" clickAction={() => decidi('rifiuta')} />
                  <Button label="Cancella" variant="ghost" clickAction={() => setDaCancellare(true)} />
                  {selezionata.stato === 'vuota' ? (
                    <Button
                      label="Scrivi il testo"
                      variant="primary"
                      isLoading={inScrittura}
                      clickAction={scrivi}
                    />
                  ) : null}
                  {modificato ? <Badge variant="warning" label="testo modificato" /> : null}
                  </HStack>
                </div>
              ) : (
                /* Già decisa: al posto dei bottoni si dice cosa sta succedendo,
                   perché è la domanda che uno si fa appena approva. */
                <Banner
                  status={selezionata.stato === 'pubblicata' ? 'success' : 'info'}
                  title={ETICHETTA_STATO[selezionata.stato] ?? selezionata.stato}
                  description={
                    selezionata.stato === 'approvata'
                      ? cosaSuccedeOra(selezionata, adesso)
                      : scade?.scaduta
                        ? 'Il tempo per dire di sì è passato: va rigenerata.'
                        : undefined
                  }
                />
              )}

              {/* ── La scheda dell'articolo ──────────────────────────────
                  Un articolo non e' un post lungo: titolo, sommario e categoria
                  sono quello che si legge nell'elenco del blog e nei risultati
                  di ricerca, e vanno corretti come il corpo.

                  ⚠️ Lo SLUG si mostra ma non si modifica. E' la chiave con cui
                  il sito riconosce l'articolo: cambiarlo dopo la prima
                  pubblicazione non rinomina niente, crea un SECONDO articolo e
                  lascia il primo online per sempre. */}
              {selezionata.tipo === 'articolo' ? (
                <VStack gap={3}>
                  <TextInput
                    label="Titolo"
                    description="Massimo 70 caratteri: oltre, Google lo taglia nei risultati."
                    value={String(selezionata.contenuto.titolo ?? '')}
                    isDisabled
                    disabledMessage="Si corregge rigenerando: per ora l'articolo si modifica dal corpo."
                  />
                  <TextInput
                    label="Sommario"
                    description="Quello che si legge sotto il titolo nell'elenco. Massimo 160 caratteri."
                    value={String(selezionata.contenuto.sommario ?? '')}
                    isDisabled
                    disabledMessage="Si corregge rigenerando."
                  />
                  <HStack gap={3} align="center">
                    {selezionata.contenuto.categoria ? (
                      <Badge variant="blue" label={String(selezionata.contenuto.categoria)} />
                    ) : (
                      <Text type="supporting">senza categoria</Text>
                    )}
                    <Text type="supporting">
                      indirizzo: /blog/{String(selezionata.contenuto.slug ?? '—')}
                    </Text>
                    {selezionata.contenuto.foto ? (
                      <Text type="supporting">copertina: sì</Text>
                    ) : (
                      <Text type="supporting">senza copertina</Text>
                    )}
                  </HStack>
                </VStack>
              ) : null}

              {/* ── La scheda del post social ─────────────────────────── */}
              {selezionata.tipo === 'social' ? (
                <VStack gap={3}>
                  <HStack gap={2} align="center" wrap="wrap">
                    <Badge
                      variant="neutral"
                      label={`Formato: ${String(selezionata.contenuto.formato ?? 'post')}`}
                    />
                    {selezionata.contenuto.framework ? (
                      <Badge
                        variant="neutral"
                        label={`Framework: ${String(selezionata.contenuto.framework)}`}
                      />
                    ) : null}
                    {selezionata.contenuto.canale ? (
                      <Badge
                        variant="blue"
                        label={`Canale: ${String(selezionata.contenuto.canale)}`}
                      />
                    ) : null}
                  </HStack>

                  {/* Se ci sono dati mancanti / da verificare prima di pubblicare */}
                  {Array.isArray(selezionata.contenuto.dati_mancanti) &&
                  selezionata.contenuto.dati_mancanti.length > 0 ? (
                    <Banner
                      status="warning"
                      title="Dati non verificati (richiedono conferma dal cliente)"
                      description={selezionata.contenuto.dati_mancanti.join(' • ')}
                    />
                  ) : null}

                  {/* Selettore ganci alternativi */}
                  {Array.isArray(selezionata.contenuto.ganci) &&
                  selezionata.contenuto.ganci.length > 1 ? (
                    <VStack gap={1}>
                      <Text type="supporting">Ganci alternativi (clicca per applicare al post)</Text>
                      <VStack gap={1}>
                        {selezionata.contenuto.ganci.map((g, idx) => {
                          const testoGancio = String(g);
                          const eAttivo = testoCorrente.startsWith(testoGancio);
                          return (
                            <div
                              key={idx}
                              style={{
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: eAttivo
                                  ? '1px solid var(--color-border-accent, #3b82f6)'
                                  : '1px solid var(--color-border-subtle, #e5e7eb)',
                                background: eAttivo
                                  ? 'var(--color-background-accent-subtle, #eff6ff)'
                                  : 'var(--color-background-surface)',
                                cursor: DECIDIBILI.has(selezionata.stato) ? 'pointer' : 'default',
                                fontSize: '13px',
                              }}
                              onClick={() => {
                                if (DECIDIBILI.has(selezionata.stato)) {
                                  void impostaGancio(testoGancio);
                                }
                              }}
                            >
                              <HStack justify="between" align="center">
                                <Text>
                                  <strong>Opzione {idx + 1}:</strong> {testoGancio}
                                </Text>
                                {eAttivo ? <Badge variant="success" label="Attivo" /> : null}
                              </HStack>
                            </div>
                          );
                        })}
                      </VStack>
                    </VStack>
                  ) : null}

                  {/* Slide del carosello */}
                  {selezionata.contenuto.formato === 'carosello' &&
                  Array.isArray(selezionata.contenuto.slide) &&
                  selezionata.contenuto.slide.length > 0 ? (
                    <VStack gap={2}>
                      <Text type="supporting">
                        Slide del carosello ({selezionata.contenuto.slide.length} slide)
                      </Text>
                      <List hasDividers density="compact">
                        {(
                          selezionata.contenuto.slide as Array<{
                            n?: number;
                            testo?: string;
                            prompt_immagine?: string;
                          }>
                        ).map((sl, i) => (
                          <ListItem
                            key={i}
                            label={`Slide ${sl.n ?? i + 1}: ${sl.testo ?? ''}`}
                            description={
                              sl.prompt_immagine ? `Prompt grafica: ${sl.prompt_immagine}` : undefined
                            }
                          />
                        ))}
                      </List>
                    </VStack>
                  ) : null}

                  {/* Sceneggiatura Reel */}
                  {selezionata.contenuto.formato === 'reel' &&
                  Array.isArray(selezionata.contenuto.script_reel) &&
                  selezionata.contenuto.script_reel.length > 0 ? (
                    <VStack gap={2}>
                      <Text type="supporting">Sceneggiatura Reel</Text>
                      <List hasDividers density="compact">
                        {(
                          selezionata.contenuto.script_reel as Array<{
                            secondi?: string;
                            a_video?: string;
                            voce?: string;
                          }>
                        ).map((b, i) => (
                          <ListItem
                            key={i}
                            label={`[${b.secondi ?? '0-3s'}] ${b.voce ?? ''}`}
                            description={`A video: ${b.a_video ?? ''}`}
                          />
                        ))}
                      </List>
                    </VStack>
                  ) : null}

                  {/* Primo commento (hashtag o link) */}
                  {selezionata.contenuto.primo_commento ? (
                    <VStack gap={1}>
                      <HStack justify="between" align="center">
                        <Text type="supporting">Primo commento (per hashtag o link esterni)</Text>
                        <Button
                          label={copiatoCommento ? 'Copiato!' : 'Copia 1° commento'}
                          variant="secondary"
                          size="sm"
                          clickAction={() =>
                            copiaPrimoCommento(String(selezionata.contenuto.primo_commento))
                          }
                        />
                      </HStack>
                      <TextArea
                        label="Primo commento"
                        isLabelHidden
                        value={String(selezionata.contenuto.primo_commento)}
                        rows={3}
                        isDisabled={!DECIDIBILI.has(selezionata.stato)}
                        onChange={(v) => {
                          void fetch(`/api/bozze/${selezionata.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ azione: 'nessuna', primo_commento: v }),
                          });
                        }}
                      />
                    </VStack>
                  ) : null}

                  {/* Traccia se già segnata come pubblicata a mano */}
                  {selezionata.contenuto.pubblicata_a_mano ? (
                    <Banner
                      status="success"
                      title="Pubblicata a mano"
                      description={`Segnata da ${
                        (selezionata.contenuto.pubblicata_a_mano as { operatore?: string })
                          .operatore ?? 'dashboard'
                      } il ${
                        (selezionata.contenuto.pubblicata_a_mano as { data?: string }).data
                          ? quandoBreve(
                              (selezionata.contenuto.pubblicata_a_mano as { data?: string }).data!
                            )
                          : 'oggi'
                      }`}
                    />
                  ) : null}
                </VStack>
              ) : null}

              {/* ── IL COMPITO NON E' IL POST (07/09/2026) ───────────────────
                  Uno slot ancora da generare mostrava il suo COMPITO («Cosa
                  deve fare», «Si regge su») dentro il campo «Testo», sotto la
                  riga «Il testo non è ancora stato scritto». Chi apriva la
                  bozza leggeva quella roba come il post — e la reazione giusta
                  era «ma è scritto da cani»: come post lo è, perche' non e' un
                  post.

                  Adesso il compito sta fuori dal campo, in un riquadro suo, e
                  il campo del testo resta VUOTO finche' il testo non c'e'
                  davvero. Un contenitore che si chiama «Testo» deve contenere
                  il testo o niente. */}
              {selezionata.stato === 'vuota' ? (
                <Banner
                  status="info"
                  title="Questo slot non ha ancora un testo"
                  description={`${testoOriginale}

Premi «Scrivi il testo» per generarlo.`}
                />
              ) : null}

              {/* Il testo e' modificabile finche' la bozza e' decidibile. Dopo
                  resta leggibile ma fermo: correggere un post gia' pubblicato
                  qui non lo cambierebbe su Google, direbbe solo una bugia. */}
              <TextArea
                label="Testo"
                value={selezionata.stato === 'vuota' && !modificato ? '' : testoCorrente}
                placeholder={
                  selezionata.stato === 'vuota'
                    ? 'Ancora niente: il testo lo scrive «Scrivi il testo», oppure lo scrivi tu qui.'
                    : undefined
                }
                rows={18}
                isDisabled={!DECIDIBILI.has(selezionata.stato)}
                disabledMessage="Questa bozza è già stata decisa: il testo non si tocca più."
                description={
                  modificato
                    ? 'Modificato: approvando esce questo, non quello generato.'
                    : undefined
                }
                onChange={(v) =>
                  setCorrezioni((c) => ({ ...c, [selezionata.id]: v }))
                }
              />

              {/* La copertina sta SOTTO il testo e sopra i bottoni: si guarda
                  dopo aver letto cosa esce, che è l'ordine in cui si decide.
                  Su un post di Google l'immagine è metà del messaggio.

                  ⚠️ SI PUÒ AGGIUNGERE ANCHE DOPO L'APPROVAZIONE, finché la
                  bozza non è uscita — e non è una crepa nella regola della
                  casa. Quello che una persona approva è il TESTO, che infatti
                  resta bloccato. La copertina è un allegato, e il piano del
                  mese approva post che escono fra tre settimane: pretendere la
                  foto nello stesso minuto del sì vorrebbe dire o approvare
                  tardi, o pubblicare senza immagine — che su Google significa
                  metà del messaggio in meno. */}
              {DECIDIBILI.has(selezionata.stato) || selezionata.stato === 'approvata' ? (
                <VStack gap={2}>
                  <Text type="supporting">Copertina</Text>
                  <HStack gap={3} align="center">
                    {selezionata.contenuto.foto ? (
                      <Thumbnail
                        src={String(selezionata.contenuto.foto)}
                        label="La copertina che esce con questo post"
                        alt="Copertina della bozza"
                        isLoading={caricando}
                        onRemove={togliFoto}
                        showRemoveOn="always"
                      />
                    ) : null}
                    {/* ⚠️ `placeholder` IN ITALIANO, e diverso a foto messa
                        (01/09/2026). Di serie il componente scrive "Choose
                        file": in un programma tutto in italiano stona, ma
                        soprattutto — caricata la copertina — quel riquadro
                        restava identico a prima, e sembrava che il caricamento
                        non fosse andato. La miniatura c'era, accanto, e non
                        bastava a smentirlo. */}
                    <FileInput
                      label={selezionata.contenuto.foto ? 'Cambia la copertina' : 'Aggiungi una copertina'}
                      placeholder={
                        caricando
                          ? 'Sto caricando…'
                          : selezionata.contenuto.foto
                            ? 'Scegli un’altra immagine'
                            : 'Scegli il file'
                      }
                      mode="dropzone"
                      accept="image/*"
                      maxSize={8 * 1024 * 1024}
                      value={null}
                      isLoading={caricando}
                      description="JPG o PNG, fino a 8 MB. Sale su media.mywebby.it: Google se la scarica da lì."
                      onChange={() => undefined}
                      changeAction={caricaFoto}
                    />
                  </HStack>

                  {/* ── IL BOTTONE SOTTO IL POST ──────────────────────────────
                      Solo per i post di Google: sul sito e su WhatsApp non
                      esiste un pulsante da mettere.

                      «Quello del cliente» e «Nessun bottone» sono due voci
                      diverse apposta: la prima eredita il valore di serie
                      (Servizi → Bottone sotto i post), la seconda lo toglie per
                      questo post e basta. Con una casella sola non si potrebbe
                      dire «questo no» senza cambiarlo per tutti. */}
                  {selezionata.tipo === 'post_gbp' ? (
                    <HStack gap={3} align="end" wrap="wrap">
                      <Selector
                        label="Bottone sotto il post"
                        value={(selezionata.contenuto.cta as { tipo?: string } | undefined)?.tipo ?? ''}
                        /* Cosa vuol dire «Quello del cliente», scritto invece che
                           lasciato indovinare: e' il valore configurato in
                           Servizi, e da qui non si vedeva. */
                        description={
                          selezionata.cta_tipo_cliente
                            ? `Di serie: ${
                                AZIONI_BOTTONE[selezionata.cta_tipo_cliente as AzioneBottone] ??
                                selezionata.cta_tipo_cliente
                              }${selezionata.cta_url_cliente ? ` → ${selezionata.cta_url_cliente}` : ''}`
                            : 'Questo cliente non ha un bottone di serie.'
                        }
                        onChange={(v) => {
                          /* ⚠️ SCEGLIENDO UN BOTTONE, L'INDIRIZZO SI EREDITA
                             (07/09/2026). Prima il campo «Dove porta» nasceva
                             VUOTO anche quando il cliente un indirizzo ce
                             l'aveva gia'. Ma tutti i bottoni tranne CALL lo
                             pretendono: approvare cosi' avrebbe mandato al
                             router un bottone senza destinazione. E riscrivere
                             a mano un indirizzo che il sistema conosce e' il
                             modo migliore per digitarlo sbagliato. */
                          const tipo = String(v);
                          const attuale = (selezionata.contenuto.cta as { url?: string } | undefined)?.url;
                          void cambiaCta(tipo, attuale || selezionata.cta_url_cliente || '');
                        }}
                        options={[
                          { value: '', label: 'Quello del cliente' },
                          ...Object.entries(AZIONI_BOTTONE).map(([value, label]) => ({ value, label })),
                        ]}
                      />
                      {(() => {
                        const cta = selezionata.contenuto.cta as { tipo?: string; url?: string } | undefined;
                        return cta?.tipo && VUOLE_URL(cta.tipo) ? (
                          <TextInput
                            label="Dove porta"
                            value={cta.url ?? ''}
                            /* Vuoto non e' «va bene lo stesso»: senza indirizzo
                               questo bottone non puo' uscire. */
                            status={
                              cta.url?.trim()
                                ? undefined
                                : {
                                    type: 'error',
                                    message:
                                      'Senza indirizzo questo bottone non può uscire: mettilo, o torna a «Quello del cliente».',
                                  }
                            }
                            onChange={(v) => void cambiaCta(cta.tipo!, v)}
                          />
                        ) : null;
                      })()}
                    </HStack>
                  ) : null}

                  <HStack>
                  </HStack>
                </VStack>
              ) : null}

              {voci.length > 0 ? (
                <VStack gap={2}>
                  <Text type="supporting">Piatti letti dalla foto ({voci.length})</Text>
                  <List hasDividers density="compact">
                    {voci.map((v, i) => (
                      <ListItem
                        key={i}
                        label={v.nome}
                        description={v.descrizione || undefined}
                        endContent={<Text hasTabularNumbers>{v.prezzo || '—'}</Text>}
                      />
                    ))}
                  </List>
                </VStack>
              ) : null}

              <MetadataList>
                <MetadataListItem label="Stato">
                  {ETICHETTA_STATO[selezionata.stato] ?? selezionata.stato}
                  {selezionata.stato === 'approvata' ? ` — ${cosaSuccedeOra(selezionata, adesso)}` : ''}
                </MetadataListItem>
                <MetadataListItem label="Da dove arriva">
                  {ETICHETTA_ORIGINE[selezionata.origine] ?? selezionata.origine}
                </MetadataListItem>
                {selezionata.fatto_chiave ? (
                  <MetadataListItem label="Si regge su">
                    {`${selezionata.fatto_chiave}: ${selezionata.fatto_valore ?? ''}`}
                  </MetadataListItem>
                ) : null}
                <MetadataListItem label="Creata">{quandoBreve(selezionata.creata_at)}</MetadataListItem>
                {/* ── QUANDO ESCE, E SI PUO’ SPOSTARE ──────────────────────
                    Il piano programma: la data che conta e’ quando ESCE, non
                    entro quando si decide. Sono due colonne diverse.

                    Prima era di sola lettura, e mostrata solo se una data
                    c’era gia’: per spostare un post di un giorno bisognava
                    cancellarlo e rifarlo — buttare via un testo gia’ scritto,
                    letto e corretto per cambiare un’ora. E una bozza senza
                    data non si poteva programmare affatto.

                    Il fuso lo raddrizza `istanteRoma` sul server: qui l’ora e’
                    SEMPRE quella italiana, sia letta sia scritta, o un post si
                    sposterebbe di un’ora ogni volta che lo si apre e salva. */}
                <MetadataListItem label="Esce il">
                  {DECIDIBILI.has(selezionata.stato) ? (
                    <DateTimeInput
                      label="Quando esce"
                      isLabelHidden
                      hourFormat="24h"
                      timeIncrement={15}
                      value={
                        (perCampoLocale(selezionata.pubblica_at) || undefined) as
                          ISODateTimeString | undefined
                      }
                      onChange={(v) => void cambiaQuando(v ?? '')}
                    />
                  ) : (
                    selezionata.pubblica_at ? quandoBreve(selezionata.pubblica_at) : 'al primo giro utile'
                  )}
                </MetadataListItem>
                {scade ? <MetadataListItem label="Scadenza">{scade.testo}</MetadataListItem> : null}
                {selezionata.approvata_at ? (
                  <MetadataListItem label="Approvata">
                    {`${quandoBreve(selezionata.approvata_at)} da ${selezionata.approvata_da ?? '—'} (${selezionata.approvata_via ?? '—'})`}
                  </MetadataListItem>
                ) : null}
                {/* «Chi l'ha scritto» e non «Modello»: da quando una correzione a
                    mano si registra, la risposta può essere una persona. */}
                <MetadataListItem label="Chi l’ha scritto">
                  {selezionata.modello === 'mano'
                    ? `a mano${
                        typeof selezionata.contenuto?.scritto_prima_da === 'string'
                          ? ` (prima: ${selezionata.contenuto.scritto_prima_da})`
                          : ''
                      }`
                    : (selezionata.modello ?? '—')}
                </MetadataListItem>
              </MetadataList>

              {selezionata.pubblicazioni.length > 0 ? (
                <VStack gap={2}>
                  <Text type="supporting">Pubblicazioni</Text>
                  <List hasDividers density="compact">
                    {selezionata.pubblicazioni.map((p, i) => (
                      <ListItem
                        key={i}
                        label={p.destinazione}
                        description={p.errore ?? undefined}
                        startContent={
                          <StatusDot
                            variant={p.esito === 'ok' ? 'success' : 'error'}
                            label={p.esito === 'ok' ? 'riuscita' : 'fallita'}
                          />
                        }
                      />
                    ))}
                  </List>
                </VStack>
              ) : null}
            </VStack>
          )}
        </LayoutPanel>
        )
      }
    />
    {daCancellare && selezionata ? (
      <AlertDialog
        isOpen
        onOpenChange={(aperto) => (aperto ? null : setDaCancellare(false))}
        title="Cancellare questa bozza?"
        description="Sparisce del tutto, e non è la stessa cosa di «Rifiuta»: quella resta in archivio come decisione presa. Cancellare serve alle bozze che non dovevano esistere. Non si torna indietro."
        actionLabel="Cancella"
        cancelLabel="Lascia stare"
        onAction={cancella}
      />
    ) : null}

    <ModaleNuovoPost
      aperto={apertoModaleNuovo}
      giornoPreselezionato={searchParams?.get('giorno') ?? null}
      onChiudi={() => setApertoModaleNuovo(false)}
      onCreato={() => router.refresh()}
    />
    </>
  );
}
