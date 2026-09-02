'use client';

/**
 * L'elenco aziende: raggruppato, filtrabile, e da ogni riga si può FARE qualcosa.
 *
 * ⚠️ DUE DIFETTI VERI, VISTI SU DATI VERI (27/08/2026).
 *
 * 1. I DENTISTI MISCHIATI AI RISTORANTI. L'ordine era per punteggio: i
 *    ristoranti di Vigevano, già analizzati, stavano in cima; i dentisti di
 *    Abbiategrasso, senza audit, in fondo. Erano DUE CAMPAGNE diverse finite
 *    nello stesso elenco, e non c'era modo di guardarne una sola.
 *
 *    Si raggruppa per CAMPAGNA, ed è una scelta contata: sui dati veri, la
 *    categoria fa 24 gruppi su 77 aziende (le categorie di Google Maps sono
 *    granulari — «Ristorante toscano», «Ristopub», «Pizza da asporto»), la
 *    città ne fa 4, la campagna 3. Raggruppare per categoria avrebbe prodotto
 *    più rumore del problema che curava.
 *
 * 2. QUARANTA RIGHE DI SEGUITO NON SI LEGGONO, si scorrono. Adesso sono
 *    venticinque, con gli stacchi fra i gruppi, e i comandi stanno
 *    nell'intestazione invece che sopra la lista: è verticale che si guadagna,
 *    ed è quello che mancava.
 *
 * L'archetipo resta `incident-console`: righe fitte a filo, zero card, ispettore
 * laterale alla selezione. Lo stato della vista sta nell'URL, non in `useState`.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Layout, LayoutContent, LayoutHeader, LayoutPanel } from '@astryxdesign/core/Layout';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Button } from '@astryxdesign/core/Button';
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu';
import { Link } from '@astryxdesign/core/Link';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Selector } from '@astryxdesign/core/Selector';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Divider } from '@astryxdesign/core/Divider';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { ModuloAzienda, AZIENDA_VUOTA, type AziendaModulo } from './ModuloAzienda';
import { soloData } from '@/lib/quando';

export interface Azienda {
  id: number;
  slug: string;
  nome: string;
  categoria: string | null;
  citta: string | null;
  provincia: string | null;
  stato: string;
  maps_url: string | null;
  /** L'ultimo canale usato per scrivere/chiamare, e quando. Solo l'ultimo,
   *  non uno storico: vedi la nota nello schema del 02/09/2026. */
  ultimo_contatto_canale: string | null;
  ultimo_contatto_at: string | null;
  /** Per l'audit SEO/GEO automatico — vedi wesion.sito. */
  sito_repo_url: string | null;
  sito_gsc_proprieta: string | null;
  sito_ultima_pr_url: string | null;
  sito_ultimo_audit_at: string | null;
  sito_ultimo_errore: string | null;
  campagna: string | null;
  score: number | null;
  telefono: string | null;
  telefono_normalizzato: string | null;
  email: string | null;
  sito: string | null;
  audit_note: string | null;
  /** I fatti, non l'opinione: risponde? viewport? form? Vedi `audit.ts`. */
  audit_scansione: string | null;
  audit_modello: string | null;
  audit_hook: string | null;
  audit_quando: string | null;
  audit_errore: string | null;
  /** Le stelle di Google e quante persone le hanno date. */
  voto: string | number | null;
  recensioni: number | null;
}

/**
 * L'occasione: reputazione alta e nessuna vetrina.
 *
 * ⚠️ E' il segnale che vale di piu' in questa lista, ed e' stato invisibile
 * fino al 31/08/2026 perche' guardavamo solo il sito. Un locale con 4.7 stelle
 * su 629 recensioni e nessun sito non ha un problema di reputazione: ha gia' i
 * clienti, gli manca il posto dove farsi trovare da chi non lo conosce ancora.
 * Quello con due recensioni e nessun sito e' un'altra cosa — puo' essere appena
 * aperto, o non andare bene.
 *
 * Le soglie: 4.2 e' «piace davvero», 50 recensioni sono abbastanza da non
 * essere gli amici del titolare.
 */
function eOccasione(a: Azienda): boolean {
  return !a.sito && Number(a.voto ?? 0) >= 4.2 && (a.recensioni ?? 0) >= 50;
}

const COLORE: Record<string, 'success' | 'warning' | 'error' | 'accent' | 'neutral'> = {
  prospect: 'neutral',
  contattato: 'accent',
  in_trattativa: 'warning',
  cliente: 'success',
  perso: 'error',
  archiviato: 'neutral',
};

const ETICHETTA: Record<string, string> = {
  prospect: 'Da contattare',
  contattato: 'Contattate',
  in_trattativa: 'In trattativa',
  cliente: 'Clienti',
  perso: 'Perse',
};

const STATI = ['prospect', 'contattato', 'in_trattativa', 'cliente', 'perso'];

/** Il canale con cui si è scritto davvero, non un tipo di contatto qualsiasi:
 *  per questo non c'è 'lid' né 'facebook'/'instagram' — sono identità dei
 *  contatti, non posti dove si apre un discorso commerciale. */
const CANALI_CONTATTO: { valore: string; etichetta: string }[] = [
  { valore: 'whatsapp', etichetta: 'WhatsApp' },
  { valore: 'telefono', etichetta: 'Telefono' },
  { valore: 'email', etichetta: 'Email' },
];

const ETICHETTA_CANALE: Record<string, string> = {
  whatsapp: 'WhatsApp',
  telefono: 'Telefono',
  email: 'Email',
  sito: 'Sito',
  facebook: 'Facebook',
  instagram: 'Instagram',
};

/**
 * Un numero fisso non sta su WhatsApp.
 *
 * ⚠️ In Italia i cellulari cominciano per 3 e i fissi per 0, dopo il 39 del
 * prefisso. Il 31/08/2026 il bottone WhatsApp era acceso su «02 4965 5860», il
 * centralino di una clinica: portava alla pagina di WhatsApp che dice «scarica
 * l'app», cioe' a un vicolo cieco travestito da azione. Un bottone che c'e' ma
 * non funziona costa piu' di un bottone che manca: la prima volta ci provi, la
 * seconda non ti fidi piu' nemmeno degli altri.
 */
function eFisso(normalizzato: string | null): boolean {
  return Boolean(normalizzato && /^39?0/.test(normalizzato.replace(/^\+/, '')));
}

/**
 * Il titolo di un gruppo, leggibile.
 *
 * Le campagne vecchie si chiamano come le ha chiamate la macchina —
 * «ristorante_vigevano_20260727_075808» — e quel nome in cima a dieci righe non
 * dice niente a nessuno. Si toglie la marca temporale e si separano le parole:
 * resta «ristorante · vigevano», che e' quello che uno ricorda di aver cercato.
 * Il nome vero resta in tabella, qui si cambia solo come si legge.
 */
