'use client';

/**
 * ModaleNuovoPost.tsx — Modale per la creazione di un "Post al volo".
 *
 * Permette l'inserimento di testo libero (senza vincolo di Fatti AI),
 * la gestione di gallerie con IMMAGINI MULTIPLE, la scelta della CTA
 * e la pubblicazione o programmazione diretta.
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Selector } from '@astryxdesign/core/Selector';
import { FileInput } from '@astryxdesign/core/FileInput';
import { Thumbnail } from '@astryxdesign/core/Thumbnail';
import { DateInput } from '@astryxdesign/core/DateInput';
import { AZIONI_BOTTONE, VUOLE_URL } from '@/lib/gbp';
import { Plus, X } from 'lucide-react';

type DataISO = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;

export interface ModaleNuovoPostProps {
  aperto: boolean;
  aziendaIdPreselezionata?: number | null;
  aziendeDisponibili?: Array<{ id: number; nome: string }>;
  onChiudi: () => void;
  onCreato?: () => void;
}

export function ModaleNuovoPost({
  aperto,
  aziendaIdPreselezionata,
  aziendeDisponibili: clientiProp,
  onChiudi,
  onCreato,
}: ModaleNuovoPostProps) {
  const [clienti, setClienti] = useState<Array<{ id: number; nome: string }>>(clientiProp || []);
  const [aziendaId, setAziendaId] = useState<string>(
    aziendaIdPreselezionata ? String(aziendaIdPreselezionata) : ''
  );
  const [tipo, setTipo] = useState<'post_gbp' | 'articolo'>('post_gbp');
  const [titolo, setTitolo] = useState<string>('');
  const [testo, setTesto] = useState<string>('');
  const [immagini, setImmagini] = useState<string[]>([]);
  const [ctaTipo, setCtaTipo] = useState<string>('');
  const [ctaUrl, setCtaUrl] = useState<string>('');
  const [quando, setQuando] = useState<string>('');
  const [caricandoFoto, setCaricandoFoto] = useState(false);
  const [inInvio, setInInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  /* Il messaggio che conferma cosa e' successo: senza, si torna alla lista
     senza sapere se il post e' partito, ed e' esattamente cio' che frustra. */
  const [esito, setEsito] = useState<string | null>(null);

  // Carica l'elenco dei clienti se non passato nelle props
  useEffect(() => {
    if (!aperto) return;
    if (aziendaIdPreselezionata) {
      setAziendaId(String(aziendaIdPreselezionata));
    }
    if (!clientiProp || clientiProp.length === 0) {
      fetch('/api/aziende')
        .then(async (r) => {
          if (!r.ok) throw new Error(`elenco clienti non disponibile (HTTP ${r.status})`);
          return r.json();
        })
        .then((dati) => {
          if (!Array.isArray(dati)) throw new Error('elenco clienti in un formato inatteso');

          const attivi = dati
            .filter((a: any) => a.stato === 'cliente' || a.id === aziendaIdPreselezionata)
            .map((a: any) => ({ id: a.id, nome: a.nome }))
            .sort((a: any, b: any) => a.nome.localeCompare(b.nome));

          setClienti(attivi);

          if (attivi.length === 0) {
            setErrore('Nessun cliente disponibile: aggiungine uno prima di creare un post.');
            return;
          }

          /* Nessuna preselezione: con piu' clienti in lista, sceglierne uno
             al posto dell'operatore significa pubblicare sulla scheda Google
             sbagliata al primo momento di distrazione. Se il cliente e' uno
             solo non c'e' ambiguita' e lo si imposta. */
          if (!aziendaId && attivi.length === 1) {
            setAziendaId(String(attivi[0].id));
          }
        })
        /* Prima qui c'era un catch vuoto: la lista restava vuota, il selettore
           spariva e la modale diventava un vicolo cieco senza dire perche'. */
        .catch((e: unknown) =>
          setErrore(e instanceof Error ? e.message : 'non riesco a caricare i clienti')
        );
    } else if (!aziendaId && clientiProp.length === 1) {
      setAziendaId(String(clientiProp[0].id));
    }
  }, [aperto, aziendaIdPreselezionata, clientiProp, aziendaId]);

  if (!aperto) return null;

  async function caricaFoto(file: File | File[] | null) {
    if (!file || Array.isArray(file)) return;
    setErrore(null);
    setCaricandoFoto(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (aziendaId) fd.append('aziendaId', aziendaId);

      const res = await fetch('/api/bozze/immagine-temp', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setErrore(data.errore || 'Caricamento foto non riuscito');
        return;
      }
      setImmagini((prev) => [...prev, data.url]);
    } catch (err: any) {
      setErrore(err?.message || 'Errore durante il caricamento della foto');
    } finally {
      setCaricandoFoto(false);
    }
  }

  function rimuoviImmagine(index: number) {
    setImmagini((prev) => prev.filter((_, i) => i !== index));
  }

  async function salvaPost(approvaSubito: boolean) {
    const numId = Number(aziendaId);
    if (!numId || numId <= 0) {
      setErrore('Seleziona prima un cliente');
      return;
    }
    if (!testo.trim()) {
      setErrore('Inserisci il testo del post');
      return;
    }

    setErrore(null);
    setInInvio(true);
    try {
      const payload = {
        aziendaId: numId,
        tipo,
        titolo: titolo.trim() || undefined,
        testo: testo.trim(),
        immagini,
        cta: ctaTipo ? { tipo: ctaTipo, url: ctaUrl || undefined } : undefined,
        pubblicaAt: quando || undefined,
        approvaSubito,
      };

      const res = await fetch('/api/bozze/crea-diretto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrore(data.errore || 'Errore durante il salvataggio del post');
        return;
      }

      const quandoTesto = quando
        ? `programmato per il ${new Date(quando).toLocaleDateString('it-IT')}`
        : 'in uscita al prossimo giro del router, entro pochi minuti';

      setEsito(
        approvaSubito
          ? `Post approvato e ${quandoTesto}.`
          : 'Salvato in bozza: lo trovi in consolle, in attesa di approvazione.'
      );

      // Reset del modulo: cosi' si puo' scriverne subito un altro
      setTesto('');
      setTitolo('');
      setImmagini([]);
      setCtaTipo('');
      setCtaUrl('');
      setQuando('');

      // La lista dietro si aggiorna, ma la modale resta aperta a mostrare l'esito
      if (onCreato) onCreato();
    } catch (err: any) {
      setErrore(err?.message || 'Errore durante il salvataggio');
    } finally {
      setInInvio(false);
    }
  }

  return (
    <Dialog
      isOpen
      onOpenChange={(o) => (o ? null : onChiudi())}
      purpose="form"
      width={640}
      maxHeight="85vh"
    >
      <Layout
        header={
          <DialogHeader
            title="Nuovo Post al Volo"
            subtitle="Crea e pubblica subito o programma senza vincoli"
            onOpenChange={(o) => (o ? null : onChiudi())}
          />
        }
        content={
          <LayoutContent>
            <VStack gap={4}>
        {errore ? <Banner status="error" title="Attenzione" description={errore} /> : null}
        {esito ? <Banner status="success" title="Fatto" description={esito} /> : null}

        {/* Selezione Cliente */}
        {clienti.length > 0 && (
          <Selector
            label="Cliente"
            description={
              aziendaId
                ? undefined
                : 'Su quale scheda Google finisce il post: sceglilo prima di scrivere.'
            }
            value={aziendaId}
            onChange={(v) => setAziendaId(String(v))}
            hasSearch={clienti.length > 5}
            options={[
              { value: '', label: '— scegli il cliente —' },
              ...clienti.map((c) => ({ value: String(c.id), label: c.nome })),
            ]}
          />
        )}

        {/* Tipo Post */}
        <Selector
          label="Dove inserirlo"
          value={tipo}
          onChange={(v) => setTipo(v as 'post_gbp' | 'articolo')}
          options={[
            { value: 'post_gbp', label: 'Post per Scheda Google (GBP)' },
            { value: 'articolo', label: 'Articolo del Blog' },
          ]}
        />

        {/* Titolo se articolo o opzionale */}
        {tipo === 'articolo' ? (
          <TextInput
            label="Titolo dell’articolo"
            placeholder="es. I segreti del nostro ragù della nonna"
            value={titolo}
            onChange={setTitolo}
          />
        ) : null}

        {/* Testo libero del post */}
        <VStack gap={1}>
          <TextArea
            label="Testo del post"
            description={`Caratteri inseriti: ${testo.length}`}
            placeholder="Scrivi qui il messaggio del post o della promozione..."
            rows={6}
            value={testo}
            onChange={setTesto}
          />
        </VStack>

        {/* Galleria Immagini Multiple */}
        <VStack gap={2}>
          <Text type="supporting" weight="semibold">
            Immagini del post ({immagini.length})
          </Text>

          {immagini.length > 0 ? (
            <HStack gap={3} wrap="wrap" align="center">
              {immagini.map((url, idx) => (
                <div key={idx} style={{ position: 'relative', display: 'inline-block' }}>
                  <Thumbnail src={url} alt={`Foto ${idx + 1}`} label={`Foto ${idx + 1}`} />
                  <button
                    type="button"
                    title="Rimuovi foto"
                    onClick={() => rimuoviImmagine(idx)}
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '50%',
                      width: 22,
                      height: 22,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </HStack>
          ) : null}

          <FileInput
            label={immagini.length > 0 ? 'Aggiungi un’altra foto' : 'Carica una o più foto'}
            placeholder={caricandoFoto ? 'Sto caricando la foto…' : 'Scegli immagine (JPG/PNG)'}
            mode="dropzone"
            accept="image/*"
            maxSize={8 * 1024 * 1024}
            value={null}
            isLoading={caricandoFoto}
            description="JPG o PNG fino a 8 MB. Le foto salgono su media.mywebby.it per essere servite a Google/Sito."
            onChange={() => undefined}
            changeAction={caricaFoto}
          />
        </VStack>

        {/* Selezione CTA (Pulsante sotto il post per Google) */}
        {tipo === 'post_gbp' ? (
          <VStack gap={2}>
            <HStack gap={3} align="end" wrap="wrap">
              <Selector
                label="Bottone sotto il post (CTA)"
                value={ctaTipo}
                onChange={(v) => setCtaTipo(String(v))}
                options={[
                  { value: '', label: 'Nessun bottone / Quello di serie' },
                  ...Object.entries(AZIONI_BOTTONE).map(([value, label]) => ({ value, label })),
                ]}
              />
              {ctaTipo && VUOLE_URL(ctaTipo) ? (
                <TextInput
                  label="Dove porta il pulsante (URL)"
                  placeholder="https://trattorialafenice.it/prenota"
                  value={ctaUrl}
                  onChange={setCtaUrl}
                />
              ) : null}
            </HStack>
          </VStack>
        ) : null}

        {/* Data e Ora Uscita */}
        <DateInput
          label="Quando deve uscire"
          description="Lascia vuoto per far uscire il post subito al prossimo giro del router."
          value={(quando || undefined) as DataISO | undefined}
          min={new Date().toISOString().slice(0, 10) as DataISO}
          onChange={(v) => setQuando(v ?? '')}
        />
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} justify="end" wrap="wrap">
              {esito ? (
                <>
                  <Button
                    label="Scrivine un altro"
                    variant="secondary"
                    onClick={() => setEsito(null)}
                  />
                  <Button label="Chiudi" variant="primary" onClick={onChiudi} />
                </>
              ) : (
                <>
                  <Button label="Annulla" variant="ghost" onClick={onChiudi} isDisabled={inInvio} />
                  <Button
                    label="Salva in Bozza"
                    variant="secondary"
                    isLoading={inInvio}
                    isDisabled={inInvio || !testo.trim()}
                    clickAction={() => salvaPost(false)}
                  />
                  <Button
                    label="Approva & Pubblica Subito"
                    variant="primary"
                    isLoading={inInvio}
                    isDisabled={inInvio || !testo.trim()}
                    clickAction={() => salvaPost(true)}
                  />
                </>
              )}
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
