# AGENTS - Dictator

Ce fichier guide les prochains developpements de l'extension.

## Langue et communication

- Reponses et documentation en francais.
- Ton simple, concret, oriente livraison.

## Objectif produit

Extension Chrome MV3 de dictee sur champs texte:
- ajout de cible via selection utilisateur,
- memorisation des selecteurs par site,
- dictation native ou OpenAI,
- configuration centralisee.

## Regles techniques

- Stack: TypeScript, Manifest V3, build dans `dist/`.
- Conserver le bouton `Dictee` minimal (pas de redesign lourd).
- Eviter la sur-ingenierie; privilegier des modules courts et lisibles.
- Respecter la retrocompatibilite des settings (`DEFAULT_SETTINGS` + migration defensive).
- Toute nouvelle permission manifest doit etre justifiee dans la PR.

## Qualite attendue

- Zero erreur console bloquante sur popup/options/content/background.
- Comportement robuste sur pages dynamiques (MutationObserver).
- Gestion explicite des cas non supportes (`chrome://`, extension pages, etc.).
- Erreurs utilisateur comprehensibles et actionnables.

## Securite

- Cle OpenAI stockee en local extension: ne jamais logger la cle.
- Ne pas exposer d'informations sensibles dans les messages d'erreur.
- Garder les appels reseau limites a ce qui est strictement necessaire.

## Credits et marque

- Conserver les mentions e-Frogg dans:
  - documentation (`README.md`),
  - configuration UI,
  - logs non verbeux.
- Credits attendus:
  - `Copyright (c) e-Frogg`
  - `https://www.e-frogg.com`

## Mini harnais agentique

Le suivi des demandes se fait dans `agentic/requests/`.

Pour chaque evolution, creer un fichier:
- nom: `YYYY-MM-DD_slug-court.md`
- sections obligatoires:
  - `Besoin`
  - `Roadmap`
  - `Implementation`
  - `Validation`

Le fichier doit etre mis a jour pendant l'implementation (pas seulement a la fin).

## Workflow recommande

1. Lire le besoin existant dans `agentic/requests/`.
2. Completer/creer la roadmap.
3. Implementer en petites etapes.
4. Build local (`npm run build`).
5. Mettre a jour la section `Validation`.
6. Mettre a jour `README.md` si fonctionnalite visible utilisateur.
