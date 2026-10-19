# Lexique

Web app de révision de définitions par **répétition espacée** (algorithme FSRS),
pensée pour l'iPhone : elle s'installe sur l'écran d'accueil, marche hors ligne
et garde tes cartes **dans le téléphone** (aucun serveur, aucun compte).

## Fonctionnalités

- Ajouter, modifier, supprimer une carte (mot + définition), recherche sans accents
- Révision : le mot s'affiche, tu touches la carte pour voir la définition,
  puis tu notes **À revoir / Difficile / Bien / Facile** (l'intervalle prévu
  est écrit sous chaque bouton)
- Nombre de cartes à réviser aujourd'hui (+ pastille sur l'onglet)
- 20 nouvelles cartes par jour, réglable dans l'onglet **Plus**
- Import d'un export texte d'Anki ou d'une liste `mot ; définition`
- Sauvegarde complète (cartes + progression) en fichier JSON, et restauration
- Hors ligne, mode sombre automatique, animation de retournement

---

## 1. Publier le site avec GitHub Pages

Le site est servi tel quel depuis la branche `main` (pas de compilation).

1. Fusionne ton travail dans `main` (par exemple via une pull request).
2. Sur GitHub, ouvre le dépôt → **Settings** → **Pages** (menu de gauche).
3. Dans **Build and deployment** :
   - **Source** : `Deploy from a branch`
   - **Branch** : `main` et dossier `/ (root)` → **Save**
4. Attends 1 à 2 minutes : l'adresse du site s'affiche en haut de la page
   **Pages**, du type `https://eliotvasic-ui.github.io/Lexique/`.

> Garde toujours **la même adresse** (majuscules comprises) : l'app installée
> et ses données sont liées à l'adresse avec laquelle tu l'as installée.

## 2. Installer l'app sur l'iPhone

1. Ouvre l'adresse du site dans **Safari**.
2. Touche le bouton **Partager** (carré avec une flèche vers le haut).
3. Choisis **Sur l'écran d'accueil**. Si une option du type « Ouvrir en tant
   qu'app web » apparaît, laisse-la activée.
4. Touche **Ajouter** : l'icône **Lexique** apparaît sur l'écran d'accueil.
5. Ouvre Lexique depuis cette icône : il s'affiche en plein écran, sans barre Safari.

⚠️ Pièges à connaître :

| Piège | Pourquoi | Quoi faire |
|---|---|---|
| Cartes ajoutées dans Safari absentes de l'app | iOS donne à l'app installée son propre stockage, séparé de Safari | Installe d'abord, puis ajoute/importe **depuis l'icône** |
| Supprimer l'icône efface tout | Les données vivent dans l'app installée | **Exporte une sauvegarde** avant de la supprimer |
| Changer de téléphone | Rien n'est synchronisé | Exporte la sauvegarde, puis **Restaurer…** sur le nouveau |

## 3. Importer tes cartes Anki

Dans Anki (sur ordinateur) :

1. **Fichier → Exporter…**
2. Format : **Notes en texte brut (.txt)**, choisis le paquet → **Exporter**.
3. Mets le fichier dans iCloud Drive, OneDrive ou Google Drive.

Dans Lexique : onglet **Plus** → **Fichier…** → choisis le fichier.

- Les lignes qui commencent par `#` (en-tête Anki) sont ignorées. Les colonnes
  techniques qu'elles annoncent (identifiant, type de note, paquet, tags) sont sautées.
- Le HTML est retiré (les retours à la ligne sont gardés), comme les `[sound:…]`.
- 1ʳᵉ colonne utile = **mot**, 2ᵉ = **définition**.
- L'export texte d'Anki **ne contient pas ta progression** : les cartes arrivent
  comme nouvelles (20 par jour par défaut).
- Un mot déjà présent est ignoré, et un bilan s'affiche après l'import.

Tu peux aussi **coller** une liste dans la zone de texte, une carte par ligne :

```
Grafcet ; outil graphique de description d'un automatisme séquentiel
Réceptivité ; condition logique associée à une transition
```

Seul le **premier** `;` sépare le mot de la définition : la définition peut en contenir d'autres.

## 4. Sauvegarder et restaurer

- **Exporter** (onglet Plus) ouvre la feuille de partage : **Enregistrer dans
  Fichiers**, OneDrive, Drive… Le fichier `lexique-AAAA-MM-JJ.json` contient
  toutes les cartes, ta progression et tes réglages.
- **Restaurer…** relit ce fichier et **remplace tout** le contenu de l'app
  (après confirmation).
- L'onglet Plus affiche la date de la dernière sauvegarde : exporte au moins
  une fois par semaine.

## 5. Mettre à jour l'app

Le service worker fonctionne en **« réseau d'abord »** : dès que tu as du
réseau, l'app charge la dernière version publiée ; sans réseau, elle utilise
la copie gardée dans le téléphone.

1. Modifie les fichiers et pousse-les sur `main`.
2. Attends ~1 minute que GitHub Pages republie.
3. Ouvre l'app. Si l'ancienne version s'affiche encore, ferme-la complètement
   (balaye-la vers le haut dans le sélecteur d'apps) et rouvre-la.

Si tu **ajoutes un nouveau fichier** au site, ajoute-le à la liste `APP_FILES`
de `sw.js` et change le numéro de `CACHE` (`lexique-v1` → `lexique-v2`).

Tes cartes ne sont jamais touchées par une mise à jour : elles sont dans le
stockage du téléphone, pas dans les fichiers du site.

---

## Organisation du projet

| Fichier | Rôle |
|---|---|
| `index.html` | La page unique : écrans Réviser, Cartes, Plus et fenêtre d'édition |
| `css/style.css` | Styles mobile, mode sombre, zones de sécurité, animation de la carte |
| `js/app.js` | Navigation et branchement des boutons de chaque écran |
| `js/store.js` | Lecture/écriture des cartes dans le stockage du téléphone |
| `js/srs.js` | Planification FSRS : noter, cartes du jour, quota de nouvelles |
| `js/import.js` | Lecture des exports Anki, des listes et des sauvegardes JSON |
| `sw.js` | Service worker : fonctionnement hors ligne |
| `manifest.webmanifest` | Nom, couleurs et icônes pour l'écran d'accueil |
| `icons/` | Icône (SVG source + PNG) |
| `vendor/ts-fsrs/` | Librairie [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) 5.4.2 copiée (licence MIT) |

### Tester sur ordinateur

Le site doit être servi par un petit serveur (les modules JavaScript ne
marchent pas en ouvrant `index.html` en double-cliquant) :

```
python3 -m http.server 8000
```

puis ouvrir `http://localhost:8000/`. Raccourcis clavier : **Espace** pour
retourner la carte, **1 à 4** pour noter.

## Crédits

Planification par [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)
(Open Spaced Repetition, licence MIT).
