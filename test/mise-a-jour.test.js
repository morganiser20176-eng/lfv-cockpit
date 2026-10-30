'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { MiseAJour, messageErreur } = require('../src/main/mise-a-jour');

class FauxUpdater extends EventEmitter {
  constructor() {
    super();
    this.verifications = 0;
    this.installe = null;
  }

  async checkForUpdates() {
    this.verifications++;
  }

  quitAndInstall(silencieux, relancer) {
    this.installe = { silencieux, relancer };
  }
}

test('en développement, la mise à jour reste inactive', async () => {
  const maj = new MiseAJour({ updater: null, active: false });
  assert.equal(maj.etat.statut, 'inactif');
  await maj.verifier();
  assert.equal(maj.installerMaintenant(), false);
});

test('cycle complet : vérification, téléchargement, prête, installation', async () => {
  const updater = new FauxUpdater();
  const maj = new MiseAJour({ updater, active: true });
  assert.equal(updater.autoDownload, true);
  assert.equal(updater.autoInstallOnAppQuit, true);

  const prets = [];
  maj.on('pret', (e) => prets.push(e.version));
  await maj.verifier();
  assert.equal(updater.verifications, 1);

  updater.emit('checking-for-update');
  assert.equal(maj.etat.statut, 'verification');
  updater.emit('update-available', { version: '0.3.0', releaseNotes: '<ul><li>Nouveau</li></ul>' });
  assert.equal(maj.etat.statut, 'telechargement');
  updater.emit('download-progress', { percent: 42.6 });
  assert.equal(maj.etat.pourcent, 43);

  // Pas de nouvelle vérification pendant un téléchargement.
  await maj.verifier();
  assert.equal(updater.verifications, 1);

  updater.emit('update-downloaded', { version: '0.3.0', releaseNotes: '<ul><li>Nouveau</li></ul>' });
  assert.deepEqual(maj.etat, { statut: 'pret', version: '0.3.0', notes: ['• Nouveau'] });
  assert.deepEqual(prets, ['0.3.0']);

  // Une erreur après coup ne fait pas perdre la mise à jour prête.
  updater.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'));
  assert.equal(maj.etat.statut, 'pret');

  assert.equal(maj.installerMaintenant(), true);
  assert.deepEqual(updater.installe, { silencieux: true, relancer: true });
});

test('déjà à jour', () => {
  const updater = new FauxUpdater();
  const maj = new MiseAJour({ updater, active: true });
  updater.emit('update-not-available', { version: '0.2.0' });
  assert.equal(maj.etat.statut, 'a-jour');
  assert.ok(maj.etat.verifieLe);
});

test('les erreurs sont expliquées simplement', () => {
  assert.match(messageErreur(new Error('getaddrinfo ENOTFOUND github.com')), /connexion internet/);
  assert.match(messageErreur(new Error('HttpError: 404 Not Found')), /Aucune version publiée/);
  assert.match(messageErreur(new Error('autre chose')), /nouvel essai plus tard/);
});

test('une vérification qui échoue passe en erreur sans planter', async () => {
  const updater = new FauxUpdater();
  updater.checkForUpdates = async () => { throw new Error('getaddrinfo ENOTFOUND github.com'); };
  const maj = new MiseAJour({ updater, active: true });
  await maj.verifier();
  assert.equal(maj.etat.statut, 'erreur');
});
