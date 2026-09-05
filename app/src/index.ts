import './styles/jetons.css';
import './styles/base.css';
import { PIECES } from './pieces';
import { demarrer } from './demarrage';

const racine = document.getElementById('app')!;
const nomPiece = racine.dataset.piece as keyof typeof PIECES;
const piece = PIECES[nomPiece];

void demarrer(racine, piece);
