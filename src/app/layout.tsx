import type { Metadata } from 'next';
import { Fustat, Manufacturing_Consent } from 'next/font/google';
import './globals.css';
import { TemaWesion } from '@/componenti/TemaWesion';

/**
 * I due font che il tema gothic dichiara PER NOME (`gothicTheme.ts`: Fustat per
 * testo e titoli, Manufacturing Consent per le taglie "display") ma nessuno
 * caricava mai: zero `@font-face` in giro, zero file in `public/`, zero
 * `<link>` a Google Fonts. Il browser ripiegava sul fallback di sistema, e il
 * carattere manoscritto che da' il nome al tema (quello dietro "Wesion" in
 * ogni intestazione) non si e' mai visto — sembrava solo un bold sans qualunque.
 *
 * Bastava chiamarli qui: `next/font` li scarica al build (nessuna richiesta a
 * Google a runtime) e registra l'`@font-face` con lo STESSO nome letterale che
 * il tema gia' usa nelle sue regole — non serve toccare `gothicTheme.ts`.
 * `variable` invece di `className`: cosi' non impone un font-family di suo,
 * lascia decidere al CSS del tema chi usa cosa.
 */
const fustat = Fustat({ subsets: ['latin'], weight: 'variable', display: 'swap', variable: '--font-fustat' });
const manufacturingConsent = Manufacturing_Consent({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-manufacturing-consent',
});

export const metadata: Metadata = {
  title: 'Wesion',
  description: 'La regia unica MyWebby: lead, menu del giorno, post Google.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${fustat.variable} ${manufacturingConsent.variable}`}>
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
