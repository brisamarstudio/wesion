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
import { useRouter } from 'next/navigation';
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

/** L'a capo, come costante: dentro un join scritto a mano si rompe. */
const SEP = String.fromCharCode(10);

/** Da testo a righe e viceversa: nel form le liste sono textarea. */
const aRighe = (v: string[]): string => v.join('\n');
const daRighe = (v: string): string[] => v.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);

export function SchedaCliente({ scheda: iniziale }: { scheda: Scheda }) {
  const router = useRouter();
  const [s, setS] = useState<Scheda>(iniziale);
  const [messaggio, setMessaggio] = useState<{ tipo: 'success' | 'error' | 'info'; testo: string } | null>(null);
  const [salvato, setSalvato] = useState(true);
  /** Le schede lette da Google, quando qualcuno le chiede. */
  const [schede, setSchede] = useState<Array<{ accountId: string; locationId: string; titolo: string }> | null>(null);
  /** Il materiale incollato a mano: didascalie, appunti, la telefonata. */
  const [incollato, setIncollato] = useState('');
  /** Cosa ha capito l'analisi. NON e' ancora salvato: si guarda e si accetta. */
  const [proposta, setProposta] = useState<{
    voce: Record<string, unknown>;
    fatti: { cosa_fa: string; offerta: string[]; materiali: string[] };
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
    }));

    setProposta(null);
    setMessaggio({ tipo: 'success', testo: 'Portato nei campi. Correggi quello che non torna, poi salva.' });
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
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack gap={3} align="center">
            <Heading level={2}>{s.nome}</Heading>
            <StatusDot variant={s.stato === 'cliente' ? 'success' : 'neutral'} label={s.stato} />
            <Text color="secondary">{s.citta ?? ''}</Text>
            {!salvato ? <Badge variant="warning" label="non salvata" /> : null}
          </HStack>
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

            {mancanze.length > 0 ? (
              <Banner
                status="warning"
                title="Questo cliente non è ancora pronto"
                description="Finché manca qualcosa qui sotto, il piano esce povero o non esce."
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

            {/* ── 1. Chi è ───────────────────────────────────────────────── */}
            <VStack gap={3}>
              <VStack gap={1}>
                <Heading level={3}>Chi è</Heading>
                <Text type="supporting">
                  Il settore sceglie quali temi e quali ricorrenze hanno senso. Esplicito e non dedotto dalla
                  categoria di Google: indovinarlo da «Da Andrea» vuol dire sbagliarlo su tutto il mese.
                </Text>
              </VStack>
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
            </VStack>

            {/* ── 2. Come parla ──────────────────────────────────────────── */}
            <VStack gap={3}>
              <VStack gap={1}>
                <Heading level={3}>Come parla</Heading>
                <Text type="supporting">
                  Senza questo i testi escono corretti e intercambiabili: il generatore ricade sul registro da
                  agenzia, ed è il difetto che si nota anche quando non è un errore.
                </Text>
              </VStack>
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
                  description="Didascalie dei social, appunti di una telefonata, un messaggio che ti ha scritto. È la fonte migliore dopo le recensioni, perché sono parole sue."
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
                description="Dalle recensioni: è materiale verificato da terzi, quindi si può usare senza chiedere conferma. Una voce per riga."
                rows={3}
                value={aRighe(s.voce.apprezzato)}
                onChange={(v) => {
                  setSalvato(false);
                  setS((x) => ({ ...x, voce: { ...x.voce, apprezzato: daRighe(v) } }));
                }}
              />
              <TextArea
                label="Confini — cosa NON fa"
                description="«niente surgelati», «niente truciolato». Valgono su Google come sul sito. Una voce per riga."
                rows={3}
                value={aRighe(s.voce.non_fa)}
                onChange={(v) => {
                  setSalvato(false);
                  setS((x) => ({ ...x, voce: { ...x.voce, non_fa: daRighe(v) } }));
                }}
              />
              <TextArea
                label="Da non dire mai"
                description="Frasi che il cliente non vuole sentirsi attribuire, finché non le conferma lui. Una per riga."
                rows={3}
                value={aRighe(s.voce.mai_dire)}
                onChange={(v) => {
                  setSalvato(false);
                  setS((x) => ({ ...x, voce: { ...x.voce, mai_dire: daRighe(v) } }));
                }}
              />
            </VStack>

            {/* ── 3. Cosa è vero ─────────────────────────────────────────── */}
            <VStack gap={3}>
              <VStack gap={1}>
                <Heading level={3}>Cosa è vero</Heading>
                <Text type="supporting">
                  I fatti sono l’unica cosa che un post può affermare, ed è ciò che rende la revisione «è vero?»
                  invece di «è bello?». Togliere una riga non la cancella: la spegne, così i post già pubblicati
                  sanno ancora su cosa si reggevano.
                </Text>
              </VStack>
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

            {/* ── 4. Cosa gli facciamo ───────────────────────────────────── */}
            <VStack gap={3}>
              <VStack gap={1}>
                <Heading level={3}>Cosa gli facciamo</Heading>
                <Text type="supporting">
                  Senza una riga qui il router non pubblica niente, nemmeno se il titolare manda la foto.
                </Text>
              </VStack>

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
                      description="È per-cliente: non può stare in un .env comune."
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
                    <TextInput
                      label="URL a cui mandare gli articoli"
                      description="Un endpoint sul sito del cliente. Il sito scrive sul proprio database: noi non abbiamo le sue credenziali, e non dobbiamo averle."
                      placeholder="https://ilcliente.it/api/blog"
                      value={config('blog').site_blog_url ?? ''}
                      onChange={(v) => cambiaServizio('blog', { site_blog_url: v })}
                    />
                    <TextInput
                      label="Segreto del blog"
                      description="Diverso da quello del menù, apposta: chi può cambiare venti righe di menù non deve poter pubblicare articoli indicizzabili."
                      value={config('blog').site_blog_secret ?? ''}
                      onChange={(v) => cambiaServizio('blog', { site_blog_secret: v })}
                    />
                    <TextInput
                      label="Pagina del blog"
                      placeholder="https://ilcliente.it/blog"
                      value={config('blog').site_blog_page ?? ''}
                      onChange={(v) => cambiaServizio('blog', { site_blog_page: v })}
                    />
                    <TextInput
                      label="Categorie"
                      description="Separate da virgola. Il generatore sceglie fra queste invece di inventarne una nuova a ogni articolo: un blog con quindici categorie da un pezzo ciascuna non raggruppa niente."
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
                  <Text type="supporting">
                    Nessuno. Si abilita con <code>npm run cliente -- --azienda {s.slug} --titolare &quot;+39…&quot;</code>
                  </Text>
                )}
              </VStack>
            </VStack>

            {/* ── 5. Il mese ─────────────────────────────────────────────── */}
            <VStack gap={3}>
              <VStack gap={1}>
                <Heading level={3}>Il mese</Heading>
                <Text type="supporting">
                  Prima si costruisce il piano — che è aritmetica su un calendario e non costa niente — poi si
                  guarda, e solo dopo si spendono le generazioni. Se il piano è sbagliato lo vedi in dieci secondi;
                  accorgertene leggendo diciotto testi costa molto di più.
                </Text>
              </VStack>
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
                <Button
                  label="Analizza il sito"
                  clickAction={() => chiama(`/api/aziende/${s.id}/audit`, 'Analizzo')}
                />
              </HStack>
            </VStack>

            <HStack gap={2}>
              <Button label="Salva la scheda" variant="primary" clickAction={salva} isDisabled={salvato} />
              <Button label="Torna all’elenco" variant="ghost" onClick={() => router.push('/aziende')} />
            </HStack>
          </VStack>
        </LayoutContent>
      }
    />
  );
}
