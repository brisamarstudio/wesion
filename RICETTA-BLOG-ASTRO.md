# Ricetta: aggiungere il blog di Wesion a un sito Astro

Da usare ogni volta che nasce un sito Astro nuovo che deve ricevere articoli da
Wesion. `CONTRATTO-SITO.md` dice **cosa** viaggia sul filo; questa dice **come**
si monta la presa dall'altra parte.

L'implementazione di riferimento, quella da cui si copia, è
`SITI/trattorialafenice`. È la prima ed è stata collaudata end-to-end il
30/08/2026.

> **Prerequisiti del sito.** Astro con `output: 'server'` (o ibrido), un
> database Neon già collegato (`src/lib/db.ts` che esporta `sql`), e un file
> `src/config/brand.ts`. Se il sito è statico puro non può ricevere articoli:
> serve prima renderlo server-side, altrimenti la pubblicazione non ha dove
> scrivere.

---

## 1. I quattro file che si copiano **senza toccarli**

| File | Cosa fa |
|---|---|
| `src/lib/blog.ts` | legge gli articoli dal DB, converte il testo di Wesion in HTML |
| `src/pages/api/blog.ts` | l'endpoint che riceve il POST firmato |
| `src/pages/sitemap-blog.xml.ts` | la sitemap degli articoli, rigenerata a ogni richiesta |
| `scripts/migra-blog.ts` | versa in tabella eventuali articoli già scritti a mano |

Sono identici da un sito all'altro **apposta**: tutto ciò che cambia da cliente
a cliente sta in `brand.ts`. Se ti ritrovi a modificarne uno per far funzionare
un sito nuovo, fermati: quel valore va spostato in `brand.ts`, non cablato lì.

L'unica cosa che potresti dover adattare è `scripts/migra-blog.ts`, se il sito
non ha articoli storici da migrare — in quel caso non serve proprio.

## 2. Quello che si cambia — cinque punti, sempre gli stessi

### a) `src/config/brand.ts`

```ts
siteOrigin: 'https://www.ilcliente.it',   // SENZA barra finale

blog: {
  autore: 'Nome del Cliente',
  categoriaPredefinita: 'Novità',
  immaginePredefinita: '/images/una-foto-che-esiste.webp',
},
```

⚠️ `immaginePredefinita` deve puntare a un file che **esiste davvero** in
`public/`. È la copertina che compare quando Wesion pubblica senza immagine, e
un 404 lì è un buco nella griglia del blog su ogni articolo automatico.

### b) La tabella, in `src/lib/schema.sql`

Copia il blocco `CREATE TABLE IF NOT EXISTS blog_posts (...)` e il suo indice.

⚠️ `slug VARCHAR(160) UNIQUE NOT NULL` — l'`UNIQUE` non è decorativo: è ciò su
cui si aggancia l'`ON CONFLICT` dell'endpoint, ed è l'unica cosa che impedisce a
una ripubblicazione dopo una correzione di creare un secondo articolo che fa
concorrenza al primo su Google. Senza, la query fallisce e basta.

### c) `astro.config.mjs`

Se il sito elenca gli articoli a mano in `customPages`, **toglili**: da adesso
li serve `/sitemap-blog.xml`. Lasciarli fa convivere due elenchi, uno dei quali
invecchia in silenzio.

### d) `public/robots.txt`

Aggiungi la seconda riga, sotto quella che c'è già:

```
Sitemap: https://www.ilcliente.it/sitemap-blog.xml
```

Più sitemap sono previste dallo standard e Google le legge tutte.

### e) Le pagine del blog

`blog/index.astro` e `blog/[slug].astro` devono leggere dal database:

```ts
import { leggiArticoli, leggiArticolo } from '../../lib/blog';
const articoli = await leggiArticoli();                       // elenco
const post = await leggiArticolo(String(Astro.params.slug));  // singolo
```

Se il sito ha anche un `llms.txt` generato, fagli usare `leggiArticoli()`: così
un articolo pubblicato mezz'ora fa compare per gli assistenti AI senza deploy.

## 3. Il segreto

Uno per cliente, generato nuovo ogni volta:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Va in **due posti**: `BLOG_SECRET` fra le variabili del progetto su Cloudflare,
e nella scheda del cliente in Wesion come `site_blog_secret`.

