'use client';

/**
 * Le campagne: da «dentisti a Pavia» a un elenco di potenziali clienti.
 *
 * È il primo anello della catena, quello che riempie l'imbuto. Prima esisteva
 * solo come rotta da chiamare con `curl`, il che vuol dire che la usava una
 * persona sola.
 *
 * ⚠️ PERCHÉ DUE BOTTONI E NON UNO. Avviare la ricerca e raccogliere i risultati
 * sono due momenti separati perché su Apify un run serio dura minuti: tenere
 * aperta una richiesta HTTP per tutto quel tempo vuol dire perderla a metà e
 * non sapere più se il run è partito — pagandolo comunque. Si avvia, si va a
 * fare altro, si torna e si raccoglie. Anche il giorno dopo: il dataset su
 * Apify non scade insieme a questa pagina.
 *
 * Raccogliere due volte non fa danni: l'inserimento va in conflitto sul Place
 * ID, quindi non si creano doppioni. Serve più spesso di quanto sembri, perché
 * la prima volta si prova quasi sempre mentre il run è ancora a metà.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { List, ListItem } from '@astryxdesign/core/List';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Trash2 } from 'lucide-react';
import { quandoBreve } from '@/lib/quando';

export interface CampagnaRiga {
  id: number;
  nome: string;
  categoria: string;
  citta: string[];
  apify_run_id: string | null;
  creata_at: string;
  /** Quante aziende sono già entrate da questa campagna. */
  raccolte: number;
}

