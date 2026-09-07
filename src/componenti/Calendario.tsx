'use client';

/**
 * Il calendario della settimana, su tutti i clienti.
 *
 * ⚠️ LA DOMANDA A CUI RISPONDE È «COSA DEVO FARE STAMATTINA», non «cosa è
 * successo». Per questo l'ordine non è cronologico puro: quello che aspetta una
 * persona sale in cima al suo giorno, il resto scende. Un post «da approvare»
 * datato oggi non esce finché qualcuno non dice sì — è l'unica coda che si ferma
 * da sola, e mescolarla col già fatto la rende invisibile.
 *
 * I giorni vuoti restano visibili. Un giovedì in cui non esce niente da nessuna
 * parte è il buco che il cliente noterebbe guardando la sua pagina: comprimerlo
 * vorrebbe dire nascondere esattamente ciò che serviva vedere.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { List, ListItem } from '@astryxdesign/core/List';
import { Divider } from '@astryxdesign/core/Divider';
import { giornoRoma } from '@/lib/quando';

export interface VoceCalendario {
  id: number;
  tipo: string;
  stato: string;
  pubblica_at: string | null;
  scade_at: string | null;
  azienda_id: number;
  azienda: string;
  titolo: string | null;
  testo: string | null;
  /** La copertina, se c'e'. Su un post di Google e' meta' del messaggio. */
  foto: string | null;
  uscita: boolean;
  fallita: boolean;
  quanti_avvisi: number | null;
}

export interface GiornoCalendario {
  data: string;
  voci: VoceCalendario[];
}

const TIPO: Record<string, string> = {
  menu: 'menù',
  post_gbp: 'Google',
  articolo: 'blog',
  messaggio_lead: 'messaggio',
};

/**
 * Come si presenta uno stato, e se aspetta una persona.
 *
 * `attende` è la colonna che decide l'ordine dentro la giornata: non è una
 * questione di gravità ma di chi deve muoversi.
 */
const STATO: Record<string, { testo: string; colore: 'neutral' | 'warning' | 'blue' | 'green' | 'red'; attende: boolean }> = {
  vuota: { testo: 'da scrivere', colore: 'neutral', attende: true },
  generata: { testo: 'scritta', colore: 'blue', attende: true },
  attesa_approvazione: { testo: 'da approvare', colore: 'warning', attende: true },
  approvata: { testo: 'approvata', colore: 'blue', attende: false },
  pubblicando: { testo: 'sta uscendo', colore: 'blue', attende: false },
  pubblicata: { testo: 'uscita', colore: 'green', attende: false },
  rifiutata: { testo: 'rifiutata', colore: 'neutral', attende: false },
  scaduta: { testo: 'scaduta', colore: 'red', attende: false },
};

const GIORNI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

function intestazioneGiorno(iso: string): string {
  const d = new Date(iso);
  const nome = GIORNI[(d.getDay() + 6) % 7];
  return `${nome} ${d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Rome' })}`;
}

function etichetta(v: VoceCalendario): string {
  return v.titolo || (v.testo ?? '').replace(/\s+/g, ' ').slice(0, 64) || 'senza testo';
}

