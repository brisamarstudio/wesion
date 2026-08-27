'use client';

/**
 * L'elenco aziende: righe fitte, e da ognuna si può FARE qualcosa.
 *
 * ⚠️ LA PRIMA VERSIONE ERA UNA VETRINA. Mostrava 46 aziende con un punteggio
 * accanto e non offriva un solo modo di agirci: né chiamare, né aprire una
 * chat, né segnare l'esito. Si guardava il lavoro invece di farlo, e il
 * punteggio dell'audit — che esiste per decidere chi chiamare per primo — non
 * portava da nessuna parte.
 *
 * Adesso da qui si telefona, si apre WhatsApp col numero nel formato giusto, si
 * copia il gancio scritto dall'audit e si segna com'è andata. È la differenza
 * fra un cruscotto e uno strumento.
 *
 * Filtri, ricerca e pagina stanno nell'URL e non in `useState`: un filtro si
 * manda a qualcuno, si mette nei segnalibri, e il tasto indietro funziona.
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
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
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
  score: number | null;
  telefono: string | null;
  /** Solo cifre col prefisso: è quello che vuole wa.me. */
  telefono_normalizzato: string | null;
  email: string | null;
  sito: string | null;
  audit_note: string | null;
  audit_hook: string | null;
  audit_quando: string | null;
  audit_errore: string | null;
}

const COLORE_STATO: Record<string, 'success' | 'warning' | 'error' | 'accent' | 'neutral'> = {
  prospect: 'neutral',
  contattato: 'accent',
  in_trattativa: 'warning',
  cliente: 'success',
  perso: 'error',
  archiviato: 'neutral',
};

const ETICHETTA: Record<string, string> = {
  prospect: 'Da contattare',
  contattato: 'Contattata',
  in_trattativa: 'In trattativa',
  cliente: 'Cliente',
  perso: 'Persa',
  archiviato: 'Archiviata',
};

/** L'ordine in cui si scorre un imbuto: da chi non sa chi siamo a chi paga. */
const STATI = ['prospect', 'contattato', 'in_trattativa', 'cliente', 'perso'];

