'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { lireDetail, resumeDetail, chargerDetail } = require('../src/main/details');

const REPONSE = {
  sha: 'A71C04E9F2A71C04E9F2A71C04E9F2A71C04E9F2',
  deployed_at: '2026-10-30T19:30:02Z',
  precedente: '6480fd6',
  changements: [
    { pr: 641, titre: '  Radar : carte   au choix ', resume: 'Chaque visiteur choisit.', lignes: ['Choix de la carte', 42, ''], liens: ['/radar', '/admin/radar-simu', '//evil.example', 'https://evil.example/', 'javascript:alert(1)', '/a"b'], liens_deduits: false },
    { pr: 'pas un nombre', titre: null, lignes: 'pas une liste', liens: null },
  ],
  autres: ['Journal : témoin', 12],
  indisponible: null,
};

test('le détail reçu du BO est revalidé : textes nettoyés, seuls les chemins sûrs restent', () => {
  const d = lireDetail(REPONSE);
  assert.equal(d.sha, 'a71c04e9f2a71c04e9f2a71c04e9f2a71c04e9f2');
  assert.equal(d.precedente, '6480fd6');
  assert.deepEqual(d.changements[0], {
    pr: 641,
    titre: 'Radar : carte au choix',
    resume: 'Chaque visiteur choisit.',
    lignes: ['Choix de la carte'],
    liens: ['/radar', '/admin/radar-simu'],
    liensDeduits: false,
  });
  assert.deepEqual(d.changements[1], { pr: null, titre: 'Changement sans titre', resume: null, lignes: [], liens: [], liensDeduits: false });
  assert.deepEqual(d.autres, ['Journal : témoin']);
  assert.equal(lireDetail({ sha: 'pas-un-sha' }), null);
  assert.equal(lireDetail(null), null);
  assert.equal(lireDetail({ sha: 'abc1234', changements: null }).changements, null);
});

test('le résumé d’une version tient en une ligne', () => {
  assert.equal(resumeDetail(lireDetail(REPONSE)), 'Radar : carte au choix (+1)');
  assert.equal(resumeDetail({ changements: [] }), null);
  assert.equal(resumeDetail(null), null);
});

function fauxFetch(status, corps) {
  const appels = [];
  const f = async (url, init) => {
    appels.push({ url, init });
    return { status, ok: status >= 200 && status < 300, json: async () => corps };
  };
  f.appels = appels;
  return f;
}

test('le détail est lu dans le BO, avec la session, sans suivre une redirection', async () => {
  const f = fauxFetch(200, REPONSE);
  const r = await chargerDetail(f, 'https://lesfousvolants-recette.lesfousvolants.fr');
  assert.equal(r.statut, 'ok');
  assert.equal(r.detail.changements.length, 2);
  assert.equal(f.appels[0].url, 'https://lesfousvolants-recette.lesfousvolants.fr/admin/cockpit/version');
  assert.equal(f.appels[0].init.redirect, 'manual');
  assert.equal(f.appels[0].init.credentials, 'include');
  assert.equal(f.appels[0].init.headers.Accept, 'application/json');
});

test('session expirée, droit manquant ou panne : un statut clair, jamais une exception', async () => {
  assert.equal((await chargerDetail(fauxFetch(401, {}), 'https://x')).statut, 'connexion');
  assert.equal((await chargerDetail(fauxFetch(302, {}), 'https://x')).statut, 'connexion');
  assert.equal((await chargerDetail(fauxFetch(403, {}), 'https://x')).statut, 'interdit');
  assert.equal((await chargerDetail(fauxFetch(500, {}), 'https://x')).statut, 'erreur');
  assert.equal((await chargerDetail(fauxFetch(200, { pas: 'un détail' }), 'https://x')).statut, 'erreur');
  assert.equal((await chargerDetail(async () => { throw new Error('réseau'); }, 'https://x')).statut, 'erreur');
});
