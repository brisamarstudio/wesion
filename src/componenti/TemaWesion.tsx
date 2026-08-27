'use client';

/**
 * Tema + router, i due innesti che Astryx si aspetta dall'app che lo ospita.
 *
 * Il tema arriva dal sottopercorso /built accoppiato al suo theme.css: e' la
 * strada indicata per le app SSR. Con il tema "runtime" gli override dei
 * componenti vengono iniettati solo all'idratazione, quindi la prima pittura
 * mostra lo stile sbagliato e poi salta. Su Next si vede.
 *
 * LinkProvider fa passare OGNI link di Astryx dal router di Next. Senza, i
 * SideNavItem ricaricherebbero la pagina intera a ogni click.
 */
import { Theme } from '@astryxdesign/core/theme';
import { LinkProvider } from '@astryxdesign/core/Link';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import '@astryxdesign/theme-neutral/theme.css';
import NextLink from 'next/link';
import type { ReactNode } from 'react';

export function TemaWesion({ children }: { children: ReactNode }) {
  return (
    <Theme theme={neutralTheme}>
      <LinkProvider component={NextLink}>{children}</LinkProvider>
    </Theme>
  );
}
