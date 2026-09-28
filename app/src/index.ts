import './styles/jetons.css';
import './styles/base.css';
import './styles/pantry.css';
import { startPage } from './page';

const racine = document.getElementById('app')!;

void startPage(racine, location.href);
