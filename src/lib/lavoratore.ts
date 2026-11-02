/**
 * I programmi che lavorano per Wesion da fuori — oggi uno: il PC di Mariano
 * che fa le immagini con ComfyUI (vedi lavoratore/immagini.mjs).
 *
 * ⚠️ PERCHÉ È IL PC A CHIAMARE, E NON IL SERVER (02/11/2026). ComfyUI gira sul
 * PC dell'ufficio, con la RTX 5080: costo zero a immagine. Il server su Contabo
 * non lo raggiunge, e aprire ComfyUI su internet vorrebbe dire lasciare a
 * chiunque lo trovi la possibilità di far girare codice su quel PC (i nodi
 * personalizzati eseguono Python). Quindi il verso è l'opposto: il PC chiede
 * «c'è qualcosa da fare?», lo fa, e riconsegna. Niente porte aperte.
 *
 * Il token non sta nel .env del server: sta nel database come impronta
 * sha256. Così si aggiunge o si revoca un lavoratore senza toccare il server.
 */
import { createHash } from 'node:crypto';
import { query } from './db';

const INTESTAZIONE = 'x-wesion-lavoratore';

/** Il nome del lavoratore se il token è buono (e segna che si è fatto vivo), altrimenti null. */
export async function verificaLavoratore(richiesta: Request): Promise<string | null> {
  const token = richiesta.headers.get(INTESTAZIONE);
  if (!token || token.length < 20) return null;
  const impronta = createHash('sha256').update(token).digest('hex');
  const [r] = await query<{ nome: string }>(
    `UPDATE wesion.lavoratore SET visto_at = now() WHERE token_hash = $1 RETURNING nome`,
    [impronta]
  );
  return r?.nome ?? null;
}

/**
 * Il PC delle immagini è acceso? «Visto negli ultimi 3 minuti»: il programma
 * chiede lavoro ogni 20 secondi, quindi tre minuti di silenzio vogliono dire
 * spento, non lento.
 */
export async function pcImmaginiAcceso(): Promise<boolean> {
  const [r] = await query<{ acceso: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM wesion.lavoratore
                     WHERE nome = 'pc-immagini' AND visto_at > now() - interval '3 minutes') AS acceso`
  );
  return Boolean(r?.acceso);
}
