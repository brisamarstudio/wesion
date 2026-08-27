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
import { AppShell } from '@astryxdesign/core/AppShell';
import { SideNav, SideNavHeading, SideNavItem } from '@astryxdesign/core/SideNav';
import type { ReactNode } from 'react';

const VOCI = [
  { href: '/campagne', label: 'Campagne' },
  { href: '/aziende', label: 'Aziende' },
  { href: '/calendario', label: 'Calendario' },
  { href: '/piano', label: 'Piano' },
  { href: '/bozze', label: 'Bozze' },
  { href: '/spie', label: 'Spie' },
  { href: '/insights', label: 'Insights' },
];

export function Telaio({
  children,
  attiva,
}: {
  children: ReactNode;
  attiva: string;
}) {
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
        >
          {VOCI.map((v) => (
            <SideNavItem
              key={v.href}
              label={v.label}
              href={v.href}
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
