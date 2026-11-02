/**
 * Il PC delle immagini: prende da Wesion i post senza foto, le fa con ComfyUI
 * sulla scheda video di qui, e le riconsegna.
 *
 *   node --env-file=lavoratore/.env.lavoratore lavoratore/immagini.mjs
 *   (oppure doppio click su lavoratore/avvia-immagini.bat)
 *
 * ⚠️ PERCHÉ IL VERSO È QUESTO (02/11/2026): il server su Contabo non vede
 * ComfyUI, e aprire ComfyUI su internet è un rischio vero (i nodi eseguono
 * codice). Quindi è il PC a chiamare il server, ogni 20 secondi: «c'è lavoro?».
 * Se il PC è spento, Wesion se ne accorge in 3 minuti e le foto le fa
 * OpenRouter (vedi src/lib/lavoratore.ts e src/lib/mese.ts).
 *
 * Modello: Z-Image Turbo (Apache 2.0: uso commerciale libero — le foto finiscono
 * sui post dei clienti). 8 passi, pochi secondi su una RTX 5080.
 *
 * Nessuna dipendenza: solo Node 20+.
 */

const WESION = (process.env.WESION_URL || 'https://wesion.mywebby.it').replace(/\/$/, '');
const TOKEN = process.env.WESION_LAVORATORE_TOKEN;
const COMFY = (process.env.COMFY_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');
const OGNI_SECONDI = Number(process.env.OGNI_SECONDI || 20);
const LARGHEZZA = 1280;
const ALTEZZA = 960; // 4:3, come le immagini di OpenRouter

if (!TOKEN) {
  console.error('Manca WESION_LAVORATORE_TOKEN: avvialo con --env-file=lavoratore/.env.lavoratore');
  process.exit(1);
}

const ora = () => new Date().toLocaleTimeString('it-IT');
const dorme = (ms) => new Promise((ok) => setTimeout(ok, ms));
const intestazioni = { 'x-wesion-lavoratore': TOKEN };

function flussoZImage(prompt, seme) {
  return {
    1: { class_type: 'UNETLoader', inputs: { unet_name: 'z_image_turbo_bf16.safetensors', weight_dtype: 'default' } },
    2: { class_type: 'CLIPLoader', inputs: { clip_name: 'qwen_3_4b.safetensors', type: 'lumina2', device: 'default' } },
    3: { class_type: 'VAELoader', inputs: { vae_name: 'ae.safetensors' } },
    4: { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['1', 0], shift: 3 } },
    5: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: prompt } },
    6: { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['5', 0] } },
    7: { class_type: 'EmptySD3LatentImage', inputs: { width: LARGHEZZA, height: ALTEZZA, batch_size: 1 } },
    8: {
      class_type: 'KSampler',
      inputs: {
        model: ['4', 0], positive: ['5', 0], negative: ['6', 0], latent_image: ['7', 0],
        seed: seme, steps: 8, cfg: 1, sampler_name: 'res_multistep', scheduler: 'simple', denoise: 1,
      },
    },
    9: { class_type: 'VAEDecode', inputs: { samples: ['8', 0], vae: ['3', 0] } },
    10: { class_type: 'SaveImage', inputs: { images: ['9', 0], filename_prefix: 'wesion' } },
  };
}

async function comfyAcceso() {
  try {
    const r = await fetch(`${COMFY}/system_stats`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
}

/** Fa l'immagine e ne torna i byte (PNG). */
async function genera(prompt) {
  const seme = Math.floor(Math.random() * 2 ** 31);
  const r = await fetch(`${COMFY}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: flussoZImage(prompt, seme) }),
  });
  const { prompt_id, error, node_errors } = await r.json();
  if (!prompt_id) throw new Error(`ComfyUI ha rifiutato il flusso: ${JSON.stringify(error ?? node_errors).slice(0, 300)}`);

  const scadenza = Date.now() + 5 * 60_000;
  while (Date.now() < scadenza) {
    await dorme(1000);
    const storia = await (await fetch(`${COMFY}/history/${prompt_id}`)).json();
    const esito = storia[prompt_id];
    if (!esito) continue;
    if (esito.status?.status_str === 'error') {
      const msg = esito.status.messages?.find((m) => m[0] === 'execution_error')?.[1]?.exception_message;
      throw new Error(`ComfyUI: ${String(msg ?? 'errore').slice(0, 300)}`);
    }
    const img = esito.outputs?.['10']?.images?.[0];
    if (img) {
      const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
      return Buffer.from(await (await fetch(`${COMFY}/view?${q}`)).arrayBuffer());
    }
  }
  throw new Error('ComfyUI non ha finito in 5 minuti');
}

async function giro() {
  if (!(await comfyAcceso())) {
    // Senza ComfyUI non si chiede lavoro: prenotare foto che non si possono
    // fare le terrebbe ferme 10 minuti per niente.
    return;
  }
  const r = await fetch(`${WESION}/api/lavoratore/immagini?max=4`, { headers: intestazioni });
  if (r.status === 401) {
    console.error(`[${ora()}] Wesion dice che il token non è valido. Fermo.`);
    process.exit(1);
  }
  if (!r.ok) throw new Error(`Wesion ha risposto ${r.status}`);
  const { lavori } = await r.json();
  for (const l of lavori) {
    const t = Date.now();
    try {
      const png = await genera(l.prompt);
      const c = await fetch(`${WESION}/api/lavoratore/immagini/${l.id}`, {
        method: 'POST',
        headers: { ...intestazioni, 'content-type': 'image/png', 'x-modello': 'comfyui/z-image-turbo' },
        body: png,
      });
      const e = await c.json().catch(() => ({}));
      if (!c.ok) throw new Error(`consegna rifiutata: ${e.errore ?? c.status}`);
      console.log(`[${ora()}] bozza ${l.id}: fatta in ${((Date.now() - t) / 1000).toFixed(1)}s → ${e.url}`);
    } catch (errore) {
      console.error(`[${ora()}] bozza ${l.id}: ${errore.message}`);
      await fetch(`${WESION}/api/lavoratore/immagini/${l.id}`, {
        method: 'POST',
        headers: { ...intestazioni, 'content-type': 'application/json' },
        body: JSON.stringify({ errore: errore.message }),
      }).catch(() => {});
    }
  }
}

console.log(`[${ora()}] Wesion immagini: ComfyUI ${COMFY} → ${WESION}, ogni ${OGNI_SECONDI}s. Ctrl+C per fermare.`);
for (;;) {
  try {
    await giro();
  } catch (errore) {
    console.error(`[${ora()}] ${errore.message}`);
  }
  await dorme(OGNI_SECONDI * 1000);
}
