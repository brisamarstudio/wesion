'use client';

/**
 * «Da chiamare», prima schermata: una scheda per ricerca, non un elenco unico.
 *
 * ⚠️ PERCHE' CARD E NON RIGHE (02/11/2026). Le ricerche sono cose separate —
 * «hotel a Vigevano» e «ristrutturazioni a Rozzano» non si confrontano riga per
 * riga, si sceglie su quale lavorare oggi. Con tutte le aziende in un elenco
 * solo, alla quinta ricerca la pagina era un muro. Qui ogni scheda dice in
 * italiano se vale la pena (vedi `verdettoRicerca`) e porta all'elenco di
 * quella ricerca sola.
 *
 * L'elenco completo resta raggiungibile («Tutto in un elenco»): serve per
 * cercare un nome che non sai in che ricerca sta.
 */
import { useRouter } from 'next/navigation';
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Divider } from '@astryxdesign/core/Divider';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Plus, List as IconaElenco, ArrowRight } from 'lucide-react';
import {
  verdettoRicerca,
  eRicercaRicettiva,
  titoloRicerca,
  ETICHETTA_TONO,
  type RiassuntoRicerca,
  type Tono,
} from '@/lib/ricerche';
import { soloData } from '@/lib/quando';

const COLORE_TONO: Record<Tono, 'success' | 'warning' | 'neutral' | 'accent' | 'error'> = {
  buona: 'success',
  media: 'warning',
  da_vedere: 'neutral',
  magra: 'neutral',
  finita: 'accent',
  vuota: 'neutral',
};

export function RicercheDaChiamare({
  ricerche,
  senzaRicerca,
}: {
  ricerche: RiassuntoRicerca[];
  /** Aziende aggiunte a mano, fuori da ogni ricerca. */
  senzaRicerca: number;
}) {
  const router = useRouter();

  async function controllaPrenotazioni(campagna: string | number) {
    await fetch('/api/aziende/prenotazioni', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campagna }),
    }).catch(() => null);
    router.refresh();
  }

  // Prima quelle su cui c'e' lavoro, poi le finite e le vuote: la prima
  // scheda in alto a sinistra e' quella da aprire oggi.
  const ordine: Record<Tono, number> = { buona: 0, media: 1, da_vedere: 2, magra: 3, finita: 4, vuota: 5 };
  const conVerdetto = ricerche
    .map((r) => ({ r, v: verdettoRicerca(r) }))
    .sort((a, b) => ordine[a.v.tono] - ordine[b.v.tono]);

  const daChiamare = ricerche.reduce((s, r) => s + r.da_chiamare, 0);

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack justify="between" align="center" wrap="wrap" gap={3}>
            <VStack gap={0.5}>
              <Heading level={2}>Da chiamare</Heading>
              <Text type="supporting" color="secondary">
                {ricerche.length
                  ? `${daChiamare} da chiamare in ${ricerche.length} ${ricerche.length === 1 ? 'ricerca' : 'ricerche'}. Apri quella su cui lavori oggi.`
                  : 'Nessuna ricerca ancora.'}
              </Text>
            </VStack>
            <HStack gap={2} align="center" wrap="wrap">
              <Button
                label="Tutto in un elenco"
                size="sm"
                variant="ghost"
                icon={<IconaElenco size={15} />}
                onClick={() => router.push('/aziende?vista=elenco')}
              />
              <Button
                label="Nuova ricerca"
                size="sm"
                variant="primary"
                icon={<Plus size={16} />}
                onClick={() => router.push('/campagne')}
              />
            </HStack>
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={4}>
          {ricerche.length === 0 ? (
            <EmptyState
              title="Nessuna ricerca"
              description="Una ricerca porta qui le attività di una categoria in una città, pronte da chiamare."
              actions={<Button label="Fai la prima ricerca" variant="primary" onClick={() => router.push('/campagne')} />}
            />
          ) : (
            <VStack gap={4}>
              <Grid columns={{ minWidth: 340, max: 3, repeat: 'fill' }} gap={4}>
                {conVerdetto.map(({ r, v }) => (
                  <Card key={r.id} padding={0}>
                    <VStack gap={3} padding={4}>
                      <VStack gap={1}>
                        <HStack gap={2} align="center">
                          <StatusDot variant={COLORE_TONO[v.tono]} label={ETICHETTA_TONO[v.tono]} />
                          <Text type="supporting" weight="medium">
                            {ETICHETTA_TONO[v.tono]}
                          </Text>
                        </HStack>
                        <Heading level={3}>{titoloRicerca(r)}</Heading>
                        <Text type="supporting" color="secondary">
                          {r.totale} attività · cercata il {soloData(r.creata_at)}
                        </Text>
                      </VStack>

                      <VStack gap={1.5}>
                        {v.frasi.map((f, i) => (
                          <Text key={i} color={i === 0 ? 'primary' : 'secondary'}>
                            {f}
                          </Text>
                        ))}
                      </VStack>

                      {r.primi?.length && r.da_chiamare > 0 ? (
                        <VStack gap={1}>
                          <Text type="label" color="secondary">
                            Chiama per primi
                          </Text>
                          {r.primi.map((p, i) => (
                            <HStack key={p.id} gap={2} align="center" wrap="wrap">
                              <Text type="supporting" color="secondary">
                                {i + 1}.
                              </Text>
                              <Text weight="medium">{p.nome}</Text>
                              <Text type="supporting" color="secondary">
                                {p.perche.replace(/^ · /, '')}
                              </Text>
                            </HStack>
                          ))}
                        </VStack>
                      ) : null}
                    </VStack>

                    <Divider />

                    <HStack justify="between" align="center" gap={3} padding={3}>
                      <Text type="supporting" color="secondary">
                        {[
                          `${r.da_chiamare} da chiamare`,
                          r.contattati ? `${r.contattati} sentiti` : '',
                          r.in_trattativa ? `${r.in_trattativa} in trattativa` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                      <HStack gap={2} align="center">
                        {eRicercaRicettiva(r) && r.pren_da_verificare > 0 ? (
                          <Button
                            label={`Controlla le prenotazioni (${r.pren_da_verificare})`}
                            size="sm"
                            variant={v.tono === 'da_vedere' ? 'primary' : 'ghost'}
                            tooltip="Apre il sito di ognuna con un browser vero e guarda dove va chi preme «Prenota». Un paio di minuti."
                            clickAction={() => controllaPrenotazioni(r.id)}
                          />
                        ) : null}
                        <Button
                          label="Apri"
                          size="sm"
                          variant={v.tono === 'buona' ? 'primary' : 'secondary'}
                          icon={<ArrowRight size={15} />}
                          onClick={() => router.push(`/aziende?campagna=${r.id}`)}
                        />
                      </HStack>
                    </HStack>
                  </Card>
                ))}
              </Grid>

              {senzaRicerca > 0 ? (
                <Text type="supporting" color="secondary">
                  {senzaRicerca === 1 ? 'C’è anche 1 attività aggiunta' : `Ci sono anche ${senzaRicerca} attività aggiunte`} a mano, fuori
                  da ogni ricerca: le trovi in «Tutto in un elenco».
                </Text>
              ) : null}
            </VStack>
          )}
        </LayoutContent>
      }
    />
  );
}
