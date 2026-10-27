/**
 * Analisi automatica del sito web del cliente per la configurazione del blog.
 *
 * Risolve la domanda dell'operatore: "Cosa devo inserire qui?"
 *
 * 1. Rileva la piattaforma: WordPress (via meta tag, wp-content, wp-json) vs Nostro/Astro.
 * 2. Cerca la pagina reale del blog (/blog, /articoli, /news, /notizie...).
 * 3. Trova o genera le categorie:
 *    - Se WordPress: interroga la REST API pubblica /wp-json/wp/v2/categories per prendere
 *      le categorie VERE create nel suo database.
 *    - Se non è WordPress o non ha categorie: legge il testo del sito e interpella l'AI
 *      per generare 4-6 categorie editoriali perfette e pertinenti al suo business reale.
 */

import { indirizzoPubblico, leggiTestoSito } from './leggiSito.ts';
import { generaJson } from './generatore.ts';

export interface EsitoAnalisiSito {
  urlAnalizzato: string;
  tipo: 'wesion' | 'wordpress';
  site_blog_page: string;
  categorie: string;
  wp_base?: string;
  site_blog_url?: string;
  dettagli: string;
}

interface CategorieAiRisposta {
  categorie: string[];
}

function eRispostaCategorie(x: unknown): x is CategorieAiRisposta {
  return (
    typeof x === 'object' &&
    x !== null &&
    Array.isArray((x as CategorieAiRisposta).categorie) &&
    (x as CategorieAiRisposta).categorie.every((c) => typeof c === 'string' && c.trim().length > 0)
  );
}

/** Percorsi comuni in cui risiede il blog su siti italiani e internazionali */
const PERCORSI_BLOG_CANDIDATI = [
  '/blog',
  '/articoli',
  '/news',
  '/notizie',
  '/magazine',
  '/journal',
  '/storie',
  '/approfondimenti',
];

