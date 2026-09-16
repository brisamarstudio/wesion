/**
 * I clienti — non i lead.
 *
 * ⚠️ PERCHE' ESISTE, E NON BASTAVA IL FILTRO "Clienti" DENTRO /aziende
 * (02/09/2026). Quel filtro cambia la lista ma non il pannello: a destra resta
 * comunque "Come aprire il discorso", punteggio di urgenza, "Copia il gancio"
 * — tutta roba che ha senso per un lead che non hai ancora chiamato, e nessun
 * senso per chi è già cliente da mesi. Il sintomo è stato reale: aprendo
 * Trattoria La Fenice da lì, in cima c'era un invito a decidere "chi chiamo
 * per primo" su qualcuno che si chiama già da un pezzo.
 *
 * Questa pagina non duplica la scheda cliente (`/aziende/[id]`, che è già
 * fatta bene: Plancia, voce, fatti, impostazioni) — è solo la porta giusta per
 * arrivarci.
 *
 * ⚠️ OGNI RIGA DICE COSA GLI FACCIAMO, NON COM'È FATTO DENTRO (16/09/2026).
 * Prima ogni cliente portava appeso «senza repo — audit SEO non attivo»: vero,
 * e illeggibile per chi non ha scritto il codice. Adesso porta i tre prodotti —
 * Google, Social, Sito — con la stessa regola della Plancia: acceso e pronto è
 * pieno, acceso e rotto è un avviso, spento non c'è. E si filtra: «fammi vedere
 * solo i clienti social» è la domanda che si fa prima di mandare un preventivo.
 */
import { Telaio } from '@/componenti/Telaio';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { List, ListItem } from '@astryxdesign/core/List';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout';
import { query } from '@/lib/db';
import { soloData } from '@/lib/quando';
import { leggiProdotto, PRODOTTI } from '@/lib/prodotti';

import { BottoneImportaGBP } from '@/componenti/BottoneImportaGBP';

export const dynamic = 'force-dynamic';

interface Cliente {
  id: string | number;
  nome: string;
  categoria: string | null;
  citta: string | null;
  google_attivo: boolean;
  google_pronto: boolean;
  social_attivo: boolean;
  blog_attivo: boolean;
  blog_pronto: boolean;
  sito_repo_url: string | null;
  sito_ultimo_audit_at: string | null;
  sito_ultima_pr_url: string | null;
}

/** I filtri in cima: gli stessi prodotti del menù, più «Tutti». */
const FILTRI: Array<{ id: string; label: string }> = [
  { id: '', label: 'Tutti' },
  { id: 'google', label: PRODOTTI.google.label },
  { id: 'social', label: PRODOTTI.social.label },
  { id: 'sito', label: PRODOTTI.sito.label },
];

