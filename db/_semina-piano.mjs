import { Pool } from 'pg';
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const { rows:[a] } = await p.query(
  `INSERT INTO wesion.azienda (slug,nome,citta,stato,fonte,settore)
   VALUES ('zzz-piano-fenice','Trattoria La Fenice (prova)','Pavia','cliente','manuale',ARRAY['ristorazione','locale'])
   ON CONFLICT (slug) DO UPDATE SET settore=EXCLUDED.settore RETURNING id`);
await p.query(
  `INSERT INTO wesion.voce (azienda_id, voce, pubblico, apprezzato, non_fa, mai_dire)
   VALUES ($1,'diretto, senza fronzoli, da osteria di paese','famiglie e lavoratori del pavese',
           ARRAY['la pasta fatta in casa','il rapporto qualità prezzo','l''accoglienza di Marco'],
           ARRAY['niente surgelati','niente menù turistico'],
           ARRAY['non dire mai "cucina tipica"','non dire "il migliore di Pavia"'])
   ON CONFLICT (azienda_id) DO UPDATE SET apprezzato=EXCLUDED.apprezzato, voce=EXCLUDED.voce, pubblico=EXCLUDED.pubblico`,[a.id]);
await p.query(`DELETE FROM wesion.fatto WHERE azienda_id=$1`,[a.id]);
const fatti = [
  ['cosa_fa','trattoria con cucina pavese e pasta fatta in casa','detto_dal_cliente'],
  ['offerta','risotto con la zucca mantovana','detto_dal_cliente'],
  ['offerta','agnolotti tirati a mano ogni mattina','detto_dal_cliente'],
  ['offerta','sale per pranzi di famiglia fino a 40 persone','detto_dal_cliente'],
  ['materiali','farina di un molino di Zinasco','detto_dal_cliente'],
  ['materiali',"verdure dall'orto dietro il locale",'detto_dal_cliente'],
  ['punti_forza','Marco in sala da 12 anni, conosce i clienti per nome','detto_dal_cliente'],
  ['punti_forza','cucina aperta a vista','detto_dal_cliente'],
];
for (const [chiave,valore,fonte] of fatti)
  await p.query(`INSERT INTO wesion.fatto (azienda_id,chiave,valore,fonte,verificato_at) VALUES ($1,$2,$3,$4,now())`,[a.id,chiave,valore,fonte]);
console.log('azienda di prova id =', a.id, '— fatti:', fatti.length);
await p.end();
