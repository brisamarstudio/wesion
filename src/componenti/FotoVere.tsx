'use client';

/**
 * L'archivio delle foto vere di un cliente, dentro il mese.
 *
 * Si caricano una volta (anche venti insieme), Wesion le descrive da solo e il
 * mese le usa prima di generare: vedi src/lib/foto.ts. Sta chiuso quando il
 * cliente ha gia' le sue foto, aperto quando non ne ha nessuna — e' l'unico
 * caso in cui c'e' qualcosa da fare qui.
 */
import { useCallback, useEffect, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Grid } from '@astryxdesign/core/Grid';
import { AspectRatio } from '@astryxdesign/core/AspectRatio';
import { FileInput } from '@astryxdesign/core/FileInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Badge } from '@astryxdesign/core/Badge';
import { Images, X } from 'lucide-react';

interface Foto {
  id: number;
  url: string;
  descrizione: string | null;
  usata: number;
}

export function FotoVere({
  aziendaId,
  nome,
  anno,
  mese,
  postConAI,
  onCambiate,
}: {
  aziendaId: number;
  nome: string;
  anno: number;
  mese: number;
  /** Quanti post del mese hanno ancora un'immagine generata. */
  postConAI: number;
  onCambiate: () => void;
}) {
  const [foto, setFoto] = useState<Foto[] | null>(null);
  const [esito, setEsito] = useState<string | null>(null);
  const [caricando, setCaricando] = useState(false);

  const carica = useCallback(async () => {
    const r = await fetch(`/api/aziende/${aziendaId}/foto`);
    const e = await r.json().catch(() => ({}));
    setFoto(r.ok ? e.foto : []);
  }, [aziendaId]);

  useEffect(() => {
    carica();
  }, [carica]);

  async function aggiungi(file: File | File[] | null) {
    const lista = Array.isArray(file) ? file : file ? [file] : [];
    if (!lista.length) return;
    setEsito(null);
    setCaricando(true);
    try {
      const modulo = new FormData();
      for (const f of lista) modulo.append('file', f);
      const r = await fetch(`/api/aziende/${aziendaId}/foto`, { method: 'POST', body: modulo });
      const e = await r.json().catch(() => ({}));
      setEsito(
        r.ok
          ? `${e.caricate?.length ?? 0} ${e.caricate?.length === 1 ? 'foto caricata e descritta' : 'foto caricate e descritte'}.` +
              (e.scartate?.length ? ` Scartate: ${e.scartate.join('; ')}.` : '')
          : (e.errore ?? 'Il caricamento non è riuscito.')
      );
      await carica();
    } finally {
      setCaricando(false);
    }
  }

  async function togli(id: number) {
    await fetch(`/api/aziende/${aziendaId}/foto?foto=${id}`, { method: 'DELETE' });
    await carica();
  }

  async function usaAlPostoDellAI() {
    const r = await fetch(`/api/aziende/${aziendaId}/foto?assegna=${anno}-${String(mese).padStart(2, '0')}`, {
      method: 'POST',
    });
    const e = await r.json().catch(() => ({}));
    setEsito(
      r.ok
        ? e.assegnate
          ? `Messe ${e.assegnate} foto vere al posto di quelle generate.`
          : 'Nessuna foto vera c’entra con i post rimasti: restano quelle generate.'
        : (e.errore ?? 'Non è andata.')
    );
    onCambiate();
    await carica();
  }

  const quante = foto?.length ?? 0;

  return (
    <Collapsible
      defaultIsOpen={foto !== null && quante === 0}
      trigger={
        <HStack gap={2} align="center">
          <Images size={16} />
          <Text weight="medium">Foto vere di {nome}</Text>
          <Badge variant="neutral" label={String(quante)} />
          <Text type="supporting" color="secondary">
            {quante
              ? 'il mese le usa prima di generarne'
              : 'nessuna: le immagini sono tutte generate'}
          </Text>
        </HStack>
      }
    >
      <VStack gap={3} paddingBlock={2}>
        <FileInput
          label="Aggiungi foto vere"
          mode="dropzone"
          isMultiple
          accept="image/*"
          maxSize={8 * 1024 * 1024}
          maxFiles={40}
          value={[]}
          isLoading={caricando}
          placeholder={caricando ? 'Carico e descrivo…' : 'Trascina qui le foto, anche venti insieme'}
          description="La sala, i piatti, la cabina, l’ingresso, il laboratorio. Wesion le descrive da solo e le dà ai post che parlano di quello, senza ripeterle nello stesso mese."
          onChange={() => undefined}
          changeAction={aggiungi}
        />
        {esito ? <Text type="supporting">{esito}</Text> : null}
        {quante && postConAI ? (
          <HStack gap={2} align="center" wrap="wrap">
            <Button label="Usa le foto vere al posto di quelle generate" size="sm" clickAction={usaAlPostoDellAI} />
            <Text type="supporting" color="secondary">
              Solo sui post ancora da approvare, e mai sopra una foto messa a mano.
            </Text>
          </HStack>
        ) : null}
        {quante ? (
          <Grid columns={{ minWidth: 150, repeat: 'fill' }} gap={3}>
            {foto!.map((f) => (
              <VStack key={f.id} gap={1}>
                <AspectRatio ratio={4 / 3} fit="cover">
                  <img src={f.url} alt={f.descrizione ?? 'foto del cliente'} loading="lazy" />
                </AspectRatio>
                <Text type="supporting" color="secondary" maxLines={2}>
                  {f.descrizione ?? 'senza descrizione'}
                </Text>
                <HStack gap={1} align="center" justify="between">
                  <Text type="supporting" color="secondary">
                    {f.usata ? `usata ${f.usata}×` : 'mai usata'}
                  </Text>
                  <Button label="Togli" size="sm" variant="ghost" icon={<X size={13} />} clickAction={() => togli(f.id)} />
                </HStack>
              </VStack>
            ))}
          </Grid>
        ) : null}
      </VStack>
    </Collapsible>
  );
}
