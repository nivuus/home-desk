import './styles/jetons.css';
import './styles/base.css';
import './styles/media.css';
import './styles/pantry.css';
import './styles/vacuum.css';
import './styles/animation.css';
import { startPage } from './page';

const racine = document.getElementById('app')!;

void startPage(racine, location.href);
