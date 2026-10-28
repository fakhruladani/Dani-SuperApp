import './lib/i18n.js';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.jsx';
import Quick from './pages/Quick.jsx';
import Widget from './pages/Widget.jsx';
import Sticky from './pages/Sticky.jsx';
import Print from './pages/Print.jsx';
import { api, on } from './lib/api.js';

const route = location.hash.replace(/^#/, '');
const applyTheme = (t) => document.documentElement.classList.toggle('dark', !!t?.dark);
if (!route.startsWith('/print/')) { api('theme:get').then(applyTheme); on('theme:changed', applyTheme); }

const Root = route === '/quick' ? Quick : route === '/widget' ? Widget : route.startsWith('/sticky/') ? Sticky : route.startsWith('/print/') ? Print : App;
createRoot(document.getElementById('root')).render(<Root />);
