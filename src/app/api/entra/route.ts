/**
 * Entrare e uscire.
 *
 * ⚠️ NON DICE MAI QUALE DELLE DUE COSE E' SBAGLIATA. "Email o password non
 * corretti", sempre uguale, sia che l'utente non esista sia che la password non
 * torni. Distinguere le due risposte vuol dire regalare a chiunque un modo per
 * scoprire quali email sono registrate.
 *
 * E la password si verifica ANCHE quando l'utente non esiste, contro un hash
 * finto: senza, la risposta per un'email sconosciuta tornerebbe in un
 * millisecondo e quella per una nota in cento, che e' la stessa informazione
 * detta col cronometro.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { creaCookie, NOME_COOKIE } from '@/lib/sessione';
import { impastaPassword, verificaPassword } from '@/lib/password';

/** Un hash valido ma di nessuno: serve a spendere lo stesso tempo. */
let hashFinto: string | null = null;

export async function POST(richiesta: Request) {
  const { email, password } = (await richiesta.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    return NextResponse.json({ errore: 'Servono email e password.' }, { status: 400 });
  }

  const [utente] = await query<{ email: string; password: string; nome: string | null }>(
    `SELECT email, password, nome FROM wesion.utente WHERE lower(email) = lower($1)`,
    [email]
  );

  if (!hashFinto) hashFinto = await impastaPassword('nessuno-entra-con-questa');
  const buona = await verificaPassword(password, utente?.password ?? hashFinto);

  if (!utente || !buona) {
    return NextResponse.json({ errore: 'Email o password non corretti.' }, { status: 401 });
  }

  await query(`UPDATE wesion.utente SET ultimo_accesso_at = now() WHERE lower(email) = lower($1)`, [email]);

  const risposta = NextResponse.json({ email: utente.email, nome: utente.nome });
  risposta.cookies.set(NOME_COOKIE, await creaCookie(utente.email, utente.nome), {
    httpOnly: true,
    sameSite: 'lax',
    // Solo in produzione: in sviluppo si gira su http://localhost e un cookie
    // `secure` non verrebbe mai mandato indietro.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 12 * 3600,
  });
  return risposta;
}

export async function DELETE() {
  const risposta = NextResponse.json({ uscito: true });
  risposta.cookies.set(NOME_COOKIE, '', { path: '/', maxAge: 0 });
  return risposta;
}
