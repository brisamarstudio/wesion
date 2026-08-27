/**
 * Creare (o aggiornare) un utente della dashboard.
 *
 * La password non si passa sulla riga di comando come argomento: finirebbe
 * nella cronologia della shell e nella lista dei processi, dove la vede
 * chiunque sia sulla macchina. Si passa da una variabile d'ambiente, che
 * sparisce col comando.
 *
 *   PASSWORD='quella-buona' npm run utente -- --email tu@mywebby.it --nome Mariano
 */
import { pool, query } from '../src/lib/db.ts';
import { impastaPassword } from '../src/lib/password.ts';

const arg = (n: string): string | null => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? (process.argv[i + 1] ?? null) : null;
};

try {
  const email = arg('email');
  const nome = arg('nome');
  const password = process.env.PASSWORD;

  if (!email) throw new Error('serve --email');
  if (!password || password.length < 10) {
    throw new Error("serve la variabile PASSWORD, di almeno 10 caratteri (PASSWORD='...' npm run utente -- ...)");
  }

  const impastata = await impastaPassword(password);
  const [utente] = await query<{ email: string; creato: boolean }>(
    `INSERT INTO wesion.utente (email, password, nome)
     VALUES (lower($1), $2, $3)
     ON CONFLICT (email) DO UPDATE SET password = EXCLUDED.password, nome = COALESCE(EXCLUDED.nome, wesion.utente.nome)
     RETURNING email, (xmax = 0) AS creato`,
    [email, impastata, nome]
  );

  console.log(`${utente.creato ? 'Creato' : 'Aggiornata la password di'}: ${utente.email}`);
  console.log('La password non è stata scritta da nessuna parte in chiaro.');
} catch (errore: unknown) {
  console.error(`\nErrore: ${errore instanceof Error ? errore.message : errore}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
