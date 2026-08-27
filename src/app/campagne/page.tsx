/**
 * Campagne — il primo anello: da "dentisti a Pavia" a un elenco di lead.
 */
import { query } from '@/lib/db';
import { Telaio } from '@/componenti/Telaio';
import { Campagne, type CampagnaRiga } from '@/componenti/Campagne';

export const dynamic = 'force-dynamic';

export default async function PaginaCampagne() {
  const campagne = await query<CampagnaRiga>(`
    SELECT c.id, c.nome, c.categoria, c.citta, c.apify_run_id, c.creata_at,
           (SELECT count(*)::int FROM wesion.azienda a WHERE a.campagna_id = c.id) AS raccolte
      FROM wesion.campagna c
     ORDER BY c.creata_at DESC
     LIMIT 100
  `);

  return (
    <Telaio attiva="/campagne">
      <Campagne campagne={campagne} />
    </Telaio>
  );
}
