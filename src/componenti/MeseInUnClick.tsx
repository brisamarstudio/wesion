'use client';

/**
 * «Il mese» — una card per cliente, un click per prepararlo, uno per approvarlo.
 *
 * ⚠️ PERCHE' (02/11/2026): «io vorrei che con un CLICK una volta letto il piano
 * editoriale del mese e approvato non ci penso più». La pagina di prima
 * (PianoEditoriale, ora «strumento avanzato») faceva vedere giorni e temi e poi
 * lasciava l'operatore da solo: bozze vuote, testi da scrivere, immagini da
 * caricare, diciotto approvazioni. Qui ogni card dice a che punto e' il mese di
 * quel cliente e qual e' l'UNICO bottone da premere adesso. La logica sta in
 * src/lib/mese.ts.
 *
 * Due livelli, come «Da chiamare»: le card per scegliere, il mese intero per
 * leggerlo e approvarlo.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { FileInput } from '@astryxdesign/core/FileInput';
import { FotoVere } from './FotoVere';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { AZIONI_BOTTONE, VUOLE_URL, type AzioneBottone } from '@/lib/gbp';
import { Link } from '@astryxdesign/core/Link';
import { ArrowLeft, ArrowRight, Check, RefreshCw, Send, Sparkles, X } from 'lucide-react';
import type { StatoMese, VoceMese, FaseMese, DoveEsce } from '@/lib/mese';
import { giornoRoma } from '@/lib/quando';

export interface ClienteMese {
  id: number;
  nome: string;
  stato: StatoMese;
}

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

const FASE: Record<FaseMese, { parola: string; colore: 'success' | 'warning' | 'neutral' | 'accent' | 'error' }> = {
  non_configurato: { parola: 'Non collegato', colore: 'error' },
  da_preparare: { parola: 'Da preparare', colore: 'neutral' },
  in_preparazione: { parola: 'A metà', colore: 'warning' },
  da_approvare: { parola: 'Da leggere e approvare', colore: 'accent' },
  approvato: { parola: 'Approvato, esce da solo', colore: 'success' },
};

function giorno(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Rome',
  });
}

function n(x: number, uno: string, tanti: string): string {
  return `${x} ${x === 1 ? uno : tanti}`;
}

/** La frase della card: cosa c'e' e cosa fare, in italiano. */
function fraseStato(s: StatoMese, nomeMese: string): string {
  switch (s.fase) {
    case 'non_configurato':
      return 'Né la scheda Google né il blog sono collegati: non c’è dove pubblicare. Si sistema dalla scheda del cliente, in «Servizi».';
    case 'da_preparare':
      if (s.fatti === 0) {
        return 'Di questo cliente non sappiamo ancora niente: senza fatti veri i post sarebbero inventati. Riempi «Cosa è vero» nella sua scheda, poi torna qui.';
      }
      return `${nomeMese[0].toUpperCase()}${nomeMese.slice(1)} non è ancora pronto. Un click prepara tutto: giorni, testi e immagini${s.blogPronto ? ', più gli articoli del sito' : ''}. Ci vogliono un paio di minuti.`;
    case 'in_preparazione':
      if (!s.vuote && s.senzaFoto && s.pcAcceso) {
        return `Testi pronti. Le ${n(s.senzaFoto, 'immagine', 'immagini')} le sta facendo il tuo PC con ComfyUI: ricarica fra qualche minuto.`;
      }
      return `Preparazione a metà: ${s.vuote ? `${n(s.vuote, 'testo', 'testi')} da scrivere` : ''}${s.vuote && s.senzaFoto ? ', ' : ''}${s.senzaFoto ? `${n(s.senzaFoto, 'immagine', 'immagini')} da fare` : ''}. Riprende da dove si era fermata.`;
    case 'da_approvare':
      return `Pronto: ${n(s.post, 'post Google', 'post Google')}${s.articoli ? ` e ${n(s.articoli, 'articolo', 'articoli')} del sito` : ''}. Leggilo e approvalo con un click.`;
    case 'approvato':
      return `Approvato: esce da solo. ${s.uscite ? `${n(s.uscite, 'già uscito', 'già usciti')}` : 'Non è ancora uscito niente'}${s.prossima ? `, il prossimo ${giorno(s.prossima)}` : ''}.`;
  }
}

