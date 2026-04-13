# 2026-04-13_test-dictee-config

## Besoin

- Ajouter dans la configuration une fonction de test de dictee reelle.
- Flux attendu: configurer, cliquer dans un champ de test, puis cliquer sur `Tester dictee` pour lancer la transcription.
- Garder le test micro existant (barre de niveau) et un comportement simple a comprendre.

## Roadmap

- [x] Ajouter le champ de test et le bouton `Tester dictee` dans l'UI options.
- [x] Brancher un mode start/stop de dictee directement depuis `options.ts`.
- [x] Inserer la transcription dans le champ de test a la position du curseur.
- [x] Conserver fallback natif si OpenAI est selectionne et indisponible.
- [x] Valider au build et mettre a jour la documentation utilisateur.

## Implementation

- `public/options/options.html`
  - Renommage du bouton test audio en `Tester micro`.
  - Ajout du bouton `Tester dictee`.
  - Ajout d'un `textarea` de test de dictee avec consigne d'usage.
- `public/options/options.css`
  - Style du `textarea` et marge du bloc de test pour rester coherent avec la carte existante.
- `src/options/options.ts`
  - Import des providers (`NativeDictationProvider`, `OpenAIRealtimeProvider`) et helpers de texte editable.
  - Ajout d'un etat de session de dictee de test (provider actif, ancre prefix/suffix, champ cible).
  - Ajout de `toggleDictationTest()`:
    - start/stop sur le bouton,
    - insertion live de la transcription dans le champ de test,
    - usage des reglages courants (provider, modele, langue, micro, sensibilite),
    - fallback natif en cas d'echec OpenAI.
  - Protection contre conflit avec le test micro (un seul test actif a la fois).
- `README.md`
  - Ajout de la mention du nouveau test de dictee dans la section configuration.

## Validation

- Build: `npm run build` OK.
- Verification manuelle a faire dans `Options`:
  - cliquer dans le champ de test,
  - cliquer `Tester dictee`,
  - verifier la transcription en live et le stop via le meme bouton.
