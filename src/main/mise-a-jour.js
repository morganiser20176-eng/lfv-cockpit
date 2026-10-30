'use strict';

// Mise à jour automatique de LFV Cockpit lui-même (electron-updater).
//
// Les versions sont publiées en « Releases » GitHub par le workflow
// installeur-windows.yml. Le logiciel vérifie au démarrage puis toutes les
// 4 heures, télécharge en arrière-plan et propose de redémarrer. S'il n'est
// pas redémarré, la mise à jour s'installe à la fermeture.

const { EventEmitter } = require('node:events');
const { notesEnTexte } = require('./changelog');

const INTERVALLE_MS = 4 * 60 * 60 * 1000;

class MiseAJour extends EventEmitter {
  /**
   * @param {object} options
   * @param {import('electron-updater').AppUpdater|EventEmitter} options.updater
   * @param {boolean} options.active  false en développement (logiciel non installé)
   */
  constructor({ updater, active }) {
    super();
    this.updater = updater;
    this.active = active;
    this.minuteur = null;
    this.etat = active ? { statut: 'attente' } : { statut: 'inactif' };
    if (!active) return;

    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.allowPrerelease = false;
    updater.on('checking-for-update', () => this.changer({ statut: 'verification' }));
    updater.on('update-not-available', () => this.changer({ statut: 'a-jour', verifieLe: new Date().toISOString() }));
    updater.on('update-available', (info) => this.changer({ statut: 'telechargement', version: info.version, notes: notesEnTexte(info.releaseNotes), pourcent: 0 }));
    updater.on('download-progress', (p) => {
      if (this.etat.statut === 'telechargement') this.changer({ ...this.etat, pourcent: Math.round(p.percent || 0) });
    });
    updater.on('update-downloaded', (info) => {
      this.changer({ statut: 'pret', version: info.version, notes: notesEnTexte(info.releaseNotes) });
      this.emit('pret', this.etat);
    });
    updater.on('error', (erreur) => {
      // Une mise à jour déjà prête reste prête, même si une vérification suivante échoue.
      if (this.etat.statut === 'pret') return;
      this.changer({ statut: 'erreur', message: messageErreur(erreur), verifieLe: new Date().toISOString() });
    });
  }

  changer(etat) {
    this.etat = etat;
    this.emit('etat', etat);
  }

  demarrer() {
    if (!this.active) return;
    this.arreter();
    this.verifier();
    this.minuteur = setInterval(() => this.verifier(), INTERVALLE_MS);
  }

  arreter() {
    if (this.minuteur) clearInterval(this.minuteur);
    this.minuteur = null;
  }

  async verifier() {
    if (!this.active || this.etat.statut === 'pret' || this.etat.statut === 'telechargement') return;
    try {
      await this.updater.checkForUpdates();
    } catch (erreur) {
      this.changer({ statut: 'erreur', message: messageErreur(erreur), verifieLe: new Date().toISOString() });
    }
  }

  installerMaintenant() {
    if (this.etat.statut !== 'pret') return false;
    // Installation silencieuse puis relance automatique du logiciel.
    this.updater.quitAndInstall(true, true);
    return true;
  }
}

function messageErreur(erreur) {
  const texte = String((erreur && erreur.message) || erreur || '');
  if (/ENOTFOUND|ETIMEDOUT|ECONNRESET|ERR_INTERNET_DISCONNECTED|net::/i.test(texte)) return 'Pas de connexion internet : nouvel essai plus tard.';
  if (/404|Not Found/i.test(texte)) return 'Aucune version publiée trouvée pour le moment.';
  return 'La recherche de mise à jour a échoué : nouvel essai plus tard.';
}

module.exports = { MiseAJour, messageErreur, INTERVALLE_MS };
