'use client';

/**
 * Il modulo d'ingresso.
 *
 * Split-screen (31/08→01/09/2026): prima era un modulo nudo — VStack, input
 * senza contenitore, nessuna Card. Il pannello di destra non e' decorazione
 * a caso: e' la catena di STATO.md §7 (fatto → voce → bozza → approvazione →
 * pubblicazione), la stessa cosa che il software fa, mostrata a chi sta per
 * entrarci. Niente illustrazione stock: Astryx non ne fornisce (solo linee
 * guida di piazzamento), e un'icona generica avrebbe detto meno di questo.
 *
 * ⚠️ Il pannello sparisce sotto gli 800px di larghezza DELLA CARD (container
 * query, non media query — un iPad in verticale ci passa sotto apposta):
 * sotto un certo punto è solo ingombro, non identita'.
 *
 * Riporta dove si stava andando (`?poi=`) invece di scaricare tutti sulla home:
 * chi apre il link di una bozza e si ritrova a dover entrare, dopo vuole quella
 * bozza, non l'elenco aziende.
 *
 * ⚠️ La destinazione si accetta solo se comincia per `/` e non per `//`. Senza
 * quel controllo, un `?poi=//altrosito.it` diventerebbe un redirect verso
 * fuori: si manda a qualcuno un link alla NOSTRA pagina di login e lo si
 * scarica su una copia identica che raccoglie password.
 */
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { TAPPE_CATENA } from '@/componenti/catenaWesion';
import { Center } from '@astryxdesign/core/Center';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { Section } from '@astryxdesign/core/Section';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';

// Grid emette minmax(MIN, 1fr): sotto 2×MIN + gap la colonna singola prende
// tutto lo spazio. E' la stessa soglia su cui si aggancia la container query
// qui sotto, cosi' i due punti di rottura non possono disallinearsi. 400 (non
// 320) apposta: a 320 un iPad in verticale (~720px di card) teneva ancora le
// due colonne, ognuna a ~360px — il modulo ci stava, ma stretto. Sopra gli
// 800px di card (tablet in orizzontale in su) le due colonne tornano comode.
const COLUMN_MIN_WIDTH = 400;

// Arancio vero del logo (misurato sul PNG, non un token semantico: qui serve
// il colore del marchio, non uno stato dell'interfaccia — vedi AGENTS.md sul
// perche' altrove si usano solo i token).
const ARANCIO_MARCHIO = '236, 101, 51';

// Un <style> semplice: niente compilatore StyleX per query CSS e sfondo a piu'
// livelli che StyleX non saprebbe scrivere comunque (§5.1 di STATO.md — qui
// non serve prenderlo).
const STILE_INGRESSO = `
.wesion-ingresso-pagina {
  /* 100% da solo non basta: richiede che OGNI antenato fino a <html> abbia
     un'altezza esplicita, e qui non ce l'ha nessuno — il pannello restava
     incollato in alto invece di centrarsi. Il viewport non ha bisogno di
     antenati. Le due righe sono apposta: la seconda vince dove dvh esiste
     (tiene conto della barra degli indirizzi mobile), altrimenti resta la
     prima — mai nessuna reale sui browser di oggi. */
  min-height: 100vh;
  min-height: 100dvh;
  background-color: var(--color-background-body);
  /* Punteggio fine ovunque, poi due aloni caldi (l'arancio del marchio) e
     freddi (l'accent del tema) fuori centro: rompe il nero piatto senza
     trasformare un login in una pagina marketing. */
  background-image:
    radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    radial-gradient(620px 620px at 12% 18%, rgba(${ARANCIO_MARCHIO}, 0.16), transparent 60%),
    radial-gradient(560px 560px at 88% 82%, rgba(232, 241, 246, 0.06), transparent 60%);
  background-size: 28px 28px, auto, auto;
  padding: var(--spacing-6);
}
@media (max-width: 479px) {
  /* Meno margine perso ai lati quando il telefono e' la misura che conta. */
  .wesion-ingresso-pagina { padding: var(--spacing-4); }
}

@keyframes wesion-ingresso-comparsa {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.wesion-ingresso-card {
  animation: wesion-ingresso-comparsa var(--duration-medium) var(--ease-standard) both;
}
@media (prefers-reduced-motion: reduce) {
  .wesion-ingresso-card { animation: none; }
}
.wesion-ingresso-grid {
  container-type: inline-size;
  container-name: wesion-ingresso;
}
@container wesion-ingresso (max-width: 799px) {
  .wesion-ingresso-pannello { display: none; }
}
`;

// La casa e' "Da fare" (/insights), non l'elenco aziende: e' la pagina che
// dice cosa fare adesso, non un imbuto da leggere riga per riga (01/09/2026).
function destinazioneSicura(poi: string | null): string {
  if (!poi || !poi.startsWith('/') || poi.startsWith('//')) return '/insights';
  return poi;
}