export function Campagne({ campagne }: { campagne: CampagnaRiga[] }) {
  const router = useRouter();
  const [categoria, setCategoria] = useState('');
  const [citta, setCitta] = useState('');
  const [quanti, setQuanti] = useState('50');
  const [messaggio, setMessaggio] = useState<{ tipo: 'success' | 'error' | 'info'; testo: string } | null>(null);
  /**
   * Due mestieri diversi, non due sezioni della stessa pagina: cercare gente
   * nuova e tornare a raccogliere un run partito ieri. Impilati uno sotto
   * l'altro si scorreva sempre, e chi apriva per raccogliere passava ogni volta
   * davanti a un modulo che non gli serviva. Si apre su «Fatte» quando ce ne
   * sono: se torni qui, quasi sempre e' per quelle.
   */
  const [scheda, setScheda] = useState(campagne.length ? 'fatte' : 'cerca');

  async function avvia() {
    setMessaggio(null);
    const risposta = await fetch('/api/campagne', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoria, citta, quanti: Number(quanti) || 50 }),
    });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      setMessaggio({ tipo: 'error', testo: esito?.errore ?? 'Non è andata.' });
      return;
    }
    setMessaggio({
      tipo: 'success',
      testo: 'Ricerca avviata su Apify. Ci mette qualche minuto: torna qui e premi «Raccogli».',
    });
    setCategoria('');
    setCitta('');
    router.refresh();
  }

  /**
   * ⚠️ CANCELLA I LEAD, NON IL LAVORO.
   *
   * Serve a buttare via una ricerca sbagliata — categoria storta, "stavo solo
   * provando". Ma se dentro c'e' un'azienda diventata cliente, o con bozze o
   * servizi attivi, quella resta: perde solo il legame con la campagna.
   * Portarsela via a cascata sarebbe irreversibile per un gesto nato come
   * "faccio pulizia".
   */
  async function cancella(c: CampagnaRiga) {
    const conLead = c.raccolte > 0;
    const avviso = conLead
      ? `Cancello «${c.nome}» e i ${c.raccolte} lead che ha portato. ` +
        'Quelli diventati clienti, o che hanno bozze, servizi o messaggi, NON vengono cancellati: ' +
        'perdono solo il legame con la campagna.'
      : `Cancello «${c.nome}». Non ha portato nessun lead.`;
    if (!window.confirm(avviso)) return;

    setMessaggio(null);
    const risposta = await fetch(`/api/campagne/${c.id}${conLead ? '?aziende=si' : ''}`, { method: 'DELETE' });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      setMessaggio({ tipo: 'error', testo: esito?.errore ?? 'Non è andata.' });
      return;
    }
    setMessaggio({
      tipo: 'success',
      testo:
        `Campagna cancellata${esito.cancellate ? `, con ${esito.cancellate} lead` : ''}.` +
        (esito.protette?.length
          ? ` ${esito.protette.length} non sono state toccate perché ci lavoriamo: ${esito.protette.slice(0, 3).join(', ')}${esito.protette.length > 3 ? '…' : ''}`
          : ''),
    });
    router.refresh();
  }

  async function raccogli(id: number) {
    setMessaggio({ tipo: 'info', testo: 'Raccolgo i risultati…' });
    const risposta = await fetch(`/api/campagne/${id}/raccogli`, { method: 'POST' });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      // 409 vuol dire "il run è ancora in corso": è la risposta giusta a una
      // domanda fatta presto, non un guasto. Si dice com'è.
      setMessaggio({ tipo: risposta.status === 409 ? 'info' : 'error', testo: esito?.errore ?? 'Non è andata.' });
      return;
    }
    setMessaggio({
      tipo: 'success',
      testo: `Letti ${esito.letti} risultati: ${esito.aziende} aziende e ${esito.contatti} contatti. ${
        esito.scartati ? `${esito.scartati} scartati perché senza nome.` : ''
      }`,
    });
    router.refresh();
  }

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack gap={5} align="center" wrap="wrap">
            <Heading level={2}>Campagne</Heading>
            <TabList value={scheda} onChange={setScheda}>
              <Tab value="cerca" label="Cerca" />
              <Tab
                value="fatte"
                label="Fatte"
                endContent={campagne.length ? <Badge variant="neutral" label={String(campagne.length)} /> : null}
              />
            </TabList>
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={4}>
          <VStack gap={6}>
            {messaggio ? (
              <Banner
                status={messaggio.tipo}
                title={messaggio.testo}
                isDismissable
                onDismiss={() => setMessaggio(null)}
              />
            ) : null}

            {/* I campi dicono cosa vogliono con l'esempio dentro, non con una
                riga di spiegazione sotto: «Pavia, Vigevano» insegna la virgola
                meglio di «più città separate da virgola». */}
            {scheda === 'cerca' ? (
              <HStack gap={3} align="end" wrap="wrap">
                <TextInput
                  label="Cosa cerchi"
                  placeholder="dentisti"
                  value={categoria}
                  onChange={setCategoria}
                />
                <TextInput label="Dove" placeholder="Pavia, Vigevano" value={citta} onChange={setCitta} />
                <TextInput label="Massimo" placeholder="50" value={quanti} onChange={setQuanti} />
                <Button
                  label="Cerca"
                  variant="primary"
                  isDisabled={!categoria.trim() || !citta.trim()}
                  tooltip={!categoria.trim() || !citta.trim() ? 'Servono cosa e dove.' : undefined}
                  clickAction={avvia}
                />
              </HStack>
            ) : null}

            {scheda === 'fatte' ? (
              campagne.length === 0 ? (
                <EmptyState
                  title="Nessuna campagna"
                  description="Cercane una dalla linguetta «Cerca»."
                />
              ) : (
                <List hasDividers density="balanced">
                  {campagne.map((c) => (
                    <ListItem
                      key={c.id}
                      /* Il nome vero della campagna e' spesso una stringa da
                         macchina («ristorante_vigevano_20260727_075808»): si
                         mostra cosa cercava, che e' quello che uno ricorda. */
                      label={`${c.categoria} · ${c.citta.join(', ')}`}
                      description={quandoBreve(c.creata_at)}
                      /* Cliccare la riga APRE la lista, filtrata su questa
                         campagna. Era la cosa che mancava: si raccoglievano
                         trenta lead e poi bisognava andarli a cercare a mano
                         in un elenco di settantasette. */
                      onClick={() => router.push(`/aziende?campagna=${c.id}`)}
                      endContent={
                        <HStack gap={3} align="center">
                          {c.raccolte > 0 ? (
                            <Badge variant="green" label={`${c.raccolte} aziende`} />
                          ) : (
                            <Text type="supporting">non ancora raccolta</Text>
                          )}
                          {c.apify_run_id ? (
                            <Button
                              label={c.raccolte > 0 ? 'Raccogli ancora' : 'Raccogli'}
                              size="sm"
                              variant="ghost"
                              clickAction={() => raccogli(c.id)}
                            />
                          ) : (
                            <Text type="supporting">senza run</Text>
                          )}
                          {/* Icona e non bottone rosso a tutta parola: su ogni
                              riga di un elenco, «Cancella» scritto per esteso
                              e' la cosa piu' vistosa dello schermo, e non e'
                              quella che si fa piu' spesso. */}
                          <Button
                            label="Cancella la campagna"
                            isIconOnly
                            icon={<Trash2 size={16} />}
                            size="sm"
                            variant="ghost"
                            clickAction={() => cancella(c)}
                          />
                        </HStack>
                      }
                    />
                  ))}
                </List>
              )
            ) : null}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
