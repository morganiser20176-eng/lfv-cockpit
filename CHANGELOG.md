# Nouveautés de LFV Cockpit

Toutes les évolutions du logiciel, de la plus récente à la plus ancienne.
Ce fichier est affiché tel quel dans l’écran « Nouveautés » du logiciel et sur la page de chaque version GitHub.

Numérotation `MAJEUR.MINEUR.CORRECTIF` :

- **CORRECTIF** (0.2.0 → 0.2.1) : corrections, rien ne change dans l’utilisation ;
- **MINEUR** (0.2.1 → 0.3.0) : nouvelles fonctions ;
- **MAJEUR** (0.3.0 → 1.0.0) : changement important de fonctionnement.

## [0.3.0] – 2026-10-30

### Nouveautés

- **Détail de chaque mise à jour du site** : pour chaque nouvelle version détectée en recette ou en production, LFV Cockpit montre précisément ce qui a changé. Pour chaque changement : son titre, son résumé et ses lignes « Changelog utilisateur », y compris celles du BO.
- **Liens directs « Où voir »** : un bouton par page concernée ouvre directement le bon endroit, sur le site ou dans le BO de l’environnement mis à jour.
- Le panneau des mises à jour de l’accueil et le bandeau de nouvelle version résument le premier changement et ouvrent le détail.

### Améliorations

- Le détail est lu dans le BO avec votre passkey : il n’est jamais public. Si la session BO est fermée, il s’affiche tout seul dès que vous vous reconnectez.
- La confirmation avant « Déploiement production » s’applique aussi aux liens du détail.

## [0.2.0] – 2026-10-30

### Nouveautés

- **Mise à jour automatique** : les nouvelles versions de LFV Cockpit se téléchargent en arrière-plan. Un bandeau propose de redémarrer pour les installer ; sinon, elles s’installent à la prochaine fermeture.
- **Écran « Nouveautés »** : l’historique de toutes les versions, accessible depuis le menu de gauche. Il s’ouvre tout seul après chaque mise à jour.
- **Avant de redémarrer**, le bandeau de mise à jour montre ce que contient la nouvelle version.

### Améliorations

- Réglages : version installée, recherche d’une mise à jour à la demande, mise à jour automatique activable ou non.
- Le panneau des mises à jour de l’accueil indique aussi les nouvelles versions du logiciel.

## [0.1.0] – 2026-10-30

### Nouveautés

- Les sites et back-offices de **production** et de **recette** dans une seule fenêtre, par le menu de gauche ou `Ctrl+1` à `Ctrl+4`.
- Accueil « tableau des départs » aux couleurs du site : état des quatre destinations et dernières mises à jour.
- Sessions séparées pour la prod et la recette, gardées chiffrées sur le PC.
- Rechargement automatique des pages à chaque déploiement du site, jamais pendant une saisie dans le BO.
- Le site se recharge après un enregistrement dans le BO du même environnement.
- Confirmation avant d’ouvrir « Déploiement production ».
- Comparaison prod / recette côte à côte (`Ctrl+5`).
- Liens externes (YouTube, Discord, FSHub…) ouverts dans le navigateur habituel.
