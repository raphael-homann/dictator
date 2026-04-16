# Dictator - Chrome Extension

Extension Chrome MV3 (TypeScript) pour ajouter un bouton de dictee vocale sur des champs texte de n'importe quel site.

## Comment ca marche

1. Depuis le popup, clique `Ajouter une dictee`.
2. Un mode selection s'ouvre sur la page: clique un `input`, `textarea` ou zone `contenteditable`.
3. L'extension memorise le selecteur pour ce site (origin).
4. Un bouton `Dictee` est injecte pres du champ.
5. Un clic lance la dictee (etat actif + visualisation), un second clic stoppe.

## Moteurs de dictee

- `Natif navigateur` (Web Speech API)
- `OpenAI Realtime` (cle API stockee localement dans l'extension)

## Configuration disponible

- provider actif (`native` / `openai`)
- modele OpenAI realtime
- modele de transcription
- langue
- cle API OpenAI
- micro par defaut
- sensibilite micro + bouton `Tester`
- delai d'inactivite auto (configurable) + barre de progression pendant la dictee
- champ de test + bouton `Tester dictee` pour lancer une vraie dictee depuis la configuration
- panneau debug temps reel du test (provider actif, duree, mots, tokens, logs)
- mode `Verrouiller le champ pendant la dictee` (active par defaut)
- liste des sites/selecteurs enregistres (suppression)

## Installation depuis GitHub

### 1) Recuperer le projet

```bash
git clone <URL_DU_REPO>
cd dictator
```

### 2) Construire l'extension

```bash
npm install
npm run build
```

Le build genere tous les fichiers dans `dist/`.

### 3) Charger dans Chrome

1. Ouvrir `chrome://extensions`
2. Activer `Mode developpeur`
3. Cliquer `Charger l'extension non empaquetee`
4. Selectionner le dossier `dist`

### 4) Verifier les droits

Dans les details de l'extension:
- `Acces au site` -> `Sur tous les sites`
- Autoriser le micro quand Chrome le demande

## Utilisation rapide

1. Ouvrir la configuration de l'extension
2. Saisir la cle OpenAI (si provider OpenAI) et enregistrer
3. Ouvrir un site web `http(s)`
4. Depuis le popup, cliquer `Ajouter une dictee`
5. Cliquer un champ cible
6. Utiliser le bouton `Dictee` injecte pres du champ

## Depannage

- `Receiving end does not exist`: recharge la page cible + verifie `Acces au site`.
- `Cannot use import statement outside a module`: recharge l'extension et assure-toi d'utiliser le dossier `dist` reconstruit.
- Pas de visualisation: verifier permission micro, puis utiliser `Tester` dans la configuration pour ajuster la sensibilite.

## Organisation agentique

Le suivi des demandes/evolutions est dans `agentic/`:
- besoin
- roadmap
- implementation

Voir `agentic/README.md` et les fichiers de `agentic/requests/`.

## Credits

Projet concu et maintenu par **e-Frogg**.

- Site: https://www.e-frogg.com
- Copyright (c) e-Frogg