export async function analizzaSitoPerBlog(
  urlGrezzo: string,
  contesto: {
    nomeAzienda: string;
    settore?: string;
    cosaFa?: string;
    offerta?: string;
  }
): Promise<EsitoAnalisiSito> {
  let url = (urlGrezzo || '').trim();
  if (!url) {
    throw new Error('Nessun indirizzo del sito fornito.');
  }
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  // Rimuoviamo eventuale slash finale per normalizzare la base
  url = url.replace(/\/+$/, '');

  if (!indirizzoPubblico(url)) {
    throw new Error(`Indirizzo non valido o non pubblico: ${url}`);
  }

  let htmlHome = '';
  let rispOk = false;
  try {
    const risp = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    rispOk = risp.ok;
    htmlHome = await risp.text();
  } catch (err) {
    console.warn(`[analizzaSito] impossibile scaricare la homepage di ${url}:`, err);
  }

  // 1. Riconoscimento CMS / Piattaforma
  const eWordPress =
    /wp-content|wp-includes|<meta[^>]+name=["']generator["'][^>]+content=["'][^"']*WordPress/i.test(htmlHome) ||
    htmlHome.includes('/wp-json');

  const tipo: 'wesion' | 'wordpress' = eWordPress ? 'wordpress' : 'wesion';
  const wp_base = eWordPress ? url : undefined;
  const site_blog_url = !eWordPress ? `${url}/api/blog` : undefined;

  // 2. Riconoscimento Pagina Blog
  let site_blog_page = `${url}/blog`;
  let blogTrovato = false;

  // Cerchiamo link nell'HTML della home (es. <a href="/notizie" o href="https://dominio/blog">)
  if (htmlHome) {
    for (const candidato of PERCORSI_BLOG_CANDIDATI) {
      const regexRelativo = new RegExp(`href=["'](${candidato}\\/?)["']`, 'i');
      const regexAssoluto = new RegExp(`href=["'](${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${candidato}\\/?)["']`, 'i');
      if (regexRelativo.test(htmlHome) || regexAssoluto.test(htmlHome)) {
        site_blog_page = `${url}${candidato}`;
        blogTrovato = true;
        break;
      }
    }
  }

  // Se non l'abbiamo trovato nei link della home, facciamo un veloce test HTTP HEAD sui primi candidati
  if (!blogTrovato) {
    for (const candidato of ['/blog', '/articoli', '/news']) {
      try {
        const testHead = await fetch(`${url}${candidato}`, {
          method: 'HEAD',
          redirect: 'follow',
          signal: AbortSignal.timeout(4000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; WesionBot/1.0)',
          },
        });
        if (testHead.ok) {
          site_blog_page = `${url}${candidato}`;
          blogTrovato = true;
          break;
        }
      } catch {
        // prosegui con il candidato successivo
      }
    }
  }

  // 3. Estrazione / Rilevamento Categorie
  let categorieFinali: string[] = [];
  let fonteCategorie = '';

  // 3a. Se è WordPress, interroghiamo la REST API pubblica per le categorie native
  if (eWordPress) {
    try {
      const apiCat = await fetch(`${url}/wp-json/wp/v2/categories?per_page=30`, {
        signal: AbortSignal.timeout(5000),
        headers: { Accept: 'application/json' },
      });
      if (apiCat.ok) {
        const jsonCat = (await apiCat.json()) as Array<{ name?: string; slug?: string }>;
        if (Array.isArray(jsonCat)) {
          const estratte = jsonCat
            .map((c) => String(c.name ?? '').trim())
            .filter((nome) => {
              const lower = nome.toLowerCase();
              return nome.length > 1 && lower !== 'senza categoria' && lower !== 'uncategorized';
            });
          if (estratte.length > 0) {
            categorieFinali = estratte;
            fonteCategorie = 'estratte dalla REST API di WordPress del cliente';
          }
        }
      }
    } catch (err) {
      console.warn(`[analizzaSito] REST API categorie non raggiungibile su ${url}:`, err);
    }
  }

  // 3b. Se non trovate via REST API, usiamo l'AI analizzando i testi del sito e la scheda
  if (categorieFinali.length === 0) {
    let testoEstratto = '';
    try {
      testoEstratto = await leggiTestoSito(url, 4000);
    } catch {
      // Ignora, useremo le info del contesto
    }

    const promptSistema = `Sei un esperto di Content Marketing e Architettura dell'Informazione per PMI locali e professionisti.
Il tuo compito è definire da 4 a 6 categorie editoriali ideali per il BLOG aziendale di questo cliente.

REGOLE TASSATIVE:
- Le categorie devono essere pertineti ESCLUSIVAMENTE al settore reale e all'offerta del cliente.
- MAI usare categorie generiche da agenzia web come "Ristorazione", "SEO", "Prezzi & Budget", a meno che l'azienda non sia un ristorante o un'agenzia SEO.
- Ogni categoria deve essere in italiano, di 1-3 parole (es. per un centro massaggi: "Massaggi Tradizionali", "Benessere & Relax", "Trattamenti Corpo", "Consigli Posturali", "Tradizione Thai").
- Rispondi ESCLUSIVAMENTE con un oggetto JSON: {"categorie": ["Cat1", "Cat2", "Cat3", "Cat4"]}`;

    const promptUtente = `Azienda: ${contesto.nomeAzienda}
${contesto.settore ? `Settore: ${contesto.settore}` : ''}
${contesto.cosaFa ? `Cosa fa: ${contesto.cosaFa}` : ''}
${contesto.offerta ? `Offerta/Servizi: ${contesto.offerta}` : ''}

Testo estratto dal sito web (${url}):
${testoEstratto || 'Nessun testo estratto. Usa le informazioni aziendali fornite sopra.'}

Definisci da 4 a 6 categorie pertinenti per il blog.`;

    try {
      const rispAi = await generaJson<CategorieAiRisposta>(promptSistema, promptUtente, eRispostaCategorie, {
        maxTokens: 500,
        timeoutMs: 30000,
      });
      categorieFinali = rispAi.dato.categorie.map((c) => c.trim()).filter(Boolean);
      fonteCategorie = 'generate con AI su misura per l’attività del cliente';
    } catch (err) {
      console.error('[analizzaSito] Fallimento generazione categorie con AI:', err);
      // Fallback basato sul contesto se anche l'AI fallisce
      if (contesto.cosaFa || contesto.settore) {
        categorieFinali = ['Servizi & Trattamenti', 'Consigli Utili', 'Novità & Aggiornamenti', 'Guide & Approfondimenti'];
        fonteCategorie = 'proposte di base dal settore';
      }
    }
  }

  const stringaCategorie = categorieFinali.join(', ');
  const dettagli = `Piattaforma: ${eWordPress ? 'WordPress' : 'Sito custom / Wesion'} • Pagina blog: ${site_blog_page} • ${categorieFinali.length} categorie (${fonteCategorie}).`;

  return {
    urlAnalizzato: url,
    tipo,
    site_blog_page,
    categorie: stringaCategorie,
    wp_base,
    site_blog_url,
    dettagli,
  };
}
