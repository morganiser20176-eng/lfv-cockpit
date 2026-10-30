'use strict';

const path = require('node:path');
const { app, BrowserWindow, ipcMain, Notification, clipboard, net, shell } = require('electron');
const { lireOrigines, construireEnvironnements, construireDestinations, estOuvrableEnExterne } = require('./environments');
const { Store } = require('./store');
const { GuetteurDeVersions } = require('./updates');
const { GestionnaireDeVues } = require('./views');

const RACINE = path.join(__dirname, '..');
const environnements = construireEnvironnements(lireOrigines());
const destinations = construireDestinations(environnements);

let fenetre = null;
let store = null;
let vues = null;
let guetteur = null;
// Ce que l'interface affiche : 'accueil', 'reglages', 'comparer' ou un id de destination.
let affichage = 'accueil';
let confirmation = null;
let avis = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!fenetre) return;
    if (fenetre.isMinimized()) fenetre.restore();
    fenetre.focus();
  });
  app.whenReady().then(demarrer);
  app.on('window-all-closed', () => app.quit());
}

function demarrer() {
  app.setAppUserModelId('fr.lesfousvolants.cockpit');
  store = new Store(app.getPath('userData'));

  fenetre = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#080c1a',
    title: 'LFV Cockpit',
    icon: path.join(RACINE, 'renderer', 'assets', 'images', 'icone.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#05080f', symbolColor: '#cfd3dc', height: 40 },
    webPreferences: {
      preload: path.join(RACINE, 'preload', 'shell-preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  fenetre.once('ready-to-show', () => fenetre.show());
  fenetre.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  fenetre.webContents.on('will-navigate', (evt) => evt.preventDefault());
  fenetre.webContents.on('before-input-event', (evt, input) => raccourci(evt, input));
  fenetre.loadFile(path.join(RACINE, 'renderer', 'index.html'));

  vues = new GestionnaireDeVues({
    fenetre,
    environnements,
    destinations,
    reglages: () => store.reglages,
  });
  vues.on('change', () => pousserEtat());
  vues.on('touche', raccourci);
  vues.on('confirmer-deploiement', (demande) => {
    confirmation = demande;
    vues.afficher([], null);
    pousserEtat();
  });
  vues.on('site-rafraichi', ({ destination }) => {
    afficherAvis({ ton: 'info', texte: 'Le site a été rechargé pour montrer vos dernières modifications du BO.', destination });
  });
  vues.on('erreur-chargement', ({ destination, description }) => {
    afficherAvis({ ton: 'erreur', texte: `Page injoignable (${description}). Vérifiez la connexion internet puis rechargez.`, destination });
  });

  guetteur = new GuetteurDeVersions({
    environnements,
    versionConnue: (env) => store.version(env),
    lireJson: async (url) => {
      const reponse = await net.fetch(url, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
      if (!reponse.ok) throw new Error(`HTTP ${reponse.status}`);
      return reponse.json();
    },
  });
  guetteur.on('version', surNouvelleVersion);
  guetteur.on('etat', () => pousserEtat());
  guetteur.demarrer(store.reglages.intervalleVerificationSecondes);

  brancherIpc();
}

function surNouvelleVersion({ env, version, precedente, verdict }) {
  store.memoriserVersion(env, version);
  if (verdict === 'premiere') return;
  const etiquette = environnements[env].etiquette;
  const court = version.sha.slice(0, 7);
  store.ajouterAuJournal({ env, evenement: `Nouvelle version ${court}`, statut: 'Pages rechargées', precedente: precedente && precedente.sha });
  if (store.reglages.rechargerApresDeploiement) vues.nouvelleVersion(env);
  if (store.reglages.notificationsWindows && Notification.isSupported()) {
    new Notification({ title: `${etiquette} · nouvelle version en ligne`, body: `Version ${court}. LFV Cockpit a rechargé les pages.`, silent: true }).show();
  }
  afficherAvis({ ton: 'maj', texte: `Nouvelle version déployée sur la ${environnements[env].libelle.toLowerCase()} (${court}). Pages rechargées automatiquement.`, env });
  pousserEtat();
}

function afficherAvis(nouvelAvis) {
  avis = { ...nouvelAvis, id: Date.now() };
  pousserEtat();
}

function destinationAffichee() {
  return destinations[affichage] ? affichage : null;
}

function raccourci(evt, input) {
  if (input.type !== 'keyDown' || !input.control || input.alt || input.meta) return;
  const parTouche = { 1: 'prod-site', 2: 'prod-bo', 3: 'rec-site', 4: 'rec-bo', 5: 'comparer', 0: 'accueil' };
  const cible = parTouche[input.key];
  if (cible) {
    evt.preventDefault();
    fenetre.webContents.send('aller', cible);
    return;
  }
  const actuelle = destinationAffichee();
  if (actuelle && (input.key === 'r' || input.key === 'F5')) {
    evt.preventDefault();
    vues.naviguer(actuelle, 'recharger');
  }
}

function etatComplet() {
  return {
    affichage,
    environnements,
    destinations,
    vues: vues.etat(),
    guetteur: guetteur.etat,
    reglages: store.reglages,
    journal: store.journal,
    confirmation,
    avis,
    version: app.getVersion(),
  };
}

function pousserEtat() {
  if (fenetre && !fenetre.isDestroyed()) fenetre.webContents.send('etat', etatComplet());
}

function brancherIpc() {
  ipcMain.handle('etat', () => etatComplet());

  ipcMain.handle('afficher', (_e, cible, zones) => {
    affichage = cible;
    confirmation = null;
    if (avis && avis.destination && avis.destination !== cible) avis = null;
    if (destinations[cible]) vues.afficher([cible], zones);
    else if (cible === 'comparer') vues.afficher(['cmp-prod', 'cmp-rec'], zones);
    else vues.afficher([], null);
    pousserEtat();
  });

  ipcMain.on('zones', (_e, zones) => vues.placer(zones));

  ipcMain.handle('naviguer', (_e, action) => {
    const actuelle = destinationAffichee();
    if (actuelle) vues.naviguer(actuelle, action);
  });

  ipcMain.handle('ouvrir-externe', () => {
    const actuelle = destinationAffichee();
    if (!actuelle) return;
    const url = vues.etat().destinations[actuelle].url;
    if (estOuvrableEnExterne(url)) shell.openExternal(url);
  });

  ipcMain.handle('copier-url', () => {
    const actuelle = destinationAffichee();
    if (actuelle) clipboard.writeText(vues.etat().destinations[actuelle].url);
  });

  ipcMain.handle('recharger-maintenant', (_e, env) => {
    if (environnements[env]) vues.rechargerMaintenant(env);
  });

  ipcMain.handle('comparer-chemin', (_e, chemin) => vues.comparerChemin(chemin));

  ipcMain.handle('deploiement', (_e, confirme, zones) => {
    const demande = confirmation;
    confirmation = null;
    if (!demande) return;
    if (confirme) vues.confirmerDeploiement(demande.destination, demande.url);
    if (affichage === demande.destination) vues.afficher([demande.destination], zones);
    pousserEtat();
  });

  ipcMain.handle('fermer-avis', () => {
    avis = null;
    pousserEtat();
  });

  ipcMain.handle('reglages', (_e, changements) => {
    const avant = store.reglages.intervalleVerificationSecondes;
    const apres = store.modifierReglages(changements || {});
    if (apres.intervalleVerificationSecondes !== avant) guetteur.demarrer(apres.intervalleVerificationSecondes);
    pousserEtat();
    return apres;
  });

  ipcMain.handle('effacer-session', async (_e, env) => {
    if (!environnements[env]) return;
    await vues.effacerSession(env);
    store.ajouterAuJournal({ env, evenement: 'Session effacée de ce PC', statut: 'Passkey requise' });
    pousserEtat();
  });

  ipcMain.handle('verifier-maintenant', () => guetteur.verifierTout());
}
