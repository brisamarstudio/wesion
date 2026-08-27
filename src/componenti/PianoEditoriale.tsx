'use client';

/**
 * Il piano del mese: si GUARDA prima di crearlo.
 *
 * ⚠️ QUESTA PAGINA È LA RAGIONE PER CUI IL PIANO È SEPARATO DALLA SCRITTURA.
 *
 * `costruisciPiano` non chiama nessuna AI: decide solo giorni e temi, con
 * aritmetica su un calendario e i fatti della scheda. Calcolarlo non costa
 * niente e non lascia traccia — quindi si può guardare quante volte si vuole,
 * cambiare mese, cambiare quantità, e solo alla fine dire di sì.
 *
 * Senza questa schermata il valore di quella separazione si perde: finora il
 * bottone sulla scheda cliente creava le bozze e basta, e il piano lo si
 * scopriva dopo, guardando diciotto righe già fatte. Accorgersi lì che tre post
 * di fila parlano della stessa cosa costa molto di più, e a quel punto si è
 * tentati di tenerli buoni perché ci sono.
 *
 * Ogni riga dice **su quale fatto si regge**. È ciò che rende la revisione
 * «è vero?» invece di «è bello?» — e il motivo per cui il generatore non può
 * inventare: gli si passa quel fatto e nient'altro.
 */
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { List, ListItem } from '@astryxdesign/core/List';
import { EmptyState } from '@astryxdesign/core/EmptyState';

export interface ClientePiano {
  id: number;
  nome: string;
  /** Quanti fatti attivi ha: sotto una certa soglia il piano esce generico. */
  fatti: number;
  settore: string[];
}

interface Slot {
  data: string;
  origine: 'ricorrenza' | 'pilastro';
  titolo: string;
  angolo: string;
  fatto: string;
  fonte: string;
  fattoId: number | null;
}

interface Anteprima {
  anno: number;
  mese: number;
  quantita: number;
  materiaSufficiente: boolean;
  slot: Slot[];
  avvisi: string[];
}

const MESI = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

/** «01/09» — la data come la legge chi guarda una griglia, non un timestamp. */
function giorno(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Rome' });
}

