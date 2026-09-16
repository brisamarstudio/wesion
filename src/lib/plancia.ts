/**
 * La plancia: lo stato di un cliente detto in italiano, non in configurazione.
 *
 * ⚠️ NASCE DA CHI LA USA (15/09/2026): «avete costruito in AIchese invece che in
 * umanese. Mille cose e non c'è un click». La scheda metteva sullo stesso piano
 * l'account id di Google e «Social: attivo», e non rispondeva alle due domande
 * che uno si fa aprendola: **cosa è collegato** e **cosa devo fare adesso**.
 *
 * Qui non si legge il database e non si cambia niente: si guarda la `Scheda` che
 * la pagina ha già in mano e se ne ricava, per ogni canale, UNA parola, UNA
 * frase e UN bottone. Tutto quello che serve è già in `leggiScheda`: se domani
 * servisse un dato in più, si aggiunge là in lettura — non si inventa qui.
 *
 * ⚠️ LO STATO SI CALCOLA, NON SI DICHIARA. «Attivo» non vuol dire «funziona»:
 * il blog di MyWebby era acceso e puntava a localhost, cioè non pubblicava
 * niente, e la pagina non lo diceva. È lo stesso guasto muto del 01/09/2026 che
 * ha fatto nascere `servizi_pronti` in `bozze.ts`: quella regola sta in SQL
 * perché serve alla consolle delle bozze, questa la rifà in TypeScript perché
 * serve al browser. Se ne cambi una, cambia l'altra — sono due copie della
 * stessa frase, e la seconda è qui per non mandare al client la `config`.
 */

import type { Scheda } from './scheda';

/** Tre stati, non di più: una persona di fretta ne distingue tre. */
export type StatoCanale = 'funziona' | 'problema' | 'spento';

export interface Canale {
  id: string;
  /** Il nome che userebbe il cliente al telefono, non il `tipo` in tabella. */
  nome: string;
  stato: StatoCanale;
  /** Una riga sotto il titolo: cosa sta succedendo, in italiano. */
  dettaglio: string;
  /** Il bottone: uno solo, quello giusto per lo stato in cui è. */
  azione: { etichetta: string; tab: string } | null;
}

/** Una riga di «Da fare oggi»: cosa aspetta, e dove si fa. */
export interface DaFare {
  id: string;
  testo: string;
  etichetta: string;
  tab: string;
  urgente: boolean;
}

/**
 * Le frasi con un numero, provate con 0, 1 e tanti.
 *
 * Il 15/09/2026 la dashboard diceva «Artigiano il Conte ha solo 0 fatti»: la
 * frase era stata scritta pensando al 3. Ogni conteggio passa di qui.
 */
export function conta(n: number, uno: string, molti: string, nessuno: string): string {
  if (n === 0) return nessuno;
  if (n === 1) return `un ${uno}`;
  return `${n} ${molti}`;
}

/**
 * Un indirizzo che da un server non porta da nessuna parte.
 *
 * Vuoto è ovvio; `localhost` è il caso cattivo — sembra configurato e non lo è.
 * Stessa regola di `servizi_pronti` in `bozze.ts` (vedi l'avvertenza in cima).
 */
export function indirizzoDiProva(url: string | undefined): boolean {
  const v = (url ?? '').trim();
  if (!v) return false;
  return v.includes('localhost') || v.includes('127.0.0.1');
}

function config(s: Scheda, tipo: string): Record<string, string> {
  return s.servizi.find((x) => x.tipo === tipo)?.config ?? {};
}

function attivo(s: Scheda, tipo: string): boolean {
  return s.servizi.find((x) => x.tipo === tipo)?.attivo ?? false;
}

/** L'ultima cosa uscita (o non uscita) verso una destinazione. */
function ultimaVerso(s: Scheda, destinazione: string): { quando: string | null; riuscita: boolean } | null {
  for (const v of s.storico) {
    const d = v.destinazioni.find((x) => x.destinazione === destinazione);
    if (d) return { quando: v.uscito_at, riuscita: d.esito === 'ok' };
  }
  return null;
}

/** "il 12/09" oppure "" — le date in plancia non hanno bisogno dell'ora. */
function ilGiorno(iso: string | null): string {
  if (!iso) return '';
  return ` il ${new Date(iso).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })}`;
}

/**
 * Le schede dei canali, nell'ordine in cui contano per chi vende.
 *
 * Google per primo perché è dove si vede l'effetto (ed è l'unico che pubblica
 * da solo), il sito dopo, poi i social che si copiano a mano, WhatsApp che è il
 * canale in entrata, il menù solo per chi ha una cucina.
 */