function titoloLeggibile(titolo: string): string {
  const pezzi = (titolo.includes('_') ? titolo.split('_') : titolo.split(' · '))
    // Via le marche temporali, in tutte e due le forme che girano in tabella:
    // «20260727_075808» dai nomi da macchina, «27/08/2026» da quelli scritti a
    // mano. In una linguetta la data non serve a scegliere: i gruppi si
    // distinguono per cosa cercavano, non per quando.
    .filter((p) => !/^\d{6,}$/.test(p) && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(p.trim()));
  return pezzi.join(' · ');
}

interface Vista {
  q: string;
  stato: string;
  categoria: string;
  citta: string;
  campagna: string;
  sito: string;
}

interface Opzioni {
  categorie: Array<{ valore: string; quanti: number }>;
  citte: Array<{ valore: string; quanti: number }>;
  campagne: Array<{ id: number; nome: string; quanti: number }>;
}

export function ElencoAziende({
  aziende,
  conteggi,
  quante,
  daAnalizzare,
  pagina,
  perPagina,
  gruppo,
  vista,
  opzioni,
}: {
  aziende: Azienda[];
  conteggi: Record<string, number>;
  quante: number;
  /** Quante aziende non hanno ancora un audit riuscito, su TUTTE non solo questa pagina. */
  daAnalizzare: number;
  pagina: number;
  perPagina: number;
  gruppo: string;
  vista: Vista;
  opzioni: Opzioni;
}) {
  const router = useRouter();
  const [inCorso, avvia] = useTransition();
  const [cerca, setCerca] = useState(vista.q);
  const [selezionataId, setSelezionataId] = useState<number | null>(null);
  const [messaggio, setMessaggio] = useState<{ tipo: 'success' | 'error' | 'info'; testo: string } | null>(null);
  const [copiato, setCopiato] = useState(false);
  /** Il giro dell'audit dura minuti: il bottone deve dire che sta lavorando. */
  const [analisiInCorso, setAnalisiInCorso] = useState(false);
  const [seoInCorso, setSeoInCorso] = useState(false);
  const [esitoSeo, setEsitoSeo] = useState<{ pr_url: string | null; riepilogo: string } | null>(null);
  /**
   * `null` = chiuso. Un oggetto = aperto su quei dati; senza `id` dentro, e'
   * una creazione. Tenerlo in uno stato solo evita il caso impossibile
   * "aperto ma non so su cosa", che con due booleani separati arriva sempre.
   */
  const [modulo, setModulo] = useState<AziendaModulo | null>(null);
  /**
   * Le righe spuntate.
   *
   * ⚠️ VIVE NEL COMPONENTE, non nell'URL come i filtri: una selezione e' un
   * gesto in corso, non una vista che si condivide o si ricarica. Cambiando
   * pagina si perde, ed e' giusto — spuntare venti righe su tre pagine e poi
   * cancellarle tutte insieme e' esattamente il gesto che non vuoi fare per
   * sbaglio.
   */
  const [spuntate, setSpuntate] = useState<Set<number>>(new Set());
  /** La domanda prima di cancellare le spuntate: null = nessuna in corso. */
  const [confermaBlocco, setConfermaBlocco] = useState(false);

  function spunta(id: number, dentro: boolean) {
    setSpuntate((s) => {
      const nuovo = new Set(s);
      if (dentro) nuovo.add(id);
      else nuovo.delete(id);
      return nuovo;
    });
  }

  /** Elimina o archivia le righe spuntate, e dice cosa e' rimasto in piedi. */
  async function azioneSuSpuntate(azione: 'elimina' | 'archivia') {
    const r = await fetch('/api/aziende/azioni', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...spuntate], azione }),
    });
    const esito = await r.json().catch(() => ({}));
    setConfermaBlocco(false);
    if (!r.ok) {
      setMessaggio({ tipo: 'error', testo: esito.errore ?? 'Non è andata.' });
      return;
    }
    setMessaggio({
      tipo: esito.protette ? 'info' : 'success',
      testo:
        azione === 'archivia'
          ? `Archiviate ${esito.archiviate}: escono dai filtri ma restano in tabella.`
          : esito.protette
            ? `Cancellate ${esito.cancellate}. Ne restano ${esito.protette}, hanno del lavoro dentro: ${esito.nomiProtetti.join(', ')}.`
            : `Cancellate ${esito.cancellate}.`,
    });
    setSpuntate(new Set());
    setSelezionataId(null);
    router.refresh();
  }

  /** Il gruppo che si sta per cancellare: null = nessuna domanda in corso. */
  const [gruppoDaButtare, setGruppoDaButtare] = useState<{ campo: string; valore: string; etichetta: string; quante: number } | null>(null);

  /**
   * Cancella tutte le aziende del gruppo aperto.
   *
   * Il server rifiuta riga per riga quello che ha del lavoro dentro e torna
   * indietro con i due numeri: si mostrano tutti e due, perche' «cancellate 21»
   * senza «3 restano, sono clienti» fa credere di aver pulito quando non e' vero.
   */
  async function eliminaGruppo(campo: string, valore: string) {
    const r = await fetch('/api/aziende/elimina-gruppo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campo, valore }),
    });
    const esito = await r.json().catch(() => ({}));
    setGruppoDaButtare(null);
    if (!r.ok) {
      setMessaggio({ tipo: 'error', testo: esito.errore ?? 'Non si è potuto cancellare.' });
      return;
    }
    setMessaggio({
      tipo: esito.protette ? 'info' : 'success',
      testo: esito.protette
        ? `Cancellate ${esito.cancellate}. Ne restano ${esito.protette} perché hanno del lavoro dentro: ${esito.nomiProtetti.join(', ')}.`
        : `Cancellate ${esito.cancellate} aziende.`,
    });
    setSelezionataId(null);
    vaiA({ [campo]: '', pagina: 1 });
    router.refresh();
  }
  /**
   * Le due meta' del pannello: quella che serve MENTRE si telefona (il gancio,
   * cosa si e' visto) e quella che si guarda prima o dopo (numeri, campagna,
   * data dell'audit). Impilate erano una colonna da scorrere col telefono in
   * mano; separate, chi chiama vede solo quello che deve leggere ad alta voce.
   */
  const [dettaglio, setDettaglio] = useState('gancio');

  /**
   * L'anagrafica completa non ce l'ha la riga dell'elenco: la lista porta il
   * minimo per decidere chi chiamare, non i contatti uno per uno. Quindi si
   * chiede al server prima di aprire, invece di far comparire un modulo mezzo
   * vuoto che al salvataggio cancellerebbe quello che non aveva caricato.
   */
  async function apriModifica(id: number) {
    const r = await fetch(`/api/aziende/${id}`);
    if (!r.ok) {
      setMessaggio({ tipo: 'error', testo: 'Non sono riuscito a leggere la scheda anagrafica.' });
      return;
    }
    const a = await r.json();
    setModulo({
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

  async function elimina(id: number, nome: string) {
    const r = await fetch(`/api/aziende/${id}`, { method: 'DELETE' });
    const esito = await r.json().catch(() => ({}));
    if (!r.ok) {
      // Il 409 arriva con la spiegazione gia' scritta dal server: mostrarla
      // com'e' e' meglio che riscriverla peggio da questa parte.
      setMessaggio({ tipo: 'error', testo: esito.errore ?? 'Non si può cancellare.' });
      return;
    }
    setSelezionataId(null);
    setMessaggio({ tipo: 'success', testo: `«${nome}» cancellata.` });
    router.refresh();
  }

  const selezionata = aziende.find((a) => a.id === selezionataId) ?? null;
  const totalePagine = Math.max(1, Math.ceil(quante / perPagina));

  /**
   * L'asse su cui si divide diventa il filtro che le linguette scrivono
   * nell'URL. Tre nomi diversi per la stessa idea, e vanno tenuti allineati:
   * `gruppo` e' l'asse, `campoGruppo` il parametro, `gruppoScelto` il valore.
   */
  const campoGruppo = gruppo === 'campagna' ? 'campagna' : gruppo === 'citta' ? 'citta' : 'categoria';
  const gruppoScelto = (vista[campoGruppo as keyof Vista] as string) || 'tutti';
  const opzioniGruppo: Array<{ valore: string; etichetta: string; quanti: number }> =
    gruppo === 'campagna'
      ? opzioni.campagne.map((c) => ({ valore: String(c.id), etichetta: c.nome, quanti: c.quanti }))
      : gruppo === 'citta'
        ? opzioni.citte.map((c) => ({ valore: c.valore, etichetta: c.valore, quanti: c.quanti }))
        : gruppo === 'categoria'
          ? opzioni.categorie.map((c) => ({ valore: c.valore, etichetta: c.valore, quanti: c.quanti }))
          : [];

  /** Cambia la vista scrivendo nell'URL: è lì che vive lo stato. */
  function vaiA(campi: Record<string, string | number | null>) {
    const p = new URLSearchParams();
    const tutti = { ...vista, gruppo, pagina, q: cerca, ...campi } as Record<string, string | number | null>;
    for (const [k, v] of Object.entries(tutti)) {
      if (v === null || v === '' || v === 'tutti') continue;
      if (k === 'pagina' && v === 1) continue;
      if (k === 'gruppo' && v === 'campagna') continue; // è il default
      p.set(k, String(v));
    }
    avvia(() => router.push(`/aziende${p.toString() ? `?${p}` : ''}`));
  }

  /**
   * Le righe divise in gruppi, nell'ordine in cui arrivano dal database.
   *
   * Il server ordina già per gruppo e poi per punteggio dentro il gruppo: qui
   * si taglia dove il valore cambia. Non si riordina niente lato client, o la
   * paginazione mostrerebbe gruppi a metà con l'ordine sbagliato.
   */
  const gruppi: Array<{ titolo: string; righe: Azienda[] }> = [];
  for (const a of aziende) {
    const chiave =
      gruppo === 'citta'
        ? a.citta || 'Senza città'
        : gruppo === 'campagna'
          ? a.campagna || 'Senza campagna'
          : gruppo === 'nessuno'
            ? ''
            : a.categoria || 'Senza categoria';
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo && ultimo.titolo === chiave) ultimo.righe.push(a);
    else gruppi.push({ titolo: chiave, righe: [a] });
  }

  async function cambiaStato(id: number, nuovo: string, canale?: string) {
    setMessaggio(null);
    const r = await fetch(`/api/aziende/${id}/stato`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stato: nuovo, canale }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      setMessaggio({ tipo: 'error', testo: e?.errore ?? 'Non è andata.' });
      return;
    }
    router.refresh();
  }

  async function analizza(id: number) {
    setMessaggio(null);
    const r = await fetch(`/api/aziende/${id}/audit`, { method: 'POST' });
    const e = await r.json().catch(() => ({}));
    if (!r.ok || e?.esito === 'errore') setMessaggio({ tipo: 'error', testo: e?.errore ?? 'Non è andata.' });
    router.refresh();
  }

  /**
   * L'audit SEO/GEO: clona il repo, legge Search Console, apre la PR — vedi
   * `/api/aziende/[id]/seo-audit`. Dura di più di `analizza` (clona un repo,
   * non solo legge una pagina), quindi ha un suo stato di caricamento: non è
   * `analisiInCorso`, quello è del giro sull'hook.
   */
  async function analizzaSeo(id: number) {
    setMessaggio(null);
    setSeoInCorso(true);
    setEsitoSeo(null);
    try {
      const r = await fetch(`/api/aziende/${id}/seo-audit`, { method: 'POST' });
      const e = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMessaggio({ tipo: 'error', testo: e?.errore ?? 'Non è andata.' });
        return;
      }
      setEsitoSeo({ pr_url: e.pr_url ?? null, riepilogo: e.riepilogo ?? '' });
      router.refresh();
    } finally {
      setSeoInCorso(false);
    }
  }

  async function analizzaMancanti() {
    /**
     * ⚠️ SI DICE QUANTE E QUANTO, non "sto lavorando".
     *
     * Ogni azienda vuole scaricare il suo sito e farlo leggere a un'AI: sono
     * secondi, e su venticinque diventano minuti. Un bottone che gira senza
     * dire niente fa pensare che si sia piantato, e chi guarda ricarica la
     * pagina — cioe' interrompe proprio la cosa che stava aspettando.
     */
    const quante = Math.min(daAnalizzare, 25);
    setAnalisiInCorso(true);
    setMessaggio({
      tipo: 'info',
      testo: `Sto guardando ${quante} siti, uno per uno. Ci vogliono un paio di minuti: puoi continuare a lavorare, ma non ricaricare la pagina.`,
    });
    const r = await fetch('/api/aziende/audit-batch', { method: 'POST' });
    const e = await r.json().catch(() => ({}));
    setAnalisiInCorso(false);
    if (!r.ok) {
      setMessaggio({ tipo: 'error', testo: e?.errore ?? 'Non è andata.' });
      return;
    }
    setMessaggio({
      tipo: 'success',
      testo:
        e.analizzate === 0
          ? 'Non c’è nessuna azienda da analizzare.'
          : `Analizzate ${e.analizzate}, riuscite ${e.riuscite}. Il tetto è 25 per giro: rilancia per continuare.`,
    });
    router.refresh();
  }

  async function copiaGancio(testo: string) {
    try {
      await navigator.clipboard.writeText(testo);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2500);
    } catch {
      setMessaggio({ tipo: 'error', testo: 'Il browser non ha lasciato copiare. Selezionalo a mano.' });
    }
  }

  const filtriAttivi = [vista.categoria, vista.citta, vista.campagna, vista.sito].filter(Boolean).length;

  /**
   * Cosa scrivere sotto il nome, e cosa NO.
   *
   * ⚠️ Due regole, e tutte e due tolgono roba invece di aggiungerne.
   *
   * 1. Non si ripete quello che è già scritto nell'intestazione del gruppo.
   *    Raggruppando per campagna «dentisti · abbiategrasso», scrivere «Dentista
   *    · Abbiategrasso» sotto ogni riga è rumore che raddoppia l'altezza della
   *    lista senza dire niente di nuovo.
   *
   * 2. LO STATO SI SCRIVE, non solo si colora. Il pallino ha il suo `label` per
   *    chi usa uno screen reader, ma chi guarda e non distingue i colori vede
   *    solo un puntino grigio: fra «contattata» e «cliente» non c'è differenza
   *    leggibile. Si scrive solo quando serve — cioè quando NON è già implicito
   *    nel filtro attivo, altrimenti è la stessa parola ripetuta venticinque
   *    volte.
   */
  function descrizione(a: Azienda): string | undefined {
    const pezzi: string[] = [];

    if (vista.stato === 'tutti') pezzi.push(ETICHETTA[a.stato] ?? a.stato);
    if (gruppo !== 'categoria' && a.categoria) pezzi.push(a.categoria);
    if (gruppo !== 'citta' && gruppo !== 'campagna' && a.citta) pezzi.push(a.citta);

    return pezzi.join(' · ') || undefined;
  }

  return (
    <>
      <Layout
      height="fill"
      header={
        /* I comandi stanno QUI e non sopra la lista: è verticale guadagnato,
           ed è quello che mancava per non dover scorrere prima di decidere. */
        <LayoutHeader hasDivider>
          <HStack gap={3} align="center" wrap="wrap">
            <Heading level={2}>Aziende</Heading>
            <Text color="secondary">
              {quante}
              {totalePagine > 1 ? ` · pagina ${pagina} di ${totalePagine}` : ''}
            </Text>

            <SegmentedControl
              label="Stato"
              size="sm"
              value={vista.stato}
              onChange={(v) => vaiA({ stato: v, pagina: 1 })}
            >
              <SegmentedControlItem
                value="tutti"
                label={`Tutte (${Object.values(conteggi).reduce((a, b) => a + b, 0)})`}
              />
              {STATI.filter((s) => conteggi[s]).map((s) => (
                <SegmentedControlItem key={s} value={s} label={`${ETICHETTA[s]} (${conteggi[s]})`} />
              ))}
            </SegmentedControl>
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <VStack gap={0}>
            <VStack padding={3} gap={3}>
              {/* ── LA LEGENDA ────────────────────────────────────────────────
                  ⚠️ SCRITTA PER CHI ARRIVA OGGI (01/09/2026). Detto da chi la
                  usa, guardando questa pagina: «noi umani se guardiamo sta
                  pagina non ci capiamo nulla». Aveva ragione: la riga dice
                  «95», «★ 4.9 · 10», «senza sito» e nessuna delle tre e'
                  spiegata da nessuna parte. Erano leggibili solo per chi le
                  aveva costruite.

                  Sta CHIUSA di serie: chi lavora qui tutti i giorni non deve
                  scavalcarla ogni volta. Ma sta in cima, dove chi non sa
                  guarda per primo, e non in una pagina di aiuto che bisogna
                  sapere di dover cercare. */}
              <Banner
                status="info"
                container="card"
                defaultIsExpanded={false}
                title="Chi chiamo per primo?"
                description="Punteggio alto e «senza sito»: sono quelli a cui serve di più. Apri una riga per il numero e per cosa dirgli."
                endContent={<Text type="supporting">cosa vuol dire?</Text>}
              >
                <MetadataList>
                  <MetadataListItem label="95 (giallo)">
                    Il voto dell’audit: quanto è messo male il sito che ha adesso. Più è alto,
                    più ha bisogno di noi. «—» vuol dire che non l’abbiamo ancora guardato:
                    lo fai con «Controlla i siti mai visti», il bottone qui sopra: ci mette un paio di
                    minuti perché guarda un sito per volta.
                  </MetadataListItem>
                  <MetadataListItem label="★ 4.9 · 10">
                    Le recensioni su Google: prima il voto, poi quante ne ha. Dieci recensioni
                    e cinque stelle non sono la stessa cosa di seicento.
                  </MetadataListItem>
                  <MetadataListItem label="senza sito (rosso)">
                    Non ha un sito. Il rosso non è un problema tuo: è il motivo per cui lo
                    chiami.
                  </MetadataListItem>
                  <MetadataListItem label="occasione (verde)">
                    Nessun sito, ma già tante recensioni buone: ha i clienti e non ha la
                    vetrina. È il caso migliore che puoi trovare.
                  </MetadataListItem>
                  <MetadataListItem label="Da contattare">
                    A che punto sei con lui. Dopo la telefonata lo cambi tu, dalla riga.
                  </MetadataListItem>
                  <MetadataListItem label="Dividi per">
                    Raggruppa l’elenco: per campagna, per città o per categoria. Non cambia
                    cosa vedi, cambia come è impilato.
                  </MetadataListItem>
                </MetadataList>
              </Banner>

              {/* ── I FILTRI, TUTTI IN UNA RIGA ──────────────────────────────
                  ⚠️ ETICHETTE NASCOSTE (01/09/2026). Ogni filtro aveva la sua
                  scritta sopra — «Categoria», «Città», «Campagna», «Sito» — e
                  quelle scritte alzavano ogni controllo di una riga: i primi
                  quattro entravano, il quinto («Sito») finiva a capo da solo e
                  sembrava un pezzo staccato di un'altra cosa.

                  Si possono togliere perché il placeholder dice già la stessa
                  parola: «Tutte le categorie», «Tutte le città». Restano per chi
                  legge con lo screen reader, che l'etichetta ce l'ha comunque.

                  Il prezzo, detto: quando un filtro è scelto, il suo valore
                  sostituisce il placeholder e si perde la parola che diceva di
                  che filtro si tratta. Lo si accetta perché i valori qui sono
                  espliciti da soli («dentisti · abbiategrasso»), e perché
                  «Togli i filtri (N)» dice comunque che qualcosa è acceso. */}
              <HStack gap={2} align="end" wrap="wrap">
                <TextInput
                  label="Cerca"
                  isLabelHidden
                  placeholder="Nome, città, categoria, telefono…"
                  value={cerca}
                  onChange={setCerca}
                  size="sm"
                  startIcon="search"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') vaiA({ q: cerca, pagina: 1 });
                  }}
                />

                {/* I filtri portano il loro numero: si sceglie sapendo quanto
                    c'è dietro, invece di aprire e trovare tre righe. */}
                <Selector
                  label="Categoria"
                  isLabelHidden
                  size="sm"
                  hasClear
                  hasSearch={opzioni.categorie.length > 8}
                  placeholder="Tutte le categorie"
                  value={vista.categoria}
                  onChange={(v) => vaiA({ categoria: v ?? '', pagina: 1 })}
                  options={opzioni.categorie.map((c) => ({ value: c.valore, label: `${c.valore} (${c.quanti})` }))}
                />
                <Selector
                  label="Città"
                  isLabelHidden
                  size="sm"
                  hasClear
                  hasSearch={opzioni.citte.length > 8}
                  placeholder="Tutte le città"
                  value={vista.citta}
                  onChange={(v) => vaiA({ citta: v ?? '', pagina: 1 })}
                  options={opzioni.citte.map((c) => ({ value: c.valore, label: `${c.valore} (${c.quanti})` }))}
                />
                <Selector
                  label="Campagna"
                  isLabelHidden
                  size="sm"
                  hasClear
                  placeholder="Tutte le campagne"
                  value={vista.campagna}
                  onChange={(v) => vaiA({ campagna: v ?? '', pagina: 1 })}
                  options={opzioni.campagne.map((c) => ({ value: String(c.id), label: `${c.nome} (${c.quanti})` }))}
                />
                <Selector
                  label="Sito"
                  isLabelHidden
                  size="sm"
                  hasClear
                  placeholder="Con e senza sito"
                  value={vista.sito}
                  onChange={(v) => vaiA({ sito: v ?? '', pagina: 1 })}
                  options={[
                    { value: 'no', label: 'Senza sito' },
                    { value: 'si', label: 'Con un sito' },
                  ]}
                />
              </HStack>

              <HStack gap={2} align="center" wrap="wrap">
                <Text type="supporting">Dividi per</Text>
                <SegmentedControl label="Dividi per" size="sm" value={gruppo} onChange={(v) => vaiA({ gruppo: v, campagna: '', citta: '', categoria: '', pagina: 1 })}>
                  <SegmentedControlItem value="campagna" label="Campagna" />
                  <SegmentedControlItem value="citta" label="Città" />
                  <SegmentedControlItem value="categoria" label="Categoria" />
                  <SegmentedControlItem value="nessuno" label="Niente" />
                </SegmentedControl>

                <Button
                  label="Cerca"
                  size="sm"
                  variant="primary"
                  isLoading={inCorso}
                  onClick={() => vaiA({ q: cerca, pagina: 1 })}
                />
                {/* Sta fra i comandi e non in fondo alla lista: chi aggiunge
                    un'azienda a mano di solito ha appena riagganciato il
                    telefono, e non deve cercare il bottone. */}
                <Button
                  label="Nuova azienda"
                  size="sm"
                  variant="secondary"
                  icon={<Plus size={16} />}
                  onClick={() => setModulo({ ...AZIENDA_VUOTA })}
                />
                {filtriAttivi > 0 ? (
                  <Button
                    label={`Togli i filtri (${filtriAttivi})`}
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      vaiA({ categoria: '', citta: '', campagna: '', sito: '', pagina: 1 })
                    }
                  />
                ) : null}
                {/* ⚠️ "Analizza le mancanti" NON SI CAPIVA (01/09/2026):
                    mancanti cosa? E si cliccava alla cieca, aspettando minuti
                    senza sapere se stesse lavorando su tre aziende o trenta.
                    Adesso dice il mestiere e il numero — e sparisce quando non
                    c'e' niente da analizzare, invece di restare li' a far
                    premere un bottone che non fa niente. */}
                {daAnalizzare > 0 ? (
                  <Button
                    label={`Controlla i siti mai visti (${daAnalizzare})`}
                    size="sm"
                    variant="ghost"
                    isLoading={analisiInCorso}
                    tooltip="Scarica il sito di ogni azienda senza punteggio e lo fa leggere all’AI. Ci vuole qualche secondo per azienda, 25 per volta."
                    clickAction={analizzaMancanti}
                  />
                ) : null}
                <Button
                  label="Esporta CSV"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    window.location.href = `/api/aziende/esporta${vista.stato !== 'tutti' ? `?stato=${vista.stato}` : ''}`;
                  }}
                />
              </HStack>

              {/* ── LE LINGUETTE DEI GRUPPI ──────────────────────────────────
                  ⚠️ PERCHE' NON UN ACCORDION, provato e buttato il 31/08/2026.
                  I gruppi erano richiudibili dentro la lista, ma la lista e'
                  PAGINATA: «dentisti» comincia a pagina 1 e finisce a pagina 2,
                  quindi chiudere il gruppo non toglieva di mezzo i dentisti di
                  la'. Un accordion ha senso su un elenco intero, non su una
                  finestra di venticinque righe.
                  Le linguette invece FILTRANO: una linguetta e' un gruppo, e si
                  porta dietro la sua paginazione. E i gruppi troppi — con la
                  categoria sono ventiquattro — finiscono nel menu «altro» che
                  TabList ha gia' dentro. */}
              {gruppo !== 'nessuno' && opzioniGruppo.length > 0 ? (
                <HStack gap={3} align="center" wrap="wrap">
                  {/* `lg` e la riga sotto: alla prima prova erano `md` e senza
                      divisore, e chi le usava non le ha viste — «ma ste tab
                      dove sono?». Un comando che sceglie cosa vedi non puo'
                      pesare meno di un'etichetta di campo. */}
                  <TabList
                    size="lg"
                    hasDivider
                    value={gruppoScelto}
                    onChange={(v) => vaiA({ [campoGruppo]: v === 'tutti' ? '' : v, pagina: 1 })}
                  >
                    <Tab value="tutti" label="Tutti" endContent={<Badge variant="neutral" label={String(quante)} />} />
                    {opzioniGruppo.map((o) => (
                      <Tab
                        key={o.valore}
                        value={o.valore}
                        label={titoloLeggibile(o.etichetta)}
                        endContent={<Badge variant="neutral" label={String(o.quanti)} />}
                      />
                    ))}
                  </TabList>

                  {/* Si cancella il gruppo APERTO, mai «tutti»: buttare l'intero
                      elenco non e' un gesto che deve stare a un click da qui. */}
                  {gruppoScelto !== 'tutti' ? (
                    <Button
                      label="Elimina il gruppo"
                      size="sm"
                      variant="destructive"
                      icon={<Trash2 size={16} />}
                      onClick={() => {
                        const scelto = opzioniGruppo.find((o) => o.valore === gruppoScelto);
                        if (scelto)
                          setGruppoDaButtare({
                            campo: campoGruppo,
                            valore: scelto.valore,
                            etichetta: titoloLeggibile(scelto.etichetta),
                            quante: scelto.quanti,
                          });
                      }}
                    />
                  ) : null}
                </HStack>
              ) : null}

              {/* La barra c'e' solo quando serve: una riga di comandi sempre
                  accesa su una lista che non hai ancora toccato e' rumore, e i
                  due bottoni pericolosi starebbero li' a portata di distrazione. */}
              {spuntate.size > 0 ? (
                <HStack gap={3} align="center" wrap="wrap">
                  <Badge variant="info" label={`${spuntate.size} scelte`} />
                  {/* «Archivia» PRIMA di «Elimina», ed e' voluto: nove volte su
                      dieci il rumore e' un'azienda vera che non serve adesso,
                      e archiviarla la toglie dai filtri senza perderla. */}
                  <Button label="Archivia" size="sm" clickAction={() => azioneSuSpuntate('archivia')} />
                  <Button
                    label="Elimina"
                    size="sm"
                    variant="destructive"
                    icon={<Trash2 size={16} />}
                    onClick={() => setConfermaBlocco(true)}
                  />
                  <Button label="Togli la selezione" size="sm" variant="ghost" onClick={() => setSpuntate(new Set())} />
                </HStack>
              ) : null}

              {messaggio ? (
                <Banner
                  status={messaggio.tipo}
                  title={messaggio.testo}
                  isDismissable
                  onDismiss={() => setMessaggio(null)}
                />
              ) : null}
            </VStack>

            {aziende.length === 0 ? (
              <EmptyState
                title="Nessuna azienda"
                description={
                  vista.q || filtriAttivi
                    ? 'Con questi filtri non c’è niente. Toglierne uno di solito basta.'
                    : 'Le aziende arrivano dalle campagne.'
                }
              />
            ) : (
              <VStack gap={0}>
                {gruppi.map((g) => (
                  <VStack key={g.titolo || 'tutto'} gap={0}>
                    {/* L'intestazione del gruppo è l'unica cosa che rompe il
                        flusso di righe, ed è esattamente il suo mestiere:
                        senza, i dentisti si leggono come la coda dei
                        ristoranti. */}
                    {/* L'intestazione serve solo quando si guardano TUTTI i
                        gruppi insieme: dentro una linguetta ripeterebbe il nome
                        che sta gia' scritto sopra. */}
                    {g.titolo && gruppoScelto === 'tutti' ? (
                      <>
                        <Divider />
                        <HStack gap={2} align="center" padding={3}>
                          <Text type="supporting">{titoloLeggibile(g.titolo)}</Text>
                          <Badge variant="neutral" label={String(g.righe.length)} />
                        </HStack>
                      </>
                    ) : null}
                    <List hasDividers density="compact">
                      {g.righe.map((a) => (
                        <ListItem
                          key={a.id}
                          label={a.nome}
                          description={descrizione(a)}
                          isSelected={a.id === selezionataId}
                          onClick={() => {
                            setSelezionataId(a.id);
                            setEsitoSeo(null);
                          }}
                          startContent={
                            <HStack gap={2} align="center">
                              {/* ⚠️ `stopPropagation`: la riga apre il dettaglio,
                                  la casella no. Senza, spuntare una riga la
                                  apriva anche — e chi ne spunta dieci di fila
                                  si ritrova il pannello che salta a ogni click. */}
                              <span onClick={(e) => e.stopPropagation()}>
                                <CheckboxInput
                                  label={`Scegli ${a.nome}`}
                                  isLabelHidden
                                  value={spuntate.has(a.id)}
                                  onChange={(dentro) => spunta(a.id, dentro)}
                                />
                              </span>
                              <StatusDot
                                variant={COLORE[a.stato] ?? 'neutral'}
                                label={ETICHETTA[a.stato] ?? a.stato}
                                tooltip={ETICHETTA[a.stato] ?? a.stato}
                              />
                            </HStack>
                          }
                          endContent={
                            <HStack gap={3} align="center">
                              {/* Badge solo sopra 80: se ce l'hanno tutte non
                                  dice niente. È il numero che decide chi si
                                  chiama per primo. */}
                              {/* ⚠️ VARIANTI SEMANTICHE, NON COLORI (31/08/2026).
                                  Erano `orange` e `red`, che in questo tema sono
                                  "categoriali": fondo pastello e testo scuro,
                                  pensati per etichettare, non per farsi notare.
                                  Su venticinque righe di fila sparivano tutti
                                  nello stesso beige. `warning` e `error` hanno
                                  il fondo pieno: il numero alto si vede da un
                                  metro, che e' il mestiere di questa colonna. */}
                              {a.score !== null && a.score >= 80 ? (
                                <Badge variant="warning" label={String(a.score)} />
                              ) : (
                                <Text color="secondary" hasTabularNumbers>
                                  {a.score === null ? '—' : a.score}
                                </Text>
                              )}
                              {a.recensioni ? (
                                <Text type="supporting" hasTabularNumbers>
                                  ★ {a.voto} · {a.recensioni}
                                </Text>
                              ) : null}
                              {eOccasione(a) ? (
                                <Badge
                                  variant="success"
                                  label="occasione"
                                />
                              ) : null}
                              {!a.sito ? <Badge variant="error" label="senza sito" /> : null}
                              <Text type="supporting">{a.telefono ?? ''}</Text>
                            </HStack>
                          }
                        />
                      ))}
                    </List>
                  </VStack>
                ))}
              </VStack>
            )}

            {totalePagine > 1 ? (
              <HStack gap={2} padding={3} align="center">
                <Button label="Indietro" size="sm" isDisabled={pagina <= 1} onClick={() => vaiA({ pagina: pagina - 1 })} />
                <Text type="supporting">
                  {(pagina - 1) * perPagina + 1}–{Math.min(pagina * perPagina, quante)} di {quante}
                </Text>
                <Button
                  label="Avanti"
                  size="sm"
                  isDisabled={pagina >= totalePagine}
                  onClick={() => vaiA({ pagina: pagina + 1 })}
                />
              </HStack>
            ) : null}
          </VStack>
        </LayoutContent>
      }
      end={
        <LayoutPanel width={380} hasDivider isScrollable label="Dettaglio azienda" padding={4}>
          {!selezionata ? (
            <EmptyState
              isCompact
              title="Nessuna azienda selezionata"
              description="Scegli una riga per chiamarla, scriverle o segnare com’è andata."
            />
          ) : (
            <VStack gap={5}>
              <VStack gap={1}>
                <Heading level={3}>{selezionata.nome}</Heading>
                <Text color="secondary">
                  {[selezionata.categoria, selezionata.citta].filter(Boolean).join(' · ')}
                </Text>
              </VStack>

              {/* Le azioni in cima: sono il motivo per cui si apre una riga.
                  Chi telefona non deve scorrere una scheda per trovare il numero. */}
              <HStack gap={2} wrap="wrap">
                <Button
                  label="Chiama"
                  variant="primary"
                  size="sm"
                  isDisabled={!selezionata.telefono}
                  tooltip={selezionata.telefono ?? 'Non ha un numero'}
                  onClick={() => {
                    window.location.href = `tel:${(selezionata.telefono ?? '').replace(/[^\d+]/g, '')}`;
                  }}
                />
                <Button
                  label="WhatsApp"
                  size="sm"
                  isDisabled={!selezionata.telefono_normalizzato || eFisso(selezionata.telefono_normalizzato)}
                  tooltip={
                    eFisso(selezionata.telefono_normalizzato)
                      ? 'È un numero fisso: su WhatsApp non c’è.'
                      : !selezionata.telefono_normalizzato
                        ? 'Non ha un numero.'
                        : undefined
                  }
                  onClick={() => window.open(`https://wa.me/${selezionata.telefono_normalizzato}`, '_blank')}
                />
                {/* L'email la raccoglie l'audit dal sito: se c'e', e' un modo di
                    scrivergli che prima non compariva da nessuna parte. */}
                <Button
                  label="Email"
                  size="sm"
                  isDisabled={!selezionata.email}
                  tooltip={selezionata.email ?? 'Nessun indirizzo: lo trova «Analizza il sito», se è scritto sul loro sito.'}
                  onClick={() => {
                    window.location.href = `mailto:${selezionata.email}`;
                  }}
                />
                <Button
                  label="Maps"
                  size="sm"
                  variant="ghost"
                  isDisabled={!selezionata.maps_url}
                  onClick={() => window.open(selezionata.maps_url ?? '', '_blank')}
                />
                <Button
                  label="Sito"
                  size="sm"
                  variant="ghost"
                  isDisabled={!selezionata.sito}
                  onClick={() => window.open(`https://${selezionata.sito}`, '_blank')}
                />
                <Button
                  label="Modifica"
                  size="sm"
                  variant="ghost"
                  icon={<Pencil size={16} />}
                  clickAction={() => apriModifica(selezionata.id)}
                />
                {/* «Elimina» accanto a «Modifica» e non nascosto in fondo: il
                    server rifiuta comunque tutto quello che ha del lavoro
                    dentro, e dice perché. Il bottone pericoloso non è questo. */}
                <Button
                  label="Elimina"
                  size="sm"
                  variant="destructive"
                  icon={<Trash2 size={16} />}
                  clickAction={() => elimina(selezionata.id, selezionata.nome)}
                />
              </HStack>

              <VStack gap={2}>
                <Text type="supporting">Com’è andata</Text>
                <HStack gap={2} wrap="wrap" align="center">
                  {STATI.map((s) =>
                    s === 'contattato' ? (
                      // «Contattate» non è un semplice tag: è un fatto che
                      // succede su un canale preciso, in un momento preciso.
                      // Un click secco perdeva entrambi — vedi lo schema del
                      // 02/09/2026. Il menu chiede il canale UNA volta, non
                      // ogni volta: ricliccare senza scegliere terrebbe quello
                      // dell'ultima volta.
                      <DropdownMenu
                        key={s}
                        button={{
                          label: ETICHETTA[s],
                          size: 'sm',
                          variant: selezionata.stato === s ? 'primary' : 'ghost',
                        }}
                        items={CANALI_CONTATTO.map((c) => ({
                          label: c.etichetta,
                          onClick: () => cambiaStato(selezionata.id, s, c.valore),
                        }))}
                      />
                    ) : (
                      <Button
                        key={s}
                        label={ETICHETTA[s]}
                        size="sm"
                        variant={selezionata.stato === s ? 'primary' : 'ghost'}
                        clickAction={() => cambiaStato(selezionata.id, s)}
                      />
                    )
                  )}
                </HStack>
                {/* Non solo quando stato==='contattato': anche un'azienda già
                    passata a «In trattativa» o «Cliente» resta comunque
                    qualcuno a cui abbiamo scritto — il canale non deve
                    sparire quando lo stato avanza. */}
                {selezionata.ultimo_contatto_at ? (
                  <Badge
                    variant="neutral"
                    label={`${ETICHETTA_CANALE[selezionata.ultimo_contatto_canale ?? ''] ?? selezionata.ultimo_contatto_canale} · contattata il ${soloData(selezionata.ultimo_contatto_at)}`}
                  />
                ) : null}
              </VStack>

              <TabList value={dettaglio} onChange={setDettaglio} hasDivider>
                <Tab value="gancio" label="Come aprire" />
                <Tab value="dati" label="Dati" />
              </TabList>

              {dettaglio === 'gancio' && selezionata.audit_errore && !selezionata.audit_hook ? (
                <Banner status="warning" title="L’ultimo audit non è riuscito" description={selezionata.audit_errore} />
              ) : null}

              {dettaglio === 'gancio' ? (
              selezionata.audit_hook ? (
                <VStack gap={2}>
                  <HStack gap={2} align="center">
                    <Text type="supporting">Come aprire il discorso</Text>
                    {/* «urgenza» e non il numero nudo: quel punteggio dice quanto
                        SERVE un sito nuovo, non quanto è bello quello che c'è.
                        95 = non ce l'ha, 40 = sta già bene. Letto senza
                        l'etichetta sembra una pagella, e un 40 su un sito sano
                        si legge come una bocciatura — è successo il 31/08/2026,
                        e a leggerlo male siamo stati in due. Verde sotto 50:
                        poco urgente non è un problema, è una buona notizia. */}
                    {selezionata.score !== null ? (
                      <Badge
                        variant={selezionata.score >= 80 ? 'warning' : selezionata.score >= 50 ? 'info' : 'success'}
                        label={`urgenza ${selezionata.score}/100`}
                      />
                    ) : null}
                  </HStack>
                  <TextArea
                    label="Gancio"
                    isLabelHidden
                    rows={4}
                    value={selezionata.audit_hook}
                    isDisabled
                    disabledMessage="Si riscrive rianalizzando il sito."
                  />
                  <HStack gap={2}>
                    <Button
                      label={copiato ? 'Copiato' : 'Copia il gancio'}
                      size="sm"
                      variant={copiato ? 'ghost' : 'secondary'}
                      onClick={() => copiaGancio(selezionata.audit_hook ?? '')}
                    />
                    <Button label="Rianalizza" size="sm" variant="ghost" clickAction={() => analizza(selezionata.id)} />
                  </HStack>
                </VStack>
              ) : (
                <Button
                  label="Analizza il sito"
                  variant="secondary"
                  size="sm"
                  clickAction={() => analizza(selezionata.id)}
                />
              )
              ) : null}

              {/* I FATTI E L'OPINIONE, SEPARATI E DETTI PER NOME.
                  Fino al 31/08/2026 qui sotto «Cosa si è visto» compariva la
                  prosa del modello: su un sito nostro, responsive, ne è uscito
                  «non ottimizzato per i dispositivi recenti» mentre la
                  scansione registrava viewport PRESENTE. Chi legge un gancio al
                  telefono deve sapere quale delle due frasi può difendere. */}
              {dettaglio === 'gancio' && selezionata.audit_scansione ? (
                <VStack gap={1}>
                  <Text type="supporting">Cosa si è visto</Text>
                  <Text>{selezionata.audit_scansione}</Text>
                </VStack>
              ) : null}

              {dettaglio === 'gancio' && selezionata.audit_note ? (
                <VStack gap={1}>
                  <Text type="supporting">
                    Come la legge il modello{selezionata.audit_modello ? ` (${selezionata.audit_modello})` : ''}
                  </Text>
                  <Text color="secondary">{selezionata.audit_note}</Text>
                </VStack>
              ) : null}

              {dettaglio === 'dati' ? (
              <VStack gap={3}>
              <MetadataList>
                <MetadataListItem label="Telefono">{selezionata.telefono ?? '—'}</MetadataListItem>
                <MetadataListItem label="Email">{selezionata.email ?? '—'}</MetadataListItem>
                <MetadataListItem label="Sito">{selezionata.sito ?? 'nessuno'}</MetadataListItem>
                {selezionata.campagna ? (
                  <MetadataListItem label="Da campagna">{selezionata.campagna}</MetadataListItem>
                ) : null}
                {selezionata.audit_quando ? (
                  <MetadataListItem label="Ultimo audit">{soloData(selezionata.audit_quando)}</MetadataListItem>
                ) : null}
              </MetadataList>

              <Divider />

              {/* L'audit SEO/GEO/AEO automatico: clona il repo, legge Search
                  Console, apre una PR. Compare solo se c'è un repo da
                  clonare — senza, il bottone cliccato darebbe solo un errore
                  che dice "vai su Modifica prima". */}
              <VStack gap={2}>
                <Text type="supporting">Audit SEO/GEO/AEO</Text>
                {selezionata.sito_repo_url ? (
                  <VStack gap={2}>
                    <MetadataList>
                      <MetadataListItem label="Repository">{selezionata.sito_repo_url}</MetadataListItem>
                      {selezionata.sito_gsc_proprieta ? (
                        <MetadataListItem label="Search Console">{selezionata.sito_gsc_proprieta}</MetadataListItem>
                      ) : null}
                      {selezionata.sito_ultimo_audit_at ? (
                        <MetadataListItem label="Ultimo giro">
                          {soloData(selezionata.sito_ultimo_audit_at)}
                        </MetadataListItem>
                      ) : null}
                      {selezionata.sito_ultima_pr_url ? (
                        <MetadataListItem label="Ultima PR aperta">
                          <Link href={selezionata.sito_ultima_pr_url} isExternalLink isStandalone>
                            {selezionata.sito_ultima_pr_url}
                          </Link>
                        </MetadataListItem>
                      ) : null}
                    </MetadataList>

                    {selezionata.sito_ultimo_errore ? (
                      <Banner
                        status="error"
                        title="L’ultimo giro non è riuscito"
                        description={selezionata.sito_ultimo_errore}
                      />
                    ) : null}

                    <Button
                      label="Analizza SEO"
                      size="sm"
                      isLoading={seoInCorso}
                      clickAction={() => analizzaSeo(selezionata.id)}
                    />

                    {esitoSeo ? (
                      <Banner
                        status={esitoSeo.pr_url ? 'success' : 'info'}
                        title={esitoSeo.pr_url ? 'PR aperta' : 'Nessuna modifica da proporre'}
                        description={esitoSeo.riepilogo}
                      >
                        {esitoSeo.pr_url ? (
                          <Link href={esitoSeo.pr_url} isExternalLink isStandalone>
                            {esitoSeo.pr_url}
                          </Link>
                        ) : null}
                      </Banner>
                    ) : null}
                  </VStack>
                ) : (
                  <Text type="supporting" color="secondary">
                    Manca il repository del sito — aggiungilo da «Modifica» per abilitare l’audit automatico.
                  </Text>
                )}
              </VStack>
              </VStack>
              ) : null}

              <Button
                label="Apri la scheda del cliente"
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/aziende/${selezionata.id}`)}
              />
            </VStack>
          )}
        </LayoutPanel>
      }
      />

      {/* Montato solo da aperto, e questo NON è un dettaglio: il modulo tiene i
          campi in `useState`, che si inizializza al primo montaggio. Tenendolo
          sempre montato, la seconda azienda che apri ti mostrerebbe i dati
          della prima. Smontarlo e rimontarlo è il modo più economico per non
          doverli risincronizzare a mano a ogni apertura. */}
      {/* La domanda dice il NUMERO e il nome del gruppo: «sei sicuro?» senza
          dire di cosa si risponde sempre di sì. E dice anche la cosa che
          rassicura: i clienti e chi ha del lavoro dentro non si toccano. */}
      {confermaBlocco ? (
        <AlertDialog
          isOpen
          onOpenChange={(aperto) => (aperto ? null : setConfermaBlocco(false))}
          title={`Cancellare ${spuntate.size} aziende?`}
          description="Restano i clienti, chi è in trattativa e chiunque abbia bozze, servizi o messaggi: quelle te le dico per nome. Se vuoi solo toglierle di mezzo, «Archivia» le conserva."
          actionLabel="Cancella"
          cancelLabel="Lascia stare"
          onAction={() => azioneSuSpuntate('elimina')}
        />
      ) : null}

      {gruppoDaButtare ? (
        <AlertDialog
          isOpen
          onOpenChange={(aperto) => (aperto ? null : setGruppoDaButtare(null))}
          title={`Cancellare ${gruppoDaButtare.quante} aziende?`}
          description={`Tutte quelle di «${gruppoDaButtare.etichetta}». Restano i clienti, chi è in trattativa e chiunque abbia bozze, servizi o messaggi: quelle te le dico dopo, una per nome.`}
          actionLabel="Cancella il gruppo"
          cancelLabel="Lascia stare"
          onAction={() => eliminaGruppo(gruppoDaButtare.campo, gruppoDaButtare.valore)}
        />
      ) : null}

      {modulo ? (
        <ModuloAzienda
          aperto
          azienda={modulo}
          onChiudi={() => setModulo(null)}
          onSalvata={(id, giaEsisteva) => {
            setMessaggio(
              giaEsisteva
                ? {
                    tipo: 'info',
                    testo:
                      'Quel Place ID era già in tabella: ho aperto quella che c’era invece di crearne una seconda.',
                  }
                : { tipo: 'success', testo: 'Salvata.' }
            );
            setSelezionataId(id);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
