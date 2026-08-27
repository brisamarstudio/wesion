/**
 * La voce del cliente: il contesto che fa SCEGLIERE, non la roba da dire.
 *
 * Perché esiste accanto ai fatti. I fatti rispondono a «cosa posso dire senza
 * mentire»: sono i confini, e servono a non fare danni. Ma due falegnami con gli
 * stessi identici fatti — stessi legni, stessi prodotti, stessa provincia —
 * devono scrivere post diversi, perché uno ha imparato dal padre e l'altro è
 * scappato da un ufficio a quarant'anni. Senza quel pezzo il piano editoriale è
 * corretto e intercambiabile: ed è l'*intercambiabile* il difetto che si vede,
 * non lo *scorretto*.
 *
 * ⚠️ QUI DENTRO C'È IL BUG CHE HA SPENTO LA VOCE PER SETTIMANE.
 *
 * Fino al 25/07/2026 gbp-autoposter impacchettava tutto — origine, voce, parole
 * sue, cosa apprezzano i clienti — sotto un unico cappello «sfondo, non
 * materiale da citare», chiuso da tre righe di NON. Il modello obbediva alla
 * lettera: `parole_sue` e `apprezzato` gli passavano davanti con scritto sopra
 * «non usarle», e infatti non le usava. Sembrava che la voce non arrivasse mai
 * al prompt; ci arrivava, ma imbavagliata.
 *
 * Le tre parti hanno TRE DESTINI DIVERSI, ed è tutto il senso di questo file:
 *
 *   SFONDO      `origine`, `come_ragiona` — non si cita, sul serio. Sono le
 *               frasi che diventano ritornello se il modello le vede come
 *               materiale: «il desiderio incontenibile di imparare» appiccicato
 *               in fondo a otto post di fila.
 *   MATERIALE   `apprezzato` — viene dalle recensioni, cioè da gente che ha
 *               pagato. È l'unica cosa verificata da terzi che abbiamo, e si
 *               usa. Con un limite solo: si parla della COSA, non del fatto che
 *               qualcuno l'ha detta (le recensioni stanno nei DIVIETI_BASE).
 *   ISTRUZIONI  `voce`, `parole_sue`, `da_evitare` — non sono né sfondo né
 *               materiale: dicono COME scrivere. Vanno in fondo, che è dove un
 *               modello guarda per ultimo prima di rispondere.
 *
 * Nessun import relativo: così lo può caricare anche il router.
 */

export interface VoceCliente {
  origine: string;
  come_ragiona: string;
  voce: string;
  pubblico: string;
  apprezzato: string[];
  parole_sue: string[];
  da_evitare: string[];
}

/**
 * Il difetto da battere, DESCRITTO invece che sperato.
 *
 * Un prompt che dice solo «scrivi bene» ottiene il registro medio di internet,
 * che per un'attività locale è il registro dell'agenzia: corretto, levigato e
 * scritto da nessuno. Su Artigiano il Conte, con la voce registrata come «parla
 * in prima persona, linguaggio quotidiano ricco di dettagli personali», è uscito
 * «Ogni dettaglio è studiato per valorizzare il legno».
 *
 * Le frasi qui sotto sono vere, prese da post generati davvero: un modello
 * riconosce molto meglio «non scrivere COSÌ» che «scrivi concreto». E la prova
 * finale non è una lista di divieti ma una domanda applicabile a qualsiasi frase
 * — se funziona identica per il concorrente, non parla di questo cliente.
 */
export const EVITA_IL_GENERICO = `COME NON DEVE SUONARE:
Il difetto da evitare non è l'errore, è il post anonimo: corretto, levigato e
scrivibile da chiunque per chiunque. Questi sono usciti davvero, e sono il
bersaglio: "ogni dettaglio è studiato per", "la qualità che fa la differenza",
"professionalità e passione", "soluzioni su misura per ogni esigenza",
"un'esperienza unica", "il connubio perfetto tra tradizione e innovazione".
Prova del nove su ogni frase che scrivi: se funzionerebbe identica per un'altra
attività dello stesso settore, non sta parlando di questo cliente — riscrivila
con dentro una cosa concreta (un gesto, un materiale, un caso, un numero di
passaggi), oppure toglila.`;

/**
 * La voce nella forma in cui può entrare in un prompt.
 *
 * Restituisce sempre almeno `EVITA_IL_GENERICO`, anche a voce vuota: il registro
 * da agenzia è il difetto di partenza di tutti, pure dei clienti su cui non
 * abbiamo ancora fatto nessuna analisi.
 */
export function vocePerPrompt(v: VoceCliente): string {
  const blocchi: string[] = [];

  const sfondo: string[] = [];
  if (v.origine) sfondo.push(`- Da dove viene: ${v.origine}`);
  if (v.come_ragiona) sfondo.push(`- Come ragiona: ${v.come_ragiona}`);
  if (sfondo.length) {
    blocchi.push(
      [
        'CHI È QUESTO CLIENTE (sfondo per scegliere il taglio, non roba da raccontare):',
        ...sfondo,
        '',
        'NON raccontarlo e NON citarlo: niente frasi su come è nata l’attività, sulla',
        'passione o sugli anni di esperienza. Deve sentirsi nel taglio, non leggersi.',
      ].join('\n')
    );
  }

  if (v.apprezzato.length) {
    blocchi.push(
      [
        'COSA GLI RICONOSCONO I CLIENTI (verificato: viene dalle recensioni, puoi usarlo):',
        ...v.apprezzato.map((x) => `- ${x}`),
        '',
        'Questa è roba vera, detta da chi lo ha pagato: è il materiale migliore che hai,',
        'costruiscici sopra il post. Ma parlane dal lato del lavoro, non del giudizio:',
        'racconta COME si ottiene quella cosa. Mai scrivere "i clienti dicono", mai citare',
        'recensioni, stelle o punteggi.',
      ].join('\n')
    );
  }

  const istruzioni: string[] = [];
  if (v.voce) istruzioni.push(`- Come parla davvero: ${v.voce}`);
  if (v.pubblico) istruzioni.push(`- A chi si rivolge: ${v.pubblico}`);
  if (v.parole_sue.length) {
    istruzioni.push(`- Parole e modi suoi, usane almeno uno se ci sta: ${v.parole_sue.join('; ')}`);
  }
  if (v.da_evitare.length) {
    istruzioni.push(`- Parole e modi che non gli appartengono, non usarli mai: ${v.da_evitare.join('; ')}`);
  }
  if (istruzioni.length) {
    blocchi.push(
      ['COME DEVE SUONARE (è la parte che conta: scrivi come parla lui):', ...istruzioni].join('\n')
    );
  }

  blocchi.push(EVITA_IL_GENERICO);
  return blocchi.join('\n\n');
}

/** Vero se c'è abbastanza voce da cambiare qualcosa nei testi. */
export function voceUtilizzabile(v: VoceCliente): boolean {
  return Boolean(v.origine || v.come_ragiona || v.voce) || v.apprezzato.length > 0;
}