export function canali(s: Scheda): Canale[] {
  const elenco: Canale[] = [];

  // ── Google ───────────────────────────────────────────────────────────────
  {
    const c = config(s, 'post_gbp');
    const ultima = ultimaVerso(s, 'gbp');
    const idStorti =
      (c.gbp_account_id && !/^[0-9]+$/.test(c.gbp_account_id)) ||
      (c.gbp_location_id && !/^[0-9]+$/.test(c.gbp_location_id));
    const toltoDaGoogle =
      s.storico.find((v) => v.destinazioni.some((d) => d.destinazione === 'gbp'))?.stato_remoto ?? null;

    let stato: StatoCanale = 'spento';
    let dettaglio = 'la sua scheda Google non la curiamo noi';
    let azione: Canale['azione'] = { etichetta: 'Attiva', tab: 'servizi' };

    if (attivo(s, 'post_gbp')) {
      if (!c.gbp_account_id || !c.gbp_location_id) {
        stato = 'problema';
        dettaglio = 'non è collegata a nessuna scheda Google: i post non possono uscire';
        azione = { etichetta: 'Sistemalo', tab: 'servizi' };
      } else if (idStorti) {
        stato = 'problema';
        dettaglio = 'la scheda collegata è salvata storta: la pubblicazione fallisce';
        azione = { etichetta: 'Sistemalo', tab: 'servizi' };
      } else if (ultima && !ultima.riuscita) {
        stato = 'problema';
        dettaglio = `l'ultimo post non è uscito${ilGiorno(ultima.quando)}`;
        azione = { etichetta: 'Guarda', tab: 'storico' };
      } else if (toltoDaGoogle && toltoDaGoogle !== 'LIVE') {
        stato = 'problema';
        dettaglio = 'Google ha tolto l’ultimo post';
        azione = { etichetta: 'Guarda', tab: 'storico' };
      } else {
        stato = 'funziona';
        dettaglio = ultima ? `ultimo post${ilGiorno(ultima.quando)}` : 'collegata, nessun post ancora uscito';
        azione = { etichetta: 'Vai ai post', tab: 'mese' };
      }
    }
    elenco.push({ id: 'google', nome: 'Google', stato, dettaglio, azione });
  }

  // ── Sito e blog ──────────────────────────────────────────────────────────
  {
    const c = config(s, 'blog');
    const wordpress = (c.tipo || 'wesion') === 'wordpress';
    const indirizzo = wordpress ? c.wp_base : c.site_blog_url;
    const ultima = ultimaVerso(s, 'blog');

    let stato: StatoCanale = 'spento';
    let dettaglio = 'non gli scriviamo articoli';
    let azione: Canale['azione'] = { etichetta: 'Attiva', tab: 'servizi' };

    if (attivo(s, 'blog')) {
      if (!(indirizzo ?? '').trim()) {
        stato = 'problema';
        dettaglio = 'manca l’indirizzo a cui mandare gli articoli';
        azione = { etichetta: 'Sistemalo', tab: 'servizi' };
      } else if (indirizzoDiProva(indirizzo)) {
        stato = 'problema';
        dettaglio = 'l’indirizzo è ancora quello delle prove: non pubblica niente';
        azione = { etichetta: 'Sistemalo', tab: 'servizi' };
      } else if (ultima && !ultima.riuscita) {
        stato = 'problema';
        dettaglio = `l'ultimo articolo non è uscito${ilGiorno(ultima.quando)}`;
        azione = { etichetta: 'Guarda', tab: 'storico' };
      } else {
        stato = 'funziona';
        dettaglio = ultima ? `ultimo articolo${ilGiorno(ultima.quando)}` : 'collegato, nessun articolo ancora';
        azione = { etichetta: 'Vai agli articoli', tab: 'mese' };
      }
    }
    elenco.push({ id: 'sito', nome: 'Sito e blog', stato, dettaglio, azione });
  }

  // ── Social ───────────────────────────────────────────────────────────────
  {
    const c = config(s, 'social');
    const nomiCanali =
      c.canali === 'facebook' ? 'Facebook' : c.canali === 'instagram' ? 'Instagram' : 'Facebook e Instagram';
    const aSettimana = Number(c.post_a_settimana || '3');
    const daCopiare = s.daApprovare.filter((b) => b.tipo === 'social').length;

    // Il social non ha uno stato «rotto»: in Fase 1 si pubblica a mano, quindi
    // non c'è niente che possa fallire di nascosto. Due stati, e basta.
    const acceso = attivo(s, 'social');
    elenco.push({
      id: 'social',
      nome: 'Social',
      stato: acceso ? 'funziona' : 'spento',
      dettaglio: acceso
        ? `${nomiCanali} · ${conta(aSettimana, 'post a settimana', 'post a settimana', 'nessun post programmato')}` +
          (daCopiare ? ` · ${conta(daCopiare, 'post da copiare', 'post da copiare', '')}` : '')
        : 'non gli scriviamo post social',
      azione: acceso
        ? { etichetta: daCopiare ? 'Copia i post' : 'Vai ai post', tab: daCopiare ? 'approvare' : 'mese' }
        : { etichetta: 'Attiva', tab: 'servizi' },
    });
  }

  // ── WhatsApp ─────────────────────────────────────────────────────────────
  {
    // Non è un servizio in tabella: il bot è uno solo per tutti. Quello che
    // cambia da cliente a cliente è CHI può dargli comandi — vedi i titolari.
    const quanti = s.titolari.length;
    elenco.push({
      id: 'whatsapp',
      nome: 'WhatsApp',
      stato: quanti ? 'funziona' : 'spento',
      dettaglio: quanti
        ? conta(quanti, 'numero abilitato', 'numeri abilitati', '')
        : 'nessun numero abilitato: il bot non gli risponde',
      azione: quanti ? null : { etichetta: 'Abilita un numero', tab: 'anagrafica' },
    });
  }

  // ── Menù del giorno ──────────────────────────────────────────────────────
  // Solo a chi ha una cucina: su un falegname è una scheda che non vorrà mai.
  if (attivo(s, 'menu_del_giorno') || s.settore.includes('ristorazione')) {
    const c = config(s, 'menu_del_giorno');
    let stato: StatoCanale = 'spento';
    let dettaglio = 'non gli pubblichiamo il menù';
    let azione: Canale['azione'] = { etichetta: 'Attiva', tab: 'servizi' };

    if (attivo(s, 'menu_del_giorno')) {
      if (!(c.site_menu_url ?? '').trim()) {
        stato = 'problema';
        dettaglio = 'manca l’indirizzo a cui mandare il menù';
        azione = { etichetta: 'Sistemalo', tab: 'servizi' };
      } else if (indirizzoDiProva(c.site_menu_url)) {
        stato = 'problema';
        dettaglio = 'l’indirizzo è ancora quello delle prove: non pubblica niente';
        azione = { etichetta: 'Sistemalo', tab: 'servizi' };
      } else {
        const ultima = ultimaVerso(s, 'sito');
        stato = 'funziona';
        dettaglio = ultima ? `ultimo menù${ilGiorno(ultima.quando)}` : 'collegato, il titolare manda la foto';
        azione = null;
      }
    }
    elenco.push({ id: 'menu', nome: 'Menù del giorno', stato, dettaglio, azione });
  }

  return elenco;
}

