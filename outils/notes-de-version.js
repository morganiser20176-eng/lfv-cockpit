'use strict';

// Écrit build/release-notes.md : la rubrique de CHANGELOG.md qui correspond
// à la version de package.json. Ces notes deviennent le texte de la version
// sur GitHub, que LFV Cockpit affiche avant de redémarrer pour se mettre à jour.
// Échoue si la version n'a pas de rubrique : pas de version sans nouveautés.

const fs = require('node:fs');
const path = require('node:path');
const { sectionMarkdown } = require('../src/main/changelog');

const racine = path.join(__dirname, '..');
const { version } = JSON.parse(fs.readFileSync(path.join(racine, 'package.json'), 'utf8'));
const notes = sectionMarkdown(fs.readFileSync(path.join(racine, 'CHANGELOG.md'), 'utf8'), version);

if (!notes) {
  console.error(`CHANGELOG.md n'a pas de rubrique « ## [${version}] » : ajoutez les nouveautés de cette version.`);
  process.exit(1);
}

fs.mkdirSync(path.join(racine, 'build'), { recursive: true });
fs.writeFileSync(path.join(racine, 'build', 'release-notes.md'), `${notes}\n`);
console.log(`Notes de la version ${version} écrites dans build/release-notes.md`);
