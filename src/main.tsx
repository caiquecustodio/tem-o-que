import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { PlatformAdminView } from './components/PlatformAdminView.tsx';
import { PwaInstallPrompt } from './components/PwaInstallPrompt.tsx';
import './index.css';

const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const isPlatformRoot = !isLocalHost && (window.location.pathname === '/' || window.location.pathname === '/admin');
const storeSlug = window.location.pathname.match(/^\/s\/([a-z0-9-]+)/)?.[1];
const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
if (manifest && storeSlug) manifest.href = `/s/${storeSlug}/manifest.webmanifest`;
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined); }, { once: true });
}

createRoot(document.getElementById('root')!).render(<>{isPlatformRoot ? <PlatformAdminView /> : <App />}<PwaInstallPrompt /></>);
