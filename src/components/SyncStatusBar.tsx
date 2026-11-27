import { useEffect, useState } from 'react';
import { outbox, useOutbox } from '../api/outbox';

/** Mostra sem barulho o que ainda está sincronizando e avisa, com a causa, o que o servidor recusou. */
export function SyncStatusBar() {
  const { ops } = useOutbox();
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  const waiting = ops.filter((op) => op.state !== 'failed').length;
  const failed = ops.filter((op) => op.state === 'failed');
  if (online && !waiting && !failed.length) return null;

  return (
    <div className="mb-4 space-y-2 no-print">
      {(!online || waiting > 0) && (
        <p role="status" aria-live="polite" className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
          <span>
            {!online ? 'Sem conexão. ' : ''}
            {waiting > 0 ? `${waiting} ${waiting === 1 ? 'alteração aguardando' : 'alterações aguardando'} sincronização. Você pode continuar trabalhando.` : 'Os dados exibidos são os últimos salvos neste aparelho.'}
          </span>
          {online && waiting > 0 && <button type="button" onClick={outbox.retryNow} className="shrink-0 font-semibold underline cursor-pointer">Tentar agora</button>}
        </p>
      )}
      {failed.map((op) => (
        <div key={op.id} role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-900">
          <span><strong className="font-semibold">{op.label} não foi concluído.</strong> {op.error}</span>
          <button type="button" onClick={() => outbox.dismiss(op.id)} className="shrink-0 font-semibold underline cursor-pointer">Entendi</button>
        </div>
      ))}
    </div>
  );
}
