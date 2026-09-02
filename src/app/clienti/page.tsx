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
 * fatta bene: voce, fatti, servizi, piano) — è solo la porta giusta per
 * arrivarci, con una lista che parla di CHI SONO GIÀ NOSTRI: sito, audit
 * SEO, non "quanto urge chiamarli".
 */
import { Telaio } from '@/componenti/Telaio';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { List, ListItem } from '@astryxdesign/core/List';
import { Badge } from '@astryxdesign/core/Badge';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout';
import { query } from '@/lib/db';
import { soloData } from '@/lib/quando';

export const dynamic = 'force-dynamic';

interface Cliente {
  id: number;
  nome: string;
  categoria: string | null;
  citta: string | null;
  sito_pubblico: string | null;
  sito_repo_url: string | null;
  sito_ultimo_audit_at: string | null;
  sito_ultima_pr_url: string | null;
}

export default async function PaginaClienti() {
  const clienti = await query<Cliente>(
    `SELECT
       a.id, a.nome, a.categoria, a.citta,
       (SELECT c.normalizzato FROM wesion.contatto c
         WHERE c.azienda_id = a.id AND c.tipo = 'sito' ORDER BY c.id LIMIT 1) AS sito_pubblico,
       sito.repo_url AS sito_repo_url,
       sito.ultimo_audit_at AS sito_ultimo_audit_at,
       sito.ultima_pr_url AS sito_ultima_pr_url
     FROM wesion.azienda a
     LEFT JOIN wesion.sito sito ON sito.azienda_id = a.id
     WHERE a.stato = 'cliente'
     ORDER BY a.nome`
  );

  return (
    <Telaio attiva="/clienti">
      <Layout
        header={
          <LayoutHeader hasDivider>
            <VStack gap={1}>
              <Heading level={1}>Clienti</Heading>
              <Text type="supporting" color="secondary">
                Chi è già dentro — non chi va ancora chiamato. Per il discorso di apertura
                e il punteggio di urgenza, quello sta in «Aziende».
              </Text>
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
            ) : (
              <List>
                {clienti.map((c) => (
                  <ListItem
                    key={c.id}
                    href={`/aziende/${c.id}`}
                    label={c.nome}
                    description={[c.categoria, c.citta].filter(Boolean).join(' · ') || undefined}
                    endContent={
                      <HStack gap={2} align="center">
                        {c.sito_pubblico ? (
                          <Badge variant="neutral" label={c.sito_pubblico} />
                        ) : null}
                        {!c.sito_repo_url ? (
                          <Badge variant="warning" label="senza repo — audit SEO non attivo" />
                        ) : c.sito_ultima_pr_url ? (
                          <Badge
                            variant="success"
                            label={`PR aperta${c.sito_ultimo_audit_at ? ` · ${soloData(c.sito_ultimo_audit_at)}` : ''}`}
                          />
                        ) : c.sito_ultimo_audit_at ? (
                          <Badge variant="info" label={`ultimo audit ${soloData(c.sito_ultimo_audit_at)}`} />
                        ) : (
                          <Badge variant="neutral" label="mai analizzato" />
                        )}
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
