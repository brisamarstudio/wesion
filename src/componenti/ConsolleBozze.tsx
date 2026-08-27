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
import { useMemo, useState } from 'react';
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
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import {
  ETICHETTA_ORIGINE,
  ETICHETTA_STATO,
  ETICHETTA_TIPO,
  scadenza,
  testoBozza,
  vociMenu,
  type Bozza,
} from '@/lib/bozze';
import { controllaBozza } from '@/lib/controlloTesto';

/** Il colore dice a colpo d'occhio se la riga aspetta una persona o no. */
const COLORE_STATO: Record<string, 'success' | 'warning' | 'error' | 'accent' | 'neutral'> = {
  vuota: 'neutral',
  generata: 'accent',
  attesa_approvazione: 'warning',
  approvata: 'accent',
  pubblicata: 'success',
  rifiutata: 'neutral',
  scaduta: 'error',
};

const DECIDIBILI = new Set(['vuota', 'generata', 'attesa_approvazione']);

function quandoBreve(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) +
    ' ' +
    d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

export function ConsolleBozze({ bozze }: { bozze: Bozza[] }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState('da_decidere');
  const [cerca, setCerca] = useState('');
  const [selezionataId, setSelezionataId] = useState<number | null>(null);
  /** Le correzioni in corso, per id: si perdono cambiando riga, apposta. */
  const [correzioni, setCorrezioni] = useState<Record<number, string>>({});
  const [errore, setErrore] = useState<string | null>(null);

  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return bozze.filter((b) => {
      if (filtro === 'da_decidere' && !DECIDIBILI.has(b.stato)) return false;
      if (filtro === 'attenzione' && !b.avvisi.some((a) => a.gravita === 'grave')) return false;
      if (!q) return true;
      return [b.azienda, b.citta, ETICHETTA_TIPO[b.tipo] ?? b.tipo, testoBozza(b.contenuto)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [bozze, filtro, cerca]);

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
    () => (selezionata ? controllaBozza(selezionata.tipo, testoCorrente) : []),
    [selezionata, testoCorrente]
  );
  const gravi = avvisiCorrenti.filter((a) => a.gravita === 'grave');
  const attenzioni = avvisiCorrenti.filter((a) => a.gravita === 'attenzione');

  const voci = selezionata ? vociMenu(selezionata.contenuto) : [];
  const scade = selezionata ? scadenza(selezionata.scade_at) : null;

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

  const daDecidere = bozze.filter((b) => DECIDIBILI.has(b.stato)).length;

  return (
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
              <SegmentedControl
                label="Cosa mostrare"
                value={filtro}
                onChange={setFiltro}
                size="sm"
              >
                <SegmentedControlItem value="da_decidere" label="Da decidere" />
                <SegmentedControlItem value="attenzione" label="Con avvisi" />
                <SegmentedControlItem value="tutte" label="Tutte" />
              </SegmentedControl>
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
                  const s = scadenza(b.scade_at);
                  const graviQui = b.avvisi.filter((a) => a.gravita === 'grave').length;
                  return (
                    <ListItem
                      key={b.id}
                      label={b.azienda}
                      description={
                        [ETICHETTA_TIPO[b.tipo] ?? b.tipo, ETICHETTA_ORIGINE[b.origine] ?? b.origine]
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
                          <Text type="supporting">{quandoBreve(b.creata_at)}</Text>
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
        <LayoutPanel width={440} hasDivider isScrollable label="Dettaglio bozza" padding={4}>
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

              {/* Il testo e' modificabile finche' la bozza e' decidibile. Dopo
                  resta leggibile ma fermo: correggere un post gia' pubblicato
                  qui non lo cambierebbe su Google, direbbe solo una bugia. */}
              <TextArea
                label="Testo"
                value={testoCorrente}
                rows={12}
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

              {DECIDIBILI.has(selezionata.stato) && !scade?.scaduta ? (
                <HStack gap={2}>
                  <Button
                    label={gravi.length > 0 ? 'Approva lo stesso' : 'Approva'}
                    variant="primary"
                    clickAction={() => decidi('approva')}
                    tooltip={
                      gravi.length > 0
                        ? 'Ci sono avvisi gravi. Puoi approvare comunque: decidi tu.'
                        : undefined
                    }
                  />
                  <Button label="Rifiuta" variant="secondary" clickAction={() => decidi('rifiuta')} />
                </HStack>
              ) : null}

              <MetadataList>
                <MetadataListItem label="Stato">
                  {ETICHETTA_STATO[selezionata.stato] ?? selezionata.stato}
                  {/* Approvata non vuol dire uscita: lo diciamo dove si legge. */}
                  {selezionata.stato === 'approvata' ? ' — il router deve ancora pubblicarla' : ''}
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
  );
}
