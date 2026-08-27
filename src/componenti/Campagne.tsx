'use client';

/**
 * Le campagne: da «dentisti a Pavia» a un elenco di potenziali clienti.
 *
 * È il primo anello della catena, quello che riempie l'imbuto. Prima esisteva
 * solo come rotta da chiamare con `curl`, il che vuol dire che la usava una
 * persona sola.
 *
 * ⚠️ PERCHÉ DUE BOTTONI E NON UNO. Avviare la ricerca e raccogliere i risultati
 * sono due momenti separati perché su Apify un run serio dura minuti: tenere
 * aperta una richiesta HTTP per tutto quel tempo vuol dire perderla a metà e
 * non sapere più se il run è partito — pagandolo comunque. Si avvia, si va a
 * fare altro, si torna e si raccoglie. Anche il giorno dopo: il dataset su
 * Apify non scade insieme a questa pagina.
 *
 * Raccogliere due volte non fa danni: l'inserimento va in conflitto sul Place
 * ID, quindi non si creano doppioni. Serve più spesso di quanto sembri, perché
 * la prima volta si prova quasi sempre mentre il run è ancora a metà.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { List, ListItem } from '@astryxdesign/core/List';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { quandoBreve } from '@/lib/quando';

export interface CampagnaRiga {
  id: number;
  nome: string;
  categoria: string;
  citta: string[];
  apify_run_id: string | null;
  creata_at: string;
  /** Quante aziende sono già entrate da questa campagna. */
  raccolte: number;
}

export function Campagne({ campagne }: { campagne: CampagnaRiga[] }) {
  const router = useRouter();
  const [categoria, setCategoria] = useState('');
  const [citta, setCitta] = useState('');
  const [quanti, setQuanti] = useState('50');
  const [messaggio, setMessaggio] = useState<{ tipo: 'success' | 'error' | 'info'; testo: string } | null>(null);

  async function avvia() {
    setMessaggio(null);
    const risposta = await fetch('/api/campagne', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria, citta, quanti: Number(quanti) || 50 }),
    });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      setMessaggio({ tipo: 'error', testo: esito?.errore ?? 'Non è andata.' });
      return;
    }
    setMessaggio({
      tipo: 'success',
      testo: 'Ricerca avviata su Apify. Ci mette qualche minuto: torna qui e premi «Raccogli».',
    });
    setCategoria('');
    setCitta('');
    router.refresh();
  }

  async function raccogli(id: number) {
    setMessaggio({ tipo: 'info', testo: 'Raccolgo i risultati…' });
    const risposta = await fetch(`/api/campagne/${id}/raccogli`, { method: 'POST' });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      // 409 vuol dire "il run è ancora in corso": è la risposta giusta a una
      // domanda fatta presto, non un guasto. Si dice com'è.
      setMessaggio({ tipo: risposta.status === 409 ? 'info' : 'error', testo: esito?.errore ?? 'Non è andata.' });
      return;
    }
    setMessaggio({
      tipo: 'success',
      testo: `Letti ${esito.letti} risultati: ${esito.aziende} aziende e ${esito.contatti} contatti. ${
        esito.scartati ? `${esito.scartati} scartati perché senza nome.` : ''
      }`,
    });
    router.refresh();
  }

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack gap={3} align="center">
            <Heading level={2}>Campagne</Heading>
            <Text color="secondary">
              {campagne.length === 0 ? 'nessuna ancora' : `${campagne.length} fatte`}
            </Text>
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

            <VStack gap={3}>
              <VStack gap={1}>
                <Heading level={3}>Cerca potenziali clienti</Heading>
                <Text type="supporting">
                  Categoria e città come le scriveresti su Google Maps. Ogni risultato diventa un’azienda in stato
                  «da contattare», con i suoi contatti — e da lì si può far girare l’audit.
                </Text>
              </VStack>

              <HStack gap={3} align="end" wrap="wrap">
                <TextInput
                  label="Categoria"
                  placeholder="ristoranti, dentisti, falegnamerie…"
                  value={categoria}
                  onChange={setCategoria}
                />
                <TextInput
                  label="Città"
                  description="Più città separate da virgola."
                  placeholder="Pavia, Vigevano"
                  value={citta}
                  onChange={setCitta}
                />
                <TextInput
                  label="Quanti al massimo"
                  description="Un tetto c’è sempre: senza, un refuso costa un run enorme."
                  value={quanti}
                  onChange={setQuanti}
                />
                <Button
                  label="Avvia la ricerca"
                  variant="primary"
                  isDisabled={!categoria.trim() || !citta.trim()}
                  tooltip={!categoria.trim() || !citta.trim() ? 'Servono categoria e città.' : undefined}
                  clickAction={avvia}
                />
              </HStack>
            </VStack>

            <VStack gap={3}>
              <Heading level={3}>Le campagne fatte</Heading>
              {campagne.length === 0 ? (
                <EmptyState
                  title="Nessuna campagna"
                  description="Le 46 aziende che ci sono adesso sono arrivate dalla migrazione di leadgen, non da qui."
                />
              ) : (
                <List hasDividers density="balanced">
                  {campagne.map((c) => (
                    <ListItem
                      key={c.id}
                      label={c.nome}
                      description={`${c.categoria} · ${c.citta.join(', ')} · ${quandoBreve(c.creata_at)}`}
                      endContent={
                        <HStack gap={3} align="center">
                          {c.raccolte > 0 ? (
                            <Badge variant="green" label={`${c.raccolte} aziende`} />
                          ) : (
                            <Text type="supporting">non ancora raccolta</Text>
                          )}
                          {c.apify_run_id ? (
                            <Button
                              label={c.raccolte > 0 ? 'Raccogli ancora' : 'Raccogli'}
                              size="sm"
                              variant={c.raccolte > 0 ? 'ghost' : 'secondary'}
                              clickAction={() => raccogli(c.id)}
                            />
                          ) : (
                            <Text type="supporting">senza run</Text>
                          )}
                        </HStack>
                      }
                    />
                  ))}
                </List>
              )}
            </VStack>
          </VStack>
        </LayoutContent>
      }
    />
  );
}
