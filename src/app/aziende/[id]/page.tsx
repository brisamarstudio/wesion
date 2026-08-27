/**
 * La pagina di un cliente.
 *
 * Componente server: legge la scheda e la passa. Tutto il resto e' un form, che
 * per forza vive nel browser.
 */
import { notFound } from 'next/navigation';
import { Telaio } from '@/componenti/Telaio';
import { SchedaCliente } from '@/componenti/SchedaCliente';
import { leggiScheda } from '@/lib/scheda';

export const dynamic = 'force-dynamic';

export default async function PaginaCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const aziendaId = Number(id);
  if (!Number.isFinite(aziendaId)) notFound();

  const scheda = await leggiScheda(aziendaId);
  if (!scheda) notFound();

  return (
    <Telaio attiva="/aziende">
      <SchedaCliente scheda={scheda} />
    </Telaio>
  );
}
