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

# `standalone` è un server già assemblato con dentro solo i moduli che usa.
COPY --from=costruzione /app/.next/standalone ./
COPY --from=costruzione /app/.next/static ./.next/static

USER node

EXPOSE 3000

# Il server standalone si avvia da server.js, non da `next start`: `next` non
# è nemmeno installato in questa immagine, ed è esattamente il punto.
CMD ["node", "server.js"]
