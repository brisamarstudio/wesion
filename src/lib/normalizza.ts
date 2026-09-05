/**
 * Come si riducono a forma canonica le cose che arrivano da fuori.
 *
 * Queste funzioni esistono anche dentro `db/migra-da-leadgen.mjs`, e la copia
 * la' NON va tenuta allineata a questa. Non e' pigrizia: quello script e' una
 * migrazione una-tantum, gia' eseguita il 25/08/2026 con i conteggi verificati
 * da entrambe le parti, e non girera' mai piu'. Cambiarlo adesso non cambia un
 * solo dato — riscriverebbe solo la storia di come quei 46 lead sono entrati.
 * Questa e' l'unica copia viva; quella e' un reperto.
 *
 * (Se un giorno quella migrazione dovesse rigirare, la strada giusta e' farle
 * importare queste funzioni, non ricopiarle una terza volta.)
 */

/**
 * Il numero in forma confrontabile: solo cifre, con prefisso internazionale.
 *
 * E' la colonna su cui il router cerca a ogni messaggio in arrivo, quindi due
 * scritture dello stesso numero devono dare la stessa stringa o il titolare
 * diventa uno sconosciuto. '+' davanti vuol dire che e' gia' internazionale;
 * '00' e' il prefisso di uscita; un numero che inizia per 0 o 3 senza prefisso
 * e' italiano.
 *
 * ⚠️ PERCHE' SI GUARDA LA LUNGHEZZA E NON IL PREFISSO '39'.
 * Fino al 05/09/2026 la regola era «se non comincia gia' per 39, anteponilo».
 * Ma un cellulare italiano il cui numero NAZIONALE inizia per 39 — 391, 392,
 * 393... sono prefissi Wind veri — comincia per 39 pur non avendo il prefisso
 * internazionale: `3912345678` restava tale, mentre da WhatsApp lo stesso
 * numero arriva come `393912345678`. Le due forme non coincidevano mai e quel
 * titolare non veniva riconosciuto MAI, senza un errore da nessuna parte.
 *
 * La lunghezza invece non e' ambigua: un cellulare nazionale ha 9-10 cifre, con
 * il 39 davanti ne ha 11-12. E un numero che inizia per 0 e' sempre nazionale,
 * perche' nessuna forma internazionale comincia per 0 una volta tolti '+' e
 * '00' — quindi li' il prefisso si mette e basta.
 */
export function normalizzaTelefono(grezzo: string | null | undefined): string | null {
  const s = String(grezzo || '').trim();
  let cifre = s.replace(/\D/g, '');
  if (!cifre) return null;
  if (s.startsWith('+')) return cifre;
  if (cifre.startsWith('00')) return cifre.slice(2);
  // Fisso nazionale: comincia per 0, e nessun internazionale lo fa.
  if (cifre.startsWith('0')) return '39' + cifre;
  // Cellulare nazionale: comincia per 3 ed e' lungo 9-10. Con il 39 davanti
  // sarebbe 11-12, quindi non c'e' modo di confonderli.
  if (/^3/.test(cifre) && cifre.length >= 9 && cifre.length <= 10) return '39' + cifre;
  return cifre;
}

/**
 * Il Place ID di Google, che vive in coda al maps_url.
 *
 * E' LA CHIAVE dell'azienda: identifica il posto, non un suo attributo. Nome e
 * telefono cambiano, il posto no. Apify a volte lo restituisce anche come campo
 * suo, quindi si guarda prima li' e poi nell'URL.
 */
export function estraiPlaceId(item: Record<string, unknown>): string | null {
  for (const chiave of ['placeId', 'place_id', 'placeID']) {
    const v = item[chiave];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const url = String(item.url ?? item.googleMapsUrl ?? item.mapsUrl ?? item.placeUrl ?? '');
  const m = url.match(/[?&]query_place_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Il sito ridotto al suo dominio: due URL della stessa home devono coincidere. */
export function normalizzaSito(url: string | null | undefined): string | null {
  const s = String(url || '').trim();
  if (!s) return null;
  try {
    return new URL(s.startsWith('http') ? s : `https://${s}`).hostname.replace(/^www\./, '');
  } catch {
    return s.toLowerCase();
  }
}

/** Slug leggibile e stabile: e' quello che finisce negli URL della dashboard. */
export function creaSlug(nome: string | null | undefined, citta?: string | null): string {
  const pulisci = (t: string | null | undefined) =>
    String(t || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return [pulisci(nome), pulisci(citta)].filter(Boolean).join('-').slice(0, 80) || 'azienda';
}

/** Il CAP pescato dall'indirizzo: Apify non lo restituisce come campo suo. */
export function estraiCap(indirizzo: string | null | undefined): string | null {
  const m = String(indirizzo || '').match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}
