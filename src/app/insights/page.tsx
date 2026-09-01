/**
 * Da fare — le cose ferme, e un click per andarci.
 *
 * ⚠️ NON È UN CRUSCOTTO DI VANITÀ. Ogni riga deve rispondere a «cosa faccio
 * adesso»: niente grafici, niente totali cumulativi.
 *
 * ⚠️ E NON SI SPIEGA AL LETTORE PERCHÉ LA PAGINA È FATTA COSÌ (31/08/2026).
 * Questa pagina aveva sotto ogni titolo un paragrafo che raccontava le mie
 * scelte di progetto — «"senza sito" è la colonna che conta per chi vende siti:
 * sono i lead dove il problema è evidente prima ancora di chiamare». È una nota
 * di progettazione: sta bene qui, in un commento, dove questo progetto ha la
 * regola di scrivere il PERCHÉ. Su uno schermo dove qualcuno deve solo decidere
 * chi chiamare è rumore che allontana il numero dall'occhio. Chi usa lo
 * strumento non deve imparare come l'ho pensato.
 *
 * Regola per chi tocca questa pagina: etichetta corta, numero grosso, e la riga
 * PORTA dove si lavora invece di dire a parole dove andare.
 *
 * Pagina server: sono query, non interazione.
 */
import { query } from '@/lib/db';
import { Telaio } from '@/componenti/Telaio';
import { CatenaStriscia } from '@/componenti/CatenaStriscia';
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { List, ListItem } from '@astryxdesign/core/List';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Divider } from '@astryxdesign/core/Divider';

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
    conti.bozze_da_decidere && {
      testo: `${conti.bozze_da_decidere} testi aspettano il tuo sì`,
      vai: '/bozze',
      ora: true,
    },
    conti.caldi_non_contattati && {
      testo: `${conti.caldi_non_contattati} lead buoni da chiamare`,
      vai: '/aziende?stato=prospect',
      ora: true,
    },
    conti.da_analizzare && {
      testo: `${conti.da_analizzare} aziende senza audit`,
      vai: '/aziende',
      ora: false,
    },
    conti.clienti_senza_voce && {
      testo: `${conti.clienti_senza_voce} clienti senza voce`,
      vai: '/aziende?stato=cliente',
      ora: false,
    },
    conti.clienti_senza_fatti && {
      testo: `${conti.clienti_senza_fatti} clienti con meno di 4 fatti`,
      vai: '/aziende?stato=cliente',
      ora: false,
    },
    conti.slot_da_scrivere && {
      testo: `${conti.slot_da_scrivere} post del piano ancora da scrivere`,
      vai: '/piano',
      ora: false,
    },
  ].filter(Boolean) as Array<{ testo: string; vai: string; ora: boolean }>;

  const ordine = ['prospect', 'contattato', 'in_trattativa', 'cliente', 'perso'];


  return (
    <Telaio attiva="/insights">
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider>
            <Heading level={2}>Da fare</Heading>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={4}>
            <VStack gap={6}>
              {/*
                La mappa, non la spiegazione (01/09/2026). Questa pagina e' la
                porta d'ingresso da quando /entra non manda piu' a /aziende:
                chi arriva non sa cosa significhi "bozza" o "approvazione".
                Una riga muta — icona ed etichetta, zero prosa — non e'
                spiegare "perche' la pagina e' fatta cosi'" (quello resta
                vietato, vedi sopra): e' dire cos'e' il prodotto, che e' un'
                altra cosa. Condivisa con il login (`catenaWesion.ts`) perche'
                e' lo stesso concetto raccontato due volte.
              */}
              <CatenaStriscia />
              <Divider />

              <VStack gap={3}>
                {daFare.length === 0 ? (
                  <Banner
                    status="success"
                    title="Niente in attesa"
                    description="Tutto quello che poteva partire è partito."
                  />
                ) : (
                  /* La riga PORTA dove si lavora: prima diceva a parole
                     «Aziende -> Da contattare», che e' un'istruzione da
                     eseguire a mano. */
                  <List hasDividers density="balanced">
                    {daFare.map((r, i) => (
                      <ListItem
                        key={i}
                        label={r.testo}
                        href={r.vai}
                        startContent={r.ora ? <Badge variant="warning" label="ora" /> : null}
                        endContent={<Text type="supporting">apri →</Text>}
                      />
                    ))}
                  </List>
                )}
              </VStack>

              <VStack gap={3}>
                <Heading level={3}>Aziende</Heading>
                <List hasDividers density="balanced">
                  {ordine.map((st) => {
                    const r = imbuto.find((x) => x.stato === st);
                    if (!r) return null;
                    return (
                      <ListItem
                        key={st}
                        label={ETICHETTA[st] ?? st}
                        href={`/aziende?stato=${st}`}
                        description={r.senza_sito ? `${r.senza_sito} senza sito` : undefined}
                        endContent={<Text hasTabularNumbers>{r.quanti}</Text>}
                      />
                    );
                  })}
                </List>
              </VStack>

              <VStack gap={3}>
                <Heading level={3}>Categorie migliori</Heading>
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
                        href={`/aziende?categoria=${encodeURIComponent(c.categoria)}`}
                        description={`${c.quanti} aziende${c.senza_sito ? ` · ${c.senza_sito} senza sito` : ''}`}
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