export function Calendario({
  giorni,
  indietro,
  inizio,
  clienti,
  cliente,
  oggi,
}: {
  giorni: GiornoCalendario[];
  indietro: VoceCalendario[];
  inizio: string;
  clienti: Array<{ id: string; nome: string }>;
  cliente: string;
  oggi: string;
}) {
  const router = useRouter();
  const [inCorso, avvia] = useTransition();

  function settimana(scarto: number) {
    const d = new Date(inizio);
    d.setDate(d.getDate() + scarto * 7);
    // ⚠️ Il filtro si porta dietro: cambiare settimana non deve azzerare il
    // cliente scelto, o si riparte da capo a ogni freccia.
    const coda = cliente ? `&cliente=${cliente}` : '';
    avvia(() => router.push(`/calendario?da=${d.toISOString().slice(0, 10)}${coda}`));
  }

  const tutte = giorni.flatMap((g) => g.voci);
  const daFare = tutte.filter((v) => STATO[v.stato]?.attende).length;
  const uscite = tutte.filter((v) => v.uscita).length;
  const oggiVoci = giorni.find((g) => giornoRoma(g.data) === oggi)?.voci ?? [];

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack gap={3} align="center" wrap="wrap">
            <Heading level={2}>Calendario</Heading>
            <Text color="secondary">
              {tutte.length === 0
                ? 'questa settimana non esce niente'
                : `${tutte.length} in settimana · ${uscite} già uscite`}
            </Text>
            <HStack gap={2} align="center">
              {clienti.length > 1 ? (
                <Selector
                  label="Cliente"
                  isLabelHidden
                  size="sm"
                  value={cliente}
                  hasSearch={clienti.length > 8}
                  onChange={(v) => {
                    const scelto = String(v);
                    const da = inizio.slice(0, 10);
                    avvia(() =>
                      router.push(`/calendario?da=${da}${scelto ? `&cliente=${scelto}` : ''}`)
                    );
                  }}
                  options={[
                    { value: '', label: `Tutti i clienti (${clienti.length})` },
                    ...clienti.map((c) => ({ value: c.id, label: c.nome })),
                  ]}
                />
              ) : null}
              <Button label="Settimana prima" size="sm" variant="ghost" isLoading={inCorso} onClick={() => settimana(-1)} />
              <Button label="Oggi" size="sm" variant="ghost" onClick={() => avvia(() => router.push('/calendario'))} />
              <Button label="Settimana dopo" size="sm" variant="ghost" onClick={() => settimana(1)} />
              {/* L'altra domanda: non «cosa faccio stamattina» ma «il mese e'
                  coperto?». Due viste, non una con dentro un interruttore. */}
              <Button
                label="Vista mese"
                size="sm"
                variant="secondary"
                onClick={() => {
                  const d = new Date(inizio);
                  avvia(() =>
                    router.push(
                      `/calendario?vista=mese&anno=${d.getFullYear()}&mese=${d.getMonth() + 1}` +
                        (cliente ? `&cliente=${cliente}` : '')
                    )
                  );
                }}
              />
            </HStack>
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={4}>
          <VStack gap={5}>
            {/* ⚠️ RIMASTI INDIETRO, e si cercano fuori dalla settimana apposta:
                il guasto tipico è di tre giorni fa, e guardandolo solo dentro
                la finestra corrente lo si perderebbe ogni lunedì mattina —
                cioè proprio quando serve saperlo. */}
            {indietro.length > 0 ? (
              <Banner
                status="error"
                title={`${indietro.length} approvazioni non sono mai uscite`}
                description="Qualcuno ha detto sì e non è successo niente: di solito vuol dire che il router è fermo o ha perso la sessione di WhatsApp. Va guardato lì, non in dashboard."
                defaultIsExpanded
              >
                <List hasDividers density="compact">
                  {indietro.map((v) => (
                    <ListItem
                      key={v.id}
                      label={`${v.azienda} — ${etichetta(v)}`}
                      description={TIPO[v.tipo] ?? v.tipo}
                      onClick={() => router.push('/bozze')}
                    />
                  ))}
                </List>
              </Banner>
            ) : null}

            {daFare > 0 ? (
              <Banner
                status="warning"
                title={`${daFare} cose aspettano una persona questa settimana`}
                description="Finché nessuno le guarda non escono, e la data passa lo stesso."
                endContent={<Button label="Vai alle bozze" size="sm" onClick={() => router.push('/bozze')} />}
              />
            ) : null}

            {oggiVoci.length > 0 ? (
              <Banner
                status="info"
                title={`Oggi escono ${oggiVoci.length} cose`}
                description={[...new Set(oggiVoci.map((v) => v.azienda))].join(' · ')}
              />
            ) : null}

            <VStack gap={0}>
              {giorni.map((g) => {
                const eOggi = giornoRoma(g.data) === oggi;
                // Dentro il giorno: prima quello che aspetta una persona.
                const ordinate = [...g.voci].sort(
                  (a, b) => Number(STATO[b.stato]?.attende ?? false) - Number(STATO[a.stato]?.attende ?? false)
                );

                return (
                  <VStack key={g.data} gap={0}>
                    <Divider />
                    <HStack gap={2} align="center" padding={3}>
                      <Text color={eOggi ? 'primary' : 'secondary'}>
                        {intestazioneGiorno(g.data)}
                      </Text>
                      {eOggi ? <Badge variant="info" label="oggi" /> : null}
                      {g.voci.length > 0 ? (
                        <Badge variant="neutral" label={String(g.voci.length)} />
                      ) : (
                        <>
                          <Text type="supporting">niente</Text>
                          {/* Un giorno vuoto e' il posto dove viene voglia di
                              aggiungere qualcosa: prima bisognava andarselo a
                              cercare in un'altra pagina e ridigitare la data. */}
                          <Button
                            label="Aggiungi"
                            size="sm"
                            variant="ghost"
                            onClick={() => router.push(`/bozze?nuovo=1&giorno=${giornoRoma(g.data)}`)}
                          />
                        </>
                      )}
                    </HStack>

                    {ordinate.length > 0 ? (
                      <List hasDividers density="compact">
                        {ordinate.map((v) => {
                          const st = STATO[v.stato] ?? { testo: v.stato, colore: 'neutral' as const, attende: false };
                          return (
                            <ListItem
                              key={v.id}
                              label={v.azienda}
                              description={etichetta(v)}
                              /* ⚠️ ALLA BOZZA, non alla scheda dell'azienda.
                                 Portava li', e vedevi «da approvare» per poi
                                 finire in un posto dove quella bozza non c'e':
                                 un pianificatore da cui non si puo' agire e'
                                 un rapporto. */
                              onClick={() => router.push(`/bozze?bozza=${v.id}`)}
                              startContent={
                                v.foto ? (
                                  <img
                                    src={v.foto}
                                    alt=""
                                    width={40}
                                    height={40}
                                    style={{
                                      objectFit: 'cover',
                                      borderRadius: 'var(--radius-inner)',
                                      display: 'block',
                                    }}
                                  />
                                ) : undefined
                              }
                              endContent={
                                <HStack gap={3} align="center">
                                  <Text type="supporting">{TIPO[v.tipo] ?? v.tipo}</Text>
                                  {v.quanti_avvisi ? <Badge variant="error" label={String(v.quanti_avvisi)} /> : null}
                                  {v.fallita && !v.uscita ? <Badge variant="error" label="fallita" /> : null}
                                  <Badge variant={st.colore} label={st.testo} />
                                </HStack>
                              }
                            />
                          );
                        })}
                      </List>
                    ) : null}
                  </VStack>
                );
              })}
              <Divider />
            </VStack>

            {tutte.length === 0 ? (
              <Text type="supporting">
                Nessun post programmato in questa settimana, su nessun cliente. Se non è voluto, il piano si
                costruisce dalla pagina Piano — e senza, sulle schede dei clienti non esce più niente.
              </Text>
            ) : null}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
