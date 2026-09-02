# La dashboard — va su Contabo, dietro nginx come gli altri prodotti.
#
# Tre stadi, per un motivo solo: quello che serve a COSTRUIRE non deve finire
# in quello che GIRA. Astryx, la sua CLI, TypeScript e i tipi pesano centinaia
# di megabyte e all'immagine finale non servono — il codice arriva già compilato.

# ── 1. Dipendenze ────────────────────────────────────────────────────────────
FROM node:22-alpine AS dipendenze
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── 2. Costruzione ───────────────────────────────────────────────────────────
FROM node:22-alpine AS costruzione
WORKDIR /app
COPY --from=dipendenze /app/node_modules ./node_modules
COPY . .

# ⚠️ Il build NON deve toccare il database.
#
# Le pagine sono tutte `force-dynamic`, quindi non c'è prerendering che legga
# Postgres. Ma se un domani qualcuno toglie quella riga, il build comincerebbe
# a interrogare Neon dalla macchina che costruisce l'immagine — e con il .env
# di produzione, come avverte il playbook. Questa riga fa fallire quel caso
# invece di lasciarlo passare in silenzio.
ENV DATABASE_URL=""
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── 3. Quello che gira ───────────────────────────────────────────────────────
FROM node:22-alpine AS produzione
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# L'audit SEO clona il repo di un sito cliente per leggerlo e proporre le
# correzioni (vedi lib/seo-git.ts): senza `git` nell'immagine, quella chiamata
# fallisce con "spawn git ENOENT" — un errore che non dice cosa manca davvero.
RUN apk add --no-cache git

# `standalone` è un server già assemblato con dentro solo i moduli che usa.
COPY --from=costruzione /app/.next/standalone ./
COPY --from=costruzione /app/.next/static ./.next/static

# ⚠️ `public/` VA COPIATA A MANO, e non è un dettaglio (01/09/2026). L'output
# `standalone` di Next NON la porta con sé: si porta il server e i moduli, non
# i file statici serviti così come sono. Questo Dockerfile è di fine agosto,
# quando `public/` non esisteva ancora — è nata col logo vero sul login. Il
# build passa lo stesso, l'immagine parte lo stesso, e in produzione il logo
# risponde 404: il guasto compare solo a chi guarda la pagina.
COPY --from=costruzione /app/public ./public

USER node

EXPOSE 3000

# Il server standalone si avvia da server.js, non da `next start`: `next` non
# è nemmeno installato in questa immagine, ed è esattamente il punto.
CMD ["node", "server.js"]
