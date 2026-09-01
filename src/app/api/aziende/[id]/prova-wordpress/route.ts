/**
 * «Queste credenziali WordPress funzionano?»
 *
 * PERCHE' UNA ROTTA SOLO PER PROVARE. Le tre cose che si rompono su un
 * WordPress altrui — REST API bloccata da un plugin di sicurezza, header
 * Authorization mangiato dall'hosting, utente senza permessi — danno tutte lo
 * stesso sintomo: un articolo che non esce, giorni dopo, con un errore che
 * arriva in una riga di `pubblicazione`. Provarle mentre si configura le
 * distingue in trenta secondi, che e' il momento in cui c'e' ancora qualcuno
 * che guarda.
 *
 * ⚠️ LA PASSWORD ARRIVA DAL MODULO, NON DAL DATABASE, ed e' voluto: si prova
 * quello che si sta incollando, prima di salvarlo. Non viene scritta da
 * nessuna parte qui dentro — la salva il PUT della scheda, come tutto il resto.
 */
import { NextResponse } from 'next/server';
import { provaWordPress, type ConfigSito } from '@/lib/sito';

export async function POST(richiesta: Request) {
  let corpo: ConfigSito;
  try {
    corpo = (await richiesta.json()) as ConfigSito;
  } catch {
    return NextResponse.json({ ok: false, errore: 'corpo della richiesta non leggibile' }, { status: 400 });
  }

  const esito = await provaWordPress({
    wp_base: corpo.wp_base,
    wp_utente: corpo.wp_utente,
    wp_password_app: corpo.wp_password_app,
  });

  // Sempre 200: la domanda «funziona?» ha ricevuto risposta anche quando la
  // risposta e' no. Un 4xx qui vorrebbe dire che la PROVA e' fallita, che e'
  // un'altra cosa e manderebbe il messaggio sbagliato a chi guarda.
  return NextResponse.json(esito);
}
