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

  const nuova = !azienda?.id;

  function cambia(campo: keyof AziendaModulo, valore: string) {
    setDati((d) => ({ ...d, [campo]: valore }));
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