export function ElencoAziende({
  aziende,
  conteggi,
  quante,
  pagina,
  perPagina,
  cerca: cercaIniziale,
  stato,
}: {
  aziende: Azienda[];
  conteggi: Record<string, number>;
  quante: number;
  pagina: number;
  perPagina: number;
  cerca: string;
  stato: string;
}) {
  const router = useRouter();
  const [inCorso, avvia] = useTransition();
  const [cerca, setCerca] = useState(cercaIniziale);
  const [selezionataId, setSelezionataId] = useState<number | null>(null);
  const [messaggio, setMessaggio] = useState<{ tipo: 'success' | 'error' | 'info'; testo: string } | null>(null);
  const [copiato, setCopiato] = useState(false);

  const selezionata = aziende.find((a) => a.id === selezionataId) ?? null;
  const totalePagine = Math.max(1, Math.ceil(quante / perPagina));

  /** Cambia la vista scrivendo nell'URL: è lì che vive lo stato. */
  function vaiA(campi: Record<string, string | number | null>) {
    const p = new URLSearchParams();
    const attuali: Record<string, string | number | null> = { q: cerca, stato, pagina, ...campi };
    for (const [k, v] of Object.entries(attuali)) {
      if (v === null || v === '' || v === 'tutti' || (k === 'pagina' && v === 1)) continue;
      p.set(k, String(v));
    }
    avvia(() => router.push(`/aziende${p.toString() ? `?${p}` : ''}`));
  }

  async function cambiaStato(id: number, nuovo: string) {
    setMessaggio(null);
    const risposta = await fetch(`/api/aziende/${id}/stato`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stato: nuovo }),
    });
    if (!risposta.ok) {
      const e = await risposta.json().catch(() => ({}));
      setMessaggio({ tipo: 'error', testo: e?.errore ?? 'Non è andata.' });
      return;
    }
    router.refresh();
  }

  async function analizza(id: number) {
    setMessaggio(null);
    const risposta = await fetch(`/api/aziende/${id}/audit`, { method: 'POST' });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok || esito?.esito === 'errore') {
      setMessaggio({ tipo: 'error', testo: esito?.errore ?? 'Non è andata.' });
    }
    // Si ricarica comunque: anche un audit fallito ha lasciato la sua riga.
    router.refresh();
  }

  async function analizzaMancanti() {
    setMessaggio({ tipo: 'info', testo: 'Analizzo quelle senza un audit riuscito…' });
    const risposta = await fetch('/api/aziende/audit-batch', { method: 'POST' });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      setMessaggio({ tipo: 'error', testo: esito?.errore ?? 'Non è andata.' });
      return;
    }
    setMessaggio({
      tipo: 'success',
      testo:
        esito.analizzate === 0
          ? 'Non c’è nessuna azienda da analizzare.'
          : `Analizzate ${esito.analizzate}, riuscite ${esito.riuscite}. Il tetto è 25 per giro: rilancia per continuare.`,
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

  const totale = Object.values(conteggi).reduce((a, b) => a + b, 0);

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack gap={3} align="center">
            <Heading level={2}>Aziende</Heading>
            <Text color="secondary">
              {quante === 0
                ? 'nessuna'
                : `${quante}${totalePagine > 1 ? ` · pagina ${pagina} di ${totalePagine}` : ''}`}
            </Text>
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <VStack gap={0}>
            <VStack padding={3} gap={3}>
              {/* I conteggi dicono quanto c'è DI LÀ, non quanto se ne vede di
                  qua: servono a decidere dove andare. */}
              <HStack gap={2} wrap="wrap" align="center">
                <Button
                  label={`Tutte (${totale})`}
                  size="sm"
                  variant={stato === 'tutti' ? 'primary' : 'ghost'}
                  onClick={() => vaiA({ stato: 'tutti', pagina: 1 })}
                />
                {STATI.map((s) => (
                  <Button
                    key={s}
                    label={`${ETICHETTA[s]} (${conteggi[s] ?? 0})`}
                    size="sm"
                    variant={stato === s ? 'primary' : 'ghost'}
                    isDisabled={!conteggi[s]}
                    onClick={() => vaiA({ stato: s, pagina: 1 })}
                  />
                ))}
              </HStack>

              <HStack gap={2} align="end" wrap="wrap">
                <TextInput
                  label="Cerca"
                  isLabelHidden
                  placeholder="Nome, città, categoria, telefono, sito…"
                  value={cerca}
                  onChange={setCerca}
                  size="sm"
                  startIcon="search"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') vaiA({ q: cerca, pagina: 1 });
                  }}
                />
                <Button label="Cerca" size="sm" isLoading={inCorso} onClick={() => vaiA({ q: cerca, pagina: 1 })} />
                <Button label="Analizza le mancanti" size="sm" variant="ghost" clickAction={analizzaMancanti} />
                <Button
                  label="Esporta CSV"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    window.location.href = `/api/aziende/esporta${stato !== 'tutti' ? `?stato=${stato}` : ''}`;
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
                  cercaIniziale
                    ? 'Nessun risultato per questa ricerca. Prova con meno parole.'
                    : 'Con questo filtro non c’è niente. Le aziende arrivano dalle campagne.'
                }
              />
            ) : (
              <List hasDividers density="balanced">
                {aziende.map((a) => (
                  <ListItem
                    key={a.id}
                    label={a.nome}
                    description={[a.categoria, a.citta].filter(Boolean).join(' · ') || undefined}
                    isSelected={a.id === selezionataId}
                    onClick={() => setSelezionataId(a.id)}
                    startContent={
                      <StatusDot
                        variant={COLORE_STATO[a.stato] ?? 'neutral'}
                        label={ETICHETTA[a.stato] ?? a.stato}
                        tooltip={ETICHETTA[a.stato] ?? a.stato}
                      />
                    }
                    endContent={
                      <HStack gap={4} align="center">
                        {/* Badge solo sopra 80: se ce l'hanno tutte non dice
                            niente. È il numero che decide chi si chiama prima. */}
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
            )}

            {totalePagine > 1 ? (
              <HStack gap={2} padding={3} align="center">
                <Button
                  label="Indietro"
                  size="sm"
                  isDisabled={pagina <= 1}
                  onClick={() => vaiA({ pagina: pagina - 1 })}
                />
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
        <LayoutPanel width={400} hasDivider isScrollable label="Dettaglio azienda" padding={4}>
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

              {/* ── Le azioni, in cima ────────────────────────────────────────
                  Sono il motivo per cui si apre una riga. Prima non c'erano
                  affatto: chi telefona non deve scorrere una scheda per trovare
                  il numero. */}
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
                  tooltip={selezionata.telefono_normalizzato ? undefined : 'Non ha un numero utilizzabile'}
                  onClick={() => {
                    // wa.me vuole SOLO cifre col prefisso: passargli il numero
                    // come è scritto apre una chat con un contatto inesistente.
                    window.open(`https://wa.me/${selezionata.telefono_normalizzato}`, '_blank');
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
              </HStack>

              {/* ── Com'è andata ─────────────────────────────────────────────
                  Si segna da qui e non dalla scheda: si scorre l'elenco dopo
                  dieci telefonate e si mettono gli esiti, uno dietro l'altro. */}
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
                <Banner
                  status="warning"
                  title="L’ultimo audit non è riuscito"
                  description={selezionata.audit_errore}
                />
              ) : null}

              {/* ── Il gancio ────────────────────────────────────────────────
                  L'unica riga di tutta la pagina che finisce davvero fuori: si
                  legge al telefono o si incolla in chat. Per questo è copiabile
                  e non solo leggibile. */}
              {selezionata.audit_hook ? (
                <VStack gap={2}>
                  <HStack gap={2} align="center">
                    <Text type="supporting">Come aprire il discorso</Text>
                    {selezionata.score !== null ? (
                      <Badge variant="orange" label={`${selezionata.score}/100`} />
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
                    <Button
                      label="Rianalizza"
                      size="sm"
                      variant="ghost"
                      clickAction={() => analizza(selezionata.id)}
                    />
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
                <MetadataListItem label="Dove">
                  {[selezionata.citta, selezionata.provincia].filter(Boolean).join(', ') || '—'}
                </MetadataListItem>
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
