# Wesion — come si usa

*Per chi lo usa, non per chi lo scrive. Se devi metterci le mani nel codice,
leggi `STATO.md`.*

Aggiornato al 02/09/2026.

---

## La regola che spiega tutto il resto

**L'ultimo bottone è di una persona. Niente esce da solo.**

Wesion raccoglie, analizza, scrive e propone. Ma il momento in cui una cosa
diventa pubblica — un post sulla scheda Google, un articolo sul sito, una
modifica al codice di un cliente — è sempre un click di qualcuno.

Se una schermata ti sembra strana, chiediti dove sta il bottone dell'operatore:
di solito la risposta è lì.

---

## La catena, in una riga

```
Campagna → Aziende → (telefonata) → Cliente → Come parla → Cosa è vero
        → Piano del mese → Bozze → APPROVI TU → esce
```

Ogni pagina del menu è un anello. Sotto, uno per uno.

---

## 📣 Campagne — *da «pizzerie a Pavia» a un elenco di nomi*

**A cosa serve:** dire a Wesion cosa cercare su Google Maps. Categoria + città +
quante ne vuoi, e parte lo scraper.

**Come si fa:** nuova campagna, scrivi la categoria («pizzeria d'asporto»), le
città, quante. Poi **aspetti** e premi «Raccogli».

**Le due cose da sapere:**

- La raccolta è **staccata** dall'avvio, apposta. Il lavoro su Apify va avanti
  per conto suo: puoi raccogliere dopo dieci minuti o il giorno dopo, il
  risultato non scade con la tua pagina.
- **Il tetto conta.** Se chiedi 50 pizzerie a Pavia e a Pavia ce ne sono 80, ne
  hai 50: non è un censimento. Per le zone che vuoi tenere sotto controllo,
  chiedine più di quante ce ne sono davvero.

> 💡 **Il trucco che nessuno usa ancora.** Rilancia una campagna già fatta sulla
> stessa zona: le aziende che c'erano restano com'erano, e **quelle nuove
> risultano di oggi**. È il modo per accorgersi delle nuove aperture senza
> nessuno strumento in più. Funziona bene solo se il tetto è alto: vedi sopra.

---

## 🏢 Aziende — *chi chiamo per primo*

**A cosa serve:** è la lista delle telefonate. I lead raccolti, ordinati per
quanto conviene chiamarli.

**Chi ha già firmato non è qui.** Appena metti qualcuno su «cliente», la riga
sparisce da questo elenco e compare in «Clienti». È voluto: questa pagina serve
a decidere chi chiamare, e un cliente non è una telefonata da fare.

**Come si legge una riga.** In fondo a ogni riga ci sono i segnali, e ognuno
vuol dire una cosa precisa:

| | cosa dice |
|---|---|
| **95** (giallo) | Quanto è messo male il sito che ha adesso. Più alto = più gli serviamo. «—» vuol dire che non l'abbiamo ancora guardato. |
| **★ 4.5 · 288** | Le stelle su Google e quante persone le hanno date. Dieci recensioni non sono seicento. |
| **senza sito** (rosso) | Non ha un sito. Non è un problema tuo: è il motivo per cui lo chiami. |
| **occasione** (verde) | Niente sito **ma** tante recensioni buone. Ha già i clienti, gli manca la vetrina. Il caso migliore che esista. |
| **scheda di nessuno** (giallo) | ⚠️ Vedi sotto: è il segnale nuovo, ed è il più forte che abbiamo. |

### «Scheda di nessuno» — leggilo bene, si fraintende

**Non vuol dire che non ha Google.** La scheda ce l'ha: nome, foto, orari,
recensioni. Vuol dire che **non è sua** — nessuno l'ha mai rivendicata.

Conseguenze, che sono la telefonata:

- non può **rispondere a una recensione** (e se ne ha una da una stella, è lì da anni);
- non può **pubblicare un post** — cioè il servizio principale di Wesion, per
  lui, oggi è tecnicamente impossibile;
- **chiunque** può suggerire una modifica ai suoi orari, e Google la accetta.

> 💬 **Come si apre:** «Ho visto che avete 674 recensioni e 4,2 stelle. Sapete
> che la scheda non è intestata a nessuno? Non potete rispondere alle
> recensioni, e chiunque può cambiarvi gli orari. Gliela mettiamo in mano noi.»

**I filtri che contano davvero:** «Senza sito» + «Scheda di nessuno». Insieme ti
danno la lista corta.

**Cosa fai dalla riga:** la apri e a destra hai numero, WhatsApp, e «Come aprire
il discorso» con il gancio già scritto. Dopo la telefonata **cambia lo stato** —
da contattare → contattato → in trattativa → cliente. Se non lo cambi, domani
richiami la stessa persona.

---

## 👥 Clienti — *chi ha già firmato*

**A cosa serve:** chi ha già firmato. Qui non c'è «chi chiamo per primo»: c'è la
scheda vera del cliente, con tutto il suo lavoro.

**Perché una pagina sua e non un filtro:** perché a un cliente da sei mesi non
devi proporre di aprire il discorso. In «Aziende» non compare più — ci finisce
da solo appena lo promuovi.

### Le linguette della scheda cliente

| | a cosa serve |
|---|---|
| **Chi è** | Anagrafica, categoria, stato commerciale. E l'audit SEO/GEO/AEO (sotto). |
| **Come parla** | Il tono del cliente: come scrive lui, non come scriveresti tu. Si costruisce dalle sue recensioni e dai suoi materiali. |
| **Cosa è vero** | ⚠️ **I fatti.** Le uniche cose che Wesion può affermare. Sotto i quattro fatti, i testi escono poveri — il numero è scritto sulla linguetta apposta. |
| **Servizi** | Cosa gli abbiamo attivato: blog sul sito, scheda Google, menù del giorno. Qui stanno i segreti e gli id. |
| **Il mese** | Il piano editoriale suo: cosa esce e quando. |
| **Da approvare** | 🔴 **L'ultimo bottone.** Le bozze pronte. Finché non premi tu, non esce niente. |

### Non ricopiare mai Place ID e URL di Maps

Nel modulo «Modifica» c'è **«Leggi dalla scheda Google»**. Se il cliente ha la
scheda collegata, quel bottone prende da Google **Place ID, URL di Maps,
indirizzo, città, provincia, CAP, categoria, telefono e sito** e li mette nei
campi.

Due cose che fa apposta:

- **riempie solo i campi vuoti.** Se un campo è già compilato e Google dice
  un'altra cosa, non lo tocca: te lo segnala e decidi tu. Quello che c'è in
  tabella spesso l'ha corretto qualcuno a mano, e Google non lo sa.
- **non salva niente.** Compila e basta: il salvataggio resta il tuo «Salva».

> Il Place ID è l'**identità** dell'azienda in tabella. Ricopiarlo a mano da
> `ChIJCz7Caq7ZhkcRhFP5-SRLuq4` è solo un modo lento di sbagliarlo — e
> sbagliarlo non dà errore, crea un doppione.

### L'audit SEO/GEO/AEO (dentro «Chi è»)

Serve a far trovare il cliente **dalle AI**, non solo da Google. Wesion legge il
repo del suo sito e propone le correzioni: dati strutturati, `llms.txt`,
`robots.txt`.

1. **«Analizza SEO»** — legge il sito e apre una proposta (una Pull Request).
2. **«Guarda la proposta»** — vedi il diff qui, file per file, e **cosa è stato
   scartato e perché**.
3. **«Applica al sito»** oppure **«Scarta la proposta»**.

**Cosa NON tocca mai, per costruzione:** prezzi, telefono, indirizzo, orari,
coordinate, tipo di cucina, voti. Sono fatti sul cliente, e un modello non li può
sapere. Se una proposta ne cambia anche uno, viene buttata **tutta**, anche se il
resto era giusto.

> ⚠️ **Leggi sempre gli scarti**, non solo il diff. Se dice «questo sito genera
> llms.txt da codice», vuol dire che il file non va creato: c'è già qualcosa che
> lo produce, e coprirlo lo spegnerebbe in silenzio. È successo davvero.

**Scartare non fa danno.** Chiude la proposta e cancella il ramo, il sito resta
com'è. Scrivi due parole nel «perché»: finiscono nella proposta, e fra sei mesi
sono l'unica cosa che spiega la decisione.

---

## 📅 Calendario — *cosa esce questa settimana, su tutti*

**A cosa serve:** la vista che apri la mattina. Tutti i clienti insieme, giorno
per giorno.

**La cosa da guardare:** i **giorni vuoti**. Un giovedì in cui non esce niente da
nessuna parte è un'informazione, non uno spazio bianco.

---

## 🗂 Piano — *il mese, prima di scrivere*

**A cosa serve:** decidere di cosa si parla questo mese, prima che qualcuno
scriva una riga. Solo per i **clienti**: costruire un mese di post a un prospect
non ha senso.

**Il numero da guardare:** i fatti. Sotto i quattro, il piano esce povero — e
conviene saperlo prima di guardarlo, non dopo.

---

## ✍️ Bozze — *la coda di quello che sta per uscire*

**A cosa serve:** tutto quello che è scritto e aspetta un sì. Post per Google,
articoli per il blog, menù del giorno.

**Come si legge:** ogni bozza ha i suoi **avvisi** — frasi troppo promozionali,
cose che il cliente non può dire, numeri che non stanno nei fatti. Gli avvisi non
bloccano: segnalano. Decidi tu.

> ⚠️ **Approvata non vuol dire pubblicata.** Approvare scrive «approvata» e
> basta. A pubblicare ci pensa il router, dall'altra parte, entro un minuto. Se
> hai approvato e dopo trenta secondi non è uscito niente, aspetta ancora un po'
> prima di preoccuparti.

---

## 📸 Il menù del giorno su WhatsApp — *quello che fa il titolare*

**A cosa serve:** il titolare fotografa la lavagna, la manda al numero del bot, legge
cosa abbiamo capito e risponde **SI**. Da lì il menù esce sul sito (e sulla scheda
Google, se gliel'abbiamo attivata). Non c'è niente da imparare: fotografa e manda, come
già fa con chiunque.

I comandi sono tre: **SI** pubblica, **NO** annulla, **RIPRISTINA** rimette quello di
prima. La bozza scade dopo 15 minuti — un «SI» che arriva domani mattina non deve
pubblicare il menù di ieri.

### Se il cliente ha più di un menù

Molti ne hanno più d'uno: La Fenice ha il fisso del giorno, il venerdì a cena, il sabato
a cena e la domenica a pranzo. **Vanno configurati nella scheda cliente, in «Servizi» →
`menu_del_giorno` → `menu_sezioni`**, e gli `slug` devono essere identici a quelli delle
categorie sul sito (`{"action":"sections"}` sull'endpoint del menù te li dice).

Come funziona poi, da solo:

1. il modello legge l'**intestazione della foto** («Sabato a Cena») e capisce da sé in
   quale menù va;
2. il bot **lo dichiara nella conferma** — «lo pubblico nella sezione *Sabato a Cena*» —
   così una sezione sbagliata si ferma prima di uscire;
3. **solo se non ha capito**, chiede: «In quale menù lo metto? 1 … 2 …», e il titolare
   risponde col numero.

> ⚠️ **Se le sezioni non sono configurate, tutto finisce nella sezione di default del
> sito** (per La Fenice era la Pausa Pranzo). Con l'aggravante che pubblicare è un
> `replace`: il menù del sabato messo nel pranzo **cancella** quello del pranzo. È il
> primo controllo da fare prima di dire a un cliente «da oggi manda al bot».

---

## 🚨 Spie — *cosa è rotto*

**A cosa serve:** qui non si clicca, si legge. Cosa non funziona, cosa è muto,
cosa è giù.

**L'ordine non è casuale:** le rosse in cima, e fra le rosse quelle che toccano
più clienti. Chi apre questa pagina di solito ha poco tempo.

---

## 📈 Da fare — *le cose ferme*

**A cosa serve:** non è un cruscotto e non ci sono grafici. Ogni riga risponde a
**«cosa faccio adesso»**, e ha un click per andarci.

---

## Le cinque cose che ti fanno perdere tempo se non le sai

1. **Approvata ≠ pubblicata.** Ci pensa il router, entro un minuto. (Bozze)
2. **Il tetto della campagna non è un censimento.** 50 richieste = 50, anche se
   ce ne sono 80. (Campagne)
3. **«Scheda di nessuno» ≠ «non ha Google».** Ce l'ha, non è sua — ed è per
   questo che vale. (Aziende)
4. **Se non cambi lo stato dopo la telefonata**, domani richiami quello di ieri.
   (Aziende)
5. **Sotto i quattro fatti i testi escono poveri.** Non è il modello che scrive
   male: non ha niente da dire. (Cosa è vero)

---

## Chi entra può fare tutto

⚠️ Oggi **non ci sono ruoli**. Chi ha un accesso può pubblicare sulle schede
Google dei clienti, cancellare gruppi interi di aziende e cambiare i segreti dei
servizi.

A chi fa ricerca clienti servono solo **Campagne** e **Aziende**: chiamare,
segnare com'è andata, portare un lead a cliente. Tutto il resto è roba che non
gli serve e che può rompere.

È una scelta con una data di scadenza, non una conclusione. Finché il ruolo
«commerciale» non esiste, la protezione è la fiducia — che funziona finché
qualcuno non clicca «Elimina il gruppo» per sbaglio.

---

## Prima di chiamare: il Registro delle Opposizioni

Il Registro Pubblico delle Opposizioni **copre anche le aziende**: un numero
intestato a una società può essere iscritto, e da quel momento la chiamata
promozionale non si può fare. Chi fa campagne telefoniche deve confrontare le
proprie liste col Registro **prima** di chiamare.

Che i numeri siano pubblici su Google Maps non cambia niente.

*(Wesion oggi non fa questo controllo: va fatto fuori. È la prossima cosa da
costruire prima di alzare il volume delle chiamate.)*