export function ModuloIngresso() {
  const router = useRouter();
  const parametri = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mostraPassword, setMostraPassword] = useState(false);
  const [ricordami, setRicordami] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function entra() {
    setErrore(null);
    const risposta = await fetch('/api/entra', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, ricordami }),
    });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      setErrore(esito?.errore ?? 'Non è andata.');
      return;
    }
    router.push(destinazioneSicura(parametri.get('poi')));
    router.refresh();
  }

  return (
    <Center axis="both" className="wesion-ingresso-pagina">
      <style>{STILE_INGRESSO}</style>
      <div className="wesion-ingresso-card" style={{ width: '100%', maxWidth: 900, marginInline: 'auto' }}>
        <Card padding={0} width="100%" elevation="low">
          <Grid
            columns={{ minWidth: COLUMN_MIN_WIDTH, repeat: 'fit' }}
            gap={0}
            align="stretch"
            className="wesion-ingresso-grid"
          >
            {/* Il modulo */}
            <Section variant="transparent" padding={6} height="100%">
              <VStack gap={6} height="100%" justify="center">
                <Text type="body" weight="bold">
                  Wesion
                </Text>

                <VStack gap={5}>
                  <VStack gap={1}>
                    <Heading level={1}>Bentornato</Heading>
                    <Text type="supporting">Accedi alla regia di Wesion</Text>
                  </VStack>

                  {errore ? <Banner status="error" title={errore} /> : null}

                  <VStack gap={3}>
                    <TextInput
                      label="Email"
                      value={email}
                      onChange={setEmail}
                      htmlName="email"
                      hasAutoFocus
                      size="lg"
                    />
                    <VStack gap={1}>
                      {/* L'etichetta e l'occhiolino sulla stessa riga: TextInput
                          non ha uno slot per un'icona finale cliccabile (solo
                          `hasClear`, un × fisso), quindi l'etichetta visibile
                          vive qui e non dentro il campo — niente posizionamento
                          assoluto da tarare a occhio sull'altezza dell'input. */}
                      <HStack justify="between" vAlign="center">
                        <Text type="label">Password</Text>
                        <IconButton
                          icon={<Icon icon={mostraPassword ? EyeOff : Eye} size="sm" />}
                          label={mostraPassword ? 'Nascondi password' : 'Mostra password'}
                          variant="ghost"
                          size="sm"
                          onClick={() => setMostraPassword((v) => !v)}
                        />
                      </HStack>
                      <TextInput
                        label="Password"
                        isLabelHidden
                        type={mostraPassword ? 'text' : 'password'}
                        value={password}
                        onChange={setPassword}
                        htmlName="password"
                        size="lg"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && email && password) void entra();
                        }}
                      />
                    </VStack>

                    <CheckboxInput
                      label="Ricordami per 30 giorni"
                      value={ricordami}
                      onChange={setRicordami}
                    />

                    <Button
                      label="Entra"
                      variant="primary"
                      size="lg"
                      width="100%"
                      isDisabled={!email || !password}
                      clickAction={entra}
                    />
                  </VStack>
                </VStack>
              </VStack>
            </Section>

            {/* Il pannello: cosa fa Wesion, non un'immagine a caso */}
            <div className="wesion-ingresso-pannello">
              <Section variant="muted" padding={6} height="100%">
                <VStack gap={8} height="100%" justify="center">
                  <VStack gap={3}>
                    {/* Il logo vero (MyWebby, versione bianca — quella nera sparirebbe
                        su questo sfondo scuro) al posto della scritta "Wesion" nel
                        font del tema: qui il logo che conta e' quello che il cliente
                        di MyWebby vede ovunque, non un font decorativo. */}
                    <img
                      src="/marchio/mywebby-bianco.png"
                      alt="MyWebby"
                      width={838}
                      height={258}
                      style={{ width: 200, height: 'auto', display: 'block' }}
                    />
                    <Text type="supporting">Wesion — la regia unica</Text>
                  </VStack>

                  <VStack gap={4}>
                    {TAPPE_CATENA.map((tappa) => (
                      <HStack key={tappa.titolo} gap={3} vAlign="center">
                        <Icon icon={tappa.icona} color="accent" size="sm" />
                        <VStack gap={0}>
                          <Text type="body" weight="semibold">
                            {tappa.titolo}
                          </Text>
                          <Text type="supporting" size="xsm">
                            {tappa.nota}
                          </Text>
                        </VStack>
                      </HStack>
                    ))}
                  </VStack>
                </VStack>
              </Section>
            </div>
          </Grid>
        </Card>
      </div>
    </Center>
  );
}
