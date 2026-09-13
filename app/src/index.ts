import './styles/jetons.css';
import './styles/base.css';
import { demarrerPage } from './page';

const racine = document.getElementById('app')!;

void demarrerPage(racine, location.href);
