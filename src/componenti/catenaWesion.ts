/**
 * La catena di STATO.md §7, in un posto solo.
 *
 * fatto → voce → bozza → approvazione → pubblicazione: e' il concetto che
 * spiega cos'e' Wesion in una riga. Vive qui perche' lo mostrano due schermi
 * diversi — il login (`ModuloIngresso`, verticale con la descrizione) e "Da
 * fare" (striscia orizzontale, solo etichetta) — e un elenco scritto due
 * volte diverge la prima volta che qualcuno lo tocca da una sola parte.
 */
import { FileText, Mic, FilePenLine, CheckCircle2, Send, type LucideIcon } from 'lucide-react';

export interface TappaCatena {
  icona: LucideIcon;
  titolo: string;
  nota: string;
}

export const TAPPE_CATENA: TappaCatena[] = [
  { icona: FileText, titolo: 'Fatto', nota: 'una foto, un audit, un piano' },
  { icona: Mic, titolo: 'Voce', nota: 'come parla quell’azienda' },
  { icona: FilePenLine, titolo: 'Bozza', nota: 'il testo pronto da leggere' },
  { icona: CheckCircle2, titolo: 'Approvazione', nota: 'sempre una persona' },
  { icona: Send, titolo: 'Pubblicazione', nota: 'sito, Google, WhatsApp' },
];
