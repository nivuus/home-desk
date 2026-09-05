import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import css from 'rollup-plugin-import-css';

export default {
  input: 'src/index.ts',
  output: {
    // 2026-08-28 : la configuration de Home Assistant a été déplacée de
    // /opt/nivuus/HomeAssistant/config vers /opt/nivuus/home-manager/config (c'est ce dossier-là
    // que docker-compose monte sur /config, cf. docker-compose.yml). L'ancien chemin n'existe
    // plus du tout : un build qui y écrivait recréait un dossier orphelin que personne ne sert,
    // et les tablettes continuaient d'afficher l'ancien bundle sans le moindre message d'erreur.
    dir: '/opt/nivuus/home-manager/config/www/wallpanel',
    entryFileNames: 'wallpanel.js',
    format: 'iife', name: 'Wallpanel', sourcemap: false,
  },
  plugins: [
    resolve(), typescript(),
    css({ output: 'wallpanel.css' }),
    terser({ format: { comments: false } }),
  ],
};
