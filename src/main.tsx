import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';
import { applyTheme, getInitialTheme } from './utils/theme.ts';

applyTheme(getInitialTheme());
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(<App />);
