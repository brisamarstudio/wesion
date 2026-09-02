/**
 * L'audit SEO/GEO/AEO automatico: legge Search Console + il repo del sito,
 * propone le correzioni, apre una Pull Request. Non pubblica niente da sola —
 * vedi la nota in cima a `lib/seo-git.ts` sul perché si ferma alla PR.
 *
 * Manuale per ora (bottone "Analizza SEO" in scheda), non un giro automatico:
 * il primo lotto di PR lo si vuole guardare uno per uno prima di lasciarlo
 * andare da solo ogni mese.
 */
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { genera } from '@/lib/generatore';
import { rendimento, riassumiRendimento } from '@/lib/search-console';
import { clonaRepo, leggiMateriale, applicaModifiche, apriPR, pulisci } from '@/lib/seo-git';
import { REGOLE_SEO_GEO } from '@/lib/regole-seo';
import { MARCA, leggiProposta } from '@/lib/seo-proposta';

export async function POST(_richiesta: Request, contesto: { params: Promise<{ id: string }> }) {
  const { id } = await contesto.params;
  const aziendaId = Number(id);
  if (!Number.isFinite(aziendaId)) return NextResponse.json({ errore: 'id non valido' }, { status: 400 });

  const { GITHUB_TOKEN } = process.env;
  if (!GITHUB_TOKEN) {
    return NextResponse.json({ errore: 'GITHUB_TOKEN non configurato: senza, non si può aprire nessuna PR.' }, { status: 500 });
  }

  const [azienda] = await query<{ nome: string; categoria: string | null; citta: string | null }>(
    `SELECT nome, categoria, citta FROM wesion.azienda WHERE id = $1`,
    [aziendaId]
  );
  if (!azienda) return NextResponse.json({ errore: 'azienda inesistente' }, { status: 404 });

  const [sito] = await query<{ repo_url: string; gsc_proprieta: string | null }>(
    `SELECT repo_url, gsc_proprieta FROM wesion.sito WHERE azienda_id = $1`,
    [aziendaId]
  );
  if (!sito) {
    return NextResponse.json(
      { errore: 'Manca il repository del sito: aprilo da "Modifica" e compila "Repository del sito".' },
      { status: 400 }
    );
  }

  let dir: string | null = null;
  try {
    // 1. Search Console — se manca la property o il token, si prosegue lo
    //    stesso: meglio una proposta senza numeri che nessuna proposta.
    let rendimentoTesto = '(Search Console non collegata: nessun numero disponibile, solo il codice.)';
    if (sito.gsc_proprieta) {
      try {
        const [perQuery, perPagina] = await Promise.all([
          rendimento(sito.gsc_proprieta, 28, 'query'),
          rendimento(sito.gsc_proprieta, 28, 'page'),
        ]);
        rendimentoTesto = riassumiRendimento(perQuery, perPagina);
      } catch (e) {
        rendimentoTesto = `(Search Console non leggibile: ${e instanceof Error ? e.message : String(e)})`;
      }
    }

    // 2. Il repo.
    const { dir: cartella, info } = await clonaRepo(sito.repo_url, GITHUB_TOKEN);
    dir = cartella;
    const materiale = await leggiMateriale(dir);

    // 3. Il modello propone le modifiche — mai un file senza spiegazione: il
    //    MOTIVO finisce nella PR, che è quello che legge chi decide il merge.
    const sistema = `Sei un tecnico SEO/GEO/AEO che propone correzioni concrete al codice di un sito, seguendo QUESTE regole:

${REGOLE_SEO_GEO}

⚠️ REGOLA PIÙ IMPORTANTE DI TUTTE LE ALTRE: NON RIGENERARE FILE CHE ESISTONO GIÀ.
Un file esistente si tocca solo con sostituzioni mirate. Riscriverlo per intero vuol dire
ricostruirlo a memoria, e ogni volta si perde qualcosa che c'era e funzionava (schema,
accessibilità, script, meta tag). Non toglierai NIENTE che c'è già: non commenti, non
funzionalità, non tag. Aggiungi soltanto quello che manca.

FORMATO DELLA RISPOSTA — testo semplice, NON JSON.

Prima riga:
${MARCA.riepilogo}: una frase su cosa hai cambiato e perché

Poi, per un file NUOVO (o per llms.txt / robots.txt, che si possono riscrivere interi):

${MARCA.file}: public/llms.txt
${MARCA.motivo}: non esisteva, serve ai crawler AI
${MARCA.scrivi}
(il file intero, esattamente come va scritto su disco)
${MARCA.fine}

Per un file che ESISTE GIÀ — una sostituzione mirata per ogni punto da cambiare:

${MARCA.file}: src/layouts/Layout.astro
${MARCA.motivo}: manca containedInPlace nel nodo Restaurant
${MARCA.cerca}
(poche righe COPIATE ESATTAMENTE dal file che ti ho dato, carattere per carattere,
 abbastanza da comparire una volta sola in tutto il file)
${MARCA.con}
(le stesse righe con dentro l'aggiunta)
${MARCA.fine}

Regole del formato:
- Il percorso è relativo alla radice del repo.
- Il testo dopo ${MARCA.cerca} deve comparire ESATTAMENTE UNA VOLTA nel file, copiato
  alla lettera dal contenuto che ti ho passato: se non combacia, la modifica viene buttata.
- Niente virgolette e niente blocchi di codice markdown attorno al contenuto.
- Non scrivere MAI le righe ${MARCA.scrivi}, ${MARCA.cerca}, ${MARCA.con} o ${MARCA.fine} dentro il contenuto.
- Meglio tre sostituzioni piccole e sicure che una grande: ogni blocco è indipendente.
- Non toccare contenuti editoriali (testi, prezzi, descrizioni del menù): solo struttura SEO/GEO/AEO.
- Se non c'è niente di sensato da proporre, scrivi solo la riga ${MARCA.riepilogo} e nessun blocco.`;

    const utente = `Cliente: ${azienda.nome} (${azienda.categoria ?? 'categoria sconosciuta'}, ${azienda.citta ?? 'città sconosciuta'}).

${rendimentoTesto}

llms.txt attuale:
${materiale.llmsTxt ?? '(non esiste)'}

robots.txt attuale:
${materiale.robotsTxt ?? '(non esiste)'}

File che sembrano contenere lo schema JSON-LD (contenuto ESATTO: è da qui che devi copiare il testo di ${MARCA.cerca}):
${
  materiale.fileSchema
    .map((f) => {
      // Il testo di CERCA deve combaciare carattere per carattere con il file
      // vero: se glielo diamo troncato, il modello copia da un pezzo che sul
      // disco continua diversamente — e la sostituzione viene scartata senza
      // che si capisca perché. Quando taglia, glielo si dice.
      const tagliato = f.contenuto.length > 20000;
      return `\n--- ${f.percorso} ---\n${f.contenuto.slice(0, 20000)}${
        tagliato ? '\n[…file più lungo: NON proporre sostituzioni oltre questo punto…]' : ''
      }`;
    })
    .join('\n') ||
  '(nessuno trovato — se il sito ha bisogno di uno schema, proponilo in un file nuovo ragionevole per lo stack di questo repo)'
}`;

    /**
     * ⚠️ `grezzo: true` NON è un dettaglio: `ripulisci` collassa ogni sequenza
     * di spazi in uno solo (serve ai post, dove uno spazio esotico rompe i
     * confronti). Su un file, l'indentazione È il file — passandoci dentro un
     * `Layout.astro` uscirebbe tutto appiattito contro il margine.
     *
     * E il tetto: il default (1600) è tarato su un post di tre righe, qui
     * tornano file interi.
     */
    const { testo, modello } = await genera(sistema, utente, { maxTokens: 8000, grezzo: true });
    const dato = leggiProposta(testo);

    // ⚠️ "Zero blocchi E zero riepilogo" non vuol dire "va tutto bene": vuol
    // dire che il modello ha risposto in un formato che non sappiamo leggere.
    // Senza questo controllo il caso si presenterebbe come un successo con
    // "nessuna modifica da proporre" — il guasto muto che questo progetto
    // passa il tempo a evitare.
    if (!dato.modifiche.length && !dato.riepilogo) {
      throw new Error(
        `${modello} ha risposto fuori formato (nessun blocco ${MARCA.file}): ${testo.slice(0, 200)}`
      );
    }

    // 4. Si applica quello che si può applicare, e si tiene il conto di cosa no.
    const { applicate, scartati: scartatiApplicando } = await applicaModifiche(dir, dato.modifiche);
    const scartati = [...dato.scartati, ...scartatiApplicando];

    if (!applicate.length) {
      await query(
        `UPDATE wesion.sito SET ultimo_audit_at = now(), ultimo_errore = $2 WHERE azienda_id = $1`,
        [aziendaId, scartati.length ? `Nessuna modifica applicabile. ${scartati.join(' · ')}`.slice(0, 500) : null]
      );
      return NextResponse.json({
        pr_url: null,
        riepilogo: dato.riepilogo,
        modello,
        scartati,
      });
    }

    /**
     * ⚠️ GLI SCARTI VANNO SCRITTI NELLA PR, non solo restituiti alla dashboard.
     * Chi apre la PR fra tre giorni non ha davanti lo schermo di oggi: deve
     * poter leggere lì dentro che il modello aveva promesso cinque cose e ne
     * sono passate tre, e quali due mancano.
     */
    const elencoScarti = scartati.length
      ? `\n\n### Proposte scartate (${scartati.length})\nNon sono finite in questo diff:\n${scartati.map((s) => `- ${s}`).join('\n')}`
      : '';

    const url = await apriPR({
      dir,
      info,
      token: GITHUB_TOKEN,
      percorsi: applicate.map((m) => m.percorso),
      titolo: `Wesion — proposta SEO/GEO/AEO (${new Date().toLocaleDateString('it-IT')})`,
      corpo:
        `Generata automaticamente da Wesion (modello: ${modello}).\n\n${dato.riepilogo}\n\n` +
        `### Modifiche applicate\n${applicate
          .map((m) => `- \`${m.percorso}\` (${m.azione})${m.motivo ? `: ${m.motivo}` : ''}`)
          .join('\n')}` +
        elencoScarti +
        `\n\n⚠️ Da rivedere a mano prima del merge — nessun controllo umano l'ha ancora guardata.`,
    });

    await query(
      `UPDATE wesion.sito SET ultimo_audit_at = now(), ultima_pr_url = $2, ultimo_errore = NULL WHERE azienda_id = $1`,
      [aziendaId, url]
    );

    return NextResponse.json({ pr_url: url, riepilogo: dato.riepilogo, modello, scartati });
  } catch (errore: unknown) {
    const messaggio = errore instanceof Error ? errore.message : String(errore);
    await query(`UPDATE wesion.sito SET ultimo_audit_at = now(), ultimo_errore = $2 WHERE azienda_id = $1`, [
      aziendaId,
      messaggio.slice(0, 500),
    ]);
    return NextResponse.json({ errore: messaggio }, { status: 500 });
  } finally {
    if (dir) await pulisci(dir);
  }
}
