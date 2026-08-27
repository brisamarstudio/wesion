import type { Metadata } from 'next';
import './globals.css';
import { TemaWesion } from '@/componenti/TemaWesion';

export const metadata: Metadata = {
  title: 'Wesion',
  description: 'La regia unica MyWebby: lead, menu del giorno, post Google.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      {/*
        `suppressHydrationWarning` sul body, e SOLO sul body.
        Le estensioni del browser scrivono i loro attributi qui prima che React
        si idrati — ColorZilla ci mette `cz-shortcut-listen="true"`, Grammarly
        e i gestori di password fanno lo stesso. Sono attributi che non
        controlliamo e che non possiamo far comparire anche sul server.
        Sopprime il confronto di UN livello solo, sugli attributi di questo tag:
        tutto quello che sta dentro resta controllato. Metterlo piu' in basso
        nascondirebbe i nostri, di errori.
      */}
      <body suppressHydrationWarning>
        <TemaWesion>{children}</TemaWesion>
      </body>
    </html>
  );
}
