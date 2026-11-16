import './styles/jetons.css';
import './styles/base.css';
import './styles/cards.css';
import './styles/media.css';
import './styles/pantry.css';
import './styles/vacuum.css';
import './styles/printer.css';
import './styles/reminders.css';
import './styles/animation.css';
import { startPage } from './page';
import { setLanguage } from './i18n';

// Until Home Assistant reports the user's language (`boot/language.ts`, once authenticated), the
// browser's is the best guess: the one the waiting screens speak. The legacy `data-piece` pages
// never ask Home Assistant and keep it.
setLanguage(navigator.language);

const racine = document.getElementById('app')!;

void startPage(racine, location.href);
