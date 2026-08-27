/**
 * Spie — cosa è rotto, cosa è silenzioso, cosa è giù.
 *
 * Pagina server e basta: qui non si clicca niente, si legge. I componenti
 * Astryx portano gia' il proprio `'use client'`, quindi non serve avvolgerli in
 * un componente client nostro — e cosi' al browser non spediamo il JavaScript
 * di una pagina che non ne ha bisogno.
 *
 * Ordine deciso in `leggiSpie()` e non qui: le rosse in cima, e fra le rosse
 * quelle che toccano piu' clienti. Chi apre questa pagina di solito ha poco
 * tempo — la prima cosa che legge dev'essere quella che costa di piu' ignorare.
 */
import { Telaio } from '@/componenti/Telaio';
import { leggiSpie, type Spia } from '@/lib/spie';
import { daQuando } from '@/lib/quando';
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Banner } from '@astryxdesign/core/Banner';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { List, ListItem } from '@astryxdesign/core/List';

export const dynamic = 'force-dynamic';

const TITOLO_FAMIGLIA: Record<Spia['famiglia'], string> = {
  guasto: 'Guasti',
  silenzio: 'Silenzi',
  impianto: 'Impianto',
};

/** Detto in italiano, perche' e' il taglio della pagina che cambia col tempo. */
const SOTTOTITOLO_FAMIGLIA: Record<Spia['famiglia'], string> = {
  guasto: 'Qualcosa è andato storto e ha lasciato una traccia.',
  silenzio: 'Non è successo niente, ed è quello il problema: nessun errore, nessun log.',
  impianto: 'Se è giù non funziona più niente, su tutti i clienti insieme.',
};

export default async function PaginaSpie() {
  const spie = await leggiSpie();
  // Pagina server: l'ora si prende una volta sola qui, e finisce nell'HTML.
  // Nessuna idratazione di mezzo, quindi nessun rischio di due valori diversi.
  const adesso = Date.now();
  const rosse = spie.filter((s) => s.colore === 'rossa').length;

  const famiglie: Array<Spia['famiglia']> = ['guasto', 'silenzio', 'impianto'];

  return (
    <Telaio attiva="/spie">
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider>
            <HStack gap={3} align="center">
              <Heading level={2}>Spie</Heading>
              <Text color="secondary">
                {spie.length === 0
                  ? 'nessuna accesa'
                  : `${spie.length} accese${rosse ? `, ${rosse} rosse` : ''}`}
              </Text>
            </HStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={4}>
            {spie.length === 0 ? (
              <EmptyState
                title="Nessuna spia accesa"
                description="Tutti i controlli sono passati. Vuol dire che in questo momento non risulta niente di rotto, non che non possa esserci: i controlli sanno guardare solo dove sanno guardare."
              />
            ) : (
              <VStack gap={6}>
                {famiglie.map((famiglia) => {
                  const gruppo = spie.filter((s) => s.famiglia === famiglia);
                  if (!gruppo.length) return null;
                  return (
                    <VStack key={famiglia} gap={3}>
                      <VStack gap={1}>
                        <Heading level={3}>{TITOLO_FAMIGLIA[famiglia]}</Heading>
                        <Text type="supporting">{SOTTOTITOLO_FAMIGLIA[famiglia]}</Text>
                      </VStack>

                      {gruppo.map((s) => {
                        const quando = daQuando(s.dal, adesso);
                        return (
                          <Banner
                            key={s.chiave}
                            status={s.colore === 'rossa' ? 'error' : 'warning'}
                            title={s.titolo}
                            description={s.dettaglio}
                            container="card"
                            /* Gli esempi stanno chiusi: servono quando hai già
                               deciso di occuparti di quella riga, non prima. */
                            defaultIsExpanded={false}
                            endContent={quando ? <Text type="supporting">{quando}</Text> : undefined}
                          >
                            {s.esempi.length > 0 ? (
                              <List hasDividers density="compact">
                                {s.esempi.map((e, i) => (
                                  <ListItem key={i} label={e} />
                                ))}
                                {s.quanti > s.esempi.length ? (
                                  <ListItem
                                    label={`…e altri ${s.quanti - s.esempi.length}`}
                                  />
                                ) : null}
                              </List>
                            ) : (
                              <Text type="supporting">
                                Questa spia parla dell’impianto, non di righe: non c’è un elenco da mostrare.
                              </Text>
                            )}
                          </Banner>
                        );
                      })}
                    </VStack>
                  );
                })}
              </VStack>
            )}
          </LayoutContent>
        }
      />
    </Telaio>
  );
}
