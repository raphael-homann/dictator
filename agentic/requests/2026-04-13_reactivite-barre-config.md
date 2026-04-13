# 2026-04-13_reactivite-barre-config

## Besoin

- Rendre la barre de visualisation micro plus reactive dans le panneau de configuration.
- Reduire l'effet "mou" pendant le test micro et le test dictee.

## Roadmap

- [x] Accelerer la transition visuelle de la barre.
- [x] Rendre le signal analyse plus nerveux (analyser + courbe de rendu).
- [x] Aligner le rendu sur test micro et test dictee.
- [x] Valider au build.

## Implementation

- `public/options/options.css`
  - transition de `transform` passee de `90ms` a `28ms`.
  - ajout de `will-change: transform` pour fluidifier les updates frequentes.
- `src/options/options.ts`
  - `testMicAnalyser.fftSize` passe de `512` a `256`.
  - `testMicAnalyser.smoothingTimeConstant` fixe a `0.35` pour moins lisser le niveau.
  - courbe de gain barree renforcee (`pow(..., 0.42)`), puis affichage plus vif (`pow(..., 0.5)` + base plus faible).
  - meme courbe appliquee au callback `onLevel` du test dictee pour garder un comportement coherent.

## Validation

- Build: `npm run build` OK.
- Verification manuelle recommandee dans `Options`:
  - lancer `Tester micro` et `Tester dictee`,
  - verifier une montee/descente plus nerveuse de la barre.
