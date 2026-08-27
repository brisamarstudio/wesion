/**
 * Le regole che valgono per OGNI testo che finisce su Google Business Profile.
 *
 * Stanno qui, e non dentro chi genera, perché le abbiamo già pagate una volta.
 * Il 20/07/2026 Google ha rimosso un post di "Artigiano il Conte" e ha
 * disattivato la pubblicazione sulla scheda: il testo elencava i contatti sotto
 * il post ed era pieno di emoji. Riscritto asciutto, è passato liscio.
 *
 * In gbp-autoposter la correzione era finita solo nel prompt di una coda su
 * due: quello che riscriveva i post presi da Instagram è rimasto indietro e
 * continuava a passare al modello telefono, sito e indirizzo chiedendogli pure
 * di chiudere con "Chiamaci per info" — esattamente il post che era stato
 * rimosso. Due prompt e una regola sola: se vive in un posto solo, la prossima
 * correzione non può dimenticarne metà.
 *
 * Nessun import relativo: così lo può caricare anche il router, se un domani
 * generasse lui.
 */

/**
 * Il ruolo del modello.
 *
 * Niente "ricco di emoji" e niente "CTA finale": erano le due istruzioni che
 * spingevano il generatore verso il volantino.
 *
 * E niente "sei un copywriter esperto in Local SEO", che c'era fino al
 * 25/07/2026. Era la richiesta sbagliata detta bene: a un copywriter esperto si
 * ottiene la prosa del copywriter esperto — levigata, competente e uguale per
 * tutti i clienti. Ma il post lo firma il falegname, non l'agenzia, e il lavoro
 * qui non è scrivere bene: è scrivere come lui.
 */
export const SISTEMA_COPYWRITER =
  "Scrivi i post di Google Business Profile per conto di attività italiane, e il tuo mestiere è " +
  "farli suonare come chi manda avanti l'attività, non come l'agenzia che gliela cura. " +
  'Testi brevi, concreti, sobri: chi legge deve riconoscere una persona, non un annuncio.\n\n' +
  'Non mostrare ragionamenti, bozze o testo dentro tag <think>. Restituisci solo il testo finale ' +
  'del post, senza preamboli tipo "Ecco il post:" e senza virgolette attorno.\n\n' +
  'FORMATTAZIONE: scrivi in TESTO SEMPLICE. Google Business Profile non interpreta il Markdown, ' +
  'quindi non usare mai asterischi per il grassetto, underscore per il corsivo, cancelletti per i ' +
  'titoli o link in forma [testo](url): comparirebbero tali e quali sul profilo pubblico.';

/**
 * Le regole di merito, già numerate: si incollano in fondo al prompt.
 *
 * La 1 e la 3 sono quelle che hanno fatto rimuovere il post. La 2 è il motivo
 * per cui la 1 non è una rinuncia: i pulsanti della scheda (Chiama, Sito,
 * Indicazioni) fanno quel lavoro meglio di qualsiasi riga di testo, e li mette
 * Google.
 *
 * La 7 è la più disattesa di tutte. Provato il 27/08/2026 su uno slot vero, il
 * modello migliore della catena ha comunque inventato "tagliatelle" e "vino
 * della casa" per un locale i cui piatti veri erano risotto e agnolotti. Nessuna
 * delle due è un errore che il controllo automatico sappia vedere: è per questo
 * che l'ultimo bottone resta di una persona.
 */
export const REGOLE_CRITICHE = `REGOLE CRITICHE:
1. NON scrivere MAI nel testo: indirizzo completo, numero di telefono, indirizzo email, URL del
   sito. Sono già sulla scheda Google, e il link ha il suo pulsante. Un post fatto di titolo +
   indirizzo + telefono + sito somiglia a un annuncio pubblicitario, e Google lo respinge: è
   successo davvero il 20/07/2026. Della zona puoi citare al massimo il nome del paese o della
   città, quando serve al discorso.
2. Niente inviti generici tipo "Contattaci per un preventivo", "Chiama ora" o "Visita il sito":
   la scheda ha già i pulsanti per farlo, e funzionano meglio di una frase.
3. Al massimo DUE emoji in tutto il post, e vanno benissimo anche zero. Tre sono già rumore:
   fanno sembrare il testo un volantino, ed è la faccia che Google guarda quando decide se un
   post è pubblicità.
4. Niente hashtag: su Google non servono a nulla e aggiungono solo rumore.
5. Racconta UNA cosa sola e concreta, quella del compito qui sopra.
6. Tono caloroso e professionale, mai gridato: niente MAIUSCOLE urlate e niente file di punti
   esclamativi.
7. NON INVENTARE NIENTE. Puoi usare solo i fatti scritti qui sopra. Non aggiungere piatti,
   prodotti, ingredienti, materiali o dettagli che non siano elencati: se il fatto dice "pasta
   fatta in casa" non puoi scrivere "tagliatelle", perché non lo sai. E mai premi,
   certificazioni, orari, prezzi, sconti, anni di attività o numeri di clienti.
8. Restituisci solo il post finale, senza spiegazioni aggiuntive.
9. TESTO SEMPLICE: niente **grassetto**, niente _corsivo_, niente link [testo](url). Su Google
   comparirebbero i simboli in chiaro.
10. NON COLLEGARE FRA LORO FATTI DIVERSI se non sai come stanno insieme. L'elenco delle altre
    cose vere non è un invito a combinarle: ogni voce sta per conto suo. Provato il 27/08/2026,
    da "farina di un molino di Zinasco" e "risotto con la zucca" è uscito "il brodo, preparato
    con la farina del molino": una frase che suona benissimo e descrive una cosa che non
    esiste. Se non sei sicuro di come due fatti si tengano, usane UNO e basta.`;

/**
 * Cose che il generatore non può MAI affermare, qualunque sia il cliente.
 *
 * Non è una questione di scrupoli: sono tutte cose che CAMBIANO, e che il
 * modello non ha modo di sapere. Un orario sbagliato in un post fa presentare
 * qualcuno davanti a una porta chiusa, e quel qualcuno chiama il cliente, che
 * chiama te. È il paracadute che smette di funzionare — non perché hai mentito,
 * ma perché hai creato un problema che prima non c'era.
 */
export const DIVIETI_BASE: string[] = [
  'Orari di apertura o chiusura, giorni di riposo, chiusure per ferie',
  'Prezzi, sconti, promozioni, offerte a tempo',
  'Disponibilità: posti liberi, scorte, tempi di consegna, prenotazioni aperte',
  'Premi, riconoscimenti, classifiche, recensioni o punteggi',
  'Certificazioni e denominazioni: bio, DOP, km 0, FSC, marchi di qualità',
  'Numeri e statistiche: anni di attività, clienti serviti, quantità prodotte',
  'Confronti con concorrenti, diretti o allusivi',
];
