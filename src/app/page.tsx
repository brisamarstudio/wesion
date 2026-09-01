import { redirect } from 'next/navigation';

/**
 * La casa di Wesion e' "Da fare" (01/09/2026, prima era l'elenco aziende).
 *
 * Chi entra non deve leggere 78 righe di lead per capire cosa fare: /insights
 * e' gia' "cosa faccio adesso" con un numero e un link, non un imbuto da
 * scorrere. L'elenco aziende resta a un click, nel menu — non e' sparito,
 * solo non e' piu' la prima cosa che si vede.
 */
export default function Home() {
  redirect('/insights');
}
