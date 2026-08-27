# Il contratto fra Wesion e il sito di un cliente

Wesion **non scrive mai** sul database di un sito cliente. Gli manda una richiesta HTTP
firmata, e il sito fa il resto.

Non è pigrizia architetturale, è l'unica cosa sensata: ogni sito ha il suo Neon, il suo
schema e le sue regole, e Wesion non ha (e non deve avere) le credenziali di quindici
database di clienti. Una chiave che apre quindici porte è una chiave che, il giorno che
gira, le apre tutte.

```
   Wesion  ──POST──►  https://ilcliente.it/api/blog
                      header: x-blog-secret: <segreto DI QUEL cliente>
                      └─ il SITO valida, scrive sul PROPRIO database, risponde con l'URL
```

Ci sono **due endpoint distinti**, con **due segreti distinti**:

| Cosa | Endpoint | Header del segreto | Config in Wesion |
|---|---|---|---|
| Menù del giorno | `site_menu_url` | `x-menu-secret` | servizio `menu_del_giorno` |
| Blog | `site_blog_url` | `x-blog-secret` | servizio `blog` |

> ⚠️ **Perché due e non uno con due azioni.** Sono superfici con rischi diversi: il menù
> cambia venti righe di una pagina che c'era già, un articolo **crea contenuto
> indicizzabile con un URL suo**. Chi ha il segreto del menù non deve poter pubblicare
> sul blog. E su un sito che il menù non ce l'ha proprio — mywebby.it, per dire — quel
> secondo endpoint non esiste nemmeno.

---

## Il blog — cosa arriva

```http
POST /api/blog
Content-Type: application/json
x-blog-secret: <il segreto di questo cliente>

{
  "action": "pubblica",
  "articolo": {
    "slug":      "come-digitalizzare-il-menu-di-un-ristorante",
    "titolo":    "Come digitalizzare il menu di un ristorante senza app da scaricare",
    "sommario":  "Menu digitale da QR code, senza app. Le 3 opzioni con prezzi reali.",
    "corpo":     "Testo semplice, con gli a capo.\n\nNiente markdown.",
    "categoria": "Ristorazione",
    "immagine":  "https://media.mywebby.it/…/copertina.jpg"
  }
}
```

### La risposta che Wesion si aspetta

```json
{ "ok": true, "url": "https://ilcliente.it/blog/come-digitalizzare-il-menu-di-un-ristorante" }
```

L'`url` finisce in `pubblicazione.url_risultato`: è quello su cui si clicca dalla consolle
per andare a vedere il pezzo vero. Se non lo restituisci, la pubblicazione risulta comunque
riuscita — ma da Wesion l'articolo non è più raggiungibile con un click, e qualcuno dovrà
cercarselo.

Qualunque cosa diversa da `2xx` viene registrata come **errore**, col corpo della risposta
salvato grezzo. Rispondi con un messaggio che spieghi cosa non andava: è quello che si legge
in consolle sei settimane dopo, quando nessuno ricorda più niente.

---

## ⚠️ Le tre regole che il sito DEVE rispettare

### 1. Lo slug decide chi pubblica, non chi riceve

Wesion manda sempre lo `slug`. Il sito **non lo genera dal titolo**.

Se lo generasse lui, correggere una parola nel titolo produrrebbe uno slug nuovo, quindi un
**secondo articolo**, e il primo resterebbe online per sempre — due versioni della stessa
cosa che si fanno concorrenza su Google. Lo slug è la chiave: stesso slug significa stesso
articolo.

### 2. Pubblicare due volte non deve creare due articoli

```sql
INSERT INTO articoli (slug, titolo, …) VALUES (…)
ON CONFLICT (slug) DO UPDATE SET titolo = EXCLUDED.titolo, …, aggiornato_at = now()
```

Ripubblicare dopo una correzione capita spesso, ed è normale. Deve **aggiornare**.
Serve un `UNIQUE` sullo slug, o l'`ON CONFLICT` non ha su cosa agganciarsi.

### 3. Il segreto si confronta a tempo costante

```ts
// ⚠️ NO: si ferma al primo byte diverso, e il tempo racconta quanti erano giusti.
if (header !== SEGRETO) return new Response('no', { status: 401 });
```

Con abbastanza tentativi il segreto si ricostruisce un carattere per volta. Su un Worker:

```ts
const atteso = new TextEncoder().encode(SEGRETO);
const dato = new TextEncoder().encode(header ?? '');
const buono = atteso.length === dato.length &&
  crypto.subtle.timingSafeEqual
    ? crypto.subtle.timingSafeEqual(atteso, dato)
    : atteso.every((b, i) => b === dato[i]);   // ripiego, meglio di ===
```

