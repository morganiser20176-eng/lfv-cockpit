'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store, REGLAGES_PAR_DEFAUT, normaliserReglages } = require('../src/main/store');

function dossierTemporaire() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lfv-cockpit-'));
}

test('premier lancement : réglages par défaut', () => {
  const s = new Store(dossierTemporaire());
  assert.deepEqual(s.reglages, REGLAGES_PAR_DEFAUT);
  assert.deepEqual(s.journal, []);
});

test('les réglages et le journal survivent à un redémarrage', () => {
  const dossier = dossierTemporaire();
  const s = new Store(dossier);
  s.modifierReglages({ notificationsWindows: false, intervalleVerificationSecondes: 300 });
  s.memoriserVersion('prod', { sha: 'abc1234', deployeLe: null });
  s.ajouterAuJournal({ env: 'prod', evenement: 'Nouvelle version abc1234', statut: 'Pages rechargées' });
  const relu = new Store(dossier);
  assert.equal(relu.reglages.notificationsWindows, false);
  assert.equal(relu.reglages.intervalleVerificationSecondes, 300);
  assert.equal(relu.version('prod').sha, 'abc1234');
  assert.equal(relu.journal[0].evenement, 'Nouvelle version abc1234');
});

test('une valeur invalide est ignorée', () => {
  const r = normaliserReglages({ intervalleVerificationSecondes: 1, notificationsWindows: 'oui', inconnu: true });
  assert.equal(r.intervalleVerificationSecondes, 60);
  assert.equal(r.notificationsWindows, true);
  assert.equal('inconnu' in r, false);
});

test('un fichier abîmé ne bloque pas le démarrage', () => {
  const dossier = dossierTemporaire();
  fs.writeFileSync(path.join(dossier, 'lfv-cockpit.json'), '{ pas du json');
  assert.deepEqual(new Store(dossier).reglages, REGLAGES_PAR_DEFAUT);
});

test('le journal est limité à 50 entrées', () => {
  const s = new Store(dossierTemporaire());
  for (let i = 0; i < 60; i++) s.ajouterAuJournal({ env: 'prod', evenement: `e${i}`, statut: '' });
  assert.equal(s.journal.length, 50);
  assert.equal(s.journal[0].evenement, 'e59');
});