export default async function PaginaClienti({
  searchParams,
}: {
  searchParams: Promise<{ prodotto?: string }>;
}) {
  const { prodotto: chiesto } = await searchParams;
  const prodotto = leggiProdotto(chiesto);

  /**
   * ⚠️ «Attivo» e «pronto» sono due cose diverse, ed è la lezione del
   * 01/09/2026 (il blog di MyWebby acceso su localhost, che non pubblicava
   * niente e non lo diceva). Le stesse condizioni stanno in `servizi_pronti`
   * dentro `bozze.ts`: se cambiano lì, cambiano qui.
   *
   * Dalla config escono SOLO dei booleani: i segreti e le chiavi di Google
   * stanno nella stessa colonna e non devono arrivare al browser.
   */
  const clienti = await query<Cliente>(
    `SELECT
       a.id, a.nome, a.categoria, a.citta,
       EXISTS (SELECT 1 FROM wesion.servizio s
                WHERE s.azienda_id = a.id AND s.attivo
                  AND s.tipo IN ('post_gbp','menu_del_giorno'))            AS google_attivo,
       EXISTS (SELECT 1 FROM wesion.servizio s
                WHERE s.azienda_id = a.id AND s.attivo AND s.tipo = 'post_gbp'
                  AND COALESCE(s.config->>'gbp_account_id', '') <> ''
                  AND COALESCE(s.config->>'gbp_location_id', '') <> '')    AS google_pronto,
       EXISTS (SELECT 1 FROM wesion.servizio s
                WHERE s.azienda_id = a.id AND s.attivo AND s.tipo = 'social') AS social_attivo,
       EXISTS (SELECT 1 FROM wesion.servizio s
                WHERE s.azienda_id = a.id AND s.attivo AND s.tipo = 'blog')   AS blog_attivo,
       EXISTS (SELECT 1 FROM wesion.servizio s
                WHERE s.azienda_id = a.id AND s.attivo AND s.tipo = 'blog'
                  AND CASE WHEN s.config->>'tipo' = 'wordpress'
                           THEN COALESCE(s.config->>'wp_base', '') <> ''
                           ELSE COALESCE(s.config->>'site_blog_url', '') <> ''
                                AND s.config->>'site_blog_url' NOT LIKE '%localhost%'
                                AND s.config->>'site_blog_url' NOT LIKE '%127.0.0.1%'
                      END)                                                 AS blog_pronto,
       sito.repo_url AS sito_repo_url,
       sito.ultimo_audit_at AS sito_ultimo_audit_at,
       sito.ultima_pr_url AS sito_ultima_pr_url
     FROM wesion.azienda a
     LEFT JOIN wesion.sito sito ON sito.azienda_id = a.id
     WHERE a.stato = 'cliente'
     ORDER BY a.nome`
  );

  // Il filtro in JS e non in SQL: sono quindici righe, e la query ha già
  // abbastanza da leggere. Il giorno che i clienti fossero mille, va nel WHERE.
  const mostrati = clienti.filter((c) => {
    if (prodotto === 'google') return c.google_attivo;
    if (prodotto === 'social') return c.social_attivo;
    if (prodotto === 'sito') return c.blog_attivo || Boolean(c.sito_repo_url);
    return true;
  });

  return (
    <Telaio attiva="/clienti">
      <Layout
        header={
          <LayoutHeader hasDivider>
            <VStack gap={3}>
              <HStack justify="between" align="center" wrap="wrap" gap={3}>
                <VStack gap={1}>
                  <Heading level={1}>Clienti</Heading>
                  <Text type="supporting" color="secondary">
                    {mostrati.length === clienti.length
                      ? `${clienti.length} clienti`
                      : `${mostrati.length} su ${clienti.length}`}
                    {' · '}
                    chi è già dentro, non chi va ancora chiamato
                  </Text>
                </VStack>
                <BottoneImportaGBP />
              </HStack>
              <HStack gap={2} wrap="wrap">
                {FILTRI.map((f) => (
                  <Button
                    key={f.id || 'tutti'}
                    label={f.label}
                    size="sm"
                    variant={(prodotto ?? '') === f.id ? 'primary' : 'secondary'}
                    href={f.id ? `/clienti?prodotto=${f.id}` : '/clienti'}
                  />
                ))}
              </HStack>
            </VStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            {clienti.length === 0 ? (
              <EmptyState
                title="Nessun cliente ancora"
                description="Chi passa a «Cliente» nel funnel di Aziende compare qui."
              />
            ) : mostrati.length === 0 ? (
              <EmptyState
                title={`Nessun cliente su ${prodotto ? PRODOTTI[prodotto].label : 'questo prodotto'}`}
                description="Si attiva dalla scheda del cliente, in «Impostazioni»."
              />
            ) : (
              <List hasDividers>
                {mostrati.map((c) => (
                  <ListItem
                    key={c.id}
                    href={`/aziende/${c.id}`}
                    label={c.nome}
                    description={[c.categoria, c.citta].filter(Boolean).join(' · ') || undefined}
                    endContent={
                      <HStack gap={2} align="center" wrap="wrap">
                        {c.google_attivo ? (
                          <Badge
                            variant={c.google_pronto ? 'success' : 'warning'}
                            label={c.google_pronto ? 'Google' : 'Google da collegare'}
                          />
                        ) : null}
                        {c.social_attivo ? <Badge variant="success" label="Social" /> : null}
                        {c.blog_attivo ? (
                          <Badge
                            variant={c.blog_pronto ? 'success' : 'warning'}
                            label={c.blog_pronto ? 'Sito' : 'Sito da sistemare'}
                          />
                        ) : null}
                        {/* Il controllo SEO è l'unica cosa che si dice anche a
                            chi non ha il blog acceso: gira sul codice del sito,
                            non sui post. */}
                        {c.sito_ultima_pr_url ? (
                          <Badge variant="warning" label="una proposta da guardare" />
                        ) : c.sito_ultimo_audit_at ? (
                          <Badge variant="neutral" label={`controllato ${soloData(c.sito_ultimo_audit_at)}`} />
                        ) : null}
                        {!c.google_attivo && !c.social_attivo && !c.blog_attivo ? (
                          <Badge variant="neutral" label="niente attivo" />
                        ) : null}
                      </HStack>
                    }
                  />
                ))}
              </List>
            )}
          </LayoutContent>
        }
      />
    </Telaio>
  );
}
