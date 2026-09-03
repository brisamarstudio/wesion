"use client";

/**
 * Il modulo di un'azienda: lo stesso per crearla e per correggerla.
 *
 * UNO SOLO PER I DUE MESTIERI, apposta. Un modulo di creazione e uno di
 * modifica separati divergono in una settimana: uno impara a validare il CAP e
 * l'altro no, e il difetto si vede solo sulla strada che non usi mai. Qui
 * l'unica differenza e' dove finisce il salvataggio — POST se e' nuova, PATCH
 * se esiste — e la decide `azienda === null`.
 *
 * ⚠️ I CONTATTI SONO L'ELENCO COMPLETO. Quelli tolti di qui spariscono davvero
 * dal database: e' voluto, perche' da `contatto` il router prende chi ha il
 * diritto di pubblicare. Un numero sbagliato che sopravvive alla correzione e'
 * peggio di uno cancellato per errore.
 *
 * ⚠️ IL PLACE ID NON SI DIGITA A MANO se l'azienda viene da Google: e' la
 * regola del guasto del 21/07/2026 (gli id di Google si leggono da Google). Qui
 * il campo c'e' perche' serve a incollare quello di un locale che stiamo
 * inserendo a mano prima che lo scraper lo trovi — e in quel caso e' quello che
 * evita il doppione, visto che il Place ID e' l'identita'.
 */
import { useState } from "react";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { Divider } from "@astryxdesign/core/Divider";
import { Plus, Trash2 } from "lucide-react";

export interface ContattoModulo {
  tipo: string;
  valore: string;
  e_titolare: boolean;
}

export interface AziendaModulo {
  id?: number;
  nome: string;
  categoria: string;
  citta: string;
  provincia: string;
  indirizzo: string;
  cap: string;
  maps_url: string;
  place_id: string;
  stato: string;
  note: string;
  contatti: ContattoModulo[];
  /** Dove sta il codice del sito e la sua property Search Console — per
   *  l'audit SEO/GEO automatico. Vuoto per chi non ha ancora un sito. */
  sito_repo_url: string;
  sito_gsc_proprieta: string;
}

export const AZIENDA_VUOTA: AziendaModulo = {
  nome: "",
  categoria: "",
  citta: "",
  provincia: "",
  indirizzo: "",
  cap: "",
  maps_url: "",
  place_id: "",
  stato: "prospect",
  note: "",
  contatti: [],
  sito_repo_url: "",
  sito_gsc_proprieta: "",
};

const STATI = [
  { value: "prospect", label: "Da contattare" },
  { value: "contattato", label: "Contattata" },
  { value: "in_trattativa", label: "In trattativa" },
  { value: "cliente", label: "Cliente" },
  { value: "perso", label: "Persa" },
  { value: "archiviato", label: "Archiviata" },
];

const TIPI = [
  { value: "telefono", label: "Telefono" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "sito", label: "Sito" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "lid", label: "LID (WhatsApp GOWS)" },
];

