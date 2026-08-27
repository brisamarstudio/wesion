'use client';

/**
 * Il modulo d'ingresso.
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
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';

function destinazioneSicura(poi: string | null): string {
  if (!poi || !poi.startsWith('/') || poi.startsWith('//')) return '/aziende';
  return poi;
}

export function ModuloIngresso() {
  const router = useRouter();
  const parametri = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState<string | null>(null);

  async function entra() {
    setErrore(null);
    const risposta = await fetch('/api/entra', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
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
    <Layout
      height="fill"
      content={
        <LayoutContent padding={6}>
          <VStack gap={5} align="center" justify="center" height="fill">
            <VStack gap={1} align="center">
              <Heading level={1}>Wesion</Heading>
              <Text type="supporting">La regia unica MyWebby</Text>
            </VStack>

            <VStack gap={3} width={360}>
              {errore ? <Banner status="error" title={errore} /> : null}
              <TextInput
                label="Email"
                value={email}
                onChange={setEmail}
                htmlName="email"
                hasAutoFocus
              />
              <TextInput
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                htmlName="password"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && email && password) void entra();
                }}
              />
              <Button
                label="Entra"
                variant="primary"
                width="100%"
                isDisabled={!email || !password}
                clickAction={entra}
              />
            </VStack>
          </VStack>
        </LayoutContent>
      }
    />
  );
}
