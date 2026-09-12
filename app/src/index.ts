import './styles/jetons.css';
import './styles/base.css';
import { ECRANS } from './ecran';
import { demarrer } from './demarrage';

const racine = document.getElementById('app')!;
const nomPiece = racine.dataset.piece as keyof typeof ECRANS;
const piece = ECRANS[nomPiece];

void demarrer(racine, piece);
