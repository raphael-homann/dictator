# 2026-04-13_icone-store-submission

## Besoin

- Ajouter une icone extension exploitable pour une soumission Chrome Web Store et brancher le manifest MV3 sur ces assets.

## Roadmap

- [x] Generer les icones PNG aux tailles attendues (16/32/48/128).
- [x] Declarer les icones globales et d'action dans le manifest public.
- [x] Rebuild pour verifier la presence des assets dans `dist/`.

## Implementation

- Creation des fichiers `public/icons/icon16.png`, `public/icons/icon32.png`, `public/icons/icon48.png`, `public/icons/icon128.png` (style micro blanc sur fond vert).
- Mise a jour de `public/manifest.json` avec `icons` et `action.default_icon`.

## Validation

- Build: `npm run build` OK.
- Tests manuels: verifier l'affichage de l'icone dans `chrome://extensions` et la barre Chrome.
- Risques restants: aucun bloqueur technique anticipe, sous reserve de verification visuelle.
