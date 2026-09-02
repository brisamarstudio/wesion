/**
 * Le regole SEO/GEO/AEO che oggi stanno solo nel playbook dell'agenzia
 * (`_MYWEBBY-PLAYBOOK/08-SEO-GEO.md`), che vive fuori da questo repo e non
 * arriva sul server: Wesion gira su Contabo, il playbook sta solo sul PC di
 * sviluppo. Se il job di audit deve seguirle, devono stare QUI — copiate a
 * mano, e da tenere aggiornate quando il playbook cambia (Google cambia le
 * regole più spesso di quanto vorremmo, è il motivo per cui questo file
 * esiste).
 *
 * ⚠️ NON è la lista completa del playbook. È la parte che un modello può
 * applicare leggendo il codice di un repo e i numeri di Search Console, senza
 * un umano in mezzo: niente entity building fuori dal sito, niente scelte
 * editoriali sui contenuti — quelle restano lavoro di persone.
 */
export const REGOLE_SEO_GEO = `
Regole SEO/GEO/AEO da applicare (fonte: playbook agenzia, 08-SEO-GEO.md):

1. GRAFO JSON-LD con @graph: WebSite + Organization + il tipo giusto di
   business (Restaurant, Hotel, LodgingBusiness...) + WebPage + BreadcrumbList
   generato dall'URL. Se manca, proponilo; se c'è, verifica che sia completo.

2. knowsAbout dentro il nodo business: territorio, città di riferimento,
   enogastronomia/settore — SOLO fatti reali già presenti nel sito o nelle
   note fornite. Non inventare nomi di aziende terze o concorrenti.

3. containedInPlace per l'area geografica, geo.region/geo.placename/
   geo.position alla città vera (non al solo paese).

4. robots.txt — policy bot AI: blocca i crawler di TRAINING (GPTBot,
   ClaudeBot, CCBot, Bytespider, Google-Extended), lascia passare quelli di
   RISPOSTA LIVE che citano con link di ritorno (OAI-SearchBot, ChatGPT-User,
   PerplexityBot, GoogleOther, Claude-SearchBot, Claude-User). Deve includere
   la riga Sitemap.

5. llms.txt in root: elenco delle pagine prioritarie del sito, in markdown,
   formato "# Nome sito" seguito da link alle pagine chiave con una riga di
   descrizione ciascuna. Aspettative basse sui risultati, costa poco: se manca
   va comunque proposto.

6. FAQPage schema per le pagine con domande frequenti in linguaggio naturale
   (tipo "che ristorante scelgo per una cena di lavoro a Voghera?"), Article/
   BlogPosting con dateModified per contenuti editoriali. Solo dove il sito ha
   già i contenuti testuali per popolarli — non inventare risposte.

7. dateModified aggiornato quando si tocca un contenuto editoriale.

8. Meta: Open Graph + Twitter Card + canonical dinamico + meta robots con
   max-image-preview:large, max-snippet:-1, max-video-preview:-1.

NON toccare: contenuti editoriali (testi, descrizioni, prezzi), entity
building esterno (Google Business Profile, OTA, stampa), scelte di brand/
naming. Quelle sono lavoro umano, non di questo job.
`.trim();
