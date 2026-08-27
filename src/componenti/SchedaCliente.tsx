'use client';

/**
 * La scheda di un cliente: dove si fa tutto quello che lo riguarda.
 *
 * Prima questa pagina non c'era e "aggiungere un cliente" voleva dire aprire il
 * database. Non è un dettaglio di comodità: una cosa che si fa in SQL la fa una
 * persona sola, e quando quella persona non c'è il lavoro si ferma.
 *
 * L'ORDINE DELLE SEZIONI È LA SEQUENZA DEL LAVORO, non un menù:
 *
 *   1. CHI È      settore e stato — decidono quali temi sono pertinenti
 *   2. COME PARLA la voce e i confini, che valgono su ogni testo
 *   3. COSA È VERO i fatti: senza questi il generatore non ha di che parlare
 *   4. COSA GLI FACCIAMO i servizi, con le loro chiavi
 *   5. IL MESE    costruisci il piano, poi scrivi i testi
 *
 * Chi arriva in fondo ha un cliente che lavora. Chi si ferma a metà lo vede
 * scritto: ogni sezione dice cosa manca per passare alla successiva.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import type { Scheda } from '@/lib/scheda';

const SETTORI: Array<{ id: string; nome: string }> = [
  { id: 'ristorazione', nome: 'Ristorazione' },
  { id: 'artigianato', nome: 'Artigianato' },
  { id: 'casa', nome: 'Casa e ambienti' },
  { id: 'servizi', nome: 'Servizi' },
  { id: 'locale', nome: 'Attività locale' },
];

/** Le chiavi dei fatti, con la domanda a cui rispondono. */
const CHIAVI: Array<{ id: string; nome: string; aiuto: string }> = [
  { id: 'cosa_fa', nome: 'Cosa fa', aiuto: "L'attività in concreto: «trattoria con cucina pavese». Una riga sola." },
  { id: 'offerta', nome: 'Offerta', aiuto: 'Prodotti o servizi principali, uno per riga.' },
  { id: 'materiali', nome: 'Materiali', aiuto: 'Ingredienti, materiali, metodi — solo cose verificate col cliente.' },
  { id: 'punti_forza', nome: 'Punti di forza', aiuto: 'Cosa lo distingue davvero, senza superlativi.' },
];

/** Da testo a righe e viceversa: nel form le liste sono textarea. */
const aRighe = (v: string[]): string => v.join('\n');
const daRighe = (v: string): string[] => v.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);

