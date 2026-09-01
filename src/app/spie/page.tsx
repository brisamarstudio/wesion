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
import { daQuando, quandoBreve } from '@/lib/quando';
import { query } from '@/lib/db';
import { ETICHETTA_TIPO, ETICHETTA_DESTINAZIONE } from '@/lib/bozze';
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Banner } from '@astryxdesign/core/Banner';
import { Badge } from '@astryxdesign/core/Badge';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { List, ListItem } from '@astryxdesign/core/List';

export const dynamic = 'force-dynamic';

interface RigaPubblicazione {
  id: number;
  azienda_id: number;
  azienda: string;
  tipo: string;
  contenuto: Record<string, unknown>;
  destinazione: string;
  esito: 'ok' | 'errore';
  errore: string | null;
  tentativi: number;
  eseguita_at: string;
}

/**
 * Le ultime uscite, riuscite o no — ispirata alla "Coda Pubblicazione AI" di
 * gbp-autoposter (01/09/2026), ma sopra lo schema vero di Wesion: una riga per
 * DESTINAZIONE, non uno stato composito su una tabella `posts`. `pubblicazione`
 * esisteva da sempre ma non aveva mai una schermata — la leggevano solo
 * `/calendario` (due booleani) e la consolle bozze (nascosta nel dettaglio):
 * per vederla per intero bisognava aprire il database a mano.
 *
 * ⚠️ QUESTO NON RICONTROLLA CON GOOGLE. Google approva i post in modo
 * asincrono: un `esito='ok'` qui vuol dire "Google l'ha accettato all'invio",
 * non "è ancora live adesso" — gbp-autoposter l'ha imparato a sue spese (il
 * suo STATO.md: un post accettato e poi respinto in silenzio dalla revisione).
 * Un ricontrollo vero tocca `router/pubblica.ts` + `src/lib/gbp.ts` e serve il
 * router acceso: resta un lavoro a parte, non fatto qui.
 */
async function leggiPubblicazioniRecenti(): Promise<RigaPubblicazione[]> {
  return query<RigaPubblicazione>(
    `SELECT p.id, b.azienda_id, a.nome AS azienda, b.tipo, b.contenuto,
            p.destinazione, p.esito, p.errore, p.tentativi, p.eseguita_at
       FROM wesion.pubblicazione p
       JOIN wesion.bozza b ON b.id = p.bozza_id
       JOIN wesion.azienda a ON a.id = b.azienda_id
      ORDER BY p.eseguita_at DESC
      LIMIT 30`
  );
}

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
  // Le due indipendenti insieme, non in fila: nessuna usa il risultato
  // dell'altra (stessa regola di `insights/page.tsx`).
  const [spie, pubblicazioni] = await Promise.all([leggiSpie(), leggiPubblicazioniRecenti()]);
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
            <VStack gap={8}>
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
                                  <ListItem key={i} label={e.etichetta} href={e.href} />
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

            <VStack gap={3}>
              <VStack gap={1}>
                <Heading level={3}>Pubblicazioni recenti</Heading>
                <Text type="supporting">
                  Le ultime uscite, riuscite o no — su tutti i clienti insieme.
                </Text>
              </VStack>

              {pubblicazioni.length === 0 ? (
                <EmptyState
                  isCompact
                  title="Ancora niente"
                  description="Zero righe in pubblicazione: non è mai uscito niente, da nessuna parte."
                />
              ) : (
                <List hasDividers density="balanced">
                  {pubblicazioni.map((p) => (
                    <ListItem
                      key={p.id}
                      label={`${p.azienda} — ${
                        (p.contenuto?.titolo as string | undefined) ||
                        ETICHETTA_TIPO[p.tipo] ||
                        p.tipo
                      }`}
                      description={`${ETICHETTA_DESTINAZIONE[p.destinazione] ?? p.destinazione}${
                        p.esito === 'errore' && p.errore ? ` · ${p.errore}` : ''
                      }${p.tentativi > 1 ? ` · tentativo ${p.tentativi}` : ''}`}
                      href={`/aziende/${p.azienda_id}`}
                      startContent={
                        <Badge
                          variant={p.esito === 'ok' ? 'success' : 'error'}
                          label={p.esito === 'ok' ? 'ok' : 'errore'}
                        />
                      }
                      endContent={<Text type="supporting">{quandoBreve(p.eseguita_at)}</Text>}
                    />
                  ))}
                </List>
              )}
            </VStack>
            </VStack>
          </LayoutContent>
        }
      />
    </Telaio>
  );
}
