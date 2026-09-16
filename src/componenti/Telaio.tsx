'use client';

/**
 * Il telaio dell'applicazione: si decide PRIMA del contenuto.
 *
 * Budget delle regioni, fissato qui e non negoziato a runtime:
 *   SideNav      256px
 *   contenuto    riempie (dentro ci vanno tabelle, non prosa)
 *   ispettore    380px, deciso dalla pagina che lo usa
 *
 * Contratto responsive:
 *   > 1024   tre regioni
 *   <= 1024  l'ispettore sparisce invece di strizzare la tabella (lo gestisce la pagina)
 *   <= 768   la navigazione diventa MobileNav (breakpoint 'md' di AppShell)
 *
 * contentPadding={0} perche' il contenuto dominante sono tabelle: sono le celle
 * a possedere il proprio incavo, e una padding qui creerebbe un doppio margine.
 *
 * ⚠️ IL MENU HA TRE VOCI, E NON E' UN GUSTO (16/09/2026).
 *
 * Ne aveva nove, ed erano tutte POSTI DOVE STANNO LE COSE: Campagne, Aziende,
 * Clienti, Calendario, Piano, Bozze, + Post al Volo, Spie, Da fare. Cinque di
 * quelle nove guardavano LA STESSA CODA DI BOZZE da cinque angoli diversi, e
 * chi entrava doveva sapere in quale dei cinque stava la riga che cercava.
 * Detto da chi lo usa: «uno che entra dice: ma dov'e' il manuale di
 * sopravvivenza?».
 *
 * Adesso il menu dice le tre cose che si FANNO — far uscire la roba, curare un
 * cliente, trovarne di nuovi — e le viste stanno dentro la voce a cui
 * appartengono, aperte solo quando sei li'. Nessuna pagina e' stata cancellata
 * e NESSUN INDIRIZZO E' CAMBIATO: `/bozze`, `/calendario`, `/piano`,
 * `/insights` rispondono come prima, perche' ci puntano i segnalibri, le spie e
 * i bottoni dentro le pagine.
 *
 * «+ Post al Volo» non c'e' piu' perche' era un doppione: e' un'AZIONE, non un
 * posto, e il suo bottone sta gia' in cima a «Da approvare», dove serve.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@astryxdesign/core/AppShell';
import { SideNav, SideNavHeading, SideNavItem } from '@astryxdesign/core/SideNav';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Icon } from '@astryxdesign/core/Icon';
import { Inbox, Users, Megaphone, Siren, LogOut, BookOpen } from 'lucide-react';
import type { ReactNode } from 'react';

interface Vista {
  href: string;
  label: string;
}

interface Gruppo {
  id: string;
  label: string;
  /** Dove si va cliccando la voce grossa: la vista principale del gruppo. */
  href: string;
  icona: typeof Inbox;
  viste: Vista[];
}

/**
 * Le tre cose che si fanno, nell'ordine in cui si fanno in una giornata.
 *
 * I nomi sono quelli che userebbe una persona al telefono. «Piano editoriale»
 * si chiama «Il mese», «Insights» si chiama «Cose ferme»: quello che c'e'
 * dentro non e' cambiato di una riga, e' cambiato come lo chiamiamo.
 */
const GRUPPI: Gruppo[] = [
  {
    id: 'oggi',
    label: 'Oggi',
    href: '/bozze',
    icona: Inbox,
    viste: [
      { href: '/bozze', label: 'Da approvare' },
      { href: '/calendario', label: 'Calendario' },
      { href: '/piano', label: 'Il mese' },
      { href: '/insights', label: 'Cose ferme' },
    ],
  },
  {
    id: 'clienti',
    label: 'Clienti',
    href: '/clienti',
    icona: Users,
    viste: [],
  },
  {
    id: 'nuovi',
    label: 'Nuovi clienti',
    href: '/aziende',
    icona: Megaphone,
    viste: [
      { href: '/aziende', label: 'Da chiamare' },
      { href: '/campagne', label: 'Campagne' },
    ],
  },
];

/**
 * In quale delle tre voci sta la pagina che stai guardando.
 *
 * Le pagine passano ancora il loro indirizzo (`attiva="/bozze"`) e non il
 * gruppo: cosi' la scheda di un'azienda puo' continuare a dire «/clienti» se e'
 * un cliente e «/aziende» se e' ancora un lead, che e' una cosa che sa lei e
 * non saprebbe il menu.
 */
function gruppoDi(attiva: string): string | null {
  for (const g of GRUPPI) {
    if (g.href === attiva || g.viste.some((v) => v.href === attiva)) return g.id;
  }
  return null;
}

