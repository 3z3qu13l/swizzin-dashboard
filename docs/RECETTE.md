# Recette swizdash

Plan de recette manuelle, à dérouler dans un navigateur avant une mise en production. Les tests automatiques (`npm test`, CI) et le test de fumée (`scripts/smoke.sh`) couvrent déjà le serveur et la sécurité : ce plan couvre ce qu'un humain voit et fait.

## Préparation

1. Sur le serveur, en root, lancer le test de fumée. Il doit finir par `All checks passed`.
   ```
   bash /root/smoke.sh
   ```
   (Le copier d'abord depuis le dépôt : `scripts/smoke.sh`.)
2. Lire le mot de passe du compte maître sur le serveur :
   ```
   cut -d: -f2 /root/.master.info
   ```
3. Ouvrir `https://<serveur>:8444` dans le navigateur.

## 1. Connexion

| # | Action | Résultat attendu |
|---|---|---|
| 1.1 | Ouvrir l'adresse | Le navigateur demande un identifiant et un mot de passe |
| 1.2 | Saisir un mauvais mot de passe | Accès refusé, nouvelle demande |
| 1.3 | Saisir le compte d'un autre utilisateur swizzin (pas le maître) | Accès refusé |
| 1.4 | Saisir le compte maître | La page « Your apps » s'affiche |

## 2. App Dashboard

| # | Action | Résultat attendu |
|---|---|---|
| 2.1 | Regarder la carte Storage | Espace utilisé, total et libre du disque `/`, barre colorée |
| 2.2 | Regarder les jauges CPU et Memory | Elles bougent toutes les 2 secondes environ |
| 2.3 | Regarder la bande en haut à droite (CPU, mémoire, réseau) | Valeurs et petites courbes qui avancent |
| 2.4 | Carte Downloads : cliquer sur un client | Le panneau « Download activity » s'ouvre sur ce client |
| 2.5 | Dans le panneau : changer d'onglet, chercher un nom, filtrer par état | La liste suit ; « Updated … ago » en bas |
| 2.6 | Fermer le panneau | Retour à la page |
| 2.7 | Tableau Application control : filtres All / Running / Stopped | Les compteurs correspondent aux lignes affichées |
| 2.8 | Déplier une appli (flèche) | Services, fichiers (chemins existants ou « missing »), adresse, port, clé API masquée |
| 2.9 | Afficher puis copier la clé API (Sonarr, Radarr…) | La clé apparaît, le bouton copier la met dans le presse-papiers |
| 2.10 | Arrêter puis démarrer une appli (ex. Transmission) | Le statut passe à Stopped puis Running |
| 2.11 | Redémarrer une appli | Elle reste Running |
| 2.12 | Sur la ligne nginx | Pas de bouton Arrêter, seulement Redémarrer |
| 2.13 | Bouton « Ouvrir » d'une appli | L'appli s'ouvre dans un nouvel onglet |

## 3. Package management

| # | Action | Résultat attendu |
|---|---|---|
| 3.1 | Onglet Package management, filtrer par catégorie, chercher | La liste suit |
| 3.2 | Une appli « SSH only » (ex. Plex) | Le message explique quelle commande `box` lancer en SSH |
| 3.3 | Installer une appli simple (ex. autobrr) puis confirmer | Le journal de `box` défile, puis « autobrr installed » |
| 3.4 | Pendant l'installation, essayer d'en lancer une autre | Les boutons Install sont désactivés, une bannière montre l'installation en cours |
| 3.5 | Fermer la fenêtre du journal pendant l'installation | L'installation continue, la bannière permet de la rouvrir |
| 3.6 | Désinstaller l'appli installée en 3.3 (Actions → Remove) | Journal, puis « autobrr removed » ; elle disparaît du tableau |

## 4. Menu Software

| # | Action | Résultat attendu |
|---|---|---|
| 4.1 | Regarder le menu de gauche | Les applis installées, par catégorie, avec une pastille de statut |
| 4.2 | Replier puis déplier une catégorie | Elle se replie |
| 4.3 | Cliquer sur Homepage et sur swizzin panel | Ils s'ouvrent dans un nouvel onglet, à la bonne adresse |
| 4.4 | Champ « Open an app… » en haut : taper le début d'un nom, puis Entrée | L'appli s'ouvre |

## 5. System Dashboard

| # | Action | Résultat attendu |
|---|---|---|
| 5.1 | Ouvrir System Dashboard | Point vert à côté du titre (données en direct) |
| 5.2 | Cartes CPU, Memory, Disk, Swap, Today, This month | Valeurs cohérentes avec 2.1 et 2.2 |
| 5.3 | Historique : passer de 5m à 30d | Les trois graphiques se redessinent |
| 5.4 | Traffic per day | Une barre par jour (si vnStat a des données) |
| 5.5 | Hardware, Disk health, Fail2Ban | Les blocs s'affichent, ou expliquent pourquoi il n'y a pas de données (VM, pas de SMART…) |
| 5.6 | System updates | Liste des paquets en attente, ou « Everything is up to date » |
| 5.7 | Copy diagnostics | « Copied », le presse-papiers contient un JSON |
| 5.8 | Power → Restart the server, sans taper le mot | Le bouton reste désactivé ; Cancel ferme sans rien faire |
| 5.9 | (optionnel, serveur de test) taper `reboot` et valider | Le serveur redémarre ; swizdash revient seul après le boot |

## 6. Affichage

| # | Action | Résultat attendu |
|---|---|---|
| 6.1 | Bouton palette en haut à droite : Night, Dusk, Day | Le thème change partout, y compris les graphiques |
| 6.2 | Recharger la page | Le thème choisi est gardé |
| 6.3 | Ouvrir sur un téléphone, ou réduire la fenêtre | Menu derrière le bouton ☰, pas de défilement horizontal |
| 6.4 | Naviguer au clavier (Tab, Entrée, Échap) | Le focus est visible, Échap ferme les fenêtres |

## Fin de recette

Si un point échoue : noter le numéro, ce qui s'affiche, et joindre la fin de `/root/logs/swizzin.log` et `journalctl -u swizdash -n 50` du serveur.
