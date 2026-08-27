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
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Selector } from '@astryxdesign/core/Selector';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Divider } from '@astryxdesign/core/Divider';
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
  campagna: string | null;
  score: number | null;
  telefono: string | null;
  telefono_normalizzato: string | null;
  email: string | null;
  sito: string | null;
  audit_note: string | null;
  audit_hook: string | null;
  audit_quando: string | null;
  audit_errore: string | null;
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
  pagina,
  perPagina,
  gruppo,
  vista,
  opzioni,
}: {
  aziende: Azienda[];
  conteggi: Record<string, number>;
  quante: number;
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

  const selezionata = aziende.find((a) => a.id === selezionataId) ?? null;
  const totalePagine = Math.max(1, Math.ceil(quante / perPagina));

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

  async function cambiaStato(id: number, nuovo: string) {
    setMessaggio(null);
    const r = await fetch(`/api/aziende/${id}/stato`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stato: nuovo }),
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

  async function analizzaMancanti() {
    setMessaggio({ tipo: 'info', testo: 'Analizzo quelle senza un audit riuscito…' });
    const r = await fetch('/api/aziende/audit-batch', { method: 'POST' });
    const e = await r.json().catch(() => ({}));
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
                  size="sm"
                  hasClear
                  placeholder="Tutte le campagne"
                  value={vista.campagna}
                  onChange={(v) => vaiA({ campagna: v ?? '', pagina: 1 })}
                  options={opzioni.campagne.map((c) => ({ value: String(c.id), label: `${c.nome} (${c.quanti})` }))}
                />
                <Selector
                  label="Sito"
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
                <Text type="supporting">Raggruppa per</Text>
                <SegmentedControl label="Raggruppa" size="sm" value={gruppo} onChange={(v) => vaiA({ gruppo: v })}>
                  <SegmentedControlItem value="campagna" label="Campagna" />
                  <SegmentedControlItem value="citta" label="Città" />
                  {/* La categoria fa 24 gruppi su 77 aziende: le categorie di
                      Google Maps sono granulari. Resta disponibile, ma non è
                      il default per un motivo misurato. */}
                  <SegmentedControlItem value="categoria" label="Categoria" />
                  <SegmentedControlItem value="nessuno" label="Niente" />
                </SegmentedControl>

                <Button label="Cerca" size="sm" isLoading={inCorso} onClick={() => vaiA({ q: cerca, pagina: 1 })} />
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
                <Button label="Analizza le mancanti" size="sm" variant="ghost" clickAction={analizzaMancanti} />
                <Button
                  label="Esporta CSV"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    window.location.href = `/api/aziende/esporta${vista.stato !== 'tutti' ? `?stato=${vista.stato}` : ''}`;
                  }}
                />
              </HStack>

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
                    {g.titolo ? (
                      <>
                        <Divider />
                        <HStack gap={2} align="center" padding={3}>
                          <Text type="supporting">{g.titolo}</Text>
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
                          onClick={() => setSelezionataId(a.id)}
                          startContent={
                            <StatusDot
                              variant={COLORE[a.stato] ?? 'neutral'}
                              label={ETICHETTA[a.stato] ?? a.stato}
                              tooltip={ETICHETTA[a.stato] ?? a.stato}
                            />
                          }
                          endContent={
                            <HStack gap={3} align="center">
                              {/* Badge solo sopra 80: se ce l'hanno tutte non
                                  dice niente. È il numero che decide chi si
                                  chiama per primo. */}
                              {a.score !== null && a.score >= 80 ? (
                                <Badge variant="orange" label={String(a.score)} />
                              ) : (
                                <Text color="secondary" hasTabularNumbers>
                                  {a.score === null ? '—' : a.score}
                                </Text>
                              )}
                              {!a.sito ? <Badge variant="red" label="senza sito" /> : null}
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
                  isDisabled={!selezionata.telefono_normalizzato}
                  onClick={() => window.open(`https://wa.me/${selezionata.telefono_normalizzato}`, '_blank')}
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
              </HStack>

              <VStack gap={2}>
                <Text type="supporting">Com’è andata</Text>
                <HStack gap={2} wrap="wrap">
                  {STATI.map((s) => (
                    <Button
                      key={s}
                      label={ETICHETTA[s]}
                      size="sm"
                      variant={selezionata.stato === s ? 'primary' : 'ghost'}
                      clickAction={() => cambiaStato(selezionata.id, s)}
                    />
                  ))}
                </HStack>
              </VStack>

              {selezionata.audit_errore && !selezionata.audit_hook ? (
                <Banner status="warning" title="L’ultimo audit non è riuscito" description={selezionata.audit_errore} />
              ) : null}

              {selezionata.audit_hook ? (
                <VStack gap={2}>
                  <HStack gap={2} align="center">
                    <Text type="supporting">Come aprire il discorso</Text>
                    {selezionata.score !== null ? <Badge variant="orange" label={`${selezionata.score}/100`} /> : null}
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
              )}

              {selezionata.audit_note ? (
                <VStack gap={1}>
                  <Text type="supporting">Cosa si è visto</Text>
                  <Text>{selezionata.audit_note}</Text>
                </VStack>
              ) : null}

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
  );
}
