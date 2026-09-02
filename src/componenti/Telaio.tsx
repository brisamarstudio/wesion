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
 */
import { useRouter } from 'next/navigation';
import { AppShell } from '@astryxdesign/core/AppShell';
import { SideNav, SideNavHeading, SideNavItem } from '@astryxdesign/core/SideNav';
import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { Megaphone, Building2, Users, CalendarDays, LayoutGrid, PenLine, Siren, TrendingUp, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Le icone servono a ritrovare la voce senza rileggerla, quindi ognuna dice il
 * MESTIERE della pagina e non la sua categoria: il megafono e' il lavoro che
 * esce (campagne), la penna e' il lavoro che aspetta un giudizio (bozze), la
 * sirena e' l'unica che chiede di essere guardata subito (spie).
 *
 * Sono componenti Lucide passati diretti: `icon` di SideNavItem accetta un nome
 * semantico OPPURE un componente SVG (`astryx docs icons`). I nomi semantici li
 * mappa gia' il tema, ma nessuno di quei 26 nomi vuol dire "piano editoriale".
 */
const VOCI = [
  { href: '/campagne', label: 'Campagne', icona: Megaphone },
  { href: '/aziende', label: 'Aziende', icona: Building2 },
  // Non lo stesso posto di "Aziende": lì il pannello parla a chi deve ancora
  // chiamare (gancio, urgenza). Qui c'è chi è già dentro — vedi la nota in
  // cima a app/clienti/page.tsx.
  { href: '/clienti', label: 'Clienti', icona: Users },
  { href: '/calendario', label: 'Calendario', icona: CalendarDays },
  { href: '/piano', label: 'Piano', icona: LayoutGrid },
  { href: '/bozze', label: 'Bozze', icona: PenLine },
  { href: '/spie', label: 'Spie', icona: Siren },
  { href: '/insights', label: 'Da fare', icona: TrendingUp },
];

export function Telaio({
  children,
  attiva,
}: {
  children: ReactNode;
  attiva: string;
}) {
  const router = useRouter();

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
          header={<SideNavHeading heading="Wesion" subheading="MyWebby" headingHref="/aziende" />}
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
          {VOCI.map((v) => (
            <SideNavItem
              key={v.href}
              label={v.label}
              href={v.href}
              icon={v.icona}
              isSelected={attiva === v.href}
            />
          ))}
        </SideNav>
      }
    >
      {children}
    </AppShell>
  );
}
