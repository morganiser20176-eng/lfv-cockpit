'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ORIGINES_PAR_DEFAUT,
  lireOrigines,
  construireEnvironnements,
  construireDestinations,
  estDansEnvironnement,
  estOuvrableEnExterne,
  estPageDeSaisie,
  estPageDeConnexion,
  estRequeteDeModification,
  cheminRelatif,
} = require('../src/main/environments');

const envs = construireEnvironnements(ORIGINES_PAR_DEFAUT);

test('les vraies adresses sont utilisées par défaut', () => {
  assert.deepEqual(lireOrigines({}), ORIGINES_PAR_DEFAUT);
  const dests = construireDestinations(envs);
  assert.equal(dests['prod-bo'].accueil, 'https://lesfousvolants.fr/admin');
  assert.equal(dests['rec-site'].accueil, 'https://lesfousvolants-recette.lesfousvolants.fr/');
});

test('prod et recette ne partagent jamais leur session', () => {
  assert.notEqual(envs.prod.partition, envs.recette.partition);
  assert.match(envs.prod.partition, /^persist:/);
});

test('une adresse reste dans la vue seulement sur le même environnement', () => {
  assert.equal(estDansEnvironnement('https://lesfousvolants.fr/admin/tours', envs.prod), true);
  assert.equal(estDansEnvironnement('https://lesfousvolants-recette.lesfousvolants.fr/admin', envs.prod), false);
  assert.equal(estDansEnvironnement('https://lesfousvolants.fr.attaquant.example/', envs.prod), false);
  assert.equal(estDansEnvironnement('http://lesfousvolants.fr/', envs.prod), false);
  assert.equal(estDansEnvironnement('pas une url', envs.prod), false);
});

test('seuls http et https partent vers le navigateur', () => {
  assert.equal(estOuvrableEnExterne('https://www.youtube.com/watch?v=x'), true);
  assert.equal(estOuvrableEnExterne('file:///C:/Windows/system32/calc.exe'), false);
  assert.equal(estOuvrableEnExterne('javascript:alert(1)'), false);
  assert.equal(estOuvrableEnExterne('ms-settings:'), false);
});

test('les pages de saisie du BO sont reconnues', () => {
  assert.equal(estPageDeSaisie('https://lesfousvolants.fr/admin/group-flights/12/edit'), true);
  assert.equal(estPageDeSaisie('https://lesfousvolants.fr/admin/tours/create'), true);
  assert.equal(estPageDeSaisie('https://lesfousvolants.fr/admin/tours'), false);
  assert.equal(estPageDeSaisie('https://lesfousvolants.fr/admin/editeur-de-pages'), false);
});

test('la page de connexion du BO est reconnue', () => {
  assert.equal(estPageDeConnexion('https://lesfousvolants.fr/admin/login'), true);
  assert.equal(estPageDeConnexion('https://lesfousvolants.fr/admin'), false);
});

test('seules les requêtes qui écrivent sur le même environnement comptent comme modification', () => {
  const o = envs.prod.origine;
  assert.equal(estRequeteDeModification('POST', `${o}/livewire/update`, envs.prod), true);
  assert.equal(estRequeteDeModification('GET', `${o}/admin/tours`, envs.prod), false);
  assert.equal(estRequeteDeModification('POST', `${o}/admin/passkey/assertion/verify`, envs.prod), false);
  assert.equal(estRequeteDeModification('POST', 'https://www.google-analytics.com/collect', envs.prod), false);
});

test('le chemin relatif garde la requête et l’ancre', () => {
  assert.equal(cheminRelatif('https://lesfousvolants.fr/tours?page=2#etape'), '/tours?page=2#etape');
});
