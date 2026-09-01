'use client';

/**
 * La mappa muta sopra "Da fare": icona ed etichetta, zero prosa (vedi il
 * commento in cima a `insights/page.tsx` sul perche').
 *
 * ⚠️ CLIENT APPOSTA, non per interattività. `insights/page.tsx` è un Server
 * Component (fa query dirette a Neon); `Icon` di Astryx è un Client
 * Component. Passargli `tappa.icona` (un riferimento a un componente Lucide)
 * come prop da un Server Component attraversa il confine RSC, dove può
 * passare solo dati semplici — un componente non lo è, e React rifiuta con
 * «Only plain objects can be passed to Client Components from Server
 * Components». Qui l'import di `TAPPE_CATENA` avviene già lato client, quindi
 * quel confine non si attraversa mai.
 */
import { ChevronRight } from 'lucide-react';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Icon } from '@astryxdesign/core/Icon';
import { TAPPE_CATENA } from './catenaWesion';

export function CatenaStriscia() {
  return (
    <HStack gap={2} wrap="wrap" vAlign="center">
      {TAPPE_CATENA.map((tappa, i) => (
        <HStack key={tappa.titolo} gap={2} vAlign="center">
          <Icon icon={tappa.icona} color="secondary" size="sm" />
          <Text type="supporting">{tappa.titolo}</Text>
          {i < TAPPE_CATENA.length - 1 ? <Icon icon={ChevronRight} color="disabled" size="sm" /> : null}
        </HStack>
      ))}
    </HStack>
  );
}
