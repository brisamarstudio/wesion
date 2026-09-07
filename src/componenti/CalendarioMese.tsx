'use client';

/**
 * Il mese intero, a griglia.
 *
 * ⚠️ PERCHE' NON UNA PAGINAZIONE. La settimana a elenco funziona per un cliente
 * con quattro post; con quindici clienti fa sessanta righe, e la richiesta che
 * arriva e' «mettici le pagine». Ma la paginazione su un calendario spezza il
 * mese in pezzi che non corrispondono a niente: nessuno pensa «la seconda
 * pagina di settembre». Il problema non e' quante righe sono, e' che si sta
 * leggendo un elenco dove serve una griglia — un mese si guarda tutto insieme,
 * e i buchi si vedono solo se stanno accanto ai pieni.
 *
 * COSA MOSTRA E PERCHE':
 *
 *   POCO PER CELLA, MA LA COPERTINA SI'. Nome del cliente e miniatura: la
 *   domanda del mese e' «e' coperto?», non «cosa dice il post». Il testo si
 *   legge nella settimana o nella bozza.
 *
 *   I GIORNI VUOTI RESTANO. Stessa ragione della vista settimanale: un buco e'
 *   quello che il cliente noterebbe guardando la sua pagina.
 *
 *   IL GIALLO E' «ASPETTA UNA PERSONA». Un post da approvare con la data di
 *   oggi non esce finche' qualcuno non dice si': e' l'unica coda che si ferma
 *   da sola, e in una griglia deve saltare all'occhio senza leggere niente.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Layout, LayoutContent, LayoutHeader } from '@astryxdesign/core/Layout';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { giornoRoma } from '@/lib/quando';
import type { VoceCalendario } from './Calendario';

const GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];

/** Quante voci per cella prima di riassumere. Oltre, la cella non si legge. */
const PER_CELLA = 3;

function attende(stato: string): boolean {
  return stato === 'vuota' || stato === 'generata' || stato === 'attesa_approvazione';
}

