'use client';

/**
 * Che ore sono — ma solo dopo che la pagina è viva nel browser.
 *
 * ⚠️ PERCHÉ NON BASTA `Date.now()`. Un componente client viene disegnato DUE
 * volte: una sul server, che produce l'HTML, e una nel browser, che si idrata
 * sopra. Se durante il disegno si chiede l'ora, le due volte danno numeri
 * diversi — di qualche centinaio di millisecondi, che basta a far cambiare
 * "scade fra 12 min" in "scade fra 11 min". React confronta i due HTML, non
 * coincidono, e si lamenta. Il guaio vero non è l'avviso in console: è che quel
 * pezzo di pagina non viene riparato.
 *
 * Qui la prima risposta è `null`, uguale da tutte e due le parti. L'ora vera
 * arriva dopo il montaggio, cioè solo nel browser, dove il server non c'è più a
 * dire il contrario.
 *
 * Si aggiorna da solo: una bozza di menù vale quindici minuti, e un conto alla
 * rovescia fermo sul valore di quando hai aperto la pagina è peggio di nessun
 * conto alla rovescia — sembra vero e non lo è.
 */
import { useEffect, useState } from 'react';

export function useAdesso(ogniMs = 30_000): number | null {
  const [adesso, setAdesso] = useState<number | null>(null);

  useEffect(() => {
    setAdesso(Date.now());
    const battito = setInterval(() => setAdesso(Date.now()), ogniMs);
    return () => clearInterval(battito);
  }, [ogniMs]);

  return adesso;
}
