# Etendo AI visual identity

This document records the first implementation slice from the visual identity handoff emailed on 30 September 2026.

## Source decisions

- Blue replaces black as the primary interaction colour for buttons, links, checkboxes, radio buttons, loading indicators, and other interactive controls.
- The Navigation Rail uses the blue interaction token for active and hover states.
- Plus Jakarta Sans is used for headings.
- Inter remains the body and data font.
- Space Mono is available for widget headings and code-oriented labels.
- Lucide and Phosphor remain the product icon families until the cross-channel icon family is formally selected.

## Implementation boundary

The first slice is implemented through the app-shell semantic tokens in `tools/app-shell/src/index.css`. This keeps generated windows and per-window artifacts unchanged while making the identity survive pipeline regeneration.

The logo asset and exact lavender/lime replacements remain separate follow-up work because the email provides references and screenshots but no machine-readable logo or color-token file.
