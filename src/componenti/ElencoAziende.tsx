'use client';

/**
 * L'elenco delle aziende: righe, non schede.
 *
 * Archetipo "tracker" (come un CRM): righe fitte a tutta larghezza, e la
 * selezione apre un pannello laterale invece di cambiare pagina. Avvolgere ogni
 * azienda in una Card e' esattamente cio' che fa sembrare un'app un prototipo.
 *
 * Perche' List e non Table: Table non ha un aggancio al click sulla riga
 * (l'unico plugin di selezione disegna caselle di spunta, che e' un'altra
 * interazione). ListItem ha onClick e isSelected nativi, ed e' quello che usa
 * il template `incident-console` che la CLI indica per questo archetipo.
 *
 * Lo stato usa StatusDot e non Badge: Badge e' per i conteggi e per gli stati
 * enumerati, non per colorare una riga.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layout, LayoutContent, LayoutHeader, LayoutPanel } from '@astryxdesign/core/Layout';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { soloData } from '@/lib/quando';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { TextInput } from '@astryxdesign/core/TextInput';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Token } from '@astryxdesign/core/Token';

export interface Azienda extends Record<string, unknown> {
  id: number;
  slug: string;
  nome: string;
  categoria: string | null;
  citta: string | null;
  provincia: string | null;
  stato: string;
  score: number | null;
  telefono: string | null;
  sito: string | null;
  /** L'ultimo audit RIUSCITO: punteggio, note e gancio vengono dallo stesso giro. */
  audit_note: string | null;
  audit_hook: string | null;
  audit_quando: string | null;
  /** L'errore dell'ULTIMO tentativo, riuscito o no. Null se è andata bene. */
  audit_errore: string | null;
}

/** Lo stato dell'azienda e' un fatto commerciale: il colore lo dice a colpo d'occhio. */
const COLORE_STATO: Record<string, 'success' | 'warning' | 'error' | 'accent' | 'neutral'> = {
  prospect: 'neutral',
  contattato: 'accent',
  in_trattativa: 'warning',
  cliente: 'success',
  perso: 'error',
  archiviato: 'neutral',
};

const ETICHETTA_STATO: Record<string, string> = {
  prospect: 'Da contattare',
  contattato: 'Contattata',
  in_trattativa: 'In trattativa',
  cliente: 'Cliente',
  perso: 'Persa',
  archiviato: 'Archiviata',
};

function etichetta(stato: string) {
  return ETICHETTA_STATO[stato] ?? stato;
}