export function PianoEditoriale({ clienti }: { clienti: ClientePiano[] }) {
  const router = useRouter();
  const parametriUrl = useSearchParams();
  const adesso = new Date();

  // `?cliente=` arriva dalla scheda: chi ci clicca vuole quel cliente, non il
  // primo dell'elenco.
  const richiesto = parametriUrl.get('cliente');
  const [clienteId, setClienteId] = useState<string>(
    (richiesto && clienti.some((c) => String(c.id) === richiesto) ? richiesto : null) ??
      (clienti[0] ? String(clienti[0].id) : '')
  );
  const [mese, setMese] = useState<string>(String(adesso.getMonth() + 1));
  const [anno, setAnno] = useState<string>(String(adesso.getFullYear()));
  /**
   * Vuoto = «quanti ne servono per tenere 4 a settimana».
   *
   * Il bundle vende un ritmo, non un numero mensile: a seconda del mese sono
   * 16, 17 o 18. Scriverne uno fisso vuol dire il mese in cui il cliente ne
   * riceve meno di quelli che ha pagato, e nessuno se ne accorge perché
   * mancano solo in fondo.
   */
  const [quantita, setQuantita] = useState<string>('');

  const [anteprima, setAnteprima] = useState<Anteprima | null>(null);
  const [messaggio, setMessaggio] = useState<{ tipo: 'success' | 'error' | 'info'; testo: string } | null>(null);

  const cliente = clienti.find((c) => String(c.id) === clienteId) ?? null;

  const parametri = useMemo(() => {
    const p = new URLSearchParams({ anno, mese });
    if (quantita.trim()) p.set('quantita', quantita.trim());
    return p.toString();
  }, [anno, mese, quantita]);

  async function guarda() {
    setMessaggio(null);
    setAnteprima(null);
    const risposta = await fetch(`/api/aziende/${clienteId}/piano?${parametri}`);
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      setMessaggio({ tipo: 'error', testo: esito?.errore ?? 'Non è andata.' });
      return;
    }
    setAnteprima(esito);
  }

  async function crea() {
    setMessaggio(null);
    const risposta = await fetch(`/api/aziende/${clienteId}/piano?${parametri}`, { method: 'POST' });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      setMessaggio({ tipo: 'error', testo: esito?.errore ?? 'Non è andata.' });
      return;
    }
    setMessaggio({
      tipo: 'success',
      testo:
        `Create ${esito.creati} bozze vuote${esito.rimossi ? ` (${esito.rimossi} slot vecchi sostituiti)` : ''}. ` +
        'I testi non ci sono ancora: si scrivono dalla scheda del cliente, o una per una dalla consolle.',
    });
    router.refresh();
  }

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack gap={3} align="center">
            <Heading level={2}>Piano editoriale</Heading>
            <Text color="secondary">giorni e temi, non testi</Text>
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={4}>
          <VStack gap={5}>
            {clienti.length === 0 ? (
              <EmptyState
                title="Nessun cliente da pianificare"
                description="Il piano si costruisce per chi è in stato «cliente». Apri una scheda dall’elenco aziende e portalo lì."
              />
            ) : (
              <>
                <Text type="supporting">
                  Calcolato dalla scheda fatti del cliente e dal calendario delle ricorrenze.{' '}
                  <strong>Nessuna AI</strong>: qui si decidono solo giorni e temi, i testi si scrivono dopo. Guardarlo
                  non costa niente e non lascia traccia — si può cambiare mese e quantità quante volte si vuole.
                </Text>

                <HStack gap={3} align="end" wrap="wrap">
                  <Selector
                    label="Cliente"
                    value={clienteId}
                    onChange={(v) => {
                      setClienteId(v);
                      setAnteprima(null);
                    }}
                    hasSearch={clienti.length > 8}
                    options={clienti.map((c) => ({
                      value: String(c.id),
                      label: `${c.nome}${c.fatti < 4 ? `  (solo ${c.fatti} fatti)` : ''}`,
                    }))}
                  />
                  <Selector
                    label="Mese"
                    value={mese}
                    onChange={(v) => {
                      setMese(v);
                      setAnteprima(null);
                    }}
                    options={MESI.map((m, i) => ({ value: String(i + 1), label: m }))}
                  />
                  <TextInput
                    label="Anno"
                    value={anno}
                    onChange={(v) => {
                      setAnno(v);
                      setAnteprima(null);
                    }}
                  />
                  <TextInput
                    label="Quanti post"
                    description="Vuoto = 4 a settimana"
                    placeholder="auto"
                    value={quantita}
                    onChange={(v) => {
                      setQuantita(v);
                      setAnteprima(null);
                    }}
                  />
                  <Button label="Anteprima" variant="primary" clickAction={guarda} />
                </HStack>

                {messaggio ? (
                  <Banner
                    status={messaggio.tipo}
                    title={messaggio.testo}
                    isDismissable
                    onDismiss={() => setMessaggio(null)}
                  />
                ) : null}

                {cliente && cliente.fatti < 4 ? (
                  <Banner
                    status="warning"
                    title={`${cliente.nome} ha solo ${cliente.fatti} fatti`}
                    description="Sotto i quattro i temi disponibili sono pochi e il mese si ripete. Si aggiungono dalla scheda del cliente, sezione «Cosa è vero»."
                  />
                ) : null}

                {anteprima ? (
                  <VStack gap={3}>
                    {anteprima.avvisi.map((a, i) => (
                      <Banner key={i} status="warning" title={a} />
                    ))}

                    {anteprima.slot.length === 0 ? (
                      <EmptyState
                        title="Non c’è niente da pianificare"
                        description="Manca la materia prima: senza fatti il generatore non avrebbe di che parlare, e il piano non si costruisce a vuoto."
                      />
                    ) : (
                      <>
                        <HStack gap={3} align="center">
                          <Heading level={3}>
                            {MESI[anteprima.mese - 1]} {anteprima.anno}
                          </Heading>
                          <Text color="secondary">
                            {anteprima.slot.length} post ·{' '}
                            {anteprima.slot.filter((s) => s.origine === 'ricorrenza').length} da ricorrenze
                          </Text>
                        </HStack>

                        <List hasDividers density="balanced">
                          {anteprima.slot.map((s, i) => (
                            <ListItem
                              key={i}
                              label={s.titolo}
                              description={
                                `${s.angolo}` + (s.fatto ? `  ·  basato su: ${s.fatto}` : '')
                              }
                              startContent={
                                <HStack gap={2} align="center">
                                  <Text hasTabularNumbers color="secondary">
                                    {giorno(s.data)}
                                  </Text>
                                  {/* Badge solo sulle ricorrenze: sono l'eccezione.
                                      Metterlo anche sui pilastri, che sono la maggioranza,
                                      vorrebbe dire non dire niente. */}
                                  {s.origine === 'ricorrenza' ? (
                                    <Badge variant="blue" label="ricorrenza" />
                                  ) : null}
                                </HStack>
                              }
                              endContent={
                                /* Uno slot senza `fattoId` nasce da un confine o
                                   dal pubblico, che non sono righe di `fatto`: il
                                   post non potrà agganciarsi a niente, ed è
                                   corretto — non c'è nessun fatto sotto. */
                                s.fattoId === null ? (
                                  <Text type="supporting">senza fatto</Text>
                                ) : (
                                  <Text type="supporting">{s.fonte}</Text>
                                )
                              }
                            />
                          ))}
                        </List>

                        <HStack gap={2} align="center">
                          <Button
                            label={`Crea ${anteprima.slot.length} post in bozza`}
                            variant="primary"
                            clickAction={crea}
                          />
                          <Text type="supporting">
                            Nascono vuote: nessun testo, nessuna chiamata a un modello. Rifarlo sullo stesso mese
                            sostituisce gli slot ancora vuoti e non tocca quelli già scritti o approvati.
                          </Text>
                        </HStack>
                      </>
                    )}
                  </VStack>
                ) : null}
              </>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
