/**
 * Le regole per i canali social (Facebook, Instagram, LinkedIn).
 *
 * Creato il 15/09/2026.
 * Integra i framework di copywriting (PAS, AIDA, BAB, STAR) e le formule
 * per mobile dei migliori creator (Justin Welsh, Charlie Hills).
 *
 * ⚠️ LA REGOLA AUREA: NIENTE FATTI INVENTATI.
 * Un post social NON può affermare nulla che non sia nel FATTO del cliente.
 * Se un framework chiede dettagli che mancano (es. anni di attività, cifre),
 * il modello DEVE elencarli in `dati_mancanti` invece di inventarli.
 */

import type { FormatoSocial, FrameworkSocial, CanaleSocial } from './social';

export const REGOLE_SOCIAL_BASE = `REGOLE FONDAMENTALI DEL CANALE SOCIAL:
1. FORMATTAZIONE PER SMARTPHONE:
   - Massimo 1-2 frasi per paragrafo.
   - Sempre una riga vuota tra i paragrafi.
   - Niente muri di testo: chi legge da mobile deve poter scorrere senza affaticarsi.
2. IL GANCO (LE PRIME DUE RIGHE):
   - Deve fermare lo scroll nei primi 2 secondi.
   - Lunghezza ideale della prima riga: sotto i 45-50 caratteri per non essere troncata dal "Vedi altro".
   - Contrasto netto, curiosità, o ribaltamento di un luogo comune. Proponi sempre 3-5 varianti di gancio.
3. PRIMO COMMENTO STRATEGICO:
   - I link esterni e i dettagli commerciali (es. link al sito, numero WhatsApp, indirizzo)
     vanno nel primo commento, non nel testo del post (gli algoritmi penalizzano i post con link esterni nel corpo).
4. HASHTAG E DETTAGLI:
   - Massimo 3-5 hashtag in fondo, pertinenti e specifici per il settore o il territorio (es. #Pavia #RistorazioneLocale).
   - Niente hashtag nel mezzo delle frasi.
   - Emoji usate con moderazione (massimo 2-3 in tutto il post), mai a cascata come un volantino da discount.
5. ZERO FATTI INVENTATI:
   - Se per completare il post ti mancano dati concreti (es. prezzi, date, nomi specifici),
     NON inventarli. Segnalali nell'array "dati_mancanti".`;

export const ISTRUZIONI_FRAMEWORK: Record<FrameworkSocial, string> = {
  PAS: `FRAMEWORK: PAS (Problema - Agitazione - Soluzione)
- Problema: esponi subito un problema o una frustrazione reale che il cliente target vive.
- Agitazione: spiega perché ignorare questo problema peggiora le cose (senza esagerare, con tatto).
- Soluzione: presenta come il fatto verificato del cliente risolve concretamente questo problema.`,

  AIDA: `FRAMEWORK: AIDA (Attenzione - Interesse - Desiderio - Azione)
- Attenzione: un gancio forte che cattura l'attenzione.
- Interesse: un fatto o retroscena interessante e poco noto legato al fatto aziendale.
- Desiderio: come la vita o il lavoro del cliente migliorano grazie a questo fatto.
- Azione: invito a commentare, salvare il post o leggere il primo commento.`,

  BAB: `FRAMEWORK: BAB (Before - After - Bridge)
- Before: come sono le cose prima (la situazione di partenza).
- After: come sono le cose dopo (il risultato desiderato).
- Bridge: il ponte (il servizio/prodotto del cliente) che porta dal prima al dopo.`,

  STAR: `FRAMEWORK: STAR (Situazione - Compito - Azione - Risultato)
- Situazione: il contesto concreto in cui ci si trova.
- Compito: cosa c'era da affrontare o risolvere.
- Azione: cosa ha fatto concretamente l'attività (partendo dal fatto verificato).
- Risultato: il beneficio concreto ottenuto.`,

  libero: `FRAMEWORK: Narrazione diretta e autentica
- Parla in modo concreto partendo dal fatto, senza schemi forzati, privilegiando la chiarezza e l'immediatezza.`,
};

export const ISTRUZIONI_FORMATO: Record<FormatoSocial, string> = {
  post: `FORMATO: Post standard (immagine singola o solo testo)
- Scrivi un testo ben ritmato, con 3-5 varianti di gancio iniziale.
- Inserisci la Call-To-Action rimandando al primo commento.`,

  carosello: `FORMATO: Carosello multi-slide (1080x1350)
- Genera da 4 a 7 slide sequenziali nell'array "slide".
- Slide 1: Copertina con titolo magnetico e promessa di valore.
- Slide centrali: Un concetto o passo concreto per slide (massimo 25-30 parole a slide).
- Ultima slide: Riepilogo e Call-To-Action (es. "Salva il post per dopo", "Scrivi nei commenti").
- Per ogni slide, fornisci anche "prompt_immagine": una descrizione per generare un visual pulito, coerente e professionale.
- Nel "testo" scrivi la didascalia (caption) che accompagna il carosello.`,

  reel: `FORMATO: Script per Reel / Video breve (15-45 secondi)
- Genera uno script cadenzato nell'array "script_reel".
- Ogni elemento ha:
  - "secondi": es. "0-3s", "3-10s", "10-25s", "25-30s"
  - "a_video": cosa si vede a schermo (inquadratura, testo in sovrimpressione, azione)
  - "voce": le parole esatte pronunciate dal titolare o dallo speaker.
- Nel "testo" scrivi la didascalia (caption) che accompagna il video.`,

  domanda: `FORMATO: Domanda / Conversazione
- Un post corto focalizzato su una domanda o un confronto costruttivo su un tema caldo del settore.
- Obiettivo: stimolare commenti e discussioni genuine tra colleghi o clienti.`,
};