export function ElencoAziende({ aziende }: { aziende: Azienda[] }) {
  const router = useRouter();
  const [cerca, setCerca] = useState('');
  const [selezionataId, setSelezionataId] = useState<number | null>(null);
  const [erroreAudit, setErroreAudit] = useState<string | null>(null);

  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (!q) return aziende;
    return aziende.filter((a) =>
      [a.nome, a.citta, a.categoria, a.telefono, a.sito]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [aziende, cerca]);

  const selezionata = aziende.find((a) => a.id === selezionataId) ?? null;

  /**
   * L'audit gira quando lo chiede una persona, non da solo.
   *
   * Costa una chiamata a pagamento per azienda: farlo partire allo scorrimento
   * dell'elenco vorrebbe dire pagare 46 audit per aprire una pagina.
   */
  async function analizza() {
    if (!selezionata) return;
    setErroreAudit(null);
    const risposta = await fetch(`/api/aziende/${selezionata.id}/audit`, { method: 'POST' });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok || esito?.esito === 'errore') {
      setErroreAudit(esito?.errore ?? 'Non è andata, e non si sa perché.');
    }
    // Si ricarica comunque: anche un audit fallito ha lasciato la sua riga
    // nello storico, e vale la pena vederla.
    router.refresh();
  }

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack gap={3} align="center">
            <Heading level={2}>Aziende</Heading>
            <Text color="secondary">
              {filtrate.length === aziende.length
                ? String(aziende.length)
                : `${filtrate.length} di ${aziende.length}`}
            </Text>
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={0}>
          <VStack gap={0}>
            {/* Il campo di ricerca sta dentro il suo incavo; la lista sotto va
                a filo, perche' e' ListItem a possedere il proprio. */}
            <VStack padding={3}>
              <TextInput
                label="Cerca"
                isLabelHidden
                placeholder="Nome, citta', categoria, telefono…"
                value={cerca}
                onChange={setCerca}
                size="sm"
                startIcon="search"
              />
            </VStack>

            {filtrate.length === 0 ? (
              <EmptyState
                title="Nessuna azienda trovata"
                description="Prova con un altro nome, oppure svuota la ricerca."
              />
            ) : (
              <List hasDividers density="balanced">
                {filtrate.map((a) => (
                  <ListItem
                    key={a.id}
                    label={a.nome}
                    description={[a.categoria, a.citta].filter(Boolean).join(' · ') || undefined}
                    isSelected={a.id === selezionataId}
                    onClick={() => setSelezionataId(a.id)}
                    startContent={
                      <StatusDot
                        variant={COLORE_STATO[a.stato] ?? 'neutral'}
                        label={etichetta(a.stato)}
                        tooltip={etichetta(a.stato)}
                      />
                    }
                    endContent={
                      <HStack gap={4} align="center">
                        {/* Il punteggio e' l'ultimo audit RIUSCITO: un tentativo
                            fallito non fa sparire il giudizio buono di prima. */}
                        <Text color="secondary" hasTabularNumbers>
                          {a.score === null ? '—' : a.score}
                        </Text>
                        <Text type="supporting">{a.telefono ?? ''}</Text>
                      </HStack>
                    }
                  />
                ))}
              </List>
            )}
          </VStack>
        </LayoutContent>
      }
      end={
        <LayoutPanel width={380} hasDivider isScrollable label="Dettaglio azienda" padding={4}>
          {selezionata ? (
            <VStack gap={5}>
              <VStack gap={1}>
                <Heading level={3}>{selezionata.nome}</Heading>
                <HStack gap={2} align="center">
                  <StatusDot
                    variant={COLORE_STATO[selezionata.stato] ?? 'neutral'}
                    label={etichetta(selezionata.stato)}
                  />
                  <Text color="secondary">{etichetta(selezionata.stato)}</Text>
                </HStack>
              </VStack>

              <MetadataList>
                <MetadataListItem label="Categoria">
                  {selezionata.categoria ?? '—'}
                </MetadataListItem>
                <MetadataListItem label="Dove">
                  {[selezionata.citta, selezionata.provincia].filter(Boolean).join(', ') || '—'}
                </MetadataListItem>
                <MetadataListItem label="Telefono">
                  {selezionata.telefono ?? '—'}
                </MetadataListItem>
                <MetadataListItem label="Sito">{selezionata.sito ?? 'nessuno'}</MetadataListItem>
                <MetadataListItem label="Punteggio">
                  {selezionata.score === null ? 'non valutata' : String(selezionata.score)}
                </MetadataListItem>
              </MetadataList>

              {erroreAudit ? (
                <Banner status="error" title="L’audit non è riuscito" description={erroreAudit} />
              ) : null}

              {/* L'ultimo tentativo è fallito ma sopra resta un punteggio: va
                  detto, o quel numero si legge come se fosse di adesso. */}
              {!erroreAudit && selezionata.audit_errore ? (
                <Banner
                  status="warning"
                  title="L’ultimo audit non è riuscito"
                  description={`Quello che vedi qui sopra è il giudizio precedente, non è di adesso. Motivo: ${selezionata.audit_errore}`}
                />
              ) : null}

              {/* La scheda e' dove si fa tutto il resto: sta in cima al
                  pannello perche' e' l'azione piu' probabile dopo aver
                  scelto una riga. */}
              <Button
                label="Apri la scheda del cliente"
                variant="primary"
                size="sm"
                onClick={() => router.push(`/aziende/${selezionata.id}`)}
              />

              <VStack gap={3}>
                <HStack gap={2} align="center">
                  <Button
                    label={selezionata.audit_quando ? 'Rianalizza il sito' : 'Analizza il sito'}
                    variant={selezionata.audit_quando ? 'secondary' : 'primary'}
                    size="sm"
                    clickAction={analizza}
                  />
                  {selezionata.audit_quando ? (
                    <Text type="supporting">
                      {soloData(selezionata.audit_quando)}
                    </Text>
                  ) : null}
                </HStack>

                {selezionata.audit_note ? (
                  <VStack gap={1}>
                    <Text type="supporting">Cosa si è visto</Text>
                    <Text>{selezionata.audit_note}</Text>
                  </VStack>
                ) : null}

                {/* Il gancio è la sola riga di tutta la pagina che finisce
                    davvero fuori: si legge al telefono o si incolla in una
                    chat. Sta in fondo perché è l'ultima cosa che serve. */}
                {selezionata.audit_hook ? (
                  <VStack gap={1}>
                    <Text type="supporting">Come aprire il discorso</Text>
                    <Text>{selezionata.audit_hook}</Text>
                  </VStack>
                ) : null}
              </VStack>

              <HStack gap={2}>
                <Token label={selezionata.slug} size="sm" />
              </HStack>
            </VStack>
          ) : (
            <EmptyState
              isCompact
              title="Nessuna azienda selezionata"
              description="Scegli una riga per vedere qui i suoi dettagli."
            />
          )}
        </LayoutPanel>
      }
    />
  );
}
