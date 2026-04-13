# 2026-04-13_debug-log-test-dictee

## Besoin

- Ajouter un log de debug visible dans la configuration pendant le test de dictee.
- Afficher en temps reel les infos de session pour savoir quelle API est utilisee (OpenAI ou natif).
- Suivre des stats utiles pendant la saisie: duree, latence de demarrage, premier texte, mots, tokens.

## Roadmap

- [x] Ajouter un bloc UI `Debug test dictee` dans la page options.
- [x] Ajouter des stats live et un flux de logs horodates.
- [x] Relier les callbacks de dictation (`onTranscript`, `onUsage`, `onWarning`, `onError`, `onStop`) au debug.
- [x] Gerer le fallback OpenAI -> natif dans le debug (provider actif mis a jour).
- [x] Valider au build et mettre a jour la doc utilisateur.

## Implementation

- `public/options/options.html`
  - Ajout d'un panneau `Debug test dictee` avec:
    - provider demande,
    - provider actif,
    - duree,
    - latence de demarrage,
    - latence premier texte,
    - mots,
    - tokens in/out/total,
    - zone de logs.
- `public/options/options.css`
  - Styles du panneau debug (carte legere, grille de stats, bloc log sombre scrollable).
- `src/options/options.ts`
  - Ajout d'un etat `DictationDebugState` + ticker (rafraichissement 250ms).
  - Ajout des helpers de rendu/formatage (`renderDebugPanel`, `appendDebugLog`, etc.).
  - Initialisation d'une session debug au lancement du test dictee.
  - Mise a jour live sur transcription (compte mots), usage OpenAI (tokens), erreurs/avertissements, arret.
  - Logs explicites lors du fallback OpenAI -> natif pour savoir immediatement quelle API est active.
- `README.md`
  - Ajout de la mention du panneau debug temps reel dans la liste des options.

## Validation

- Build: `npm run build` OK.
- Verification manuelle recommandee dans `Options`:
  - lancer un test avec provider `openai` puis `native`,
  - verifier que `Provider actif` suit le fallback,
  - verifier la progression de la duree, des mots et des tokens,
  - verifier le defilement des logs en temps reel.
