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
      <body>
        <TemaWesion>{children}</TemaWesion>
      </body>
    </html>
  );
}
