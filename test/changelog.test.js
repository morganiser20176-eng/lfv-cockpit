'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { lireChangelog, sectionMarkdown, comparerVersions, notesEnTexte } = require('../src/main/changelog');

const RACINE = path.join(__dirname, '..');
const CHANGELOG = fs.readFileSync(path.join(RACINE, 'CHANGELOG.md'), 'utf8');
const { version } = JSON.parse(fs.readFileSync(path.join(RACINE, 'package.json'), 'utf8'));

const EXEMPLE = `# Nouveautés

Texte d'introduction ignoré.

## [1.2.0] – 2026-11-05

### Nouveautés

- **Gras** et \`code\` et [lien](https://exemple.fr)
- Deuxième

### Corrections

* Une correction

## [1.1.0] - 2026-11-01

### Nouveautés

- Ancienne
`;

test('le changelog est lu version par version, rubrique par rubrique', () => {
  const versions = lireChangelog(EXEMPLE);
  assert.equal(versions.length, 2);
  assert.deepEqual(versions[0], {
    version: '1.2.0',
    date: '2026-11-05',
    sections: [
      { titre: 'Nouveautés', elements: ['Gras et code et lien', 'Deuxième'] },
      { titre: 'Corrections', elements: ['Une correction'] },
    ],
  });
  assert.equal(versions[1].date, '2026-11-01');
});

test('la rubrique Markdown d’une version sert de notes GitHub', () => {
  const notes = sectionMarkdown(EXEMPLE, '1.2.0');
  assert.match(notes, /^### Nouveautés/);
  assert.match(notes, /Une correction$/);
  assert.doesNotMatch(notes, /Ancienne/);
  assert.equal(sectionMarkdown(EXEMPLE, '9.9.9'), null);
});

test('comparaison de numéros de version', () => {
  assert.ok(comparerVersions('0.2.0', '0.10.0') < 0);
  assert.ok(comparerVersions('1.0.0', '0.9.9') > 0);
  assert.equal(comparerVersions('v0.2.0', '0.2.0'), 0);
  assert.throws(() => comparerVersions('abc', '0.1.0'));
});

test('les notes reçues de GitHub (HTML) deviennent du texte brut', () => {
  const html = '<h3>Nouveautés</h3><ul><li><strong>Mise à jour</strong> automatique</li><li>Écran &laquo;Nouveautés&raquo; &amp; plus</li></ul><script>alert(1)</script>';
  const lignes = notesEnTexte(html);
  assert.deepEqual(lignes.slice(0, 3), ['Nouveautés', '• Mise à jour automatique', '• Écran &laquo;Nouveautés&raquo; & plus']);
  assert.ok(lignes.every((l) => !/[<>]/.test(l)));
  assert.deepEqual(notesEnTexte(null), []);
  assert.deepEqual(notesEnTexte([{ version: '1.0.0', note: '- Un point' }]), ['• Un point']);
});

test('la version de package.json a ses nouveautés dans CHANGELOG.md', () => {
  const versions = lireChangelog(CHANGELOG);
  assert.equal(versions[0].version, version, `CHANGELOG.md doit commencer par la rubrique ## [${version}]`);
  assert.ok(versions[0].date, 'la rubrique de la version doit être datée');
});

test('les versions du changelog vont de la plus récente à la plus ancienne, sans doublon', () => {
  const numeros = lireChangelog(CHANGELOG).map((v) => v.version);
  assert.equal(new Set(numeros).size, numeros.length);
  for (let i = 1; i < numeros.length; i++) assert.ok(comparerVersions(numeros[i - 1], numeros[i]) > 0, `${numeros[i - 1]} avant ${numeros[i]}`);
});
