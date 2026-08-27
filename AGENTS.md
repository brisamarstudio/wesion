> ## Prima di tutto: leggi `STATO.md`
>
> Dice cos'e' Wesion, com'e' fatta la catena fatto -> voce -> bozza -> approvazione ->
> pubblicazione, e le cinque cose non ovvie che altrimenti ti costano un'ora ciascuna
> (fra cui: perche' non c'e' Tailwind, perche' l'elenco usa `List` e non `Table`, e
> quali import di Astryx non sono dove sembrano).
>
> Regola che decide i casi dubbi: **l'ultimo bottone e' dell'operatore.**
> Niente si pubblica da solo.
>
> Prima di scrivere un componente: `npm run astryx -- component <Nome>`.
> Non inventare props: e' gia' costato tre giri di build.
>
> **Dentro `router/`: import relativi CON estensione `.ts`.** Il router non passa da
> Next, lo esegue Node con `--experimental-strip-types`, che le estensioni le pretende.
> E i file di `src/lib` che il router carica (`waha`, `gbp`, `ocr`, `sito`, `db`,
> `normalizza`) non devono avere import relativi senza estensione, o si rompe l'avvio:
> per questo non ne hanno, e c'e' scritto perche' in cima a ognuno.
>
> Un backtick dentro una stringa SQL in un template literal chiude la stringa: nei
> commenti `--` dentro le query non si usano backtick.

<!-- Sotto qui il contenuto e' rigenerato da tooling: non scriverci dentro. -->

# AGENTS.md

Project-specific guidance for AI coding agents.

<!-- ASTRYX:START -->
Astryx v0.1.9 · 153 components
CLI: run every command as `npx astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in your app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — discover, don't guess. Before writing UI:
1. `astryx build "<idea>"` — START HERE: returns a kit (closest [page] + [block]s + [component]s). No args = full playbook.
2. `astryx template <name> [--skeleton]` — scaffold the [page]/[block]s it named, or study their layout. Templates are reference code.
3. `astryx component <Name>` — props + examples for every component you use.

RULES:
- No <div> — components do all layout/spacing. Full page → AppShell; sidebar nav → SideNav.
- Frame first: pick the shell (AppShell / Layout+LayoutPanel) and budget regions in px BEFORE writing content (`astryx docs layout`).
- Dense data = rows (Table, List/Item) edge-to-edge — never Card-wrapped list items. Card = dashboard widgets, galleries, settings groups only.
- Status → StatusDot/Token; Badge only for counts and enumerated states, never decoration.
- Custom styling: component props first; else style/className with tokens — var(--color-*|--spacing-*|--radius-*). No raw hex/px. (No StyleX/Tailwind compiler here — don't use xstyle/utility classes.)
- Tokens for every value (`astryx docs tokens`). Brand/accent via `astryx theme` — never override --color-* in :root.
- SELF-CHECK before you finish: re-read the file and replace any raw <div>/<span> layout, imported .css/@apply, or hardcoded value (#hex, 16px) with the component or a token (var(--color-*|--spacing-*|…)). If unsure a component/prop exists, run `astryx component <Name>` / `astryx search "<thing>"`; don't hand-roll CSS.

MORE CLI:
  search "<query>"   find any component / hook / doc / template / block
  component --list   153 components by category
  template --list    page + block recipes
  docs <topic>       color, elevation, icons, illustrations, internationalization, layout, migration, motion, principles, shape, spacing, styling, theme, tokens, typography
  swizzle <Name>     eject component source for deep customization
  upgrade --apply    run after any @astryxdesign/core bump
<!-- ASTRYX:END -->