export function ModuloAzienda({
  aperto,
  azienda,
  onChiudi,
  onSalvata,
}: {
  aperto: boolean;
  /** Null = ne stiamo creando una nuova. */
  azienda: AziendaModulo | null;
  onChiudi: () => void;
  onSalvata: (id: number, giaEsisteva: boolean) => void;
}) {
  const [dati, setDati] = useState<AziendaModulo>(azienda ?? AZIENDA_VUOTA);
  const [errore, setErrore] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [esitoImport, setEsitoImport] = useState<{
    messi: string[];
    diversi: string[];
    rivendicata: boolean;
  } | null>(null);
  const [cercandoRepo, setCercandoRepo] = useState(false);
  const [esitoRepo, setEsitoRepo] = useState<{
    tipo: "trovato" | "candidati" | "non_disponibile" | "vuoto";
    messaggio: string;
    candidati?: { cartella: string; repo_url: string }[];
  } | null>(null);

  const nuova = !azienda?.id;

  function cambia(campo: keyof AziendaModulo, valore: string) {
    setDati((d) => ({ ...d, [campo]: valore }));
  }

  /**
   * Importa l'anagrafica dalla scheda Google.
   *
   * ⚠️ RIEMPIE SOLO I CAMPI VUOTI, e dice quali ha lasciato stare.
   *
   * Sovrascrivere sarebbe stato più comodo da scrivere e sbagliato da usare:
   * quello che c'è in tabella qualcuno l'ha messo o corretto a mano, e Google
   * non sa che è stato corretto. Un import che ripassa sopra un indirizzo
   * sistemato ieri annulla il lavoro di ieri senza dirlo — e nessuno se ne
   * accorge finché non parte una lettera all'indirizzo vecchio.
   *
   * Quindi: i vuoti si riempiono, i pieni si segnalano e li decide una persona.
   * È la stessa regola dell'audit SEO coi fatti sul cliente, applicata qui.
   */
  async function importaDaGoogle() {
    setErrore(null);
    setEsitoImport(null);
    setImportando(true);
    try {
      const r = await fetch(`/api/aziende/${azienda?.id}/google`);
      const e = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErrore(e?.errore ?? "Non sono riuscito a leggere la scheda Google.");
        return;
      }
      const s = e.scheda as Record<string, string | boolean>;

      const campi: Array<[keyof AziendaModulo, string, string]> = [
        ["place_id", String(s.place_id ?? ""), "Place ID"],
        ["maps_url", String(s.maps_url ?? ""), "URL di Maps"],
        ["indirizzo", String(s.indirizzo ?? ""), "Indirizzo"],
        ["citta", String(s.citta ?? ""), "Città"],
        ["provincia", String(s.provincia ?? ""), "Provincia"],
        ["cap", String(s.cap ?? ""), "CAP"],
        ["categoria", String(s.categoria ?? ""), "Categoria"],
      ];

      const messi: string[] = [];
      const diversi: string[] = [];
      const prossimo = { ...dati };

      for (const [campo, valore, etichetta] of campi) {
        if (!valore) continue;
        const attuale = String(prossimo[campo] ?? "").trim();
        if (!attuale) {
          (prossimo[campo] as string) = valore;
          messi.push(etichetta);
        } else if (attuale !== valore) {
          diversi.push(`${etichetta} (Google dice «${valore}»)`);
        }
      }

      // I contatti sono un elenco, non un campo: si aggiunge quello che manca,
      // senza toccare i numeri che ci sono — spesso il cellulare del titolare
      // vale più del fisso che sta su Google.
      const contatti = [...prossimo.contatti];
      for (const [tipo, valore, etichetta] of [
        ["telefono", String(s.telefono ?? ""), "Telefono"],
        ["sito", String(s.sito ?? ""), "Sito"],
      ] as const) {
        if (!valore) continue;
        if (contatti.some((c) => c.tipo === tipo)) {
          if (!contatti.some((c) => c.valore.trim() === valore)) {
            diversi.push(`${etichetta} (Google dice «${valore}»)`);
          }
          continue;
        }
        contatti.push({ tipo, valore, e_titolare: false });
        messi.push(etichetta);
      }
      prossimo.contatti = contatti;

      setDati(prossimo);
      setEsitoImport({
        messi,
        diversi,
        rivendicata: s.rivendicata === true,
      });
    } finally {
      setImportando(false);
    }
  }

  /**
   * Propone `repo_url` guardando dentro `SITI/`, sul PC di sviluppo.
   *
   * Come `importaDaGoogle`: riempie solo se il campo è vuoto, non sovrascrive
   * mai quello che c'è già — un repo sbagliato incollato da qualcuno resta lì
   * finché non lo si corregge a mano, questo bottone non lo tocca.
   */
  async function cercaRepoLocale() {
    setErrore(null);
    setEsitoRepo(null);
    setCercandoRepo(true);
    try {
      const r = await fetch(`/api/aziende/${azienda?.id}/repo-locale`);
      const e = await r.json().catch(() => ({}));
      if (!r.ok) {
        setEsitoRepo({ tipo: "non_disponibile", messaggio: e?.errore ?? "Ricerca non disponibile." });
        return;
      }
      if (e.trovato) {
        if (dati.sito_repo_url.trim()) {
          setEsitoRepo({
            tipo: "candidati",
            messaggio: `Il campo è già compilato: trovato anche "${e.trovato.cartella}" → ${e.trovato.repo_url}. Confronta e decidi tu.`,
          });
        } else {
          setDati((d) => ({ ...d, sito_repo_url: e.trovato.repo_url }));
          setEsitoRepo({
            tipo: "trovato",
            messaggio: `Preso da "${e.trovato.cartella}": ${e.trovato.repo_url}. Niente è ancora salvato: premi «Salva».`,
          });
        }
      } else if (e.candidati?.length) {
        setEsitoRepo({
          tipo: "candidati",
          messaggio: `Più di una cartella possibile (o nessuna chiaramente sua): scegli tu.`,
          candidati: e.candidati,
        });
      } else {
        setEsitoRepo({ tipo: "vuoto", messaggio: "Nessuna cartella con un repo Git trovata in SITI/." });
      }
    } finally {
      setCercandoRepo(false);
    }
  }

  function cambiaContatto(indice: number, modifica: Partial<ContattoModulo>) {
    setDati((d) => ({
      ...d,
      contatti: d.contatti.map((c, i) =>
        i === indice ? { ...c, ...modifica } : c,
      ),
    }));
  }

  async function salva() {
    setErrore(null);

    if (!dati.nome.trim()) {
      setErrore(
        "Il nome è l’unica cosa obbligatoria: senza, la riga non è ritrovabile da nessuna parte.",
      );
      return;
    }

    const corpo = {
      ...dati,
      contatti: dati.contatti.filter((c) => c.valore.trim()),
    };

    const risposta = await fetch(
      nuova ? "/api/aziende" : `/api/aziende/${azienda!.id}`,
      {
        method: nuova ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      },
    );

    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      setErrore(
        esito.errore ??
          `Il salvataggio non è riuscito (HTTP ${risposta.status}).`,
      );
      return;
    }

    onSalvata(esito.id ?? azienda?.id ?? 0, Boolean(esito.giaEsisteva));
    onChiudi();
  }

  return (
    <Dialog
      isOpen={aperto}
      onOpenChange={(o) => (o ? null : onChiudi())}
      purpose="form"
      width={640}
      maxHeight="85vh"
    >
      <Layout
        header={
          <DialogHeader
            title={nuova ? "Nuova azienda" : `Modifica ${azienda?.nome}`}
            subtitle={
              nuova
                ? "Per chi non arriva da una campagna: il passaparola, la telefonata, noi stessi."
                : "Chi è e dove sta. Come parla e cosa gli facciamo stanno nella scheda."
            }
            onOpenChange={(o) => (o ? null : onChiudi())}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
              {errore ? (
                <Banner
                  status="error"
                  title="Non salvato"
                  description={errore}
                />
              ) : null}

              <TextInput
                label="Nome"
                isRequired
                value={dati.nome}
                onChange={(v) => cambia("nome", v)}
              />

              <HStack gap={3}>
                <TextInput
                  label="Categoria"
                  placeholder="Ristorante, Estetista…"
                  value={dati.categoria}
                  onChange={(v) => cambia("categoria", v)}
                />
                <Selector
                  label="Stato"
                  value={dati.stato}
                  onChange={(v) => cambia("stato", v ?? "prospect")}
                  options={STATI}
                />
              </HStack>

              <TextInput
                label="Indirizzo"
                value={dati.indirizzo}
                onChange={(v) => cambia("indirizzo", v)}
              />

              <HStack gap={3}>
                <TextInput
                  label="Città"
                  value={dati.citta}
                  onChange={(v) => cambia("citta", v)}
                />
                <TextInput
                  label="Provincia"
                  placeholder="PV"
                  value={dati.provincia}
                  onChange={(v) => cambia("provincia", v)}
                />
                <TextInput
                  label="CAP"
                  placeholder="si ricava dall’indirizzo"
                  value={dati.cap}
                  onChange={(v) => cambia("cap", v)}
                />
              </HStack>

              <Divider />

              <VStack gap={2}>
                <HStack gap={2} align="center" justify="between">
                  <Text type="supporting">Contatti</Text>
                  <Button
                    label="Aggiungi"
                    size="sm"
                    variant="ghost"
                    icon={<Plus size={16} />}
                    onClick={() =>
                      setDati((d) => ({
                        ...d,
                        contatti: [
                          ...d.contatti,
                          { tipo: "telefono", valore: "", e_titolare: false },
                        ],
                      }))
                    }
                  />
                </HStack>

                {dati.contatti.length === 0 ? (
                  <Text type="supporting" color="secondary">
                    Senza un contatto con «titolare» acceso, il router non
                    accetta comandi da nessuno per questa azienda.
                  </Text>
                ) : null}

                {dati.contatti.map((c, i) => (
                  <HStack key={i} gap={2} align="end">
                    <Selector
                      label="Tipo"
                      isLabelHidden
                      size="sm"
                      value={c.tipo}
                      onChange={(v) =>
                        cambiaContatto(i, { tipo: v ?? "telefono" })
                      }
                      options={TIPI}
                    />
                    <TextInput
                      label="Valore"
                      isLabelHidden
                      size="sm"
                      placeholder={
                        c.tipo === "telefono" || c.tipo === "whatsapp"
                          ? "+39 333 1234567"
                          : ""
                      }
                      value={c.valore}
                      onChange={(v) => cambiaContatto(i, { valore: v })}
                    />
                    <Switch
                      label="Titolare"
                      value={c.e_titolare}
                      onChange={(v) => cambiaContatto(i, { e_titolare: v })}
                    />
                    <Button
                      label="Togli il contatto"
                      isIconOnly
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 size={16} />}
                      onClick={() =>
                        setDati((d) => ({
                          ...d,
                          contatti: d.contatti.filter((_, j) => j !== i),
                        }))
                      }
                    />
                  </HStack>
                ))}
              </VStack>

              <Divider />

              {/* ⚠️ Il bottone c'è solo su un'azienda già salvata: la rotta
                  cerca l'id della scheda Google fra i suoi servizi, e una
                  che non esiste ancora servizi non ne ha. */}
              {!nuova ? (
                <VStack gap={2}>
                  <HStack gap={2} align="center" wrap="wrap">
                    <Button
                      label="Leggi dalla scheda Google"
                      size="sm"
                      variant="secondary"
                      isLoading={importando}
                      clickAction={importaDaGoogle}
                    />
                    <Text type="supporting" color="secondary">
                      Place ID, Maps, indirizzo e telefono: li ha già Google, non si ricopiano a mano.
                    </Text>
                  </HStack>

                  {esitoImport ? (
                    <Banner
                      status={esitoImport.diversi.length ? "warning" : "success"}
                      title={
                        esitoImport.messi.length
                          ? `Compilati ${esitoImport.messi.length} campi vuoti`
                          : "Non c’era niente da riempire"
                      }
                      description={
                        [
                          esitoImport.messi.length ? `Presi da Google: ${esitoImport.messi.join(", ")}.` : "",
                          esitoImport.diversi.length
                            ? `Lasciati com’erano perché già compilati e diversi — guardali e decidi tu: ${esitoImport.diversi.join(" · ")}.`
                            : "",
                          esitoImport.rivendicata
                            ? ""
                            : "⚠️ Questa scheda Google non risulta rivendicata da nessuno.",
                          "Niente è ancora salvato: premi «Salva» in fondo.",
                        ]
                          .filter(Boolean)
                          .join(" ")
                      }
                      defaultIsExpanded
                    />
                  ) : null}
                </VStack>
              ) : null}

              <HStack gap={3}>
                <TextInput
                  label="URL di Maps"
                  value={dati.maps_url}
                  onChange={(v) => cambia("maps_url", v)}
                />
                <TextInput
                  label="Place ID"
                  labelTooltip="L’identità del posto. Se c’è già in tabella, invece di creare un doppione ritroviamo quella."
                  value={dati.place_id}
                  onChange={(v) => cambia("place_id", v)}
                />
              </HStack>

              <Divider />

              {/* Per l'audit SEO/GEO automatico: senza questi due, il bottone
                  "Analizza SEO" nella scheda non ha né codice da leggere né
                  numeri da guardare. Facoltativi apposta — un lead senza sito
                  non li avrà mai, e non deve essere costretto a inventarli. */}
              <HStack gap={3}>
                <TextInput
                  label="Repository del sito"
                  labelTooltip="Il link Git del codice — dove Wesion clona per proporre le correzioni SEO/GEO. Non l'URL pubblico del sito, quello è già nei Contatti."
                  placeholder="github-wesion:brisamarstudio/sitobracemia.git"
                  value={dati.sito_repo_url}
                  onChange={(v) => cambia("sito_repo_url", v)}
                />
                <TextInput
                  label="Property Search Console"
                  labelTooltip="Il valore selezionato in alto a sinistra su search.google.com/search-console — un dominio (sc-domain:bracemia.it) o un prefisso URL esatto."
                  placeholder="sc-domain:bracemia.it"
                  value={dati.sito_gsc_proprieta}
                  onChange={(v) => cambia("sito_gsc_proprieta", v)}
                />
              </HStack>

              {/* Solo su una scheda già salvata, come il bottone Google sopra:
                  cerca il repo dentro SITI/ — funziona solo dal PC di sviluppo
                  (SITI_LOCAL_PATH), su Contabo la rotta lo dice e basta. */}
              {!nuova ? (
                <VStack gap={2}>
                  <HStack gap={2} align="center" wrap="wrap">
                    <Button
                      label="Leggi da SITI/ in locale"
                      size="sm"
                      variant="secondary"
                      isLoading={cercandoRepo}
                      clickAction={cercaRepoLocale}
                    />
                    <Text type="supporting" color="secondary">
                      Il repository ce l&apos;ha già la cartella sul disco, non si ricopia a mano.
                    </Text>
                  </HStack>

                  {esitoRepo ? (
                    <Banner
                      status={esitoRepo.tipo === "trovato" ? "success" : "warning"}
                      title={
                        esitoRepo.tipo === "trovato"
                          ? "Repository trovato"
                          : esitoRepo.tipo === "vuoto"
                            ? "Niente da proporre"
                            : esitoRepo.tipo === "non_disponibile"
                              ? "Ricerca non disponibile"
                              : "Serve una scelta"
                      }
                      description={
                        esitoRepo.candidati?.length
                          ? `${esitoRepo.messaggio} ${esitoRepo.candidati.map((c) => `"${c.cartella}" → ${c.repo_url}`).join(" · ")}`
                          : esitoRepo.messaggio
                      }
                      defaultIsExpanded
                    />
                  ) : null}
                </VStack>
              ) : null}

              <TextArea
                label="Note"
                rows={3}
                value={dati.note}
                onChange={(v) => cambia("note", v)}
              />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} justify="end">
              <Button label="Annulla" variant="ghost" onClick={onChiudi} />
              <Button
                label={nuova ? "Crea" : "Salva"}
                variant="primary"
                clickAction={salva}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
