'use client';

/**
 * «Riepilogo del mese» — una card per cliente: il messaggio pronto, da leggere,
 * correggere se serve, e mandare con un click (apre WhatsApp col testo).
 *
 * ⚠️ IL CLICK APRE WHATSAPP, NON SPEDISCE. Il messaggio esce dal WhatsApp di
 * Mariano, che vede il testo un'ultima volta e preme Invio: nessun server
 * scrive a un cliente al posto suo (vedi src/lib/riepilogo.ts).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { TextArea } from '@astryxdesign/core/TextArea';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Divider } from '@astryxdesign/core/Divider';
import { Copy, Send } from 'lucide-react';
import type { Riepilogo } from '@/lib/riepilogo';

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

function quando(iso: string): string {
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', timeZone: 'Europe/Rome' });
}

function CardRiepilogo({ r }: { r: Riepilogo }) {
  const [testo, setTesto] = useState(r.testo);
  const [aperto, setAperto] = useState(r.apertoAt);
  const [copiato, setCopiato] = useState(false);
  const chiaveMese = `${r.anno}-${String(r.mese).padStart(2, '0')}`;

  async function segna() {
    setAperto(new Date().toISOString());
    await fetch('/api/riepiloghi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aziendaId: r.aziendaId, mese: chiaveMese }),
    }).catch(() => undefined);
  }

  const stato = !r.testo
    ? { colore: 'neutral' as const, parola: 'Niente da raccontare questo mese' }
    : aperto
      ? { colore: 'success' as const, parola: `Mandato il ${quando(aperto)}` }
      : { colore: 'accent' as const, parola: 'Pronto da mandare' };

  return (
    <Card padding={0}>
      <VStack gap={3} padding={4}>
        <HStack gap={2} align="center">
          <StatusDot variant={stato.colore} label={stato.parola} />
          <Text type="supporting" weight="medium">
            {stato.parola}
          </Text>
        </HStack>
        <Heading level={3}>{r.nome}</Heading>
        {r.testo ? (
          <TextArea label="Il messaggio" isLabelHidden rows={9} value={testo} onChange={setTesto} />
        ) : (
          <Text color="secondary">
            Nessun post uscito e nessun dato da Google per questo mese: meglio non mandare un messaggio vuoto.
          </Text>
        )}
        {r.testo && !r.whatsapp ? (
          <Text type="supporting" color="secondary">
            ⚠️ Non c’è un numero del titolare: copia il testo e mandalo tu, o aggiungi il numero nella scheda.
          </Text>
        ) : null}
      </VStack>
      {r.testo ? (
        <>
          <Divider />
          <HStack justify="end" gap={2} padding={3} wrap="wrap">
            <Button
              label={copiato ? 'Copiato' : 'Copia'}
              size="sm"
              variant="ghost"
              icon={<Copy size={14} />}
              clickAction={async () => {
                await navigator.clipboard.writeText(testo).catch(() => undefined);
                setCopiato(true);
              }}
            />
            {r.whatsapp ? (
              <Button
                label={aperto ? 'Apri di nuovo WhatsApp' : 'Apri WhatsApp col messaggio'}
                size="sm"
                variant={aperto ? 'secondary' : 'primary'}
                icon={<Send size={14} />}
                tooltip="Apre WhatsApp con il testo già scritto: lo rileggi e premi Invio tu."
                onClick={() => {
                  void segna();
                  window.open(`https://wa.me/${r.whatsapp}?text=${encodeURIComponent(testo)}`, '_blank', 'noopener');
                }}
              />
            ) : null}
          </HStack>
        </>
      ) : null}
    </Card>
  );
}

export function Riepiloghi({ riepiloghi, anno, mese }: { riepiloghi: Riepilogo[]; anno: number; mese: number }) {
  const router = useRouter();
  const pronti = riepiloghi.filter((r) => r.testo && !r.apertoAt).length;
  const prima = mese === 1 ? `${anno - 1}-12` : `${anno}-${String(mese - 1).padStart(2, '0')}`;
  const dopo = mese === 12 ? `${anno + 1}-01` : `${anno}-${String(mese + 1).padStart(2, '0')}`;

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack justify="between" align="center" wrap="wrap" gap={3}>
            <VStack gap={0.5}>
              <Heading level={2}>
                Riepilogo di {MESI[mese - 1]} {anno}
              </Heading>
              <Text type="supporting" color="secondary">
                {pronti
                  ? `${pronti} ${pronti === 1 ? 'messaggio pronto' : 'messaggi pronti'}: leggi, correggi se vuoi, e mandali dal tuo WhatsApp.`
                  : 'Tutti mandati, o niente da raccontare.'}
              </Text>
            </VStack>
            <HStack gap={2}>
              <Button label="← Mese prima" size="sm" variant="ghost" onClick={() => router.push(`/riepiloghi?mese=${prima}`)} />
              <Button label="Mese dopo →" size="sm" variant="ghost" onClick={() => router.push(`/riepiloghi?mese=${dopo}`)} />
            </HStack>
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={4}>
          <Grid columns={{ minWidth: 340, max: 3, repeat: 'fill' }} gap={4}>
            {riepiloghi
              .slice()
              .sort((a, b) => Number(Boolean(b.testo)) - Number(Boolean(a.testo)))
              .map((r) => (
                <CardRiepilogo key={r.aziendaId} r={r} />
              ))}
          </Grid>
        </LayoutContent>
      }
    />
  );
}