Costa niente farlo bene, e il segreto è per-cliente: rubato uno, si ruba un sito solo.

---

## L'endpoint, da incollare (Astro su Cloudflare)

`src/pages/api/blog.ts`:

```ts
import type { APIRoute } from 'astro';
import { neon } from '@neondatabase/serverless';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;

  // 1. Il segreto, confrontato per intero.
  const dato = request.headers.get('x-blog-secret') ?? '';
  const atteso = env.BLOG_SECRET ?? '';
  if (dato.length !== atteso.length || !dato.split('').every((c, i) => c === atteso[i])) {
    return new Response(JSON.stringify({ ok: false, error: 'segreto non valido' }), { status: 401 });
  }

  const { action, articolo } = await request.json();
  if (action !== 'pubblica' || !articolo?.slug || !articolo?.titolo) {
    return new Response(JSON.stringify({ ok: false, error: 'servono action=pubblica, slug e titolo' }), { status: 400 });
  }

  // 2. Stesso slug = stesso articolo. Serve UNIQUE(slug) in tabella.
  const sql = neon(env.DATABASE_URL);
  await sql`
    INSERT INTO articoli (slug, titolo, sommario, corpo, categoria, immagine, pubblicato_at)
    VALUES (${articolo.slug}, ${articolo.titolo}, ${articolo.sommario ?? null},
            ${articolo.corpo}, ${articolo.categoria ?? null}, ${articolo.immagine ?? null}, now())
    ON CONFLICT (slug) DO UPDATE SET
      titolo = EXCLUDED.titolo, sommario = EXCLUDED.sommario, corpo = EXCLUDED.corpo,
      categoria = EXCLUDED.categoria, immagine = EXCLUDED.immagine, aggiornato_at = now()
  `;

  // 3. L'URL vero: è quello che si clicca dalla consolle.
  const url = `${env.SITE_URL}/blog/${articolo.slug}`;
  return new Response(JSON.stringify({ ok: true, url }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

La tabella minima:

```sql
CREATE TABLE IF NOT EXISTS articoli (
  id            BIGSERIAL PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,   -- ⚠️ UNIQUE, o l'ON CONFLICT non aggancia niente
  titolo        TEXT NOT NULL,
  sommario      TEXT,
  corpo         TEXT NOT NULL,
  categoria     TEXT,
  immagine      TEXT,
  pubblicato_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  aggiornato_at TIMESTAMPTZ
);
```

---

## Da dove arriva quello che ti mandiamo

Wesion genera **tutta la scheda in una chiamata sola**: titolo, sommario, categoria e corpo
insieme. Chiederli separatamente darebbe pezzi che non si parlano — un titolo che promette
una cosa e un corpo che ne racconta un'altra.

| Campo | Come nasce |
|---|---|
| `titolo` | generato, massimo 70 caratteri (oltre, Google lo taglia nei risultati) |
| `sommario` | generato, massimo 160. Se il modello lo salta, si prende l'inizio del corpo |
| `categoria` | scelta **da un elenco configurato per quel cliente**, non inventata |
| `corpo` | 400-700 parole, testo semplice con gli a capo |
| `slug` | calcolato dal titolo **una volta sola**, alla prima generazione |
| `immagine` | caricata a mano su `media.mywebby.it`, dalla consolle |

Le categorie si scrivono nella scheda del cliente, separate da virgola. Servono: un blog con
quindici categorie da un pezzo ciascuna non raggruppa niente, e le etichette non si
riordinano a posteriori senza cambiare gli URL che le usano.

> ⚠️ **Lo slug non si ricalcola mai.** Sta in `contenuto.slug` e rigenerare la bozza lo
> lascia com'è (`COALESCE` in SQL, apposta). Il titolo si corregge quanto si vuole:
> l'indirizzo resta quello. È la stessa ragione della regola 1 qui sopra, vista dall'altra
> parte del filo.

### Cosa resta a carico di una persona

Il modello **inventa i dettagli di contorno**, sempre. Provato il 27/08/2026: da «farina di
un molino di Zinasco» ha scritto «il grano viene macinato a pietra» e «una crosta di pane più
croccante» — la macinatura e il pane non stanno in nessun fatto.

Nessuno di questi è un errore che un controllo automatico possa vedere: sono frasi corrette,
fluenti, plausibili. Per questo un articolo si legge prima di approvarlo, e per questo il
bottone che pubblica è di una persona.