⚠️ **Diverso da quello del menù, sempre.** Sono superfici con rischi diversi: il
menù cambia venti righe di una pagina che c'era già, un articolo crea contenuto
indicizzabile con un URL suo. Chi ha il segreto del menù non deve poter
scrivere sul blog. E se il segreto di un cliente viene rubato, si è rubato un
sito solo.

Se `BLOG_SECRET` manca, l'endpoint risponde `503 not_configured`: **spento, non
aperto**. È voluto — un endpoint di pubblicazione senza segreto è peggio di un
endpoint che non c'è.

## 4. Il lato Wesion

Nella scheda del cliente, servizio `blog` attivo con:

| Campo | Valore |
|---|---|
| `site_blog_url` | `https://www.ilcliente.it/api/blog` |
| `site_blog_secret` | il segreto del punto 3 |
| `site_blog_page` | `https://www.ilcliente.it/blog` |

## 5. L'ordine del primo rilascio — non è indifferente

1. Crea la tabella `blog_posts`.
2. Migra gli articoli storici, se ce ne sono (`npm run blog:migra`).
3. Metti `BLOG_SECRET` su Cloudflare.
4. **Solo adesso** rilascia il codice.

Invertire 1 e 4 manda `/blog` in errore: il sito nuovo cerca una tabella che non
c'è ancora.

> **Su quale database creo la tabella?** Su quello che il sito usa davvero. Se il
> progetto ha un solo `.env` con un solo `DATABASE_URL` — il caso normale, e
> quello di tutti i siti fatti finora — la domanda non si pone: è quello, e lo
> script lo trova da solo.
>
> Vale la pena guardarci solo se quel sito ha due database separati, uno di prova
> e uno vero (in Neon si fa con i branch). Lì la tabella creata in locale finisce
> sulla copia di prova, il sito online non ce l'ha, e `/blog` va in errore al
> primo rilascio. Il modo rapido di accorgersene: se dentro il database che stai
> per toccare ci sono prenotazioni e consensi cookie veri, è quello di produzione.

## 6. Il collaudo, cinque richieste

Con il sito in locale (`npm run dev`) o già rilasciato:

```bash
SEG=$(grep "^BLOG_SECRET=" .env | cut -d= -f2)

# 1. segreto sbagliato -> 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4321/api/blog \
  -H "x-blog-secret: sbagliato" -H "Content-Type: application/json" \
  -d '{"action":"pubblica","articolo":{"slug":"x","titolo":"y","corpo":"z"}}'

# 2. slug con caratteri strani -> 400
# 3. pubblicazione valida -> 200 + {"ok":true,"url":"..."}
# 4. la STESSA pubblicazione due volte -> in tabella resta UNA riga
# 5. l'articolo compare in /blog, /sitemap-blog.xml e /llms.txt senza rideploy
```

Poi **cancella l'articolo di prova**, o resta pubblicato:

```sql
DELETE FROM blog_posts WHERE slug = 'prova-endpoint-wesion';
```

---

## Quando questa ricetta va buttata

Alla **quarta o quinta** installazione. A quel punto copiare quattro file a mano
smette di essere il modo economico e diventa il modo per avere cinque versioni
leggermente diverse dello stesso endpoint, dove una corregge un bug che le altre
quattro hanno ancora. Il passo successivo è un pacchetto `@mywebby/blog-endpoint`
che esporta l'`APIRoute` e le funzioni di lettura, e prende `brand` come
parametro.

Finché i siti sono due o tre, copiare è più onesto: un pacchetto con un solo
consumatore è una astrazione inventata prima di sapere cosa varia davvero.

## Il limite noto, che non è di questa ricetta

Gli articoli generati da Wesion **non hanno sottotitoli**: la regola 2 di
`src/lib/articolo.ts` vieta il markdown, quindi il corpo arriva come testo
piatto e diventa una sequenza di `<p>`. Il sito è tollerante — se al modello
scappa un `## titolo` diventa un `<h2>` vero invece di comparire come caratteri
— ma un pezzo di 600 parole senza gerarchia si legge peggio e vale meno per
Google di uno con tre `<h2>`.

La correzione sta in Wesion, non nei siti: far restituire ad `articolo.ts` un
elenco di sezioni invece di una stringa sola. Finché non si fa, gli articoli
scritti a mano restano migliori di quelli automatici.