/**
 * Il manuale: come si USA Wesion, pagina per pagina.
 *
 * ⚠️ STA NEL MENU E NON IN UN SEGNALIBRO perche' un link che vive fuori dal
 * programma lo perde chi entra dopo — ed e' esattamente chi ne ha bisogno. Il
 * testo e' anche in `MANUALE.md` dentro il repo, ma il repo i commerciali non
 * ce l'hanno.
 *
 * Si apre in una scheda nuova: chi lo consulta di solito sta facendo altro qui
 * dentro, e non deve perdere la riga su cui era.
 */
const MANUALE = 'https://claude.ai/code/artifact/f871dc3e-0167-4019-ad5f-5ecbb6dc8444';

export function Telaio({
  children,
  attiva,
}: {
  children: ReactNode;
  attiva: string;
}) {
  const router = useRouter();
  const gruppoAttivo = gruppoDi(attiva);

  /**
   * I numeri accanto alle voci, letti una volta per caricamento.
   *
   * Nulli finche' non arrivano: un menu che parte con «Oggi 0» e poi diventa
   * «Oggi 4» ha appena detto una bugia a chi stava leggendo. Meglio niente,
   * per un secondo. E se la chiamata fallisce restano niente: il menu deve
   * funzionare comunque, non e' li' per i numeri.
   */
  const [conteggi, setConteggi] = useState<{ daApprovare: number; clienti: number } | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch('/api/conteggi')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && d) setConteggi(d);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  const numero = (id: string): number | null => {
    if (!conteggi) return null;
    if (id === 'oggi') return conteggi.daApprovare;
    if (id === 'clienti') return conteggi.clienti;
    return null;
  };

  /**
   * L'uscita, aggiunta il 01/09/2026: la rotta `DELETE /api/entra` che cancella
   * il cookie esisteva da quando c'e' il login, ma non era agganciata a NESSUN
   * bottone — chi entrava non aveva un modo di uscire da nessuna parte
   * dell'interfaccia. Qui, non nella pagina di login, perche' e' l'unico posto
   * che vede sempre chi e' dentro. `clickAction` (non `onClick`) mostra da
   * solo lo spinner finche' la promise non finisce.
   */
  async function esci() {
    await fetch('/api/entra', { method: 'DELETE' });
    router.push('/entra');
    router.refresh();
  }

  return (
    <AppShell
      height="fill"
      contentPadding={0}
      variant="section"
      mobileNav={{ breakpoint: 'md' }}
      sideNav={
        <SideNav
          header={<SideNavHeading heading="Wesion" subheading="MyWebby" headingHref="/bozze" />}
          /**
           * ⚠️ NIENTE `autoSaveId`, ed e' voluto (27/08/2026).
           *
           * In Astryx 0.1.9 la larghezza salvata si legge dentro l'inizializzatore
           * di `useState`, cioe' al primo render del client. Sul server
           * `localStorage` non esiste e viene fuori `defaultWidth`; nel browser
           * viene fuori il valore salvato. Appena qualcuno trascina la barra una
           * volta, i due non combaciano piu' e React se ne lamenta a ogni pagina.
           *
           * E non era nemmeno una perdita: React non corregge gli attributi
           * discordanti in idratazione («this won't be patched up»), quindi teneva
           * comunque la larghezza del server. La barra si ridimensiona ancora, ma
           * non si ricorda fra un caricamento e l'altro — che e' quello che gia'
           * succedeva, solo senza l'errore in console.
           */
          resizable={{ defaultWidth: 256, minWidth: 200, maxWidth: 360 }}
          footer={
            <Button
              label="Esci"
              icon={<Icon icon={LogOut} />}
              variant="ghost"
              width="100%"
              clickAction={esci}
            />
          }
        >
          {GRUPPI.map((g) => {
            const dentro = gruppoAttivo === g.id;
            const n = numero(g.id);
            return (
              <SideNavItem
                key={g.id}
                label={g.label}
                href={g.href}
                icon={g.icona}
                isSelected={dentro}
                endContent={n ? <Badge variant={g.id === 'oggi' ? 'warning' : 'neutral'} label={String(n)} /> : undefined}
                /* Le viste si aprono solo dove sei: il menu resta di tre righe
                   finche' non serve la quarta. */
                collapsible={g.viste.length ? { defaultIsCollapsed: !dentro } : false}
              >
                {g.viste.map((v) => (
                  <SideNavItem key={v.href} label={v.label} href={v.href} isSelected={attiva === v.href} />
                ))}
              </SideNavItem>
            );
          })}

          {/* Sotto la riga: non è il lavoro di oggi, è quando qualcosa non
              torna. Le spie senza numero apposta — contarle vuol dire far
              girare tutte le loro query a ogni pagina. */}
          <SideNavItem label="Spie" href="/spie" icon={Siren} isSelected={attiva === '/spie'} />
          <SideNavItem
            label="Manuale"
            icon={BookOpen}
            onClick={() => window.open(MANUALE, '_blank', 'noopener,noreferrer')}
          />
        </SideNav>
      }
    >
      {children}
    </AppShell>
  );
}
