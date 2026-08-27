import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // pg apre socket TCP: deve restare fuori dal bundle e girare come modulo node.
  serverExternalPackages: ['pg'],

  /**
   * L'immagine porta solo quello che serve a girare.
   *
   * Senza `standalone`, dentro il container finiscono tutti i `node_modules`
   * di sviluppo — Astryx, la sua CLI, i tipi, il compilatore. Sono centinaia di
   * megabyte che sull'ARM di Oracle si copiano lentamente e non servono a
   * niente: quello che gira è gia' compilato.
   */
  output: 'standalone',
};

export default nextConfig;
