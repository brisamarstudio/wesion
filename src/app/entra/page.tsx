/**
 * La pagina d'ingresso.
 *
 * Fuori dal Telaio apposta: chi non è entrato non deve vedere il menù delle
 * cose che non può aprire. Mostrare una navigazione che porta solo a redirect
 * è il modo più rapido per far pensare che l'applicazione sia rotta.
 */
import { Suspense } from 'react';
import { ModuloIngresso } from '@/componenti/ModuloIngresso';

export const dynamic = 'force-dynamic';

export default function PaginaEntra() {
  return (
    <Suspense>
      <ModuloIngresso />
    </Suspense>
  );
}
