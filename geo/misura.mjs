// Misura GEO: quanto le AI citano un cliente (playbook 08-SEO-GEO §3.2).
// Uso (sul server, dove sta la chiave):  node misura.mjs domande-chumphon.json [ripetizioni]
// La chiave OPENROUTER_API_KEY si legge dal .env indicato in GEO_ENV (default ~/wesion-app/wesion/.env):
// non viene mai stampata. Prima prova del 06/10/2026, poi diventera' un job settimanale di Wesion.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [fileDomande, rip = '1'] = process.argv.slice(2);
const envFile = process.env.GEO_ENV || path.join(os.homedir(), 'wesion-app/wesion/.env');
const chiave = (fs.readFileSync(envFile, 'utf8').match(/^OPENROUTER_API_KEY=(.+)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, '');
if (!fileDomande || !chiave) { console.error('Servono il file delle domande e OPENROUTER_API_KEY'); process.exit(1); }

const set = JSON.parse(fs.readFileSync(fileDomande, 'utf8'));
const riconosci = set.riconosci.map((s) => s.toLowerCase());

// Una AI per motore usato dalle persone; tutte con ricerca web (Perplexity ce l'ha di suo).
const MOTORI = [
  { nome: 'Perplexity', model: 'perplexity/sonar' },
  { nome: 'ChatGPT', model: 'openai/gpt-5.4-mini', web: true },
  { nome: 'Claude', model: 'anthropic/claude-haiku-4.5', web: true },
  { nome: 'Gemini', model: 'google/gemini-3.8-flash', web: true },
];

async function chiedi(motore, domanda) {
  const corpo = { model: motore.model, messages: [{ role: 'user', content: domanda }], max_tokens: 1200 };
  if (motore.web) corpo.plugins = [{ id: 'web', max_results: 6 }];
  for (let tentativo = 1; tentativo <= 3; tentativo++) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${chiave}`, 'content-type': 'application/json',
          'HTTP-Referer': 'https://wesion.mywebby.it', 'X-Title': 'Wesion GEO' },
        body: JSON.stringify(corpo),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || r.status);
      const msg = j.choices?.[0]?.message ?? {};
      const fonti = [
        ...(msg.annotations ?? []).filter((a) => a.type === 'url_citation').map((a) => a.url_citation?.url),
        ...(j.citations ?? []),
      ].filter(Boolean);
      return { testo: msg.content ?? '', fonti: [...new Set(fonti)], costo: j.usage?.cost ?? null };
    } catch (e) {
      if (tentativo === 3) return { errore: String(e.message || e) };
      await new Promise((ok) => setTimeout(ok, 1500 * tentativo));
    }
  }
}

const dominio = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };

const lavori = [];
for (let n = 1; n <= Number(rip); n++)
  for (const d of set.domande) for (const m of MOTORI) lavori.push({ n, d, m });

const risultati = [];
let i = 0;
async function operaio() {
  while (i < lavori.length) {
    const { n, d, m } = lavori[i++];
    const r = await chiedi(m, d.q);
    const testo = (r.testo || '').toLowerCase();
    const posFonte = (r.fonti || []).findIndex((u) => riconosci.some((k) => u.toLowerCase().includes(k)));
    // Con il nome nella domanda, ripeterlo non vuol dire conoscerlo (06/10/2026: Perplexity
    // rispondeva su un «Thai Massage Chumphon» in Germania): li' conta solo se usa il sito come fonte.
    const sito = riconosci.filter((k) => k.includes('.'));
    const citato = !r.errore && (d.t === 'brand'
      ? posFonte >= 0 || sito.some((k) => testo.includes(k))
      : riconosci.some((k) => testo.includes(k)) || posFonte >= 0);
    risultati.push({ ripetizione: n, tipo: d.t, domanda: d.q, motore: m.nome, model: m.model, citato,
      posizione_fonte: posFonte >= 0 ? posFonte + 1 : null, fonti: (r.fonti || []).map(dominio).filter(Boolean),
      costo: r.costo, errore: r.errore ?? null, testo: r.testo ?? '' });
    process.stderr.write(citato ? '✓' : r.errore ? 'x' : '.');
  }
}
await Promise.all(Array.from({ length: 4 }, operaio));
process.stderr.write('\n');

const quando = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const out = path.join(path.dirname(fileDomande), `risultati-${path.basename(fileDomande, '.json')}-${quando}.json`);
fs.writeFileSync(out, JSON.stringify({ cliente: set.cliente, quando, risultati }, null, 2));

// Riepilogo: share of voice sulle domande SENZA il nome (quelle che portano clienti nuovi)
const senzaNome = risultati.filter((r) => r.tipo !== 'brand' && !r.errore);
const conNome = risultati.filter((r) => r.tipo === 'brand' && !r.errore);
console.log(`\n${set.cliente} — ${quando}`);
for (const m of MOTORI) {
  const a = senzaNome.filter((r) => r.motore === m.nome), b = conNome.filter((r) => r.motore === m.nome);
  console.log(`${m.nome.padEnd(11)} senza nome: ${a.filter((r) => r.citato).length}/${a.length}   con il nome: ${b.filter((r) => r.citato).length}/${b.length}`);
}
const conta = {};
// exa.ai e vertexaisearch sono il motore di ricerca dello strumento, non siti che l'AI consiglia
const STRUMENTI = new Set(['exa.ai', 'vertexaisearch.cloud.google.com']);
for (const r of senzaNome) for (const d of new Set(r.fonti)) if (!STRUMENTI.has(d)) conta[d] = (conta[d] || 0) + 1;
console.log('\nSiti piu citati nelle risposte senza nome:');
for (const [d, n] of Object.entries(conta).sort((x, y) => y[1] - x[1]).slice(0, 15)) console.log(`  ${String(n).padStart(3)}  ${d}`);
const errori = risultati.filter((r) => r.errore);
const spesa = risultati.reduce((s, r) => s + (Number(r.costo) || 0), 0);
console.log(`\nErrori: ${errori.length}${errori.length ? ' (' + [...new Set(errori.map((e) => e.motore + ': ' + e.errore))].slice(0, 3).join(' | ') + ')' : ''}`);
console.log(`Costo: ${spesa ? spesa.toFixed(3) + ' $' : 'n.d.'}   File: ${out}`);