export function CalendarioMese({
  celle,
  anno,
  mese,
  oggi,
  clienti,
  cliente,
}: {
  /** Un elemento per casella della griglia: `null` = giorno di un altro mese. */
  celle: Array<{ data: string | null; voci: VoceCalendario[] }>;
  anno: number;
  mese: number;
  oggi: string;
  clienti: Array<{ id: string; nome: string }>;
  cliente: string;
}) {
  const router = useRouter();
  const [inCorso, avvia] = useTransition();

  const coda = cliente ? `&cliente=${cliente}` : '';

  function vaiAlMese(scarto: number) {
    const d = new Date(anno, mese - 1 + scarto, 1);
    avvia(() =>
      router.push(`/calendario?vista=mese&anno=${d.getFullYear()}&mese=${d.getMonth() + 1}${coda}`)
    );
  }

  const nomeMese = new Date(anno, mese - 1, 1).toLocaleDateString('it-IT', {
    month: 'long',
    year: 'numeric',
  });

  const totale = celle.reduce((n, c) => n + c.voci.length, 0);
  const daDecidere = celle.reduce((n, c) => n + c.voci.filter((v) => attende(v.stato)).length, 0);

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack gap={3} align="center" wrap="wrap">
            <Heading level={2}>Calendario</Heading>
            <Text color="secondary">
              {`${totale} nel mese`}
              {daDecidere > 0 ? ` · ${daDecidere} da decidere` : ''}
            </Text>
            {clienti.length > 1 ? (
              <Selector
                label="Cliente"
                isLabelHidden
                size="sm"
                value={cliente}
                hasSearch={clienti.length > 8}
                onChange={(v) => {
                  const scelto = String(v);
                  avvia(() =>
                    router.push(
                      `/calendario?vista=mese&anno=${anno}&mese=${mese}` +
                        (scelto ? `&cliente=${scelto}` : '')
                    )
                  );
                }}
                options={[
                  { value: '', label: `Tutti i clienti (${clienti.length})` },
                  ...clienti.map((c) => ({ value: c.id, label: c.nome })),
                ]}
              />
            ) : null}
            <Button label="Mese prima" size="sm" variant="ghost" isLoading={inCorso} onClick={() => vaiAlMese(-1)} />
            <Text>{nomeMese}</Text>
            <Button label="Mese dopo" size="sm" variant="ghost" onClick={() => vaiAlMese(1)} />
            {/* Le due viste rispondono a due domande diverse: la settimana a
                «cosa faccio stamattina», il mese a «e' coperto?». */}
            <Button
              label="Vista settimana"
              size="sm"
              variant="secondary"
              onClick={() => avvia(() => router.push(`/calendario?${coda.slice(1)}`))}
            />
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={4}>
          <VStack gap={2}>
            <Grid columns={7} gap={1}>
              {GIORNI.map((g) => (
                <Text key={g} type="supporting">
                  {g}
                </Text>
              ))}
            </Grid>

            <Grid columns={7} gap={1}>
              {celle.map((c, i) => {
                if (!c.data) {
                  // Le caselle prima del 1 e dopo l'ultimo: vuote e mute, ma
                  // presenti, o la griglia si disallinea dai giorni in cima.
                  return <div key={`v${i}`} style={{ minHeight: 92 }} />;
                }
                const chiave = giornoRoma(c.data);
                const eOggi = chiave === oggi;
                const numero = new Date(c.data).getDate();
                const mostrate = c.voci.slice(0, PER_CELLA);
                const restanti = c.voci.length - mostrate.length;

                return (
                  /* ⚠️ Un <div>, come altrove in questo progetto e per lo
                     stesso motivo: ne' VStack ne' HStack accettano `style` —
                     solo `xstyle` (StyleX), e qui il compilatore StyleX non
                     c'e'. Passarglielo non da' errore, lo butta via in
                     silenzio. La cella e' un contenitore, non un widget:
                     niente Card. Colori e raggi restano token. */
                  <div
                    key={chiave}
                    style={{
                      minHeight: 92,
                      padding: 'var(--spacing-1-5)',
                      border: `1px solid ${
                        eOggi ? 'var(--color-border-emphasized)' : 'var(--color-border)'
                      }`,
                      borderRadius: 'var(--radius-element)',
                      background: eOggi
                        ? 'var(--color-background-muted)'
                        : 'var(--color-background-surface)',
                    }}
                  >
                  <VStack gap={1}>
                    <HStack gap={1} align="center" justify="between">
                      <Text type={eOggi ? 'body' : 'supporting'}>{numero}</Text>
                      {c.voci.length > 0 ? (
                        <Button
                          label={String(c.voci.length)}
                          size="sm"
                          variant="ghost"
                          /* Il giorno porta alla SETTIMANA che lo contiene: li'
                             il testo si legge per intero. Una cella che prova a
                             mostrare tutto non e' piu' una griglia. */
                          onClick={() =>
                            avvia(() => router.push(`/calendario?da=${chiave}${coda}`))
                          }
                        />
                      ) : (
                        <Button
                          label="+"
                          size="sm"
                          variant="ghost"
                          tooltip="Aggiungi un post questo giorno"
                          onClick={() =>
                            avvia(() => router.push(`/bozze?nuovo=1&giorno=${chiave}`))
                          }
                        />
                      )}
                    </HStack>

                    {mostrate.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => avvia(() => router.push(`/bozze?bozza=${v.id}`))}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--spacing-1)',
                          background: 'transparent',
                          border: 0,
                          padding: 0,
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%',
                          font: 'inherit',
                          color: 'inherit',
                        }}
                      >
                        {v.foto ? (
                          <img
                            src={v.foto}
                            alt=""
                            width={16}
                            height={16}
                            style={{
                              objectFit: 'cover',
                              borderRadius: 'var(--radius-inner)',
                              display: 'block',
                              flexShrink: 0,
                            }}
                          />
                        ) : (
                          <StatusDot
                            variant={
                              v.fallita && !v.uscita ? 'error' : attende(v.stato) ? 'warning' : 'success'
                            }
                            label={
                              v.fallita && !v.uscita
                                ? 'pubblicazione fallita'
                                : attende(v.stato)
                                  ? 'aspetta una persona'
                                  : 'a posto'
                            }
                          />
                        )}
                        <Text type="supporting" maxLines={1}>
                          {v.azienda}
                        </Text>
                      </button>
                    ))}

                    {restanti > 0 ? (
                      <Text type="supporting">{`+${restanti}`}</Text>
                    ) : null}
                  </VStack>
                  </div>
                );
              })}
            </Grid>

            {totale === 0 ? (
              <Badge variant="neutral" label="In questo mese non esce niente" />
            ) : null}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
