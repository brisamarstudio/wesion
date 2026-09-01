'use client';

/**
 * Tema + router, i due innesti che Astryx si aspetta dall'app che lo ospita.
 *
 * Il tema arriva COMPILATO (`gothic.js` + `gothic.css`), non dal sorgente
 * `gothicTheme.ts`: e' la strada indicata per le app SSR. Con il tema "runtime"
 * gli override dei componenti vengono iniettati solo all'idratazione, quindi la
 * prima pittura mostra lo stile sbagliato e poi salta. Su Next si vede.
 *
 * ⚠️ SE TOCCHI `src/tema/gothicTheme.ts` NON BASTA SALVARE: quel file e' il
 * sorgente, l'app legge il compilato. Ricompila con
 * `npm run astryx -- theme build src/tema/gothicTheme.ts`, o passi mezz'ora a
 * chiederti perche' il colore che hai appena cambiato non cambia niente.
 *
 * PERCHE' GOTHIC E NON PIU' NEUTRO (31/08/2026). Il tema neutro e' descritto
 * dai suoi stessi autori come "restrained warm grays, minimal and quiet": non
 * e' che il colore mancasse per sbaglio, e' che quel tema e' fatto per non
 * averne. Su una consolle che e' tutta righe fitte, il risultato era che
 * `Badge variant="orange"` e `variant="red"` uscivano quasi identici, cioe' la
 * distinzione che il codice fa non arrivava all'occhio. Gothic e' scuro con
 * blu-grigi profondi, e i colori semantici sopra ci si staccano.
 *
 * Il tema porta con se' le icone Lucide (`icons: gothicIconRegistry`): tutti i
 * nomi semantici — close, search, warning, calendar... — diventano Lucide senza
 * toccare una riga dei componenti.
 *
 * LinkProvider fa passare OGNI link di Astryx dal router di Next. Senza, i
 * SideNavItem ricaricherebbero la pagina intera a ogni click.
 */
import { Theme } from '@astryxdesign/core/theme';
import { LinkProvider } from '@astryxdesign/core/Link';
import { gothicTheme } from '@/tema/gothic';
import '@/tema/gothic.css';
// DOPO il tema, sempre: sovrascrive il fondo delle righe pari e deve vincere.
import '@/tema/righe.css';
import NextLink from 'next/link';
import type { ReactNode } from 'react';

export function TemaWesion({ children }: { children: ReactNode }) {
  return (
    <Theme theme={gothicTheme}>
      <LinkProvider component={NextLink}>{children}</LinkProvider>
    </Theme>
  );
}
