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
import { quandoBreve, scadenza, perCampoLocale } from '@/lib/quando';
import { AZIONI_BOTTONE, VUOLE_URL, type AzioneBottone } from '@/lib/gbp';
import { useAdesso } from './useAdesso';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { ModaleNuovoPost } from './ModaleNuovoPost';
import { Plus } from 'lucide-react';

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

export function ConsolleBozze({ bozze }: { bozze: Bozza[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // L'ora arriva dopo il montaggio: prima non si sa, e va bene cosi'.
  const adesso = useAdesso();
  const [filtro, setFiltro] = useState('da_decidere');
  /**
   * Si parte SENZA cliente scelto, non da «tutti».
   *
   * L'elenco unico di tre clienti mescolati e' illeggibile proprio quando
   * serve: si decide un cliente per volta, guardando le sue date di fila. Con
   * «tutti» di serie, la prima cosa che vedi e' la coda di qualcun altro.
   * «Tutti i clienti» resta come scelta, non come punto di partenza.
   */
  const [cliente, setCliente] = useState('');
  const [cerca, setCerca] = useState('');
  const [selezionataId, setSelezionataId] = useState<number | null>(null);
  /** Le correzioni in corso, per id: si perdono cambiando riga, apposta. */
  const [correzioni, setCorrezioni] = useState<Record<number, string>>({});
  const [errore, setErrore] = useState<string | null>(null);
  /** Vero mentre la foto sale: il media server ci mette qualche secondo. */
  const [caricando, setCaricando] = useState(false);
  const [apertoModaleNuovo, setApertoModaleNuovo] = useState(false);
  /** La conferma della cancellazione: un bottone che ha solo il sì non è una decisione. */
  const [daCancellare, setDaCancellare] = useState(false);
  const [inScrittura, setInScrittura] = useState(false);

  useEffect(() => {
    if (searchParams?.get('nuovo') === '1') {
      setApertoModaleNuovo(true);
    }
  }, [searchParams]);

  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return bozze.filter((b) => {
      if (!cliente) return false;
      if (cliente !== 'tutti' && String(b.azienda_id) !== cliente) return false;
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
      setErrore(esito?.errore ?? 'Non è andata, e non si sa perché.');
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
      setErrore(esito?.errore ?? 'Non è andata, e non si sa perché.');
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
      setErrore(esito?.errore ?? 'Non è andata, e non si sa perché.');
      router.refresh();
      return;
    }
    setDaCancellare(false);
    setSelezionataId(null);
    router.refresh();
  }

  async function decidi(azione: 'approva' | 'rifiuta') {
    if (!selezionata) return;
    setErrore(null);
    const risposta = await fetch(`/api/bozze/${selezionata.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        azione,
        // Il testo si manda solo se e' stato davvero toccato: cosi' una
        // riapprovazione non riscrive `contenuto` con quello che c'era gia'.
        ...(modificato ? { testo: testoCorrente } : {}),
      }),
    });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      setErrore(esito?.errore ?? 'Non è andata, e non si sa perché.');
      router.refresh();
      return;
    }
    setCorrezioni((c) => {
      const { [selezionata.id]: _tolta, ...resto } = c;
      return resto;
    });
    router.refresh();
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
            <Heading level={2}>Bozze</Heading>
            <Text color="secondary">
              {daDecidere === 0 ? 'niente da decidere' : `${daDecidere} da decidere`}
            </Text>
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
                  label="+ CREA POST SINGOLO AL VOLO"
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
                    { value: '', label: 'Scegli un cliente…' },
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

            {!cliente && clienti.length > 1 ? (
              <EmptyState
                title="Scegli un cliente"
                description="Le bozze si decidono un cliente per volta: le date hanno senso in fila, e la coda di uno non c’entra con quella di un altro."
              />
            ) : filtrate.length === 0 ? (
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
                      description={
                        [b.azienda, ETICHETTA_TIPO[b.tipo] ?? b.tipo, ETICHETTA_ORIGINE[b.origine] ?? b.origine]
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
      end={
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
              {DECIDIBILI.has(selezionata.stato) && !scade?.scaduta ? (
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

                    ⚠️ Un <input> nativo, come il <div> della barra dei bottoni
                    e per lo stesso motivo: Astryx non ha NESSUN componente per
                    scegliere una data — c’e’ solo `Timestamp`, di sola
                    lettura, e `TextInput` accetta type text, password ed email.
                    `datetime-local` da’ il calendario del sistema operativo,
                    gia’ in italiano, senza librerie.

                    Il fuso lo raddrizza `istanteRoma` sul server: qui l’ora e’
                    SEMPRE quella italiana, sia letta sia scritta, o un post si
                    sposterebbe di un’ora ogni volta che lo si apre e salva. */}
                <MetadataListItem label="Esce il">
                  {DECIDIBILI.has(selezionata.stato) ? (
                    <input
                      type="datetime-local"
                      aria-label="Quando esce"
                      defaultValue={perCampoLocale(selezionata.pubblica_at)}
                      onChange={(e) => void cambiaQuando(e.currentTarget.value)}
                      style={{
                        background: 'var(--color-background-surface)',
                        color: 'var(--color-text-primary)',
                        border: '1px solid var(--color-border-default)',
                        borderRadius: 'var(--radius-sm)',
                        padding: 'var(--spacing-1) var(--spacing-2)',
                        font: 'inherit',
                      }}
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
                <MetadataListItem label="Modello">{selezionata.modello ?? '—'}</MetadataListItem>
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
      onChiudi={() => setApertoModaleNuovo(false)}
      onCreato={() => router.refresh()}
    />
    </>
  );
}
