'use client';

/**
 * La scheda di un cliente: dove si fa tutto quello che lo riguarda.
 *
 * Prima questa pagina non c'era e "aggiungere un cliente" voleva dire aprire il
 * database. Non è un dettaglio di comodità: una cosa che si fa in SQL la fa una
 * persona sola, e quando quella persona non c'è il lavoro si ferma.
 *
 * L'ORDINE DELLE SEZIONI È LA SEQUENZA DEL LAVORO, non un menù:
 *
 *   1. CHI È      settore e stato — decidono quali temi sono pertinenti
 *   2. COME PARLA la voce e i confini, che valgono su ogni testo
 *   3. COSA È VERO i fatti: senza questi il generatore non ha di che parlare
 *   4. COSA GLI FACCIAMO i servizi, con le loro chiavi
 *   5. IL MESE    costruisci il piano, poi scrivi i testi
 *
 * Chi arriva in fondo ha un cliente che lavora. Chi si ferma a metà lo vede
 * scritto: ogni sezione dice cosa manca per passare alla successiva.
 */
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Selector } from '@astryxdesign/core/Selector';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { Divider } from '@astryxdesign/core/Divider';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Link } from '@astryxdesign/core/Link';
import { ETICHETTA_DESTINAZIONE } from '@/lib/bozze';
import { quandoBreve } from '@/lib/quando';
import { AZIONI_BOTTONE, VUOLE_URL } from '@/lib/gbp';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Pencil } from 'lucide-react';
import { ModuloAzienda, type AziendaModulo } from './ModuloAzienda';
import type { Scheda } from '@/lib/scheda';

const SETTORI: Array<{ id: string; nome: string }> = [
  { id: 'ristorazione', nome: 'Ristorazione' },
  { id: 'artigianato', nome: 'Artigianato' },
  { id: 'casa', nome: 'Casa e ambienti' },
  { id: 'servizi', nome: 'Servizi' },
  { id: 'locale', nome: 'Attività locale' },
];

/** Le chiavi dei fatti, con la domanda a cui rispondono. */
const CHIAVI: Array<{ id: string; nome: string; aiuto: string }> = [
  { id: 'cosa_fa', nome: 'Cosa fa', aiuto: "L'attività in concreto: «trattoria con cucina pavese». Una riga sola." },
  { id: 'offerta', nome: 'Offerta', aiuto: 'Prodotti o servizi principali, uno per riga.' },
  { id: 'materiali', nome: 'Materiali', aiuto: 'Ingredienti, materiali, metodi — solo cose verificate col cliente.' },
  { id: 'punti_forza', nome: 'Punti di forza', aiuto: 'Cosa lo distingue davvero, senza superlativi.' },
];

/**
 * Il tipo che vuole `DateInput`: una data ISO, controllata dal compilatore
 * carattere per carattere. Le nostre date girano come `string`, quindi il
 * confine fra i due mondi sta qui, in un posto solo, invece che sparso.
 */
type DataISO = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

/** L'a capo, come costante: dentro un join scritto a mano si rompe. */
const SEP = String.fromCharCode(10);

/** Da testo a righe e viceversa: nel form le liste sono textarea. */
const aRighe = (v: string[]): string => v.join('\n');
const daRighe = (v: string): string[] => v.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);

