/**
 * Insights — dove si è fermato il lavoro, e cosa lo sblocca.
 *
 * ⚠️ NON È UN CRUSCOTTO DI VANITÀ. Ogni riga qui deve rispondere a «cosa faccio
 * adesso», altrimenti è un numero che si guarda una volta e poi non si guarda
 * più. Per questo non c'è nessun grafico e nessun totale cumulativo: ci sono le
 * cose ferme e dove si riprendono.
 *
 * Pagina server: sono query, non interazione.
 */
import { query } from '@/lib/db';
import { Telaio } from '@/componenti/Telaio';
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { List, ListItem } from '@astryxdesign/core/List';
import { EmptyState } from '@astryxdesign/core/EmptyState';

export const dynamic = 'force-dynamic';

const ETICHETTA: Record<string, string> = {
  prospect: 'Da contattare',
  contattato: 'Contattate',
  in_trattativa: 'In trattativa',
  cliente: 'Clienti',
  perso: 'Perse',
};

export default async function PaginaInsights() {
  /**
   * Le tre insieme: nessuna usa il risultato di un'altra, e ogni viaggio a
   * Neon costa 38 ms. In fila erano 114 ms di sola attesa.
   */
  const [imbuto, categorie, conti] = await Promise.all([
    query<{ stato: string; quanti: number; con_audit: number; senza_sito: number }>(
    `SELECT a.stato,
            count(*)::int AS quanti,
            count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM wesion.audit x WHERE x.azienda_id = a.id AND x.esito = 'ok'))::int AS con_audit,
            count(*) FILTER (WHERE NOT EXISTS (
              SELECT 1 FROM wesion.contatto c WHERE c.azienda_id = a.id AND c.tipo = 'sito'))::int AS senza_sito
       FROM wesion.azienda a GROUP BY a.stato`
    ),

  /**
   * Le categorie ordinate per PUNTEGGIO MEDIO, non per numero.
   *
   * Dieci lead scadenti valgono meno di tre buoni, e il conteggio da solo
   * direbbe il contrario: servirebbe a scegliere la campagna sbagliata.
   */
    query<{ categoria: string; quanti: number; media: number | null; senza_sito: number }>(
    `SELECT COALESCE(NULLIF(a.categoria, ''), 'senza categoria') AS categoria,
            count(*)::int AS quanti,
            round(avg(u.score))::int AS media,
            count(*) FILTER (WHERE NOT EXISTS (
              SELECT 1 FROM wesion.contatto c WHERE c.azienda_id = a.id AND c.tipo = 'sito'))::int AS senza_sito
       FROM wesion.azienda a
       LEFT JOIN LATERAL (
         SELECT x.score FROM wesion.audit x
          WHERE x.azienda_id = a.id AND x.esito = 'ok'
          ORDER BY x.eseguito_at DESC LIMIT 1
       ) u ON true
      GROUP BY 1 HAVING count(*) > 1
      ORDER BY avg(u.score) DESC NULLS LAST, count(*) DESC LIMIT 12`
    ),

    query<{
    da_analizzare: number;
    caldi_non_contattati: number;
    clienti_senza_voce: number;
    clienti_senza_fatti: number;
    bozze_da_decidere: number;
    slot_da_scrivere: number;
  }>(
    `SELECT
       (SELECT count(*)::int FROM wesion.azienda a
         WHERE NOT EXISTS (SELECT 1 FROM wesion.audit x WHERE x.azienda_id = a.id AND x.esito = 'ok'))
         AS da_analizzare,
       (SELECT count(*)::int FROM wesion.azienda a
         JOIN LATERAL (SELECT x.score FROM wesion.audit x
                        WHERE x.azienda_id = a.id AND x.esito = 'ok'
                        ORDER BY x.eseguito_at DESC LIMIT 1) u ON true
         WHERE a.stato = 'prospect' AND u.score >= 80)
         AS caldi_non_contattati,
       (SELECT count(*)::int FROM wesion.azienda a LEFT JOIN wesion.voce v ON v.azienda_id = a.id
         WHERE a.stato = 'cliente' AND (v.azienda_id IS NULL OR COALESCE(v.voce, '') = ''))
         AS clienti_senza_voce,
       (SELECT count(*)::int FROM wesion.azienda a
         WHERE a.stato = 'cliente'
           AND (SELECT count(*) FROM wesion.fatto f WHERE f.azienda_id = a.id AND f.attivo) < 4)
         AS clienti_senza_fatti,
       (SELECT count(*)::int FROM wesion.bozza WHERE stato = 'attesa_approvazione') AS bozze_da_decidere,
       (SELECT count(*)::int FROM wesion.bozza WHERE stato = 'vuota') AS slot_da_scrivere`
    ),
  ]).then(([i, c, k]) => [i, c, k[0]] as const);

  /**
   * Ogni riga è un lavoro fermo CON SCRITTO DOVE SI RIPRENDE.
   *
   * È la parte che rende questa pagina diversa da un rapporto: si legge e si sa
   * dove andare, invece di sapere solo che qualcosa non va.
   */
  const daFare = [
    conti.caldi_non_contattati && {
      testo: `${conti.caldi_non_contattati} lead con punteggio 80 o più non sono ancora stati contattati`,
      dove: 'Aziende → «Da contattare». Sono in cima: l’elenco ordina per punteggio',
      ora: true,
    },
    conti.bozze_da_decidere && {
      testo: `${conti.bozze_da_decidere} bozze aspettano un sì o un no`,
      dove: 'Bozze → «Da decidere». È l’unica coda che si ferma se nessuno la guarda',
      ora: true,
    },
    conti.da_analizzare && {
      testo: `${conti.da_analizzare} aziende non hanno ancora un audit riuscito`,
      dove: 'Aziende → «Analizza le mancanti». È gratis: passa dalla catena, 25 per giro',
      ora: false,
    },
    conti.clienti_senza_voce && {
      testo: `${conti.clienti_senza_voce} clienti non hanno una voce`,
      dove: 'Scheda cliente → «Ricava la voce da quello che c’è». Senza, i post escono da agenzia',
      ora: false,
    },
    conti.clienti_senza_fatti && {
      testo: `${conti.clienti_senza_fatti} clienti hanno meno di 4 fatti`,
      dove: 'Scheda cliente → «Cosa è vero». Sotto i quattro i temi finiscono e il mese si ripete',
      ora: false,
    },
    conti.slot_da_scrivere && {
      testo: `${conti.slot_da_scrivere} slot del piano non hanno ancora un testo`,
      dove: 'Scheda cliente → «Scrivi i testi mancanti»',
      ora: false,
    },
  ].filter(Boolean) as Array<{ testo: string; dove: string; ora: boolean }>;

  const ordine = ['prospect', 'contattato', 'in_trattativa', 'cliente', 'perso'];
  const totale = imbuto.reduce((n, r) => n + r.quanti, 0);

  return (
    <Telaio attiva="/insights">
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider>
            <HStack gap={3} align="center">
              <Heading level={2}>Insights</Heading>
              <Text color="secondary">dove si è fermato il lavoro</Text>
            </HStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={4}>
            <VStack gap={6}>
              <VStack gap={3}>
                <VStack gap={1}>
                  <Heading level={3}>Cosa fare adesso</Heading>
                  <Text type="supporting">
                    Ogni riga è un lavoro fermo, con scritto dove si sblocca. Se è vuota, non c’è niente in attesa
                    di una persona.
                  </Text>
                </VStack>
                {daFare.length === 0 ? (
                  <Banner
                    status="success"
                    title="Niente in attesa"
                    description="Tutto quello che poteva partire è partito."
                  />
                ) : (
                  <List hasDividers density="balanced">
                    {daFare.map((r, i) => (
                      <ListItem
                        key={i}
                        label={r.testo}
                        description={r.dove}
                        startContent={r.ora ? <Badge variant="warning" label="ora" /> : null}
                      />
                    ))}
                  </List>
                )}
              </VStack>

              <VStack gap={3}>
                <VStack gap={1}>
                  <Heading level={3}>L’imbuto</Heading>
                  <Text type="supporting">
                    {totale} aziende in tutto. «senza sito» è la colonna che conta per chi vende siti: sono i lead
                    dove il problema è evidente prima ancora di chiamare.
                  </Text>
                </VStack>
                <List hasDividers density="balanced">
                  {ordine.map((st) => {
                    const r = imbuto.find((x) => x.stato === st);
                    if (!r) return null;
                    return (
                      <ListItem
                        key={st}
                        label={ETICHETTA[st] ?? st}
                        description={`${r.con_audit} con audit · ${r.senza_sito} senza sito`}
                        endContent={<Text hasTabularNumbers>{r.quanti}</Text>}
                      />
                    );
                  })}
                </List>
              </VStack>

              <VStack gap={3}>
                <VStack gap={1}>
                  <Heading level={3}>Dove conviene cercare</Heading>
                  <Text type="supporting">
                    Ordinate per punteggio medio dell’audit, non per numero: dieci lead scadenti valgono meno di
                    tre buoni, e il conteggio da solo farebbe scegliere la campagna sbagliata.
                  </Text>
                </VStack>
                {categorie.length === 0 ? (
                  <EmptyState
                    isCompact
                    title="Non abbastanza dati"
                    description="Servono almeno due aziende per categoria, e qualche audit fatto."
                  />
                ) : (
                  <List hasDividers density="compact">
                    {categorie.map((c) => (
                      <ListItem
                        key={c.categoria}
                        label={c.categoria}
                        description={`${c.quanti} aziende · ${c.senza_sito} senza sito`}
                        endContent={
                          c.media ? (
                            <Badge variant={c.media >= 80 ? 'orange' : 'neutral'} label={`media ${c.media}`} />
                          ) : (
                            <Text type="supporting">mai analizzata</Text>
                          )
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
    </Telaio>
  );
}
