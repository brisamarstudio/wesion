/**
 * La porta: senza cookie buono non si entra da nessuna parte.
 *
 * PERCHE' UN MIDDLEWARE E NON UN CONTROLLO IN OGNI PAGINA. Il controllo scritto
 * pagina per pagina funziona finche' qualcuno non aggiunge una pagina e si
 * dimentica — e quella pagina non da' nessun errore, resta solo aperta. E' lo
 * stesso genere di guasto silenzioso che le spie esistono per prendere: qui si
 * evita chiudendo tutto per difetto e aprendo solo cio' che serve.
 *
 * Restano aperti: la pagina di ingresso, la sua rotta, e /health se un domani
 * ci fosse. Tutto il resto passa da qui.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { leggiCookie, NOME_COOKIE } from '@/lib/sessione';

const APERTE = ['/entra', '/api/entra'];

export async function middleware(richiesta: NextRequest) {
  const { pathname } = richiesta.nextUrl;
  if (APERTE.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  const sessione = await leggiCookie(richiesta.cookies.get(NOME_COOKIE)?.value);
  if (sessione) return NextResponse.next();

  // Le API rispondono 401 e non un redirect: un fetch che riceve la pagina di
  // login come risposta fallisce in modo incomprensibile ("JSON non valido"),
  // e si perde mezz'ora a cercare un bug che non c'e'.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ errore: 'Non sei entrato.' }, { status: 401 });
  }

  const destinazione = richiesta.nextUrl.clone();
  destinazione.pathname = '/entra';
  // Da dove veniva, per riportarcelo dopo invece di scaricarlo sulla home.
  destinazione.searchParams.set('poi', pathname);
  return NextResponse.redirect(destinazione);
}

export const config = {
  // Fuori i file statici e le immagini: non c'e' niente da proteggere e
  // farli passare da qui costerebbe una verifica di firma per ogni icona.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
