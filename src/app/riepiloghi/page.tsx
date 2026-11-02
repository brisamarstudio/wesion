/**
 * Il riepilogo del mese per ogni cliente. Di serie il mese appena finito.
 * Vedi src/lib/riepilogo.ts sul perche' esiste e sul perche' non parte da solo.
 */
import { Telaio } from '@/componenti/Telaio';
import { Riepiloghi } from '@/componenti/Riepiloghi';
import { preparaRiepiloghi } from '@/lib/riepilogo';
import { giornoRoma } from '@/lib/quando';

export const dynamic = 'force-dynamic';

export default async function PaginaRiepiloghi({ searchParams }: { searchParams: Promise<{ mese?: string }> }) {
  const { mese: chiesto } = await searchParams;
  const [a, m] = giornoRoma(new Date()).split('-').map(Number);
  const scorso = m === 1 ? { anno: a - 1, mese: 12 } : { anno: a, mese: m - 1 };
  const scelto =
    chiesto && /^\d{4}-\d{2}$/.test(chiesto)
      ? { anno: Number(chiesto.slice(0, 4)), mese: Number(chiesto.slice(5)) }
      : scorso;
  const riepiloghi = await preparaRiepiloghi(scelto.anno, scelto.mese);
  return (
    <Telaio attiva="/riepiloghi">
      <Riepiloghi riepiloghi={riepiloghi} anno={scelto.anno} mese={scelto.mese} />
    </Telaio>
  );
}