export function MeseInUnClick({
  clienti,
  anno,
  mese,
  mesiScelta,
  clienteAperto,
}: {
  clienti: ClienteMese[];
  anno: number;
  mese: number;
  /** I due mesi che si possono scegliere: questo e il prossimo. */
  mesiScelta: Array<{ valore: string; etichetta: string }>;
  clienteAperto: number | null;
}) {
  const router = useRouter();
  const nomeMese = MESI[mese - 1];
  const [lavoro, setLavoro] = useState<Record<number, string>>({});
  const [errore, setErrore] = useState<string | null>(null);

  const vai = (p: Record<string, string | number | null>) => {
    const q = new URLSearchParams({ mese: `${anno}-${String(mese).padStart(2, '0')}` });
    for (const [k, v] of Object.entries(p)) {
      if (v === null) q.delete(k);
      else q.set(k, String(v));
    }
    router.push(`/piano?${q}`);
  };

  /** Prepara un cliente: richiama il passo finche' non ha finito o non si blocca. */
  const prepara = useCallback(
    async (id: number) => {
      setErrore(null);
      for (let giro = 0; giro < 80; giro++) {
        const r = await fetch(`/api/aziende/${id}/mese/prepara`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ anno, mese }),
        });
        const esito = await r.json().catch(() => ({}));
        if (!r.ok) {
          setErrore(esito?.errore ?? 'La preparazione si è fermata.');
          break;
        }
        const s: StatoMese = esito.stato;
        setLavoro((w) => ({
          ...w,
          [id]: `${esito.fatto[0]?.toUpperCase() ?? ''}${esito.fatto.slice(1)}.${s?.totale ? ` Testi ${s.conTesto} su ${s.totale}, immagini ${s.conFoto} su ${s.totale}.` : ''}`,
        }));
        if (esito.errori?.length && !esito.avanzati) {
          setErrore(esito.errori.join(' · '));
          break;
        }
        if (esito.finito) break;
      }
      setLavoro((w) => {
        const { [id]: _, ...resto } = w;
        return resto;
      });
      router.refresh();
    },
    [anno, mese, router]
  );

  async function preparaTutti() {
    for (const c of clienti) {
      if ((c.stato.fase === 'da_preparare' && c.stato.fatti > 0) || c.stato.fase === 'in_preparazione') await prepara(c.id);
    }
  }

  const aperto = clienteAperto ? clienti.find((c) => c.id === clienteAperto) ?? null : null;
  if (aperto) {
    return (
      <LetturaMese
        cliente={aperto}
        anno={anno}
        mese={mese}
        onIndietro={() => vai({ cliente: null })}
        onPrepara={() => prepara(aperto.id)}
        inLavoro={lavoro[aperto.id] ?? null}
      />
    );
  }

  const daPreparare = clienti.filter(
    (c) => (c.stato.fase === 'da_preparare' && c.stato.fatti > 0) || c.stato.fase === 'in_preparazione'
  );
  const daApprovare = clienti.filter((c) => c.stato.fase === 'da_approvare');

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack justify="between" align="center" wrap="wrap" gap={3}>
            <VStack gap={0.5}>
              <HStack gap={3} align="center" wrap="wrap">
                <Heading level={2}>Il mese</Heading>
                <SegmentedControl
                  label="Mese"
                  size="sm"
                  value={`${anno}-${String(mese).padStart(2, '0')}`}
                  onChange={(v) => router.push(`/piano?mese=${v}`)}
                >
                  {mesiScelta.map((m) => (
                    <SegmentedControlItem key={m.valore} value={m.valore} label={m.etichetta} />
                  ))}
                </SegmentedControl>
              </HStack>
              <Text type="supporting" color="secondary">
                {daApprovare.length
                  ? `${n(daApprovare.length, 'cliente aspetta', 'clienti aspettano')} solo che tu legga e approvi.`
                  : daPreparare.length
                    ? `${n(daPreparare.length, 'cliente', 'clienti')} da preparare per ${nomeMese}.`
                    : `${nomeMese[0].toUpperCase()}${nomeMese.slice(1)} è a posto per tutti.`}
              </Text>
            </VStack>
            <HStack gap={2} align="center" wrap="wrap">
              <Button
                label="Strumento avanzato"
                size="sm"
                variant="ghost"
                tooltip="La griglia di prima: giorni e temi, quantità, social."
                onClick={() => router.push('/piano?vista=avanzata')}
              />
              {daPreparare.length > 1 ? (
                <Button
                  label={`Prepara tutti (${daPreparare.length})`}
                  size="sm"
                  variant="primary"
                  icon={<Sparkles size={15} />}
                  clickAction={preparaTutti}
                />
              ) : null}
            </HStack>
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={4}>
          <VStack gap={4}>
            {errore ? (
              <Banner status="error" title={errore} isDismissable onDismiss={() => setErrore(null)} />
            ) : null}
            {clienti.length === 0 ? (
              <EmptyState
                title="Nessun cliente"
                description="Il mese si prepara per chi è in stato «cliente». Promuovi un'azienda dalla sua scheda."
              />
            ) : (
              <Grid columns={{ minWidth: 320, max: 3, repeat: 'fill' }} gap={4}>
                {clienti.map((c) => {
                  const s = c.stato;
                  const f = FASE[s.fase];
                  const occupato = lavoro[c.id];
                  return (
                    <Card key={c.id} padding={0}>
                      <VStack gap={3} padding={4}>
                        <HStack gap={2} align="center">
                          <StatusDot variant={f.colore} label={f.parola} isPulsing={Boolean(occupato)} />
                          <Text type="supporting" weight="medium">
                            {occupato ? 'Sto preparando…' : f.parola}
                          </Text>
                        </HStack>
                        <Heading level={3}>{c.nome}</Heading>
                        <Text>{occupato ?? fraseStato(s, nomeMese)}</Text>
                        {occupato ? <ProgressBar label="Preparazione" isLabelHidden isIndeterminate /> : null}
                        {s.fatti > 0 && s.fatti < 4 && s.fase === 'da_preparare' ? (
                          <Text type="supporting" color="secondary">
                            ⚠️ Di questo cliente sappiamo poco ({n(s.fatti, 'fatto', 'fatti')}): i post rischiano di
                            ripetersi. Aggiungi qualcosa in «Cosa è vero».
                          </Text>
                        ) : null}
                        {s.bloccate ? (
                          <Text type="supporting" color="secondary">
                            {n(s.bloccate, 'uscita non è riuscita', 'uscite non sono riuscite')} dopo due prove: le
                            trovi nel mese, si sistemano a mano.
                          </Text>
                        ) : null}
                        {s.fase === 'da_approvare' && (s.gravi || s.passate) ? (
                          <Text type="supporting" color="secondary">
                            {s.gravi ? `${n(s.gravi, 'post ha', 'post hanno')} un avviso da guardare. ` : ''}
                            {s.passate ? `${n(s.passate, 'data è', 'date sono')} già ${s.passate === 1 ? 'passata' : 'passate'}.` : ''}
                          </Text>
                        ) : null}
                      </VStack>
                      <Divider />
                      <HStack justify="between" align="center" gap={3} padding={3}>
                        <Text type="supporting" color="secondary">
                          {[s.gbpPronto ? 'Google ✓' : 'Google —', s.blogPronto ? 'Sito ✓' : 'Sito —'].join(' · ')}
                        </Text>
                        {s.fase === 'non_configurato' || (s.fase === 'da_preparare' && s.fatti === 0) ? (
                          <Button label="Apri la scheda" size="sm" onClick={() => router.push(`/aziende/${c.id}`)} />
                        ) : occupato ? (
                          /* Mentre prepara si puo' gia' guardare: i testi
                             compaiono man mano, e un bottone che gira e basta
                             lasciava li' a chiedersi «e poi?». */
                          <Button
                            label="Guarda mentre prepara"
                            size="sm"
                            variant="secondary"
                            icon={<ArrowRight size={15} />}
                            onClick={() => vai({ cliente: c.id })}
                          />
                        ) : s.fase === 'da_preparare' || s.fase === 'in_preparazione' ? (
                          <Button
                            label={s.fase === 'da_preparare' ? `Prepara ${nomeMese}` : 'Continua'}
                            size="sm"
                            variant="primary"
                            icon={<Sparkles size={15} />}
                            isDisabled={Boolean(occupato)}
                            clickAction={() => prepara(c.id)}
                          />
                        ) : (
                          <Button
                            label={s.fase === 'da_approvare' ? 'Leggi e approva' : 'Rileggi'}
                            size="sm"
                            variant={s.fase === 'da_approvare' ? 'primary' : 'secondary'}
                            icon={<ArrowRight size={15} />}
                            onClick={() => vai({ cliente: c.id })}
                          />
                        )}
                      </HStack>
                    </Card>
                  );
                })}
              </Grid>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}

// ── Il mese di un cliente, da leggere ────────────────────────────────────────

function LetturaMese({
  cliente,
  anno,
  mese,
  onIndietro,
  onPrepara,
  inLavoro,
}: {
  cliente: ClienteMese;
  anno: number;
  mese: number;
  onIndietro: () => void;
  onPrepara: () => Promise<void>;
  inLavoro: string | null;
}) {
  const router = useRouter();
  const [voci, setVoci] = useState<VoceMese[] | null>(null);
  const [stato, setStato] = useState<StatoMese>(cliente.stato);
  const [messaggio, setMessaggio] = useState<{ tipo: 'success' | 'error' | 'info'; testo: string } | null>(null);
  const [inCorso, setInCorso] = useState<Record<number, boolean>>({});
  const [dove, setDove] = useState<DoveEsce | null>(null);
  /** «Pubblica adesso» chiede conferma col secondo click, non con un popup. */
  const [confermaSubito, setConfermaSubito] = useState<number | null>(null);
  const nomeMese = MESI[mese - 1];

  const carica = useCallback(async () => {
    const r = await fetch(`/api/aziende/${cliente.id}/mese?anno=${anno}&mese=${mese}`);
    const esito = await r.json().catch(() => ({}));
    if (r.ok) {
      setVoci(esito.voci);
      setStato(esito.stato);
      setDove(esito.dove ?? null);
    } else setMessaggio({ tipo: 'error', testo: esito?.errore ?? 'Non riesco a leggere il mese.' });
  }, [cliente.id, anno, mese]);

  useEffect(() => {
    carica();
  }, [carica, inLavoro]);

  async function approvaTutto() {
    setMessaggio(null);
    const r = await fetch(`/api/aziende/${cliente.id}/mese/approva`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anno, mese }),
    });
    const e = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMessaggio({ tipo: 'error', testo: e?.errore ?? 'Non è andata.' });
      return;
    }
    const fuori = [
      e.saltateGravi ? `${n(e.saltateGravi, 'resta fuori', 'restano fuori')} per un avviso da guardare` : '',
      e.saltatePassate ? `${n(e.saltatePassate, 'ha', 'hanno')} la data già passata` : '',
    ].filter(Boolean);
    setMessaggio({
      tipo: 'success',
      testo:
        `Fatto: ${n(e.approvate, 'uscita approvata', 'uscite approvate')}. Escono da sole, ognuna nel suo giorno.` +
        (fuori.length ? ` ${fuori.join(', ')}.` : ''),
    });
    await carica();
    router.refresh();
  }

  /** Il pulsante di un post, o di tutti i post del mese ancora da far uscire. */
  async function cambiaPulsante(ids: number[], cta: { tipo: string; url: string } | null) {
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/bozze/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ azione: 'nessuna', cta }),
        })
      )
    );
    await carica();
  }

  async function azione(v: VoceMese, cosa: 'togli' | 'immagine' | 'subito' | 'domani', file?: File) {
    setInCorso((x) => ({ ...x, [v.id]: true }));
    const patch = (corpo: object) =>
      fetch(`/api/bozze/${v.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
    let r: Response;
    if (cosa === 'togli') r = await patch({ azione: 'rifiuta' });
    // «Pubblica adesso» = approva con la data di ADESSO.
    // ⚠️ Non `null` come nelle Bozze (02/11/2026): il mese elenca i post per
    // data, e un post senza data spariva dalla lista appena pubblicato —
    // niente «uscito», niente link al post vero. Con l'ora di adesso il
    // router lo prende lo stesso al primo giro, e il post resta nel suo mese.
    else if (cosa === 'subito') {
      const ora = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Rome',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
        .format(new Date())
        .replace(' ', 'T');
      r = await patch({ azione: 'approva', pubblica_at: ora });
    }
    // Una data passata: domani alle 10, ora di Roma (il fuso lo mette il server).
    else if (cosa === 'domani') {
      const domani = giornoRoma(new Date(Date.now() + 86_400_000));
      r = await patch({ pubblica_at: `${domani}T10:00` });
    } else if (file) {
      const modulo = new FormData();
      modulo.append('file', file);
      r = await fetch(`/api/bozze/${v.id}/immagine`, { method: 'POST', body: modulo });
    } else r = await fetch(`/api/bozze/${v.id}/immagine-ai`, { method: 'POST' });
    const e = await r.json().catch(() => ({}));
    if (!r.ok) setMessaggio({ tipo: 'error', testo: e?.errore ?? 'Non è andata.' });
    else if (cosa === 'subito') {
      setMessaggio({ tipo: 'success', testo: 'Approvato senza data: il router lo pubblica al prossimo giro, entro un minuto.' });
    }
    setInCorso((x) => ({ ...x, [v.id]: false }));
    setConfermaSubito(null);
    await carica();
  }

  const approvabili = (voci ?? []).filter(
    (v) => v.stato === 'attesa_approvazione' && !v.grave && new Date(v.pubblica_at).getTime() >= Date.now()
  ).length;
  const pronto = stato.fase === 'da_approvare' || (stato.fase === 'approvato' && approvabili > 0);

  const bottoneApprova =
    approvabili > 0 ? (
      <Button
        label={`Approva tutto ${nomeMese} (${approvabili})`}
        variant="primary"
        icon={<Check size={16} />}
        isDisabled={!pronto}
        tooltip={pronto ? 'Escono da sole, ognuna nel suo giorno. Quelle con un avviso grave restano fuori.' : 'Prima finisci di preparare.'}
        clickAction={approvaTutto}
      />
    ) : null;

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack justify="between" align="center" wrap="wrap" gap={3}>
            <HStack gap={3} align="center" wrap="wrap">
              <Button label="Tutti i clienti" size="sm" variant="ghost" icon={<ArrowLeft size={15} />} onClick={onIndietro} />
              <VStack gap={0.5}>
                <Heading level={2}>
                  {cliente.nome} · {nomeMese} {anno}
                </Heading>
                <Text type="supporting" color="secondary">
                  {inLavoro ?? fraseStato(stato, nomeMese)}
                </Text>
              </VStack>
            </HStack>
            <HStack gap={2} align="center">
              {stato.fase === 'da_preparare' || stato.fase === 'in_preparazione' ? (
                <Button
                  label={stato.fase === 'da_preparare' ? `Prepara ${nomeMese}` : 'Continua a preparare'}
                  variant="primary"
                  icon={<Sparkles size={15} />}
                  isDisabled={Boolean(inLavoro)}
                  clickAction={onPrepara}
                />
              ) : null}
              {bottoneApprova}
            </HStack>
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={4}>
          <VStack gap={4}>
            {messaggio ? (
              <Banner status={messaggio.tipo} title={messaggio.testo} isDismissable onDismiss={() => setMessaggio(null)} />
            ) : null}
            {inLavoro ? <ProgressBar label="Preparazione" isLabelHidden isIndeterminate /> : null}

            {/* ── DOVE ESCE, DAVVERO ─────────────────────────────────────
                Chiesto il 02/11/2026: «un recap di cosa sta facendo e dove
                pubblica realmente». Il posto vero con il link per andarci,
                cosa e' in corso adesso, e il calendario in una riga. */}
            {voci && voci.length ? (
              <Banner
                status="info"
                title="Cosa succede questo mese"
                defaultIsExpanded
                description={undefined}
              >
                <VStack gap={1.5}>
                  <Text>
                    <strong>Dove esce:</strong>{' '}
                    {dove?.scheda ? (
                      <>
                        {n(stato.post, 'post', 'post')} sulla scheda Google <strong>{dove.scheda.nome}</strong>
                        {dove.scheda.link ? (
                          <>
                            {' '}
                            (<Link href={dove.scheda.link} isExternalLink>
                              apri la scheda
                            </Link>
                            )
                          </>
                        ) : null}
                      </>
                    ) : (
                      'la scheda Google non è collegata'
                    )}
                    {stato.articoli ? (
                      <>
                        {' · '}
                        {n(stato.articoli, 'articolo', 'articoli')} sul blog di{' '}
                        {dove?.sito ? (
                          <Link href={dove.sito} isExternalLink>
                            {dove.sito.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          </Link>
                        ) : (
                          'questo cliente'
                        )}
                      </>
                    ) : null}
                    .
                  </Text>
                  <Text>
                    <strong>Adesso:</strong>{' '}
                    {stato.vuote
                      ? `${n(stato.vuote, 'testo', 'testi')} ancora da scrivere.`
                      : stato.senzaFoto
                        ? `testi pronti, ${n(stato.senzaFoto, 'immagine', 'immagini')} da fare${stato.pcAcceso ? ' (le fa il tuo PC con ComfyUI)' : ' (il PC è spento: «Continua» le fa fare a OpenRouter)'}.`
                        : stato.daApprovare
                          ? `tutto pronto, aspetta solo il tuo «Approva».`
                          : `approvato: escono da sole.`}
                    {stato.uscite ? ` ${n(stato.uscite, 'già uscito', 'già usciti')}.` : ''}
                  </Text>
                  <VStack gap={1}>
                    <Text>
                      <strong>Pulsante sotto i post:</strong>{' '}
                      {dove?.ctaCliente
                        ? `di serie «${AZIONI_BOTTONE[dove.ctaCliente.tipo as AzioneBottone] ?? dove.ctaCliente.tipo}»${dove.ctaCliente.url ? ` → ${dove.ctaCliente.url}` : ''}`
                        : 'nessuno di serie'}
                      . Cambialo per tutto il mese qui, o post per post sotto.
                    </Text>
                    <PulsantePost
                      cta={null}
                      diSerie={dove?.ctaCliente ?? null}
                      onCambia={(cta) =>
                        cambiaPulsante(
                          voci
                            .filter((x) => x.tipo === 'post_gbp' && (x.stato === 'attesa_approvazione' || x.stato === 'approvata'))
                            .map((x) => x.id),
                          cta
                        )
                      }
                    />
                  </VStack>
                  <Text>
                    <strong>Quando:</strong> dal {giorno(voci[0].pubblica_at)} al {giorno(voci[voci.length - 1].pubblica_at)}, alle 10 di mattina
                    {stato.prossima ? `; il prossimo esce ${giorno(stato.prossima)}` : ''}.
                  </Text>
                </VStack>
              </Banner>
            ) : null}

            <FotoVere
              aziendaId={cliente.id}
              nome={cliente.nome}
              anno={anno}
              mese={mese}
              postConAI={(voci ?? []).filter((v) => v.stato === 'attesa_approvazione' && v.foto_ai).length}
              onCambiate={carica}
            />

            {voci === null ? (
              <ProgressBar label="Carico il mese" isIndeterminate />
            ) : voci.length === 0 ? (
              <EmptyState
                title={`${nomeMese[0].toUpperCase()}${nomeMese.slice(1)} è vuoto`}
                description="Premi «Prepara» qui sopra: giorni, testi e immagini in un colpo."
              />
            ) : (
              <VStack gap={0}>
                {voci.map((v, i) => (
                  <VStack key={v.id} gap={0}>
                    {i > 0 ? <Divider /> : null}
                    <HStack gap={4} paddingBlock={4} align="start" wrap="wrap">
                      <VStack width={220} gap={2}>
                        {v.foto ? (
                          <AspectRatio ratio={4 / 3} fit="cover">
                            <img src={v.foto} alt={v.titolo ?? 'immagine del post'} loading="lazy" />
                          </AspectRatio>
                        ) : (
                          <AspectRatio ratio={4 / 3} fit="center">
                            <Text type="supporting" color="secondary">
                              {v.stato === 'vuota' ? 'testo e immagine in arrivo' : 'immagine in arrivo'}
                            </Text>
                          </AspectRatio>
                        )}
                        {v.foto ? (
                          <Text type="supporting" color="secondary">
                            {v.foto_fonte === 'gbp_cliente'
                              ? `📷 foto di un cliente${v.foto_autore ? ` (${v.foto_autore})` : ''}, dalla scheda Google`
                              : v.foto_fonte === 'gbp_titolare'
                                ? '📷 foto vera, dalla scheda Google'
                                : v.foto_fonte
                                  ? '📷 foto vera, caricata da te'
                                  : v.foto_ai
                                    ? '✨ immagine generata'
                                    : '📷 foto messa a mano'}
                          </Text>
                        ) : null}
                        {/* La foto VERA vince sempre su quella generata: e' il
                            locale com'e', e chi arriva trova quello che ha visto. */}
                        {v.stato === 'attesa_approvazione' || v.stato === 'approvata' ? (
                          <FileInput
                            label="Metti una foto vera"
                            isLabelHidden
                            placeholder={inCorso[v.id] ? 'Carico…' : 'Metti una foto vera'}
                            accept="image/*"
                            maxSize={8 * 1024 * 1024}
                            value={null}
                            onChange={() => undefined}
                            changeAction={async (f) => {
                              if (f && !Array.isArray(f)) await azione(v, 'immagine', f);
                            }}
                          />
                        ) : null}
                      </VStack>
                      <VStack gap={2} width="min(100%, 640px)">
                        <HStack gap={2} align="center" wrap="wrap">
                          <Text weight="semibold">{giorno(v.pubblica_at)}</Text>
                          <Badge variant={v.tipo === 'articolo' ? 'purple' : 'blue'} label={v.tipo === 'articolo' ? 'Sito · articolo' : 'Google'} />
                          {v.stato === 'approvata' ? <Badge variant="success" label="approvato" /> : null}
                          {v.stato === 'pubblicata' || v.stato === 'pubblicando' ? <Badge variant="green" label="uscito" /> : null}
                          {v.grave ? <Badge variant="error" label="da guardare" /> : null}
                          {v.stato === 'attesa_approvazione' && new Date(v.pubblica_at).getTime() < Date.now() ? (
                            <Badge variant="red" label="data passata: non esce" />
                          ) : null}
                          {v.url_uscito ? (
                            <Link href={v.url_uscito} isExternalLink>
                              guardalo dov’è uscito
                            </Link>
                          ) : null}
                        </HStack>
                        {v.errore_uscita ? (
                          <Text type="supporting" color="secondary">
                            ⚠️ Non è riuscito a uscire: {v.errore_uscita}
                          </Text>
                        ) : null}
                        {v.titolo ? <Text weight="medium">{v.titolo}</Text> : null}
                        <Text color={v.testo ? 'primary' : 'secondary'} maxLines={v.tipo === 'articolo' ? 6 : 0}>
                          {v.testo ?? 'Il testo non c’è ancora.'}
                        </Text>
                        {v.avvisi.length ? (
                          <Text type="supporting" color="secondary">
                            ⚠️ {v.avvisi.join(' · ')}
                          </Text>
                        ) : null}
                        {v.tipo === 'post_gbp' && (v.stato === 'attesa_approvazione' || v.stato === 'approvata') ? (
                          <PulsantePost
                            key={`${v.id}-${v.cta?.tipo ?? ''}-${v.cta?.url ?? ''}`}
                            cta={v.cta}
                            diSerie={dove?.ctaCliente ?? null}
                            onCambia={(cta) => cambiaPulsante([v.id], cta)}
                          />
                        ) : null}
                        {v.stato === 'attesa_approvazione' || v.stato === 'approvata' ? (
                          <HStack gap={2} wrap="wrap">
                            {v.stato === 'attesa_approvazione' && new Date(v.pubblica_at).getTime() < Date.now() ? (
                              <Button
                                label="Spostalo a domani"
                                size="sm"
                                variant="secondary"
                                clickAction={() => azione(v, 'domani')}
                              />
                            ) : null}
                            {v.testo ? (
                              <Button
                                label={confermaSubito === v.id ? 'Sicuro? Esce subito su Google' : 'Pubblica adesso'}
                                size="sm"
                                variant={confermaSubito === v.id ? 'primary' : 'ghost'}
                                icon={<Send size={14} />}
                                tooltip="Lo approva senza data: esce al prossimo giro del router, entro un minuto."
                                clickAction={async () => {
                                  if (confermaSubito !== v.id) setConfermaSubito(v.id);
                                  else await azione(v, 'subito');
                                }}
                              />
                            ) : null}
                            <Button
                              label="Rifai immagine"
                              size="sm"
                              variant="ghost"
                              icon={<RefreshCw size={14} />}
                              isLoading={inCorso[v.id]}
                              clickAction={() => azione(v, 'immagine')}
                            />
                            {v.stato === 'attesa_approvazione' ? (
                              <Button
                                label="Togli dal mese"
                                size="sm"
                                variant="ghost"
                                icon={<X size={14} />}
                                clickAction={() => azione(v, 'togli')}
                              />
                            ) : null}
                            <Button
                              label="Correggi il testo"
                              size="sm"
                              variant="ghost"
                              onClick={() => router.push(`/bozze?bozza=${v.id}`)}
                            />
                          </HStack>
                        ) : null}
                      </VStack>
                    </HStack>
                  </VStack>
                ))}
                {bottoneApprova ? (
                  <>
                    <Divider />
                    <HStack paddingBlock={4} gap={3} align="center" wrap="wrap">
                      {bottoneApprova}
                      <Text type="supporting" color="secondary">
                        Un click e il mese è fatto: ognuno esce nel suo giorno, senza che tu debba tornarci.
                      </Text>
                    </HStack>
                  </>
                ) : null}
              </VStack>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}

// ── Il pulsante sotto il post ────────────────────────────────────────────────
/**
 * ⚠️ «È essenziale per veicolare i clienti sul sito» (02/11/2026). Nel mese non
 * c'era: «Pubblica adesso» usciva col pulsante di serie del cliente, o senza,
 * senza poterlo scegliere. Stesse voci del pannello di Google; vuoto = quello
 * di serie del cliente (Servizi → scheda Google), che si vede scritto.
 */
function PulsantePost({
  cta,
  diSerie,
  onCambia,
}: {
  cta: { tipo?: string; url?: string } | null;
  diSerie: { tipo: string; url: string | null } | null;
  onCambia: (cta: { tipo: string; url: string } | null) => Promise<void>;
}) {
  const [tipo, setTipo] = useState(cta?.tipo ?? '');
  const [url, setUrl] = useState(cta?.url ?? '');
  const salvato = (cta?.url ?? '') === url;
  const etichettaSerie = diSerie
    ? `Di serie: ${AZIONI_BOTTONE[diSerie.tipo as AzioneBottone] ?? diSerie.tipo}`
    : 'Di serie: nessuno';

  return (
    <HStack gap={2} align="end" wrap="wrap">
      <Selector
        label="Pulsante"
        size="sm"
        value={tipo}
        onChange={(v) => {
          const t = String(v ?? '');
          setTipo(t);
          const u = url || diSerie?.url || '';
          setUrl(u);
          void onCambia(t ? { tipo: t, url: VUOLE_URL(t) ? u : '' } : null);
        }}
        options={[
          { value: '', label: etichettaSerie },
          ...Object.entries(AZIONI_BOTTONE).map(([value, label]) => ({ value, label })),
        ]}
      />
      {tipo && VUOLE_URL(tipo) ? (
        <>
          <TextInput
            label="Dove porta"
            size="sm"
            value={url}
            placeholder="https://…"
            status={url.trim() ? undefined : { type: 'error', message: 'Senza indirizzo il pulsante non esce.' }}
            onChange={setUrl}
          />
          {!salvato && url.trim() ? (
            <Button label="Salva" size="sm" clickAction={() => onCambia({ tipo, url: url.trim() })} />
          ) : null}
        </>
      ) : null}
    </HStack>
  );
}
