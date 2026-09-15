# Prompt per Gemini — la plancia del cliente (UX in umanese)

> Da incollare a Gemini aperto in `SOFTWARE/wesion`. Scritto il 15/09/2026, dopo che l'operatore
> (Mariano, MyWebby) ha aperto la scheda di un cliente e non ha capito dove accendere i social.

## Il problema, detto da chi lo usa

> "Avete costruito in AIchese invece che in umanese. Mille cose e non c'è un click: vai qui
> social, ecco Google, ecco il sito, ecco la tua scheda. Ci vuole il manuale d'uso."

Oggi `src/componenti/SchedaCliente.tsx` mette tutto sullo stesso piano: account id, endpoint,
segreti in chiaro, "chi può dare comandi al router", accanto a "Social: attivo". Ci sono **due
"Servizi"** (la linguetta e il tag di settore). E non dice le due cose che contano:
**cosa è collegato** e **cosa devo fare adesso**. Il blog di MyWebby punta a `localhost` (non
pubblica niente) e la pagina non lo segnala.

## Chi lo usa

Un titolare di agenzia, non uno sviluppatore, spesso di fretta, a volte dal telefono, con 15
clienti. Deve capire in **5 secondi** lo stato di un cliente e fare l'azione con **un click**.

## Cosa costruire

### 1. La linguetta "Chi è" diventa **Plancia** (prima linguetta, aperta di default)

```
MyWebby · Pavia · cliente                                   [ + Crea un post ]

Da fare oggi
  • 2 post Google da approvare              [Approva]
  • 1 post Instagram da copiare             [Apri]

┌─ Google ──────────┐ ┌─ Sito e blog ─────┐ ┌─ Social ──────────┐ ┌─ WhatsApp ────────┐
│ ● Collegata       │ │ ⚠ Non pubblica    │ │ ● Attivo · FB+IG  │ │ ○ Spento          │
│ ultimo post 12/09 │ │ indirizzo di prova│ │ 3 a settimana     │ │                   │
│ [Vai ai post]     │ │ [Sistemalo]       │ │ [Vai ai post]     │ │ [Attiva]          │
└───────────────────┘ └───────────────────┘ └───────────────────┘ └───────────────────┘

Sito:  SEO ultimo controllo 15/09 · 1 proposta da guardare   [Guarda]
```

- **Una scheda per canale**: Google, Sito e blog, Social, WhatsApp, Menù del giorno (solo per ristorazione).
- Ogni scheda ha **tre stati sole**, con colore e parola: **● Funziona** / **⚠ C'è un problema** (con
  la frase del problema in italiano) / **○ Spento**. Più **un bottone** con l'azione giusta.
- Lo stato si **calcola**, non si dichiara: es. blog con `localhost` o `127.0.0.1` = ⚠ (la stessa
  regola c'è già in `src/lib/bozze.ts`, `servizi_pronti`: riusala, non riscriverla).
- **"Da fare oggi"** in cima: bozze da approvare, social da copiare, pubblicazioni fallite, spie
  accese per quel cliente. Ogni riga porta dove si fa la cosa.

### 2. La linguetta "Servizi" diventa **Impostazioni**

- Ogni servizio in un blocco richiudibile, **chiuso di default**, col suo interruttore in testa.
- Dentro, prima le 2-3 scelte umane (es. "Bottone sotto i post", "Canali", "Post a settimana"),
  poi **"Avanzate"** chiuso: id account, endpoint, token, "chi può dare comandi al router".
- **I segreti non si mostrano in chiaro**: `••••••••` con "Mostra" / "Copia".
- Il tag di settore (Ristorazione, Artigianato, **Servizi**…) si rinomina **"Settore"** e si sposta
  in "Modifica anagrafica": non deve più chiamarsi come la linguetta.

### 3. Parole

Vietate nell'interfaccia visibile (restano solo in "Avanzate" se servono): endpoint, router, token,
payload, config, slot, fatto_id, sezione, API, REST, account id, location id.
Sostituzioni: "piano editoriale" → "calendario dei post"; "Da approvare" → "Da approvare" (va bene);
"Cosa è uscito" → "Pubblicati"; "Cosa è vero" → "Cosa sappiamo" (con sotto una riga di spiegazione).

## Regole che non si discutono

1. **Solo interfaccia.** Non cambiare API, query, schema, router, generatore. Se per mostrare uno
   stato ti serve un dato che l'API non dà, **aggiungi un campo in lettura** e dillo nel resto.
2. **Non spegnere né accendere servizi** in automatico e non cambiare nessun valore salvato.
3. Mobile: le schede vanno in colonna sotto i 700px, bottoni grandi.
4. Stesso design system già in uso (i componenti di `src/componenti`), niente librerie nuove.
5. `npx tsc --noEmit -p .` verde prima di ogni commit. Commit piccoli in italiano.
6. **Niente deploy** e **niente Oracle**: il deploy lo fa l'operatore con Claude dopo averlo visto.

## Per cominciare

Rispondi con: l'elenco degli stati che calcoli per ogni scheda (e da quali dati), le parole che
cambi, i file che tocchi. Niente codice finché l'operatore non approva.
