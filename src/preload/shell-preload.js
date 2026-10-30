'use strict';

// Le pont entre l'interface de LFV Cockpit et le processus principal.
// Il n'expose que des actions précises : jamais ipcRenderer en entier.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cockpit', {
  etat: () => ipcRenderer.invoke('etat'),
  afficher: (cible, zones) => ipcRenderer.invoke('afficher', cible, zones),
  zones: (zones) => ipcRenderer.send('zones', zones),
  naviguer: (action) => ipcRenderer.invoke('naviguer', action),
  ouvrirExterne: () => ipcRenderer.invoke('ouvrir-externe'),
  copierUrl: () => ipcRenderer.invoke('copier-url'),
  rechargerMaintenant: (env) => ipcRenderer.invoke('recharger-maintenant', env),
  comparerChemin: (chemin) => ipcRenderer.invoke('comparer-chemin', chemin),
  deploiement: (confirme, zones) => ipcRenderer.invoke('deploiement', confirme, zones),
  fermerAvis: () => ipcRenderer.invoke('fermer-avis'),
  reglages: (changements) => ipcRenderer.invoke('reglages', changements),
  effacerSession: (env) => ipcRenderer.invoke('effacer-session', env),
  verifierMaintenant: () => ipcRenderer.invoke('verifier-maintenant'),
  surEtat: (rappel) => ipcRenderer.on('etat', (_e, etat) => rappel(etat)),
  surAller: (rappel) => ipcRenderer.on('aller', (_e, cible) => rappel(cible)),
});
