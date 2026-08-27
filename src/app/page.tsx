import { redirect } from 'next/navigation';

// La casa di Wesion e' l'elenco aziende: e' da li' che parte tutto il resto.
export default function Home() {
  redirect('/aziende');
}
