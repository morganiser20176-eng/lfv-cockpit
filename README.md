# LFV Cockpit

Logiciel Windows qui réunit dans une seule fenêtre :

- le **site public** et le **back-office** de **production** (`lesfousvolants.fr`) ;
- le **site public** et le **back-office** de **recette** (`lesfousvolants-recette.lesfousvolants.fr`).

Plus besoin de jongler entre les onglets de Chrome : un clic (ou `Ctrl+1` à `Ctrl+5`) dans le rail de gauche.

## Ce que fait le logiciel

- **Affiche les vrais sites et les vrais BO.** Rien n’est copié en local : ce que vous enregistrez dans le BO prod est en ligne sur la prod, ce que vous enregistrez dans le BO recette va sur la recette.
- **Garde prod et recette séparées.** Chaque environnement a sa propre session (cookies), chiffrée par Chromium avec votre compte Windows.
- **Se met à jour tout seul quand le site change.** À chaque déploiement, le site publie `/version.json`. LFV Cockpit le relit régulièrement (60 s par défaut) et recharge les pages quand la version change. Un BO en cours de saisie (`/create`, `/edit`) n’est jamais rechargé de force : un bandeau propose de le faire.
- **Recharge le site après un enregistrement dans le BO** du même environnement, au moment où vous y retournez.
- **Demande confirmation avant « Déploiement production ».**
- **Compare prod et recette côte à côte**, sur la même page.
- **Ouvre les liens externes** (YouTube, Discord, FSHub…) dans votre navigateur habituel.
- **Se met à jour lui-même** : les nouvelles versions se téléchargent en arrière-plan ; un bandeau montre les nouveautés et propose de redémarrer.
- **Affiche ses nouveautés** : écran « Nouveautés » (historique de toutes les versions), ouvert automatiquement après chaque mise à jour.

## Connexion au BO : passkey via Windows Hello

Le BO n’accepte que les passkeys. LFV Cockpit ne lit ni ne stocke aucune clé : il laisse Windows Hello signer la connexion, comme Chrome.

Une fois par environnement (prod, puis recette) :

1. Dans Chrome, où vous êtes déjà connecté, ouvrez le BO puis **Mon compte › Mes passkeys › Ajouter**.
2. Choisissez **Windows Hello** comme emplacement (et non le gestionnaire de mots de passe Google). Nommez-la « LFV Cockpit – ce PC ».
3. Dans LFV Cockpit, ouvrez le BO et connectez-vous avec la passkey.

Une passkey enregistrée sur votre téléphone marche aussi, via le code QR proposé par Windows.

## Installation

Télécharger `LFV-Cockpit-Setup-x.y.z.exe` depuis la [dernière version](https://github.com/morganiser20176-eng/lfv-cockpit/releases/latest) puis l’ouvrir. Ensuite, le logiciel se met à jour tout seul. Tant que l’installeur n’est pas signé par un certificat payant, Windows affiche « Windows a protégé votre ordinateur » : **Informations complémentaires › Exécuter quand même** (une seule fois).

## Développement

```bash
npm install
npm test
```

Essayer le logiciel sur deux **faux** sites locaux, sans toucher aux vrais :

```bash
node outils/faux-sites.js
```

```bash
LFV_COCKPIT_ORIGINS='{"prod":"http://127.0.0.1:8101","recette":"http://127.0.0.1:8102"}' npm start
```

Simuler un déploiement sur la fausse recette : ouvrir `http://127.0.0.1:8102/__deployer`.

Voir le bandeau de mise à jour et l’écran « Nouveautés » avec une fausse version 9.9.9 : ajouter `LFV_COCKPIT_FAUSSE_MAJ=1` devant `npm start`.

### Organisation du code

| Fichier | Rôle |
|---|---|
| `src/main/main.js` | Fenêtre, raccourcis, échanges avec l’interface |
| `src/main/environments.js` | Les adresses, les sessions et les règles de navigation |
| `src/main/views.js` | Les vues web (site / BO, prod / recette, comparaison) |
| `src/main/updates.js` | Le guetteur de déploiements (`/version.json`) |
| `src/main/store.js` | Réglages et journal des mises à jour |
| `src/main/mise-a-jour.js` | La mise à jour automatique du logiciel (electron-updater) |
| `src/main/changelog.js` | Lecture de `CHANGELOG.md` et comparaison de versions |
| `src/preload/shell-preload.js` | Le pont, limité, entre l’interface et le moteur |
| `src/renderer/` | L’interface (accueil, rail, réglages), aux couleurs du site |

### Sécurité

- Vues web isolées (`contextIsolation`, `sandbox`, aucun accès Node.js), sans script injecté.
- Une vue ne quitte jamais son environnement : toute autre adresse part dans le navigateur externe, et seulement en `http(s)`.
- Permissions du navigateur refusées par défaut (caméra, micro, notifications, géolocalisation…).
- Interface protégée par une politique de sécurité du contenu stricte : aucun script ni style en ligne.

## Versions, nouveautés et publication

- **Numérotation** `MAJEUR.MINEUR.CORRECTIF` : correctif pour une correction, mineur pour une nouvelle fonction, majeur pour un changement important de fonctionnement.
- **`CHANGELOG.md` est la source unique des nouveautés.** Chaque version y a sa rubrique `## [x.y.z] – AAAA-MM-JJ` avec ses sous-rubriques (`### Nouveautés`, `### Améliorations`, `### Corrections`). Elle est affichée dans l’écran « Nouveautés » et devient le texte de la version sur GitHub.
- Les tests refusent une version de `package.json` sans sa rubrique datée dans `CHANGELOG.md`.

Publier une version :

1. Ajouter la rubrique de la nouvelle version en haut de `CHANGELOG.md`.
2. Changer la version : `npm version 0.3.0 --no-git-tag-version`.
3. Pousser. Le workflow `.github/workflows/installeur-windows.yml` (machine Windows de GitHub) lance les tests, fabrique l’installeur et **publie la version** (page Releases : installeur, `latest.yml`, notes). Les logiciels installés la trouvent d’eux-mêmes dans les 4 heures, ou tout de suite via Réglages › Rechercher une mise à jour.

Le workflow ne tourne **que** quand la version change (ou à la main) : le temps de calcul GitHub est partagé avec les déploiements du site. Une version déjà publiée n’est jamais republiée.

Ce dépôt est indépendant du dépôt du site : il ne le modifie jamais.
