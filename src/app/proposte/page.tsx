/**
 * Proposte per il sito — l'audit SEO/GEO di tutti i clienti, in una riga per uno.
 *
 * ⚠️ NON ESISTEVA (16/09/2026). L'audit sapeva leggere il repo, aprire una PR e
 * mostrarla — ma solo DENTRO la scheda del singolo cliente, sotto «Chi è». Con
 * quindici clienti, «ci sono proposte in attesa?» voleva dire aprire quindici
 * schede: cioè non chiederselo mai, e lasciare aperte PR che nessuno guarda.
 * Il lavoro c'era tutto, mancava il posto da cui vederlo.
 *
 * Qui non si approva niente e non si lancia niente: è un elenco che dice a chi
 * bisogna andare. Il bottone porta alla scheda, dove la proposta si legge col
 * diff e si applica — quello resta l'ultimo click, e resta dell'operatore.
 */
import { query } from '@/lib/db';
import { Telaio } from '@/componenti/Telaio';
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Button } from '@astryxdesign/core/Button';
import { soloData } from '@/lib/quando';

export const dynamic = 'force-dynamic';

interface RigaSito {
  azienda_id: string;
  nome: string;
  citta: string | null;
  repo_url: string;
  ultimo_audit_at: string | null;
  ultima_pr_url: string | null;
  ultimo_errore: string | null;
}

export default async function PaginaProposte() {
  const righe = await query<RigaSito>(`
    SELECT s.azienda_id::text, a.nome, a.citta, s.repo_url,
           s.ultimo_audit_at, s.ultima_pr_url, s.ultimo_errore
      FROM wesion.sito s
      JOIN wesion.azienda a ON a.id = s.azienda_id
     WHERE a.stato = 'cliente'
     -- Prima chi ha una proposta ferma, poi chi si e' rotto, poi chi non e'
     -- mai stato controllato: e' l'ordine di quanto costa ignorarli.
     ORDER BY (s.ultima_pr_url IS NOT NULL) DESC,
              (s.ultimo_errore IS NOT NULL) DESC,
              s.ultimo_audit_at NULLS FIRST,
              a.nome
  `);

  const conProposta = righe.filter((r) => r.ultima_pr_url).length;

  return (
    <Telaio attiva="/proposte">
      <Layout
        height="fill"
        header={
          <LayoutHeader hasDivider>
            <HStack gap={3} align="center" wrap="wrap">
              <Heading level={2}>Proposte per il sito</Heading>
              <Text color="secondary">
                {conProposta === 0
                  ? 'nessuna proposta aperta'
                  : conProposta === 1
                    ? 'una proposta aperta'
                    : `${conProposta} proposte aperte`}
              </Text>
            </HStack>
          </LayoutHeader>
        }
        content={
          <LayoutContent padding={0}>
            {righe.length === 0 ? (
              <VStack gap={2} padding={4}>
                <Text color="secondary">
                  Nessun cliente ha il sito collegato. Il controllo SEO legge il codice del sito: si
                  collega dalla scheda del cliente, in «Modifica anagrafica».
                </Text>
              </VStack>
            ) : (
              <List hasDividers>
                {righe.map((r) => {
                  const stato = r.ultima_pr_url
                    ? { variant: 'warning' as const, testo: 'una proposta aspetta un sì' }
                    : r.ultimo_errore
                      ? { variant: 'error' as const, testo: 'l’ultimo controllo non è andato' }
                      : r.ultimo_audit_at
                        ? { variant: 'success' as const, testo: `controllato il ${soloData(r.ultimo_audit_at)}` }
                        : { variant: 'neutral' as const, testo: 'mai controllato' };
                  return (
                    <ListItem
                      key={r.azienda_id}
                      label={r.nome}
                      description={`${r.citta ?? ''}${r.citta ? ' · ' : ''}${stato.testo}`}
                      startContent={<StatusDot variant={stato.variant} label={stato.testo} />}
                      endContent={
                        <Button
                          label={r.ultima_pr_url ? 'Guarda la proposta' : 'Apri il cliente'}
                          size="sm"
                          variant={r.ultima_pr_url ? 'primary' : 'secondary'}
                          href={`/aziende/${r.azienda_id}?tab=chi`}
                        />
                      }
                    />
                  );
                })}
              </List>
            )}
          </LayoutContent>
        }
      />
    </Telaio>
  );
}