export function SchedaCliente({ scheda: iniziale }: { scheda: Scheda }) {
  const router = useRouter();
  const parametri = useSearchParams();
  const [s, setS] = useState<Scheda>(iniziale);
  const [messaggio, setMessaggio] = useState<{ tipo: 'success' | 'error' | 'info'; testo: string } | null>(null);
  /**
   * L'anagrafica (indirizzo, contatti, repo del sito, Search Console) non
   * aveva NESSUN modo di arrivarci da qui — solo tornando all'elenco Aziende
   * e passando dal "Modifica" lì. Per chi è già cliente è un giro assurdo:
   * si riusa lo stesso `ModuloAzienda` di quella lista, stesse API.
   */
  const [moduloAnagrafica, setModuloAnagrafica] = useState<AziendaModulo | null>(null);

  // L'audit SEO/GEO — vedi /api/aziende/[id]/seo-audit. Stato locale a parte
  // da `messaggio`: dura di più (clona un repo), e il risultato (link alla
  // PR) resta in vista invece di sparire come un banner di conferma.
  const [seoInCorso, setSeoInCorso] = useState(false);
  const [esitoSeo, setEsitoSeo] = useState<{
    pr_url: string | null;
    riepilogo: string;
    scartati: string[];
  } | null>(null);

  /**
   * La proposta letta da GitHub, per mostrarla QUI.
   *
   * ⚠️ Senza questo la feature era a metà: l'audit apriva una PR e in pagina
   * compariva un link, cioè il lavoro di capire il diff scaricato addosso a
   * chi sta in dashboard. Le bozze dei post si approvano guardandole qui, non
   * su Google: per il codice di un sito vale la stessa regola.
   */
  const [pr, setPr] = useState<{
    numero: number;
    url: string;
    stato: 'aperta' | 'applicata' | 'chiusa';
    file: Array<{ percorso: string; aggiunte: number; tolte: number; patch: string | null }>;
  } | null>(null);
  const [prInCorso, setPrInCorso] = useState(false);
  const [confermaApplica, setConfermaApplica] = useState(false);

  /**
   * L'ultimo click sulle bozze, dentro la scheda.
   *
   * ⚠️ APPROVATA NON VUOL DIRE PUBBLICATA, e va detto dove si preme. Questa
   * rotta scrive `stato='approvata'` e basta: pubblica il router, dall'altra
   * parte, al suo giro (30 secondi). La dashboard non ha nessuna porta verso
   * di lui — vedi la nota in cima a `/api/bozze/[id]`.
   */
  const [bozzaInCorso, setBozzaInCorso] = useState<number | null>(null);

  async function decidiBozza(idBozza: number, azione: 'approva' | 'rifiuta') {
    setMessaggio(null);
    setBozzaInCorso(idBozza);
    try {
      const r = await fetch(`/api/bozze/${idBozza}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ azione }),
      });
      const e = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMessaggio({ tipo: 'error', testo: e?.errore ?? 'Non è andata.' });
        return;
      }
      // Via dall'elenco: ha smesso di essere una cosa da decidere.
      setS((v) => ({ ...v, daApprovare: v.daApprovare.filter((b) => b.id !== idBozza) }));
      setMessaggio({
        tipo: 'success',
        testo:
          azione === 'approva'
            ? 'Approvata. Non è ancora pubblicata: la prende il router al prossimo giro, entro un minuto.'
            : 'Rifiutata: non uscirà.',
      });
      router.refresh();
    } finally {
      setBozzaInCorso(null);
    }
  }

  async function guardaProposta() {
    setMessaggio(null);
    setPrInCorso(true);
    try {
      const r = await fetch(`/api/aziende/${s.id}/seo-pr`);
      const e = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMessaggio({ tipo: 'error', testo: e?.errore ?? 'Non sono riuscito a leggere la proposta.' });
        return;
      }
      setPr(e.pr ?? null);
    } finally {
      setPrInCorso(false);
    }
  }

  async function applicaProposta() {
    setConfermaApplica(false);
    setMessaggio(null);
    setPrInCorso(true);
    try {
      const r = await fetch(`/api/aziende/${s.id}/seo-pr`, { method: 'POST' });
      const e = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMessaggio({ tipo: 'error', testo: e?.errore ?? 'Non è andata.' });
        return;
      }
      setMessaggio({
        tipo: 'success',
        testo: 'Applicata al sito. Cloudflare ricostruisce da solo: fra qualche minuto è online.',
      });
      setPr((v) => (v ? { ...v, stato: 'applicata' } : v));
    } finally {
      setPrInCorso(false);
    }
  }

  async function analizzaSeo() {
    setMessaggio(null);
    setSeoInCorso(true);
    setEsitoSeo(null);
    try {
      const r = await fetch(`/api/aziende/${s.id}/seo-audit`, { method: 'POST' });
      const e = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMessaggio({ tipo: 'error', testo: e?.errore ?? 'Non è andata.' });
        // Anche l'errore nuovo va messo al posto del vecchio, o resta in
        // vista quello del giro prima — vedi il commento qui sotto.
        setS((v) => ({ ...v, sito_ultimo_errore: e?.errore ?? 'Non è andata.' }));
        return;
      }
      setEsitoSeo({ pr_url: e.pr_url ?? null, riepilogo: e.riepilogo ?? '', scartati: e.scartati ?? [] });
      // Appena c'è una proposta la si mostra: chiederlo con un secondo click
      // vorrebbe dire far uscire di nuovo l'operatore dal lavoro che stava
      // facendo.
      if (e.pr_url) void guardaProposta();
      /**
       * ⚠️ `router.refresh()` da solo NON basta, e si vede (02/09/2026): dopo
       * un giro riuscito restava in pagina il banner rosso del giro fallito
       * prima. Il refresh rigenera il componente server, ma `s` vive in uno
       * `useState` inizializzato UNA volta sola — i dati nuovi non lo toccano.
       * Quindi l'esito lo si scrive anche qui, a mano.
       */
      setS((v) => ({
        ...v,
        sito_ultimo_errore: null,
        sito_ultima_pr_url: e.pr_url ?? v.sito_ultima_pr_url,
        sito_ultimo_audit_at: new Date().toISOString(),
      }));
      router.refresh();
    } finally {
      setSeoInCorso(false);
    }
  }

  async function apriAnagrafica() {
    const r = await fetch(`/api/aziende/${s.id}`);
    if (!r.ok) {
      setMessaggio({ tipo: 'error', testo: 'Non sono riuscito a leggere l’anagrafica.' });
      return;
    }
    const a = await r.json();
    setModuloAnagrafica({
      id: a.id,
      nome: a.nome ?? '',
      categoria: a.categoria ?? '',
      citta: a.citta ?? '',
      provincia: a.provincia ?? '',
      indirizzo: a.indirizzo ?? '',
      cap: a.cap ?? '',
      maps_url: a.maps_url ?? '',
      place_id: a.place_id ?? '',
      stato: a.stato ?? 'prospect',
      note: a.note ?? '',
      contatti: (a.contatti ?? []).map((c: { tipo: string; valore: string; e_titolare: boolean }) => ({
        tipo: c.tipo,
        valore: c.valore,
        e_titolare: c.e_titolare,
      })),
      sito_repo_url: a.sito_repo_url ?? '',
      sito_gsc_proprieta: a.sito_gsc_proprieta ?? '',
    });
  }
  /**
   * Cinque sezioni in colonna erano due schermate e mezzo di scorrimento, e si
   * lavora su una per volta: si da' una voce OPPURE si accende un servizio
   * OPPURE si costruisce il mese. Le linguette non nascondono niente — tolgono
   * di mezzo quello che adesso non stai facendo.
   *
   * ⚠️ `?tab=` decide quella iniziale (01/09/2026): le spie di `/spie` portano
   * qui con la linguetta giusta gia' aperta — "id Google malformati" arriva su
   * `servizi`, non su "Chi è" a fartela ricercare. Letto una volta sola al
   * montaggio: dopo, chi clicca un'altra linguetta a mano decide lui.
   */
  const [sezione, setSezione] = useState(parametri.get('tab') || 'chi');

  /**
   * ⚠️ QUESTA PAGINA SERVE A DUE PERSONE DIVERSE (31/08/2026).
   *
   * E' nata come banco di lavoro di un CLIENTE: voce, fatti, servizi, piano del
   * mese. Ma ci si arriva anche da una riga qualsiasi dell'elenco, cioe' da un
   * lead che nessuno ha ancora chiamato — e li' dentro non c'e' niente che lo
   * riguardi. Aprendo un dentista di Abbiategrasso mai contattato usciva un
   * avviso giallo con cinque cose «mancanti»: nessun settore, nessun fatto,
   * nessun titolare, nessun servizio. Tutte cose che a un prospect NON devono
   * esserci. E' come aprire la scheda di un candidato e leggere «manca il
   * badge, manca la scrivania».
   *
   * Quindi: a un lead si mostra quello che serve per TELEFONARGLI (il numero e
   * il gancio), e il resto resta li' ma non urla. La lavorazione da cliente si
   * apre quando lo diventa.
   */
  const eCliente = s.stato === 'cliente';

  /**
   * Il modulo per UN pezzo solo: null = chiuso.
   *
   * ⚠️ Fino al 31/08/2026 l'unico modo di avere un post era generare il MESE:
   * diciassette bozze in un colpo. Ma il lavoro capita anche al contrario — il
   * cliente chiama, domenica fa una serata, e ne serve uno per quel giorno. Chi
   * doveva farlo generava il mese e buttava sedici bozze, oppure apriva il
   * database.
   */
  const [pezzo, setPezzo] = useState<{ tipo: 'post_gbp' | 'articolo'; fattoId: string; quando: string; angolo: string } | null>(null);

  /** Crea la bozza e la fa scrivere subito: sono due chiamate, un gesto solo. */
  async function creaPezzo() {
    if (!pezzo) return;
    setMessaggio({ tipo: 'info', testo: 'Preparo la bozza…' });

    const creata = await fetch(`/api/aziende/${s.id}/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: pezzo.tipo,
        fattoId: pezzo.fattoId ? Number(pezzo.fattoId) : undefined,
        quando: pezzo.quando || undefined,
        angolo: pezzo.angolo || undefined,
      }),
    });
    const esito = await creata.json().catch(() => ({}));
    if (!creata.ok) {
      setMessaggio({ tipo: 'error', testo: esito.errore ?? 'Non è andata.' });
      return;
    }

    setMessaggio({ tipo: 'info', testo: 'Lo faccio scrivere…' });
    const scritta = await fetch(`/api/bozze/${esito.bozzaId}/scrivi`, { method: 'POST' });
    if (!scritta.ok) {
      setMessaggio({
        tipo: 'error',
        testo: 'La bozza è stata creata ma il testo non è uscito: la trovi vuota in Bozze, si riprova da lì.',
      });
      setPezzo(null);
      return;
    }

    setPezzo(null);
    // Si va DOVE si decide: il pezzo adesso aspetta un sì, e quello è in Bozze.
    router.push('/bozze');
  }
  const [salvato, setSalvato] = useState(true);
  /** Le schede lette da Google, quando qualcuno le chiede. */
  const [schede, setSchede] = useState<Array<{ accountId: string; locationId: string; titolo: string }> | null>(null);
  /** Il materiale incollato a mano: didascalie, appunti, la telefonata. */
  const [incollato, setIncollato] = useState('');
  /** Cosa ha capito l'analisi. NON e' ancora salvato: si guarda e si accetta. */
  const [proposta, setProposta] = useState<{
    voce: Record<string, unknown>;
    fatti: { cosa_fa: string; offerta: string[]; materiali: string[]; punti_forza: string[] };
    settore: string[];
    fonti: string[];
    avvisi: string[];
  } | null>(null);

  /** I fatti nel form sono testo per chiave, una voce per riga. */
  const [fatti, setFatti] = useState<Record<string, string>>(() => {
    const per: Record<string, string> = {};
    for (const c of CHIAVI) {
      per[c.id] = aRighe(s.fatti.filter((f) => f.chiave === c.id).map((f) => f.valore));
    }
    return per;
  });

  const config = (tipo: string): Record<string, string> =>
    s.servizi.find((x) => x.tipo === tipo)?.config ?? {};
  const attivo = (tipo: string): boolean => s.servizi.find((x) => x.tipo === tipo)?.attivo ?? false;

  function cambiaServizio(tipo: string, campi: Record<string, string>, acceso?: boolean) {
    setSalvato(false);
    setS((v) => {
      const altri = v.servizi.filter((x) => x.tipo !== tipo);
      const mio = v.servizi.find((x) => x.tipo === tipo);
      return {
        ...v,
        servizi: [
          ...altri,
          { tipo, attivo: acceso ?? mio?.attivo ?? true, config: { ...(mio?.config ?? {}), ...campi } },
        ],
      };
    });
  }

  /**
   * ⚠️ GLI ID SI LEGGONO DA GOOGLE, NON SI DIGITANO.
   *
   * Il playbook lo dice con parole precise: "si correggono solo rileggendoli da
   * Importa da Google: non si deducono e non si scrivono a mano". E' la regola
   * nata dal guasto del 21/07/2026 — id sbagliati che facevano rispondere 404 a
   * Google per settimane, su clienti a caso.
   *
   * La prima versione di questa pagina li faceva scrivere a mano, cioe' era
   * l'unica cosa capace di produrre esattamente quel guasto, mentre di fianco
   * girava una spia costruita per accorgersene. Questo bottone e' la riparazione.
   */
  async function leggiDaGoogle() {
    setMessaggio({ tipo: 'info', testo: 'Chiedo a Google le schede dell’agenzia…' });
    const risposta = await fetch('/api/google/schede');
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      setMessaggio({ tipo: 'error', testo: esito?.errore ?? 'Google non risponde.' });
      return;
    }
    setSchede(esito.schede ?? []);
    setMessaggio({
      tipo: 'success',
      testo: `${(esito.schede ?? []).length} schede lette. Scegli quella di ${s.nome}.`,
    });
  }

  /**
   * ⚠️ ANALIZZA E BASTA: NON SALVA.
   *
   * Un modello legge le recensioni, la descrizione della scheda e il sito, e ne
   * trae conclusioni. Alcune saranno giuste, altre no, e chi conosce il cliente
   * e' dall'altra parte dello schermo. Quella roba poi finisce in OGNI post che
   * scriveremo per lui, per mesi: salvarla direttamente vorrebbe dire mettere in
   * tabella l'idea che un modello si e' fatto leggendo un sito.
   *
   * Si guarda, si accetta cio' che torna, e si salva come qualsiasi altra
   * modifica. L'ultimo bottone non e' del modello.
   */
  async function analizzaLaVoce() {
    setProposta(null);
    setMessaggio({ tipo: 'info', testo: 'Leggo recensioni, scheda Google e sito…' });
    const risposta = await fetch(`/api/aziende/${s.id}/analizza-voce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incollato }),
    });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      setMessaggio({ tipo: 'error', testo: esito?.errore ?? 'Non è andata.' });
      return;
    }
    setProposta(esito);
    setMessaggio({
      tipo: esito.fonti?.length ? 'success' : 'error',
      testo: esito.fonti?.length
        ? `Letto da: ${esito.fonti.join(', ')}. Guarda cosa ha capito e tieni solo quello che torna.`
        : 'Non c’è stato niente da leggere.',
    });
  }

  /** Porta la proposta nei campi. Da lì si corregge e si salva come sempre. */
  function accetta() {
    if (!proposta) return;
    const v = proposta.voce as Record<string, unknown>;
    const testo = (x: unknown) => (typeof x === 'string' ? x : '');
    const lista = (x: unknown) => (Array.isArray(x) ? x.map(String) : []);

    setSalvato(false);
    setS((x) => ({
      ...x,
      voce: {
        ...x.voce,
        // Solo dove c'era il vuoto: quello che una persona ha gia' scritto
        // vale piu' di quello che ha dedotto un modello, e sovrascriverlo
        // senza chiedere e' il modo migliore per far perdere mezz'ora.
        origine: x.voce.origine || testo(v.origine),
        come_ragiona: x.voce.come_ragiona || testo(v.come_ragiona),
        voce: x.voce.voce || testo(v.voce),
        parole_sue: x.voce.parole_sue.length ? x.voce.parole_sue : lista(v.parole_sue),
        apprezzato: x.voce.apprezzato.length ? x.voce.apprezzato : lista(v.apprezzato),
      },
    }));

    setFatti((f) => ({
      ...f,
      cosa_fa: f.cosa_fa || proposta.fatti.cosa_fa,
      offerta: f.offerta || proposta.fatti.offerta.join(SEP),
      materiali: f.materiali || proposta.fatti.materiali.join(SEP),
      punti_forza: f.punti_forza || (proposta.fatti.punti_forza ?? []).join(SEP),
    }));

    // Il settore è l'unica cosa qui che non è testo ma una scelta fra cinque:
    // si applica solo se nessuno l'ha ancora fatta, come tutto il resto.
    if (!s.settore.length && proposta.settore?.length) {
      setS((x) => ({ ...x, settore: proposta.settore as typeof x.settore }));
    }

    setProposta(null);
    setMessaggio({ tipo: 'success', testo: 'Portato nei campi. Correggi quello che non torna, poi salva.' });
  }

  /**
   * Prova le credenziali WordPress su quello che c'è NEI CAMPI, non su quello
   * che è salvato: si scopre che la password è sbagliata mentre la si incolla,
   * non il giorno che un articolo non esce.
   */
  async function provaWordPress() {
    const c = config('blog');
    setMessaggio(null);
    const risposta = await fetch(`/api/aziende/${s.id}/prova-wordpress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wp_base: c.wp_base ?? '',
        wp_utente: c.wp_utente ?? '',
        wp_password_app: c.wp_password_app ?? '',
      }),
    });
    const esito = await risposta.json().catch(() => ({}));

    if (!esito.ok) {
      setMessaggio({ tipo: 'error', testo: esito.errore ?? 'WordPress non ha risposto.' });
      return;
    }
    setMessaggio(
      esito.puoPubblicare
        ? { tipo: 'success', testo: `Funziona: risulti «${esito.utente}», e può pubblicare articoli.` }
        : {
            tipo: 'error',
            testo: `Le credenziali valgono (sei «${esito.utente}»), ma quell’utente non ha il permesso di pubblicare articoli. Serve almeno il ruolo Autore.`,
          }
    );
  }

  async function salva() {
    setMessaggio(null);
    const risposta = await fetch(`/api/aziende/${s.id}/scheda`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settore: s.settore,
        stato: s.stato,
        voce: s.voce,
        fatti: CHIAVI.flatMap((c) => daRighe(fatti[c.id] ?? '').map((valore) => ({ chiave: c.id, valore }))),
        servizi: s.servizi,
      }),
    });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      setMessaggio({ tipo: 'error', testo: esito?.errore ?? 'Non è andata, e non si sa perché.' });
      return;
    }
    setS(esito);
    setSalvato(true);
    setMessaggio({ tipo: 'success', testo: 'Scheda salvata.' });
    router.refresh();
  }

  async function chiama(url: string, quando: string) {
    setMessaggio({ tipo: 'info', testo: `${quando}…` });
    const risposta = await fetch(url, { method: 'POST' });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      setMessaggio({ tipo: 'error', testo: esito?.errore ?? 'Non è andata.' });
      return;
    }
    if (esito.creati !== undefined) {
      setMessaggio({ tipo: 'success', testo: `Piano costruito: ${esito.creati} slot. Vai in Bozze per guardarlo.` });
    } else if (esito.scritte !== undefined) {
      setMessaggio({
        tipo: 'success',
        testo:
          `Scritti ${esito.scritte} testi` +
          (esito.conAvvisiGravi ? `, di cui ${esito.conAvvisiGravi} da controllare.` : '.') +
          ` Modelli: ${(esito.modelli ?? []).join(', ')}`,
      });
    } else {
      setMessaggio({ tipo: 'success', testo: 'Fatto.' });
    }
    router.refresh();
  }

  // Cosa manca per far lavorare questo cliente, detto dove serve.
  const quantiFatti = CHIAVI.reduce((n, c) => n + daRighe(fatti[c.id] ?? '').length, 0);
  const mancanze = [
    s.stato !== 'cliente' ? "lo stato non è «cliente»: le spie dei silenzi lo ignorano" : null,
    s.settore.length === 0 ? 'nessun settore: i temi saranno solo quelli generici' : null,
    quantiFatti < 4 ? `solo ${quantiFatti} fatti: servono almeno 4 per non ripetersi` : null,
    s.titolari.length === 0 ? 'nessun titolare abilitato: il router non accetterà comandi' : null,
    !s.servizi.some((x) => x.attivo) ? 'nessun servizio attivo: non c’è niente da pubblicare' : null,
  ].filter(Boolean) as string[];

  return (
    <>
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <VStack gap={3}>
            <HStack gap={3} align="center" wrap="wrap">
              <Heading level={2}>{s.nome}</Heading>
              <StatusDot variant={s.stato === 'cliente' ? 'success' : 'neutral'} label={s.stato} />
              <Text color="secondary">{s.citta ?? ''}</Text>
              <Button
                label="Modifica anagrafica"
                icon={<Pencil size={16} />}
                variant="ghost"
                size="sm"
                clickAction={apriAnagrafica}
              />
              {!salvato ? <Badge variant="warning" label="non salvata" /> : null}
              {/* Il salvataggio sta QUI e non solo in fondo alla pagina: con le
                  linguette il bottone in coda si vede solo dentro «Il mese», e
                  chi corregge un fatto e cambia linguetta perderebbe tutto
                  senza mai incontrarlo. */}
              {!salvato ? (
                <Button label="Salva" variant="primary" size="sm" clickAction={salva} />
              ) : null}
            </HStack>
            <TabList value={sezione} onChange={setSezione}>
              <Tab value="chi" label="Chi è" />
              <Tab value="voce" label="Come parla" />
              <Tab
                value="fatti"
                label="Cosa è vero"
                endContent={
                  s.fatti.length ? (
                    <Badge variant={s.fatti.length >= 4 ? 'neutral' : 'warning'} label={String(s.fatti.length)} />
                  ) : (
                    <Badge variant="warning" label="0" />
                  )
                }
              />
              {/* Servizi e piano del mese su un lead non contattato sono due
                  schermate vuote con dentro delle regole che non lo riguardano:
                  compaiono quando diventa cliente. */}
              {eCliente ? <Tab value="servizi" label="Servizi" /> : null}
              {eCliente ? <Tab value="mese" label="Il mese" /> : null}
              {/* L'ultimo click: c'è solo quando c'è davvero qualcosa da
                  decidere, e dice quanto. Una linguetta che si apre vuota
                  insegna a non cliccarla. */}
              {s.daApprovare.length > 0 ? (
                <Tab
                  value="approvare"
                  label="Da approvare"
                  endContent={<Badge variant="warning" label={String(s.daApprovare.length)} />}
                />
              ) : null}
              {/* Lo storico compare solo quando c'e' qualcosa dentro: una
                  linguetta che si apre sempre vuota insegna a non cliccarla. */}
              {s.storico.length > 0 ? (
                <Tab
                  value="storico"
                  label="Cosa è uscito"
                  endContent={<Badge variant="neutral" label={String(s.storico.length)} />}
                />
              ) : null}
            </TabList>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={4}>
          <VStack gap={6}>
            {messaggio ? (
              <Banner
                status={messaggio.tipo}
                title={messaggio.testo}
                isDismissable
                onDismiss={() => setMessaggio(null)}
              />
            ) : null}

            {/* ── IL LEAD: quello che serve per chiamarlo ──────────────────
                Un prospect non ha una voce, dei fatti o un piano: ha un numero
                e un motivo per chiamarlo. Quelli stanno qui, in cima, e il
                resto della pagina aspetta che diventi cliente. */}
            {!eCliente ? (
              <VStack gap={3}>
                <HStack gap={2} align="center" wrap="wrap">
                  <Button
                    label="Chiama"
                    variant="primary"
                    isDisabled={!s.telefono}
                    tooltip={s.telefono ?? 'Non ha un numero: fallo trovare con «Analizza il sito».'}
                    onClick={() => {
                      window.location.href = `tel:${(s.telefono ?? '').replace(/[^\d+]/g, '')}`;
                    }}
                  />
                  <Button
                    label="WhatsApp"
                    isDisabled={!s.telefono_normalizzato}
                    onClick={() => window.open(`https://wa.me/${s.telefono_normalizzato}`, '_blank')}
                  />
                  {s.telefono ? <Text color="secondary">{s.telefono}</Text> : null}
                  {s.score !== null ? (
                    <Badge
                      variant={s.score >= 80 ? 'warning' : s.score >= 50 ? 'info' : 'success'}
                      label={`urgenza ${s.score}/100`}
                    />
                  ) : null}
                </HStack>

                {s.audit_hook ? (
                  <TextArea
                    label="Come aprire il discorso"
                    rows={4}
                    value={s.audit_hook}
                    isDisabled
                    disabledMessage="Si riscrive rianalizzando il sito, dall’elenco."
                  />
                ) : (
                  <Text color="secondary">
                    Nessun audit ancora: dall’elenco, «Analizza il sito».
                  </Text>
                )}

                {/* Il bottone che cambia tutto: da qui in poi la pagina diventa
                    quella del cliente, con voce, fatti, servizi e piano. */}
                <HStack gap={2} align="center">
                  <Button
                    label="È diventato cliente"
                    variant="secondary"
                    clickAction={async () => {
                      setS((x) => ({ ...x, stato: 'cliente' }));
                      setSalvato(false);
                      setSezione('chi');
                    }}
                  />
                  <Text type="supporting">Da lì si apre la lavorazione: voce, fatti, servizi, piano.</Text>
                </HStack>
              </VStack>
            ) : null}

            {eCliente && mancanze.length > 0 ? (
              <Banner
                status="warning"
                title="Questo cliente non è ancora pronto"
                description="Finché manca qualcosa, il piano esce povero."
                defaultIsExpanded
              >
                <List hasDividers density="compact">
                  {mancanze.map((m, i) => (
                    <ListItem key={i} label={m} />
                  ))}
                </List>
              </Banner>
            ) : (
              <Banner status="success" title="Pronto: si può costruire il piano del mese." />
            )}

            {/* ── 1. Chi è ─────────────────────────────────────────────────
                Il PERCHE' del settore — sceglie temi e ricorrenze, e dedurlo
                dalla categoria di Google vuol dire sbagliare tutto il mese —
                sta qui, non sullo schermo di chi deve solo scegliere un tag. */}
            {sezione === 'chi' ? (
            <VStack gap={3}>
              <HStack gap={2} wrap="wrap">
                {SETTORI.map((t) => (
                  <Button
                    key={t.id}
                    label={t.nome}
                    size="sm"
                    variant={s.settore.includes(t.id as never) ? 'primary' : 'secondary'}
                    onClick={() => {
                      setSalvato(false);
                      setS((v) => ({
                        ...v,
                        settore: v.settore.includes(t.id as never)
                          ? (v.settore.filter((x) => x !== t.id) as never)
                          : ([...v.settore, t.id] as never),
                      }));
                    }}
                  />
                ))}
              </HStack>
              <HStack gap={2} align="center">
                <Text type="supporting">Stato commerciale:</Text>
                {['prospect', 'contattato', 'in_trattativa', 'cliente'].map((st) => (
                  <Button
                    key={st}
                    label={st}
                    size="sm"
                    variant={s.stato === st ? 'primary' : 'ghost'}
                    onClick={() => {
                      setSalvato(false);
                      setS((v) => ({ ...v, stato: st }));
                    }}
                  />
                ))}
              </HStack>

              <Divider />

              {/* L'audit SEO/GEO/AEO automatico: clona il repo, legge Search
                  Console, apre una PR — vedi /api/aziende/[id]/seo-audit. Sta
                  in "Chi è" e non in una linguetta propria: non è ancora un
                  mestiere abbastanza carico da meritarne una tutta sua. */}
              <VStack gap={2}>
                <Text type="supporting">Audit SEO/GEO/AEO</Text>
                {s.sito_repo_url ? (
                  <VStack gap={2}>
                    <MetadataList>
                      <MetadataListItem label="Repository">{s.sito_repo_url}</MetadataListItem>
                      {s.sito_gsc_proprieta ? (
                        <MetadataListItem label="Search Console">{s.sito_gsc_proprieta}</MetadataListItem>
                      ) : null}
                      {s.sito_ultimo_audit_at ? (
                        <MetadataListItem label="Ultimo giro">{quandoBreve(s.sito_ultimo_audit_at)}</MetadataListItem>
                      ) : null}
                      {s.sito_ultima_pr_url ? (
                        <MetadataListItem label="Ultima PR aperta">
                          <Link href={s.sito_ultima_pr_url} isExternalLink isStandalone>
                            {s.sito_ultima_pr_url}
                          </Link>
                        </MetadataListItem>
                      ) : null}
                    </MetadataList>

                    {s.sito_ultimo_errore ? (
                      <Banner status="error" title="L’ultimo giro non è riuscito" description={s.sito_ultimo_errore} />
                    ) : null}

                    <HStack gap={2} align="center" wrap="wrap">
                      <Button label="Analizza SEO" size="sm" isLoading={seoInCorso} clickAction={analizzaSeo} />
                      {s.sito_ultima_pr_url ? (
                        <Button
                          label="Guarda la proposta"
                          size="sm"
                          variant="secondary"
                          isLoading={prInCorso}
                          clickAction={guardaProposta}
                        />
                      ) : null}
                    </HStack>

                    {/* ── La proposta, leggibile qui ────────────────────────
                        Il diff sta in pagina e non dietro un link: chi decide
                        deve poter vedere cosa cambia senza aprire GitHub,
                        capire un unified diff e tornare indietro. */}
                    {pr ? (
                      <VStack gap={2}>
                        <HStack gap={2} align="center" wrap="wrap">
                          <Text type="supporting">
                            Proposta #{pr.numero} · {pr.file.length} file
                          </Text>
                          <Badge
                            variant={pr.stato === 'applicata' ? 'success' : pr.stato === 'aperta' ? 'info' : 'neutral'}
                            label={
                              pr.stato === 'applicata'
                                ? 'applicata al sito'
                                : pr.stato === 'aperta'
                                  ? 'da decidere'
                                  : 'chiusa senza applicare'
                            }
                          />
                          <Link href={pr.url} isExternalLink>
                            vedila su GitHub
                          </Link>
                        </HStack>

                        {pr.file.map((f) => (
                          <VStack key={f.percorso} gap={1}>
                            <HStack gap={2} align="center" wrap="wrap">
                              <Text type="supporting">{f.percorso}</Text>
                              <Text type="supporting" style={{ color: 'var(--color-success)' }}>
                                +{f.aggiunte}
                              </Text>
                              <Text type="supporting" style={{ color: 'var(--color-error)' }}>
                                −{f.tolte}
                              </Text>
                            </HStack>
                            {f.patch ? (
                              // Il diff è testo a colonne: va letto in monospazio
                              // e può essere largo, quindi scorre per conto suo
                              // invece di allargare la pagina.
                              <VStack
                                gap={0}
                                padding={2}
                                style={{
                                  backgroundColor: 'var(--color-background-surface)',
                                  borderRadius: 'var(--radius-md)',
                                  overflowX: 'auto',
                                  maxHeight: '320px',
                                  overflowY: 'auto',
                                }}
                              >
                                {f.patch.split('\n').map((riga, i) => (
                                  <Text
                                    key={i}
                                    type="supporting"
                                    size="xsm"
                                    style={{
                                      fontFamily: 'var(--font-family-mono, monospace)',
                                      whiteSpace: 'pre',
                                      color: riga.startsWith('+')
                                        ? 'var(--color-success)'
                                        : riga.startsWith('-')
                                          ? 'var(--color-error)'
                                          : undefined,
                                    }}
                                  >
                                    {riga || ' '}
                                  </Text>
                                ))}
                              </VStack>
                            ) : null}
                          </VStack>
                        ))}

                        {/* ⚠️ L'ULTIMO BOTTONE. Da qui il sito del cliente
                            cambia davvero: Cloudflare ricostruisce da solo al
                            merge. Per questo chiede conferma e per questo non
                            lo preme nessun giro automatico. */}
                        {pr.stato === 'aperta' ? (
                          <HStack gap={2} align="center" wrap="wrap">
                            <Button
                              label="Applica al sito"
                              variant="primary"
                              size="sm"
                              isLoading={prInCorso}
                              onClick={() => setConfermaApplica(true)}
                            />
                            <Text type="supporting" color="secondary">
                              Il sito si ricostruisce da solo: online fra qualche minuto.
                            </Text>
                          </HStack>
                        ) : null}
                      </VStack>
                    ) : null}

                    {esitoSeo ? (
                      <Banner
                        status={esitoSeo.pr_url ? 'success' : 'info'}
                        title={
                          esitoSeo.pr_url
                            ? `PR aperta${esitoSeo.scartati.length ? ` · ${esitoSeo.scartati.length} proposte scartate` : ''}`
                            : 'Nessuna modifica applicata'
                        }
                        description={esitoSeo.riepilogo}
                        defaultIsExpanded
                      >
                        <VStack gap={2}>
                          {esitoSeo.pr_url ? (
                            <Link href={esitoSeo.pr_url} isExternalLink isStandalone>
                              {esitoSeo.pr_url}
                            </Link>
                          ) : null}
                          {/* Quello che il modello ha proposto e che NON è
                              passato: taciuto, si presenterebbe come una
                              proposta più povera invece che come una difesa
                              che ha funzionato. */}
                          {esitoSeo.scartati.length ? (
                            <List hasDividers density="compact">
                              {esitoSeo.scartati.map((x, i) => (
                                <ListItem key={i} label={x} />
                              ))}
                            </List>
                          ) : null}
                        </VStack>
                      </Banner>
                    ) : null}
                  </VStack>
                ) : (
                  <Text type="supporting" color="secondary">
                    Manca il repository del sito — aggiungilo da «Modifica anagrafica» per abilitare l’audit.
                  </Text>
                )}
              </VStack>
            </VStack>
            ) : null}

            {/* ── 2. Come parla ────────────────────────────────────────────
                Senza voce i testi escono corretti e intercambiabili: il
                generatore ricade sul registro da agenzia. */}
            {sezione === 'voce' ? (
            <VStack gap={3}>
              {/* ── Ricavare la voce da quello che c'e' gia' ────────────────
                  Le fonti stanno in ordine di quanto ci si puo' fidare: le
                  recensioni per prime, perche' sono l'unica cosa che non ha
                  scritto il cliente. */}
              <VStack gap={2}>
                <HStack gap={2} align="center" wrap="wrap">
                  <Button label="Ricava la voce da quello che c’è" size="sm" clickAction={analizzaLaVoce} />
                  <Text type="supporting">
                    Legge recensioni, descrizione della scheda Google e sito. Non salva niente: propone.
                  </Text>
                </HStack>
                <TextArea
                  label="Materiale suo, se ne hai"
                  description="Didascalie, appunti di una telefonata, un suo messaggio."
                  rows={3}
                  value={incollato}
                  onChange={setIncollato}
                />
              </VStack>

              {proposta ? (
                <Banner
                  status="info"
                  title="Cosa ha capito"
                  description={
                    proposta.avvisi.length
                      ? proposta.avvisi.join(' · ')
                      : 'Guarda se ti torna. Riempie solo i campi ancora vuoti.'
                  }
                  defaultIsExpanded
                >
                  <VStack gap={3}>
                    <MetadataList>
                      <MetadataListItem label="Da dove viene">
                        {String(proposta.voce.origine || '—')}
                      </MetadataListItem>
                      <MetadataListItem label="Come ragiona">
                        {String(proposta.voce.come_ragiona || '—')}
                      </MetadataListItem>
                      <MetadataListItem label="Come parla">{String(proposta.voce.voce || '—')}</MetadataListItem>
                      <MetadataListItem label="Parole sue">
                        {(proposta.voce.parole_sue as string[] | undefined)?.join(' · ') || '—'}
                      </MetadataListItem>
                      <MetadataListItem label="Cosa gli riconoscono">
                        {(proposta.voce.apprezzato as string[] | undefined)?.join(' · ') || '—'}
                      </MetadataListItem>
                      <MetadataListItem label="Cosa fa">{proposta.fatti.cosa_fa || '—'}</MetadataListItem>
                      {/* I tre elenchi che riempiono «Cosa è vero»: si guardano
                          qui perché sono quelli che finiranno nei post come
                          roba verificata, e leggerli dopo averli accettati è
                          l'ordine sbagliato. */}
                      <MetadataListItem label="Offerta">
                        {proposta.fatti.offerta?.join(' · ') || '—'}
                      </MetadataListItem>
                      <MetadataListItem label="Materiali">
                        {proposta.fatti.materiali?.join(' · ') || '—'}
                      </MetadataListItem>
                      <MetadataListItem label="Punti di forza">
                        {proposta.fatti.punti_forza?.join(' · ') || '—'}
                      </MetadataListItem>
                      <MetadataListItem label="Settore">
                        {proposta.settore?.length
                          ? proposta.settore.join(' · ')
                          : s.settore.length
                            ? 'lo tengo com’è'
                            : '—'}
                      </MetadataListItem>
                    </MetadataList>
                    <HStack gap={2}>
                      <Button label="Porta nei campi" variant="primary" size="sm" onClick={accetta} />
                      <Button label="Lascia perdere" size="sm" variant="ghost" onClick={() => setProposta(null)} />
                    </HStack>
                  </VStack>
                </Banner>
              ) : null}

              <TextInput
                label="La voce"
                placeholder="diretto, senza fronzoli, da osteria di paese"
                value={s.voce.voce}
                onChange={(v) => {
                  setSalvato(false);
                  setS((x) => ({ ...x, voce: { ...x.voce, voce: v } }));
                }}
              />
              <TextInput
                label="A chi parla"
                placeholder="famiglie e lavoratori del pavese"
                value={s.voce.pubblico}
                onChange={(v) => {
                  setSalvato(false);
                  setS((x) => ({ ...x, voce: { ...x.voce, pubblico: v } }));
                }}
              />
              <TextArea
                label="Cosa apprezzano i clienti"
                description="Dalle recensioni. Una per riga."
                rows={3}
                value={aRighe(s.voce.apprezzato)}
                onChange={(v) => {
                  setSalvato(false);
                  setS((x) => ({ ...x, voce: { ...x.voce, apprezzato: daRighe(v) } }));
                }}
              />
              <TextArea
                label="Confini — cosa NON fa"
                description="«niente surgelati», «niente truciolato». Una per riga."
                rows={3}
                value={aRighe(s.voce.non_fa)}
                onChange={(v) => {
                  setSalvato(false);
                  setS((x) => ({ ...x, voce: { ...x.voce, non_fa: daRighe(v) } }));
                }}
              />
              <TextArea
                label="Da non dire mai"
                description="Frasi da non usare mai. Una per riga."
                rows={3}
                value={aRighe(s.voce.mai_dire)}
                onChange={(v) => {
                  setSalvato(false);
                  setS((x) => ({ ...x, voce: { ...x.voce, mai_dire: daRighe(v) } }));
                }}
              />
            </VStack>
            ) : null}

            {/* ── 3. Cosa è vero ───────────────────────────────────────────
                I fatti sono l'unica cosa che un post puo' affermare: e' cio' che
                rende la revisione «e' vero?» invece di «e' bello?». Togliere una
                riga la SPEGNE, non la cancella — i post pubblicati sanno ancora
                su cosa si reggevano. */}
            {sezione === 'fatti' ? (
            <VStack gap={3}>
              {CHIAVI.map((c) => (
                <TextArea
                  key={c.id}
                  label={c.nome}
                  description={c.aiuto}
                  rows={c.id === 'cosa_fa' ? 2 : 4}
                  value={fatti[c.id] ?? ''}
                  onChange={(v) => {
                    setSalvato(false);
                    setFatti((f) => ({ ...f, [c.id]: v }));
                  }}
                />
              ))}
            </VStack>
            ) : null}

            {/* ── 4. Servizi ───────────────────────────────────────────────
                Senza una riga qui il router non pubblica niente, nemmeno se il
                titolare manda la foto. */}
            {sezione === 'servizi' ? (
            <VStack gap={3}>

              <VStack gap={2}>
                <HStack gap={2} align="center">
                  <Button
                    label={attivo('menu_del_giorno') ? 'Menù del giorno: attivo' : 'Menù del giorno: spento'}
                    size="sm"
                    variant={attivo('menu_del_giorno') ? 'primary' : 'secondary'}
                    onClick={() => cambiaServizio('menu_del_giorno', {}, !attivo('menu_del_giorno'))}
                  />
                </HStack>
                {attivo('menu_del_giorno') ? (
                  <VStack gap={2}>
                    <TextInput
                      label="URL a cui mandare il menù"
                      placeholder="https://ilcliente.it/api/menu"
                      value={config('menu_del_giorno').site_menu_url ?? ''}
                      onChange={(v) => cambiaServizio('menu_del_giorno', { site_menu_url: v })}
                    />
                    <TextInput
                      label="Segreto del sito"
                      description="Uno per cliente."
                      value={config('menu_del_giorno').site_secret ?? ''}
                      onChange={(v) => cambiaServizio('menu_del_giorno', { site_secret: v })}
                    />
                    <TextInput
                      label="Pagina del menù"
                      description="Finisce nel pulsante sotto il post di Google."
                      placeholder="https://ilcliente.it/menu"
                      value={config('menu_del_giorno').site_menu_page ?? ''}
                      onChange={(v) => cambiaServizio('menu_del_giorno', { site_menu_page: v })}
                    />
                  </VStack>
                ) : null}
              </VStack>

              <VStack gap={2}>
                <HStack gap={2} align="center">
                  <Button
                    label={attivo('post_gbp') ? 'Scheda Google: attiva' : 'Scheda Google: spenta'}
                    size="sm"
                    variant={attivo('post_gbp') ? 'primary' : 'secondary'}
                    onClick={() => cambiaServizio('post_gbp', {}, !attivo('post_gbp'))}
                  />
                </HStack>
                {attivo('post_gbp') ? (
                  <VStack gap={3}>
                    {/* ⚠️ Gli id NON si digitano. Vedi il commento su
                        `leggiDaGoogle`: e' la regola del guasto del 21/07/2026,
                        e la prima versione di questa pagina la violava. */}
                    <HStack gap={2} align="center" wrap="wrap">
                      <Button label="Leggi le schede da Google" size="sm" clickAction={leggiDaGoogle} />
                      {config('post_gbp').gbp_account_id ? (
                        <Text type="supporting">
                          collegata: account {config('post_gbp').gbp_account_id} · scheda{' '}
                          {config('post_gbp').gbp_location_id}
                        </Text>
                      ) : (
                        <Text type="supporting">nessuna scheda collegata</Text>
                      )}
                    </HStack>

                    {schede ? (
                      schede.length ? (
                        <Selector
                          label="Quale scheda è questo cliente"
                          hasSearch={schede.length > 8}
                          placeholder="Scegli dall’elenco letto da Google"
                          value={
                            config('post_gbp').gbp_location_id
                              ? `${config('post_gbp').gbp_account_id}/${config('post_gbp').gbp_location_id}`
                              : ''
                          }
                          onChange={(v) => {
                            const [account, location] = v.split('/');
                            cambiaServizio('post_gbp', { gbp_account_id: account, gbp_location_id: location });
                          }}
                          options={schede.map((x) => ({
                            value: `${x.accountId}/${x.locationId}`,
                            label: x.titolo || `scheda ${x.locationId}`,
                          }))}
                        />
                      ) : (
                        <Banner
                          status="warning"
                          title="Google non ha restituito nessuna scheda"
                          description="O l’agenzia non ne gestisce, o il token non ha i permessi giusti."
                        />
                      )
                    ) : null}

                    {/* ── IL BOTTONE SOTTO IL POST ──────────────────────────
                        Google permette di mettere un pulsante sotto ogni post
                        (Prenota, Ordina online, Scopri di più...). Wesion
                        sapeva già farlo — `pubblicaPost` accetta l'azione — ma
                        glielo passava SOLO il menù del giorno: i diciassette
                        post di un piano uscivano tutti senza niente da
                        cliccare, e non era una scelta, era una dimenticanza.

                        Qui si imposta quello di serie, valido per tutti i post
                        di questo cliente. Sulla singola bozza si può cambiare
                        dalla consolle. Il valore si risolve al momento della
                        pubblicazione, quindi vale anche per le bozze già in
                        coda: non c'è niente da rigenerare. */}
                    {eCliente && config('post_gbp').gbp_location_id ? (
                      <VStack gap={2}>
                        <Selector
                          label="Bottone sotto i post"
                          description="Quello di serie per questo cliente. Sulla singola bozza si può cambiare."
                          value={config('post_gbp').cta_tipo || ''}
                          onChange={(v) => cambiaServizio('post_gbp', { cta_tipo: String(v) })}
                          options={[
                            { value: '', label: 'Nessun bottone' },
                            ...Object.entries(AZIONI_BOTTONE).map(([value, label]) => ({ value, label })),
                          ]}
                        />
                        {/* «Chiama ora» usa il numero della scheda Google: un
                            url lì dentro fa fallire la pubblicazione. */}
                        {config('post_gbp').cta_tipo && VUOLE_URL(config('post_gbp').cta_tipo) ? (
                          <TextInput
                            label="Dove porta il bottone"
                            description="La pagina del cliente a cui mandare chi clicca."
                            value={config('post_gbp').cta_url || ''}
                            onChange={(v) => cambiaServizio('post_gbp', { cta_url: v })}
                          />
                        ) : null}
                      </VStack>
                    ) : null}

                    {/* Se in tabella c'e' gia' qualcosa di storto lo si vede
                        subito: e' la stessa cosa che sorveglia la spia
                        `id-google-malformati`, detta qui dove si puo' riparare. */}
                    {(config('post_gbp').gbp_account_id &&
                      !/^[0-9]+$/.test(config('post_gbp').gbp_account_id)) ||
                    (config('post_gbp').gbp_location_id &&
                      !/^[0-9]+$/.test(config('post_gbp').gbp_location_id)) ? (
                      <Banner
                        status="error"
                        title="Gli id salvati non sono numerici"
                        description="Così la pubblicazione fallirà con 404 al primo tentativo. Rileggili da Google."
                      />
                    ) : null}
                  </VStack>
                ) : null}
              </VStack>

              <VStack gap={2}>
                <HStack gap={2} align="center">
                  <Button
                    label={attivo('blog') ? 'Blog: attivo' : 'Blog: spento'}
                    size="sm"
                    variant={attivo('blog') ? 'primary' : 'secondary'}
                    onClick={() => cambiaServizio('blog', {}, !attivo('blog'))}
                  />
                </HStack>
                {attivo('blog') ? (
                  <VStack gap={2}>
                    {/* La scelta viene PRIMA dei campi: cambia quali campi
                        hanno senso, e mostrarli tutti insieme vorrebbe dire
                        chiedere un segreto a chi ha un WordPress e non ce
                        l'ha, o viceversa. */}
                    <Selector
                      label="Che sito ha il cliente"
                      description="Su WordPress non si installa niente: si pubblica dalla sua REST API."
                      value={config('blog').tipo || 'wesion'}
                      onChange={(v) => cambiaServizio('blog', { tipo: v ?? 'wesion' })}
                      options={[
                        { value: 'wesion', label: 'Sito nostro (Astro, Express, Worker)' },
                        { value: 'wordpress', label: 'Il WordPress del cliente' },
                      ]}
                    />

                    {(config('blog').tipo || 'wesion') === 'wordpress' ? (
                      <>
                        <TextInput
                          label="Indirizzo del sito"
                          description="Solo https: su http WordPress le password per applicazioni non le rilascia nemmeno."
                          placeholder="https://ilcliente.it"
                          value={config('blog').wp_base ?? ''}
                          onChange={(v) => cambiaServizio('blog', { wp_base: v })}
                        />
                        <TextInput
                          label="Utente WordPress"
                          description="Deve poter pubblicare articoli: Autore o Amministratore."
                          placeholder="mario"
                          value={config('blog').wp_utente ?? ''}
                          onChange={(v) => cambiaServizio('blog', { wp_utente: v })}
                        />
                        <TextInput
                          label="Password per applicazioni"
                          description="Se la genera lui: Utenti → Profilo → Password per applicazioni. Non è la sua password."
                          placeholder="abcd EFGH 1234 wxyz ..."
                          value={config('blog').wp_password_app ?? ''}
                          onChange={(v) => cambiaServizio('blog', { wp_password_app: v })}
                        />
                        <HStack gap={2} align="center">
                          <Button label="Prova le credenziali" size="sm" clickAction={provaWordPress} />
                          <Text type="supporting">
                            Chiede a WordPress «chi sono io». Verifica in un colpo solo tre cose che si
                            rompono spesso: la REST API raggiungibile, l’header Authorization che arriva
                            fino a PHP, e i permessi dell’utente.
                          </Text>
                        </HStack>
                      </>
                    ) : (
                      <>
                        <TextInput
                          label="URL a cui mandare gli articoli"
                          description="L’endpoint sul sito del cliente."
                          placeholder="https://ilcliente.it/api/blog"
                          value={config('blog').site_blog_url ?? ''}
                          onChange={(v) => cambiaServizio('blog', { site_blog_url: v })}
                        />
                        <TextInput
                          label="Segreto del blog"
                          description="Diverso da quello del menù."
                          value={config('blog').site_blog_secret ?? ''}
                          onChange={(v) => cambiaServizio('blog', { site_blog_secret: v })}
                        />
                      </>
                    )}

                    <TextInput
                      label="Pagina del blog"
                      placeholder="https://ilcliente.it/blog"
                      value={config('blog').site_blog_page ?? ''}
                      onChange={(v) => cambiaServizio('blog', { site_blog_page: v })}
                    />
                    <TextInput
                      label="Categorie"
                      description="Separate da virgola. Il generatore sceglie fra queste."
                      placeholder="Ristorazione, SEO, Prezzi & Budget, Consigli"
                      value={config('blog').categorie ?? ''}
                      onChange={(v) => cambiaServizio('blog', { categorie: v })}
                    />
                  </VStack>
                ) : null}
              </VStack>

              <VStack gap={1}>
                <Text type="supporting">Chi può dare comandi al router</Text>
                {s.titolari.length ? (
                  <List hasDividers density="compact">
                    {s.titolari.map((t) => (
                      <ListItem key={t.id} label={t.valore} description={t.tipo} />
                    ))}
                  </List>
                ) : (
                  /* Dal 31/08/2026 si fa dall'elenco: «Modifica» sulla riga,
                     un contatto con l'interruttore «titolare» acceso. La riga
                     di comando resta per il primo giro e per quando la
                     dashboard non è raggiungibile — le due strade chiamano le
                     stesse funzioni, apposta. */
                  <Text type="supporting">
                    Nessuno: il bot non risponderà a nessun numero. Si abilita da «Aziende» → la riga →
                    «Modifica» → un contatto con l’interruttore «titolare» acceso. Da riga di comando:{' '}
                    <code>npm run cliente -- --azienda {s.slug} --titolare &quot;+39…&quot;</code>
                  </Text>
                )}
              </VStack>
            </VStack>
            ) : null}

            {/* ── 5. Il mese ───────────────────────────────────────────────
                Prima il piano (aritmetica, gratis), poi si guarda, e solo dopo
                si spendono le generazioni: un piano sbagliato lo vedi in dieci
                secondi, diciotto testi sbagliati no. */}
            {sezione === 'mese' ? (
            <VStack gap={3}>
              <HStack gap={2} wrap="wrap">
                {/* ⚠️ PORTA ALL'ANTEPRIMA, non crea niente.
                    Prima questo bottone faceva direttamente il POST, e il piano
                    lo si scopriva dopo guardando diciotto righe gia' fatte —
                    che e' esattamente cio' che la separazione fra piano e
                    scrittura serve a evitare. Guardare non costa niente: che
                    sia la strada piu' comoda. */}
                <Button
                  label="Costruisci il piano del mese"
                  variant="primary"
                  isDisabled={!salvato}
                  tooltip={salvato ? undefined : 'Salva prima la scheda: il piano nasce da questi fatti.'}
                  onClick={() => router.push(`/piano?cliente=${s.id}`)}
                />
                <Button
                  label="Scrivi i testi mancanti"
                  clickAction={() => chiama(`/api/aziende/${s.id}/scrivi`, 'Scrivo i testi')}
                />
                {/* Un pezzo solo, per quando il mese non c'entra: il cliente
                    chiama e domenica fa una serata. */}
                <Button
                  label="Un post solo"
                  variant="secondary"
                  isDisabled={!s.fatti.length}
                  tooltip={s.fatti.length ? undefined : 'Serve almeno un fatto: un post deve poter dire qualcosa di vero.'}
                  onClick={() => setPezzo({ tipo: 'post_gbp', fattoId: '', quando: '', angolo: '' })}
                />
                <Button
                  label="Un articolo"
                  variant="secondary"
                  isDisabled={!s.fatti.length}
                  tooltip={s.fatti.length ? undefined : 'Serve almeno un fatto.'}
                  onClick={() => setPezzo({ tipo: 'articolo', fattoId: '', quando: '', angolo: '' })}
                />
                <Button
                  label="Analizza il sito"
                  clickAction={() => chiama(`/api/aziende/${s.id}/audit`, 'Analizzo')}
                />
              </HStack>
            </VStack>
            ) : null}

            {/* ── 6. Da approvare ──────────────────────────────────────────
                Il cerchio si chiude qui: la scheda sapeva già costruire il
                piano, scrivere un post e un articolo, ma per dire di sì si
                doveva uscire e andare in `/bozze`. L'ultimo click era il più
                lontano di tutti. */}
            {sezione === 'approvare' ? (
            <VStack gap={3}>
              <Banner
                status="info"
                title="Approvare non è pubblicare"
                description="Qui si autorizza. A pubblicare ci pensa il router, al suo giro: entro un minuto sulla scheda Google, il blog o il sito."
              />

              {s.daApprovare.map((b) => (
                <Card key={b.id}>
                  <VStack gap={2} padding={3}>
                    <HStack gap={2} align="center" wrap="wrap">
                      <Badge
                        variant="neutral"
                        label={
                          b.tipo === 'post_gbp'
                            ? 'Post scheda Google'
                            : b.tipo === 'articolo'
                              ? 'Articolo del blog'
                              : b.tipo === 'menu'
                                ? 'Menù del giorno'
                                : b.tipo
                        }
                      />
                      <Text type="supporting" color="secondary">
                        {b.pubblica_at ? `programmato per il ${quandoBreve(b.pubblica_at)}` : 'esce appena approvato'}
                      </Text>
                    </HStack>

                    {b.titolo ? <Text weight="bold">{b.titolo}</Text> : null}
                    {/* Il testo intero, non un'anteprima tagliata: si approva
                        quello che si è letto, non quello che si intuisce. */}
                    <Text style={{ whiteSpace: 'pre-wrap' }}>{b.testo ?? '(nessun testo)'}</Text>

                    <HStack gap={2}>
                      <Button
                        label="Approva"
                        variant="primary"
                        size="sm"
                        isLoading={bozzaInCorso === b.id}
                        clickAction={() => decidiBozza(b.id, 'approva')}
                      />
                      <Button
                        label="Rifiuta"
                        variant="ghost"
                        size="sm"
                        isDisabled={bozzaInCorso === b.id}
                        clickAction={() => decidiBozza(b.id, 'rifiuta')}
                      />
                      <Link href={`/bozze?cliente=${s.id}`}>Aprila in Bozze per correggerne il testo</Link>
                    </HStack>
                  </VStack>
                </Card>
              ))}
            </VStack>
            ) : null}

            {/* ── Il modulo di UN pezzo ────────────────────────────────────
                Tre domande e basta: su cosa parla, che taglio, quando esce.
                Il resto — il testo — lo scrive il generatore, e la revisione e'
                dove e' sempre stata: in Bozze. */}
            {pezzo ? (
              <Dialog isOpen onOpenChange={(o) => (o ? null : setPezzo(null))} purpose="form" width={560}>
                <DialogHeader
                  title={pezzo.tipo === 'post_gbp' ? 'Un post per la scheda Google' : 'Un articolo per il blog'}
                  subtitle={s.nome}
                  onOpenChange={(o) => (o ? null : setPezzo(null))}
                />
                <VStack gap={4} padding={4}>
                  <Selector
                    label="Su cosa parla"
                    description="Uno dei fatti veri di questo cliente."
                    value={pezzo.fattoId}
                    onChange={(v) => setPezzo((x) => (x ? { ...x, fattoId: v ?? '' } : x))}
                    options={s.fatti.map((f) => ({ value: String(f.id), label: f.valore }))}
                  />
                  <TextArea
                    label="Che taglio dargli"
                    rows={3}
                    placeholder="Domenica sera c’è la serata con la musica dal vivo: dillo senza fare il volantino."
                    value={pezzo.angolo}
                    onChange={(v) => setPezzo((x) => (x ? { ...x, angolo: v } : x))}
                  />
                  <DateInput
                    label="Quando esce"
                    description="Vuoto = appena lo approvi. Con una data, il router aspetta quel giorno alle 10."
                    value={(pezzo.quando || undefined) as DataISO | undefined}
                    min={new Date().toISOString().slice(0, 10) as DataISO}
                    onChange={(v) => setPezzo((x) => (x ? { ...x, quando: v ?? '' } : x))}
                  />
                  <HStack gap={2} justify="end">
                    <Button label="Annulla" variant="ghost" onClick={() => setPezzo(null)} />
                    <Button
                      label="Scrivilo"
                      variant="primary"
                      isDisabled={!pezzo.fattoId}
                      tooltip={pezzo.fattoId ? undefined : 'Scegli su cosa deve parlare.'}
                      clickAction={creaPezzo}
                    />
                  </HStack>
                </VStack>
              </Dialog>
            ) : null}

            {/* ── COSA È USCITO ────────────────────────────────────────────
                Chiesto il giorno della prima pubblicazione vera: «non esiste
                uno storico? per capire cosa abbiamo fatto?». No, non esisteva.

                ⚠️ CARD E NON RIGHE, in deroga alla regola di casa (dati fitti =
                righe a filo). Qui ogni voce è un oggetto visivo con una
                copertina, e si guarda come si guarda una galleria: «cosa gli
                abbiamo pubblicato?» si risponde con l'occhio, non leggendo una
                colonna. È l'eccezione che AGENTS.md prevede per le gallerie.

                Ci sono anche i FALLITI, col loro errore: "abbiamo provato e non
                è andata" fa parte della storia di un cliente quanto un
                successo, e toglierlo farebbe sembrare che quel giorno non
                avessimo fatto niente. */}
            {sezione === 'storico' ? (
              <VStack gap={4}>
                <Text type="supporting">
                  Quello che è uscito davvero, dal più recente. Non è la coda di quello che deve
                  ancora uscire: quella sta in Bozze.
                </Text>

                {/* ⚠️ `fill` E NON `fit` (01/09/2026). Con `fit` le colonne
                    vuote collassano e quelle rimaste si allargano: con UN post
                    solo in elenco, la card prendeva tutta la larghezza dello
                    schermo e la copertina veniva fuori gigantesca. `fill` tiene
                    le colonne della loro misura, e una card resta una card
                    anche quando è l'unica. */}
                <Grid columns={{ minWidth: 260, repeat: 'fill' }} gap={4}>
                  {s.storico.map((v) => {
                    const riuscita = v.destinazioni.some((d) => d.esito === 'ok');
                    const link = v.destinazioni.find((d) => d.url)?.url ?? null;
                    return (
                      <Card key={v.id} padding={0}>
                        <VStack gap={0}>
                          {v.foto ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={v.foto}
                              alt=""
                              style={{
                                width: '100%',
                                aspectRatio: '1 / 1',
                                objectFit: 'cover',
                                display: 'block',
                              }}
                            />
                          ) : null}
                          <VStack gap={2} padding={4}>
                            <HStack gap={2} vAlign="center" wrap="wrap">
                              {/* ⚠️ "Uscito" e "ancora online" sono due cose
                                  diverse: la prima dice che Google l'ha
                                  accettato quel giorno, la seconda che c'e'
                                  ancora adesso. Un post respinto dalla
                                  revisione sparisce senza avvisare nessuno, e
                                  fino al 01/09/2026 qui avrebbe continuato a
                                  dire "uscito" per sempre. */}
                              <Badge
                                variant={
                                  !riuscita
                                    ? 'error'
                                    : v.stato_remoto === 'LIVE'
                                      ? 'success'
                                      : v.stato_remoto && v.stato_remoto !== 'PROCESSING'
                                        ? 'error'
                                        : 'neutral'
                                }
                                label={
                                  !riuscita
                                    ? 'non uscito'
                                    : v.stato_remoto === 'LIVE'
                                      ? 'online'
                                      : v.stato_remoto === 'PROCESSING'
                                        ? 'in revisione'
                                        : v.stato_remoto === 'RIMOSSO'
                                          ? 'rimosso da Google'
                                          : v.stato_remoto
                                            ? `Google dice: ${v.stato_remoto}`
                                            : 'uscito'
                                }
                              />
                              {v.destinazioni.map((d, i) => (
                                <Badge
                                  key={i}
                                  variant="neutral"
                                  label={ETICHETTA_DESTINAZIONE[d.destinazione] ?? d.destinazione}
                                />
                              ))}
                            </HStack>

                            {v.titolo ? (
                              <Text type="body" weight="semibold">
                                {v.titolo}
                              </Text>
                            ) : null}
                            {v.testo ? (
                              <Text type="supporting" maxLines={4}>
                                {v.testo}
                              </Text>
                            ) : null}

                            <Text type="supporting" size="xsm">
                              {v.uscito_at ? quandoBreve(v.uscito_at) : '—'}
                            </Text>

                            {v.destinazioni
                              .filter((d) => d.esito === 'errore' && d.errore)
                              .map((d, i) => (
                                <Text key={i} type="supporting" size="xsm" color="disabled">
                                  {d.errore}
                                </Text>
                              ))}

                            {link ? (
                              <Link
                                href={link}
                                isExternalLink
                                newTabLabel="(si apre in una scheda nuova)"
                              >
                                Vai a vederlo
                              </Link>
                            ) : null}
                          </VStack>
                        </VStack>
                      </Card>
                    );
                  })}
                </Grid>
              </VStack>
            ) : null}

            <HStack gap={2}>
              <Button label="Salva la scheda" variant="primary" clickAction={salva} isDisabled={salvato} />
              <Button
                label="Torna all’elenco"
                variant="ghost"
                onClick={() => router.push(s.stato === 'cliente' ? '/clienti' : '/aziende')}
              />
            </HStack>
          </VStack>
        </LayoutContent>
      }
    />

    {/* La domanda dice cosa succede DOPO il sì, non "sei sicuro?": che il
        sito del cliente cambia e si ripubblica da solo. */}
    {confermaApplica ? (
      <AlertDialog
        isOpen
        onOpenChange={(aperto) => (aperto ? null : setConfermaApplica(false))}
        title="Applicare le modifiche al sito?"
        description={`Le modifiche entrano nel sito di ${s.nome} e Cloudflare lo ricostruisce da solo: fra qualche minuto sono online. Si può tornare indietro, ma da GitHub e a mano.`}
        actionLabel="Applica"
        cancelLabel="Lascia stare"
        onAction={applicaProposta}
      />
    ) : null}

    {moduloAnagrafica ? (
      <ModuloAzienda
        aperto
        azienda={moduloAnagrafica}
        onChiudi={() => setModuloAnagrafica(null)}
        onSalvata={() => {
          setModuloAnagrafica(null);
          router.refresh();
        }}
      />
    ) : null}
    </>
  );
}
