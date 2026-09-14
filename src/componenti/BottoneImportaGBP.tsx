'use client';

import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { useRouter } from 'next/navigation';

export function BottoneImportaGBP() {
  const [inCorso, setInCorso] = useState(false);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const router = useRouter();

  async function importa() {
    setInCorso(true);
    setMessaggio(null);
    try {
      const risp = await fetch('/api/google/importa', { method: 'POST' });
      const dati = await risp.json();
      if (!risp.ok || !dati.ok) {
        throw new Error(dati.errore || 'Errore durante l’importazione');
      }
      setMessaggio(
        `Sincronizzati ${dati.totale} clienti da Google (${dati.importati} nuovi, ${dati.giaEsistevano} già esistenti).`
      );
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessaggio(`Fallito: ${msg}`);
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <Button
        label={inCorso ? 'Sincronizzazione da Google in corso...' : '🔄 Sincronizza da Google (GBP)'}
        variant="primary"
        size="sm"
        isDisabled={inCorso}
        onClick={importa}
      />
      {messaggio && (
        <span style={{ fontSize: '13px', color: 'var(--color-text-secondary, #94a3b8)' }}>
          {messaggio}
        </span>
      )}
    </div>
  );
}