export function SchedaCliente({ scheda: iniziale }: { scheda: Scheda }) {
  const router = useRouter();
  const [s, setS] = useState<Scheda>(iniziale);
  const [messaggio, setMessaggio] = useState<{ tipo: 'success' | 'error' | 'info'; testo: string } | null>(null);
  const [salvato, setSalvato] = useState(true);

  /** I fatti nel form sono testo per chiave, una voce per riga. */
  const [fatti, setFatti] = useState<Record<string, string>>(() => {
    const per: Record<string, string> = {};
    for (const c of CHIAVI) {
      per[c.id] = aRighe(s.fatti.filter((f) => f.chiave === c.id).map((f) => f.valore));
    }
    return per;
  });

  const config = (tipo: string): Record<string, string> =>
    s.servizi.find((x) => x.tipo === tipo)?.config ?? {};
  const attivo = (tipo: string): boolean => s.servizi.find((x) => x.tipo === tipo)?.attivo ?? false;

  function cambiaServizio(tipo: string, campi: Record<string, string>, acceso?: boolean) {
    setSalvato(false);
    setS((v) => {
      const altri = v.servizi.filter((x) => x.tipo !== tipo);
      const mio = v.servizi.find((x) => x.tipo === tipo);
      return {
        ...v,
        servizi: [
          ...altri,
          { tipo, attivo: acceso ?? mio?.attivo ?? true, config: { ...(mio?.config ?? {}), ...campi } },
        ],
      };
    });
  }

  async function salva() {
    setMessaggio(null);
    const risposta = await fetch(`/api/aziende/${s.id}/scheda`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settore: s.settore,
        stato: s.stato,
        voce: s.voce,
        fatti: CHIAVI.flatMap((c) => daRighe(fatti[c.id] ?? '').map((valore) => ({ chiave: c.id, valore }))),
        servizi: s.servizi,
      }),
    });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      setMessaggio({ tipo: 'error', testo: esito?.errore ?? 'Non è andata, e non si sa perché.' });
      return;
    }
    setS(esito);
    setSalvato(true);
    setMessaggio({ tipo: 'success', testo: 'Scheda salvata.' });
    router.refresh();
  }

  async function chiama(url: string, quando: string) {
    setMessaggio({ tipo: 'info', testo: `${quando}…` });
    const risposta = await fetch(url, { method: 'POST' });
    const esito = await risposta.json().catch(() => ({}));
    if (!risposta.ok) {
      setMessaggio({ tipo: 'error', testo: esito?.errore ?? 'Non è andata.' });
      return;
    }
    if (esito.creati !== undefined) {
      setMessaggio({ tipo: 'success', testo: `Piano costruito: ${esito.creati} slot. Vai in Bozze per guardarlo.` });
    } else if (esito.scritte !== undefined) {
      setMessaggio({
        tipo: 'success',
        testo:
          `Scritti ${esito.scritte} testi` +
          (esito.conAvvisiGravi ? `, di cui ${esito.conAvvisiGravi} da controllare.` : '.') +
          ` Modelli: ${(esito.modelli ?? []).join(', ')}`,
      });
    } else {
      setMessaggio({ tipo: 'success', testo: 'Fatto.' });
    }
    router.refresh();
  }

  // Cosa manca per far lavorare questo cliente, detto dove serve.
  const quantiFatti = CHIAVI.reduce((n, c) => n + daRighe(fatti[c.id] ?? '').length, 0);
  const mancanze = [
    s.stato !== 'cliente' ? "lo stato non è «cliente»: le spie dei silenzi lo ignorano" : null,
    s.settore.length === 0 ? 'nessun settore: i temi saranno solo quelli generici' : null,
    quantiFatti < 4 ? `solo ${quantiFatti} fatti: servono almeno 4 per non ripetersi` : null,
    s.titolari.length === 0 ? 'nessun titolare abilitato: il router non accetterà comandi' : null,
    !s.servizi.some((x) => x.attivo) ? 'nessun servizio attivo: non c’è niente da pubblicare' : null,
  ].filter(Boolean) as string[];

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack gap={3} align="center">
            <Heading level={2}>{s.nome}</Heading>
            <StatusDot variant={s.stato === 'cliente' ? 'success' : 'neutral'} label={s.stato} />
            <Text color="secondary">{s.citta ?? ''}</Text>
            {!salvato ? <Badge variant="warning" label="non salvata" /> : null}
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

            {mancanze.length > 0 ? (
              <Banner
                status="warning"
                title="Questo cliente non è ancora pronto"
                description="Finché manca qualcosa qui sotto, il piano esce povero o non esce."
                defaultIsExpanded
              >
                <List hasDividers density="compact">
                  {mancanze.map((m, i) => (
                    <ListItem key={i} label={m} />
                  ))}
                </List>
              </Banner>
            ) : (
              <Banner status="success" title="Pronto: si può costruire il piano del mese." />
            )}

            {/* ── 1. Chi è ───────────────────────────────────────────────── */}
            <VStack gap={3}>
              <VStack gap={1}>
                <Heading level={3}>Chi è</Heading>
                <Text type="supporting">
                  Il settore sceglie quali temi e quali ricorrenze hanno senso. Esplicito e non dedotto dalla
                  categoria di Google: indovinarlo da «Da Andrea» vuol dire sbagliarlo su tutto il mese.
                </Text>
              </VStack>
              <HStack gap={2} wrap="wrap">
                {SETTORI.map((t) => (
                  <Button
                    key={t.id}
                    label={t.nome}
                    size="sm"
                    variant={s.settore.includes(t.id as never) ? 'primary' : 'secondary'}
                    onClick={() => {
                      setSalvato(false);
                      setS((v) => ({
                        ...v,
                        settore: v.settore.includes(t.id as never)
                          ? (v.settore.filter((x) => x !== t.id) as never)
                          : ([...v.settore, t.id] as never),
                      }));
                    }}
                  />
                ))}
              </HStack>
              <HStack gap={2} align="center">
                <Text type="supporting">Stato commerciale:</Text>
                {['prospect', 'contattato', 'in_trattativa', 'cliente'].map((st) => (
                  <Button
                    key={st}
                    label={st}
                    size="sm"
                    variant={s.stato === st ? 'primary' : 'ghost'}
                    onClick={() => {
                      setSalvato(false);
                      setS((v) => ({ ...v, stato: st }));
                    }}
                  />
                ))}
              </HStack>
            </VStack>

            {/* ── 2. Come parla ──────────────────────────────────────────── */}
            <VStack gap={3}>
              <VStack gap={1}>
                <Heading level={3}>Come parla</Heading>
                <Text type="supporting">
                  Senza questo i testi escono corretti e intercambiabili: il generatore ricade sul registro da
                  agenzia, ed è il difetto che si nota anche quando non è un errore.
                </Text>
              </VStack>
              <TextInput
                label="La voce"
                placeholder="diretto, senza fronzoli, da osteria di paese"
                value={s.voce.voce}
                onChange={(v) => {
                  setSalvato(false);
                  setS((x) => ({ ...x, voce: { ...x.voce, voce: v } }));
                }}
              />
              <TextInput
                label="A chi parla"
                placeholder="famiglie e lavoratori del pavese"
                value={s.voce.pubblico}
                onChange={(v) => {
                  setSalvato(false);
                  setS((x) => ({ ...x, voce: { ...x.voce, pubblico: v } }));
                }}
              />
              <TextArea
                label="Cosa apprezzano i clienti"
                description="Dalle recensioni: è materiale verificato da terzi, quindi si può usare senza chiedere conferma. Una voce per riga."
                rows={3}
                value={aRighe(s.voce.apprezzato)}
                onChange={(v) => {
                  setSalvato(false);
                  setS((x) => ({ ...x, voce: { ...x.voce, apprezzato: daRighe(v) } }));
                }}
              />
              <TextArea
                label="Confini — cosa NON fa"
                description="«niente surgelati», «niente truciolato». Valgono su Google come sul sito. Una voce per riga."
                rows={3}
                value={aRighe(s.voce.non_fa)}
                onChange={(v) => {
                  setSalvato(false);
                  setS((x) => ({ ...x, voce: { ...x.voce, non_fa: daRighe(v) } }));
                }}
              />
              <TextArea
                label="Da non dire mai"
                description="Frasi che il cliente non vuole sentirsi attribuire, finché non le conferma lui. Una per riga."
                rows={3}
                value={aRighe(s.voce.mai_dire)}
                onChange={(v) => {
                  setSalvato(false);
                  setS((x) => ({ ...x, voce: { ...x.voce, mai_dire: daRighe(v) } }));
                }}
              />
            </VStack>

            {/* ── 3. Cosa è vero ─────────────────────────────────────────── */}
            <VStack gap={3}>
              <VStack gap={1}>
                <Heading level={3}>Cosa è vero</Heading>
                <Text type="supporting">
                  I fatti sono l’unica cosa che un post può affermare, ed è ciò che rende la revisione «è vero?»
                  invece di «è bello?». Togliere una riga non la cancella: la spegne, così i post già pubblicati
                  sanno ancora su cosa si reggevano.
                </Text>
              </VStack>
              {CHIAVI.map((c) => (
                <TextArea
                  key={c.id}
                  label={c.nome}
                  description={c.aiuto}
                  rows={c.id === 'cosa_fa' ? 2 : 4}
                  value={fatti[c.id] ?? ''}
                  onChange={(v) => {
                    setSalvato(false);
                    setFatti((f) => ({ ...f, [c.id]: v }));
                  }}
                />
              ))}
            </VStack>

            {/* ── 4. Cosa gli facciamo ───────────────────────────────────── */}
            <VStack gap={3}>
              <VStack gap={1}>
                <Heading level={3}>Cosa gli facciamo</Heading>
                <Text type="supporting">
                  Senza una riga qui il router non pubblica niente, nemmeno se il titolare manda la foto.
                </Text>
              </VStack>

              <VStack gap={2}>
                <HStack gap={2} align="center">
                  <Button
                    label={attivo('menu_del_giorno') ? 'Menù del giorno: attivo' : 'Menù del giorno: spento'}
                    size="sm"
                    variant={attivo('menu_del_giorno') ? 'primary' : 'secondary'}
                    onClick={() => cambiaServizio('menu_del_giorno', {}, !attivo('menu_del_giorno'))}
                  />
                </HStack>
                {attivo('menu_del_giorno') ? (
                  <VStack gap={2}>
                    <TextInput
                      label="URL a cui mandare il menù"
                      placeholder="https://ilcliente.it/api/menu"
                      value={config('menu_del_giorno').site_menu_url ?? ''}
                      onChange={(v) => cambiaServizio('menu_del_giorno', { site_menu_url: v })}
                    />
                    <TextInput
                      label="Segreto del sito"
                      description="È per-cliente: non può stare in un .env comune."
                      value={config('menu_del_giorno').site_secret ?? ''}
                      onChange={(v) => cambiaServizio('menu_del_giorno', { site_secret: v })}
                    />
                    <TextInput
                      label="Pagina del menù"
                      description="Finisce nel pulsante sotto il post di Google."
                      placeholder="https://ilcliente.it/menu"
                      value={config('menu_del_giorno').site_menu_page ?? ''}
                      onChange={(v) => cambiaServizio('menu_del_giorno', { site_menu_page: v })}
                    />
                  </VStack>
                ) : null}
              </VStack>

              <VStack gap={2}>
                <HStack gap={2} align="center">
                  <Button
                    label={attivo('post_gbp') ? 'Scheda Google: attiva' : 'Scheda Google: spenta'}
                    size="sm"
                    variant={attivo('post_gbp') ? 'primary' : 'secondary'}
                    onClick={() => cambiaServizio('post_gbp', {}, !attivo('post_gbp'))}
                  />
                </HStack>
                {attivo('post_gbp') ? (
                  <VStack gap={2}>
                    <TextInput
                      label="ID account Google"
                      description="Solo cifre. Si rileggono da Google, non si deducono: un id sbagliato fallisce con 404 settimane dopo."
                      value={config('post_gbp').gbp_account_id ?? ''}
                      status={
                        config('post_gbp').gbp_account_id && !/^[0-9]+$/.test(config('post_gbp').gbp_account_id)
                          ? { type: 'error', message: 'Deve essere numerico.' }
                          : undefined
                      }
                      onChange={(v) => cambiaServizio('post_gbp', { gbp_account_id: v })}
                    />
                    <TextInput
                      label="ID scheda Google"
                      value={config('post_gbp').gbp_location_id ?? ''}
                      status={
                        config('post_gbp').gbp_location_id && !/^[0-9]+$/.test(config('post_gbp').gbp_location_id)
                          ? { type: 'error', message: 'Deve essere numerico.' }
                          : undefined
                      }
                      onChange={(v) => cambiaServizio('post_gbp', { gbp_location_id: v })}
                    />
                  </VStack>
                ) : null}
              </VStack>

              <VStack gap={1}>
                <Text type="supporting">Chi può dare comandi al router</Text>
                {s.titolari.length ? (
                  <List hasDividers density="compact">
                    {s.titolari.map((t) => (
                      <ListItem key={t.id} label={t.valore} description={t.tipo} />
                    ))}
                  </List>
                ) : (
                  <Text type="supporting">
                    Nessuno. Si abilita con <code>npm run cliente -- --azienda {s.slug} --titolare &quot;+39…&quot;</code>
                  </Text>
                )}
              </VStack>
            </VStack>

            {/* ── 5. Il mese ─────────────────────────────────────────────── */}
            <VStack gap={3}>
              <VStack gap={1}>
                <Heading level={3}>Il mese</Heading>
                <Text type="supporting">
                  Prima si costruisce il piano — che è aritmetica su un calendario e non costa niente — poi si
                  guarda, e solo dopo si spendono le generazioni. Se il piano è sbagliato lo vedi in dieci secondi;
                  accorgertene leggendo diciotto testi costa molto di più.
                </Text>
              </VStack>
              <HStack gap={2} wrap="wrap">
                <Button
                  label="Costruisci il piano del mese"
                  variant="primary"
                  isDisabled={!salvato}
                  tooltip={salvato ? undefined : 'Salva prima la scheda: il piano nasce da questi fatti.'}
                  clickAction={() => chiama(`/api/aziende/${s.id}/piano`, 'Costruisco il piano')}
                />
                <Button
                  label="Scrivi i testi mancanti"
                  clickAction={() => chiama(`/api/aziende/${s.id}/scrivi`, 'Scrivo i testi')}
                />
                <Button
                  label="Analizza il sito"
                  clickAction={() => chiama(`/api/aziende/${s.id}/audit`, 'Analizzo')}
                />
              </HStack>
            </VStack>

            <HStack gap={2}>
              <Button label="Salva la scheda" variant="primary" clickAction={salva} isDisabled={salvato} />
              <Button label="Torna all’elenco" variant="ghost" onClick={() => router.push('/aziende')} />
            </HStack>
          </VStack>
        </LayoutContent>
      }
    />
  );
}