/** Come si chiamano i tipi di bozza quando si parla con una persona. */
const COSA_E: Record<string, { uno: string; molti: string; verbo: string; tab: string }> = {
  post_gbp: { uno: 'post Google', molti: 'post Google', verbo: 'da approvare', tab: 'approvare' },
  articolo: { uno: 'articolo', molti: 'articoli', verbo: 'da approvare', tab: 'approvare' },
  social: { uno: 'post social', molti: 'post social', verbo: 'da copiare', tab: 'approvare' },
  menu: { uno: 'menù', molti: 'menù', verbo: 'da approvare', tab: 'approvare' },
  messaggio_lead: { uno: 'messaggio', molti: 'messaggi', verbo: 'da approvare', tab: 'approvare' },
};

/**
 * Cosa aspetta una persona, oggi, per QUESTO cliente.
 *
 * L'ordine è quello di quanto costa ignorarlo: prima le code ferme (una bozza
 * non approvata non esce), poi le cose rotte, poi quello che manca per lavorare.
 * È la stessa regola delle spie e dell'ordinamento delle bozze.
 */
export function daFareOggi(s: Scheda, elencoCanali: Canale[]): DaFare[] {
  const righe: DaFare[] = [];

  const perTipo = new Map<string, number>();
  for (const b of s.daApprovare) perTipo.set(b.tipo, (perTipo.get(b.tipo) ?? 0) + 1);
  for (const [tipo, n] of perTipo) {
    const e = COSA_E[tipo] ?? { uno: tipo, molti: tipo, verbo: 'da guardare', tab: 'approvare' };
    righe.push({
      id: `bozze-${tipo}`,
      testo: `${conta(n, e.uno, e.molti, '')} ${e.verbo}`,
      etichetta: tipo === 'social' ? 'Apri' : 'Approva',
      tab: e.tab,
      urgente: true,
    });
  }

  for (const c of elencoCanali) {
    if (c.stato !== 'problema') continue;
    righe.push({
      id: `guasto-${c.id}`,
      testo: `${c.nome}: ${c.dettaglio}`,
      etichetta: c.azione?.etichetta ?? 'Guarda',
      tab: c.azione?.tab ?? 'servizi',
      urgente: true,
    });
  }

  if (s.sito_ultima_pr_url) {
    righe.push({
      id: 'proposta-sito',
      testo: 'una proposta per il sito aspetta un sì',
      etichetta: 'Guarda',
      tab: 'chi',
      urgente: false,
    });
  }

  // Senza fatti il generatore non ha di che parlare: non è un guasto, ma è il
  // motivo per cui i post di quel cliente si somiglierebbero tutti.
  if (s.fatti.length < 4) {
    righe.push({
      id: 'fatti',
      testo:
        s.fatti.length === 0
          ? `di ${s.nome} non sappiamo ancora niente: senza fatti i post si ripetono`
          : s.fatti.length === 1
            ? `di ${s.nome} sappiamo un solo fatto: ne servono almeno 4`
            : `di ${s.nome} sappiamo solo ${s.fatti.length} fatti: ne servono almeno 4`,
      etichetta: 'Raccontacelo',
      tab: 'fatti',
      urgente: false,
    });
  }

  return righe;
}
