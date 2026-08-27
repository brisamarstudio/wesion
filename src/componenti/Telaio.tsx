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
  { href: '/bozze', label: 'Bozze' },
  { href: '/spie', label: 'Spie' },
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
          resizable={{ defaultWidth: 256, minWidth: 200, maxWidth: 360, autoSaveId: 'wesion-nav' }}
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
