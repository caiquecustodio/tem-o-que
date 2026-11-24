import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { PlatformAdminView } from './components/PlatformAdminView.tsx';
import './index.css';

const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const isPlatformRoot = !isLocalHost && (window.location.pathname === '/' || window.location.pathname === '/admin');
createRoot(document.getElementById('root')!).render(isPlatformRoot ? <PlatformAdminView /> : <App />);
