'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { GuetteurDeVersions, lireVersion, comparerVersions } = require('../src/main/updates');

test('version.json est lu tel que le publie le déploiement du site', () => {
  assert.deepEqual(lireVersion({ sha: 'A71C04E9F2', deployed_at: '2026-10-28T18:05:00Z' }), { sha: 'a71c04e9f2', deployeLe: '2026-10-28T18:05:00Z' });
  assert.equal(lireVersion({ sha: '<script>' }), null);
  assert.equal(lireVersion(null), null);
});

test('comparaison des versions', () => {
  const v = { sha: 'abc1234' };
  assert.equal(comparerVersions(null, v), 'premiere');
  assert.equal(comparerVersions(v, { sha: 'abc1234' }), 'identique');
  assert.equal(comparerVersions(v, { sha: 'def5678' }), 'nouvelle');
});

function guetteurAvec(reponses, connues = {}) {
  const environnements = { prod: { id: 'prod', origine: 'https://p.example' }, recette: { id: 'recette', origine: 'https://r.example' } };
  return new GuetteurDeVersions({
    environnements,
    versionConnue: (env) => connues[env] || null,
    lireJson: async (url) => {
      const env = url.startsWith('https://p.') ? 'prod' : 'recette';
      const r = reponses[env].shift();
      if (r instanceof Error) throw r;
      return r;
    },
  });
}

test('un nouveau sha déclenche un événement, un sha identique non', async () => {
  const g = guetteurAvec({
    prod: [{ sha: 'aaaaaaa' }, { sha: 'aaaaaaa' }, { sha: 'bbbbbbb' }],
    recette: [{ sha: 'ccccccc' }, { sha: 'ccccccc' }, { sha: 'ccccccc' }],
  });
  const vus = [];
  g.on('version', (e) => vus.push(`${e.env}:${e.verdict}:${e.version.sha}`));
  await g.verifierTout();
  await g.verifierTout();
  await g.verifierTout();
  assert.deepEqual(vus, ['prod:premiere:aaaaaaa', 'recette:premiere:ccccccc', 'prod:nouvelle:bbbbbbb']);
});

test('une version connue au démarrage évite un faux « nouvelle version »', async () => {
  const g = guetteurAvec({ prod: [{ sha: 'aaaaaaa' }], recette: [{ sha: 'ddddddd' }] }, { prod: { sha: 'aaaaaaa' }, recette: { sha: 'ccccccc' } });
  const vus = [];
  g.on('version', (e) => vus.push(`${e.env}:${e.verdict}`));
  await g.verifierTout();
  assert.deepEqual(vus, ['recette:nouvelle']);
});

test('un site injoignable est signalé une seule fois, puis retrouvé', async () => {
  const g = guetteurAvec({
    prod: [new Error('réseau'), new Error('réseau'), { sha: 'aaaaaaa' }],
    recette: [{ sha: 'ccccccc' }, { sha: 'ccccccc' }, { sha: 'ccccccc' }],
  });
  let injoignable = 0;
  g.on('injoignable', () => injoignable++);
  await g.verifierTout();
  assert.equal(g.etat.prod.joignable, false);
  await g.verifierTout();
  await g.verifierTout();
  assert.equal(injoignable, 1);
  assert.equal(g.etat.prod.joignable, true);
});
