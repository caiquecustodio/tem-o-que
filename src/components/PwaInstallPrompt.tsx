import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }> };

export function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setIsIos(ios);
    setIsInstalled(standalone);
    const onPrompt = (event: Event) => { event.preventDefault(); setInstallEvent(event as InstallPromptEvent); };
    const onInstalled = () => { setIsInstalled(true); setInstallEvent(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  if (isInstalled || (!isIos && !installEvent)) return null;
  const install = async () => {
    if (isIos) { setShowIosHelp(true); return; }
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  return <>
    <button onClick={() => void install()} className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-3 z-40 inline-flex min-h-11 items-center gap-2 rounded-full bg-emerald-800 px-4 text-sm font-semibold text-white shadow-lg lg:bottom-5" aria-label="Instalar Tem o quê? no dispositivo"><Download className="h-4 w-4"/>Instalar app</button>
    {showIosHelp && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 p-3 sm:items-center" onClick={() => setShowIosHelp(false)}><section role="dialog" aria-modal="true" aria-labelledby="ios-install-title" className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl" onClick={event => event.stopPropagation()}><header className="flex items-start justify-between gap-3"><div><h2 id="ios-install-title" className="text-lg font-semibold">Adicionar ao iPhone</h2><p className="mt-1 text-sm text-slate-600">Instale o app pela opção de compartilhamento do Safari.</p></div><button onClick={() => setShowIosHelp(false)} className="rounded-lg p-2 text-slate-500" aria-label="Fechar instruções"><X className="h-5 w-5"/></button></header><ol className="space-y-3 text-sm text-slate-700"><li className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 font-semibold">1</span><span>Toque em <Share className="inline h-4 w-4 align-text-bottom"/> Compartilhar no Safari.</span></li><li className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 font-semibold">2</span><span>Escolha <strong>Adicionar à Tela de Início</strong>.</span></li><li className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 font-semibold">3</span><span>Toque em <strong>Adicionar</strong>.</span></li></ol><p className="text-xs text-slate-500">Se esta página abriu dentro de outro app, abra o link no Safari primeiro.</p></section></div>}
  </>;
}
