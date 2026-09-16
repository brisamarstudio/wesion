'use client';

/**
 * La plancia: la prima cosa che si vede aprendo un cliente.
 *
 * ⚠️ NASCE DA UNA FRASE DI CHI LA USA (15/09/2026): «avete costruito in AIchese
 * invece che in umanese. Mille cose e non c'è un click: vai qui social, ecco
 * Google, ecco il sito, ecco la tua scheda. Ci vuole il manuale d'uso».
 *
 * Prima si apriva «Chi è», che è una scheda anagrafica: giusta per un lead, muta
 * per un cliente che lavora. Le domande vere sono due — **cosa è collegato** e
 * **cosa devo fare adesso** — e non avevano risposta in nessuna pagina.
 *
 * Qui non si accende e non si spegne niente (quello sta in Impostazioni, ed è una
 * scelta: uno stato si guarda di corsa, un interruttore no). Ogni scheda ha una
 * parola sola, una frase e un bottone che porta dove si fa la cosa. Il calcolo
 * degli stati sta in `lib/plancia.ts`, apposta: qui dentro non ci deve essere
 * nessuna regola, solo come si vede.
 */
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Button } from '@astryxdesign/core/Button';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { List, ListItem } from '@astryxdesign/core/List';
import { Link } from '@astryxdesign/core/Link';
import { canali, daFareOggi, type StatoCanale } from '@/lib/plancia';
import { soloData } from '@/lib/quando';
import type { Scheda } from '@/lib/scheda';

/** Colore e parola vanno sempre insieme: il colore da solo non si legge al sole. */
const COLORE: Record<StatoCanale, 'success' | 'warning' | 'neutral'> = {
  funziona: 'success',
  problema: 'warning',
  spento: 'neutral',
};

const PAROLA: Record<StatoCanale, string> = {
  funziona: 'Funziona',
  problema: 'C’è un problema',
  spento: 'Spento',
};

export function Plancia({
  s,
  vaiA,
  apriAnagrafica,
}: {
  s: Scheda;
  /** Porta a una linguetta di questa stessa pagina. */
  vaiA: (tab: string) => void;
  /** «anagrafica» non è una linguetta: è il modulo che si apre sopra. */
  apriAnagrafica: () => void;
}) {
  const elenco = canali(s);
  const daFare = daFareOggi(s, elenco);
  const vai = (tab: string) => (tab === 'anagrafica' ? apriAnagrafica() : vaiA(tab));

  return (
    <VStack gap={5}>
      {/* ── DA FARE OGGI ────────────────────────────────────────────────────
          In cima, prima delle schede: chi apre questa pagina di corsa deve
          trovare per primo quello che si ferma se nessuno lo guarda. Righe
          fitte, non Card: è un elenco di cose da fare, non una galleria. */}
      <VStack gap={2}>
        <Heading level={3}>Da fare oggi</Heading>
        {daFare.length === 0 ? (
          <Text color="secondary">Niente da fare oggi: è tutto in ordine.</Text>
        ) : (
          <List hasDividers density="compact">
            {daFare.map((r) => (
              <ListItem
                key={r.id}
                label={r.testo}
                startContent={<StatusDot variant={r.urgente ? 'warning' : 'neutral'} label={r.testo} />}
                endContent={
                  <Button label={r.etichetta} size="sm" variant="secondary" onClick={() => vai(r.tab)} />
                }
              />
            ))}
          </List>
        )}
      </VStack>

      {/* ── I CANALI ────────────────────────────────────────────────────────
          Una scheda per canale, in griglia che si impila da sola sotto i 700px
          (`minWidth`, non un numero fisso di colonne): questa pagina si apre
          anche dal telefono, in piedi davanti al locale. */}
      <Grid columns={{ minWidth: 220, repeat: 'fill' }} gap={3}>
        {elenco.map((c) => (
          <Card key={c.id}>
            <VStack gap={2} padding={3}>
              <Text weight="medium">{c.nome}</Text>
              <HStack gap={2} align="center">
                <StatusDot variant={COLORE[c.stato]} label={PAROLA[c.stato]} tooltip={PAROLA[c.stato]} />
                <Text type="supporting">{PAROLA[c.stato]}</Text>
              </HStack>
              <Text type="supporting" color="secondary">
                {c.dettaglio}
              </Text>
              {c.azione ? (
                <HStack gap={2}>
                  <Button
                    label={c.azione.etichetta}
                    size="sm"
                    variant={c.stato === 'problema' ? 'primary' : 'secondary'}
                    onClick={() => vai(c.azione!.tab)}
                  />
                </HStack>
              ) : null}
            </VStack>
          </Card>
        ))}
      </Grid>

      {/* ── IL SITO ─────────────────────────────────────────────────────────
          Non è un canale di pubblicazione come gli altri: è il posto dove
          l'audit SEO/GEO apre proposte. Sta sotto, in una riga sola, perché è
          l'unica cosa di questa pagina che non si guarda ogni giorno. */}
      <VStack gap={1}>
        <Heading level={3}>Il sito</Heading>
        {!s.sito_repo_url ? (
          <Text color="secondary">
            Il sito non è collegato: senza il suo repository il controllo SEO non può girare.{' '}
            <Link href="#" onClick={apriAnagrafica}>
              Collegalo
            </Link>
          </Text>
        ) : (
          <HStack gap={3} align="center" wrap="wrap">
            <Text type="supporting" color="secondary">
              {s.sito_ultimo_audit_at
                ? `ultimo controllo il ${soloData(s.sito_ultimo_audit_at)}`
                : 'mai controllato'}
            </Text>
            {s.sito_ultimo_errore ? (
              <HStack gap={2} align="center">
                <StatusDot variant="warning" label="l’ultimo controllo non è andato" />
                <Text type="supporting">l’ultimo controllo non è andato</Text>
              </HStack>
            ) : null}
            {s.sito_ultima_pr_url ? (
              <Button label="Guarda la proposta" size="sm" variant="secondary" onClick={() => vaiA('chi')} />
            ) : null}
          </HStack>
        )}
      </VStack>
    </VStack>
  );
}
