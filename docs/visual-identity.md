# Etendo AI visual identity

This document records the Etendo AI visual identity implementation from the 30 September 2026 handoff and the Confluence brand manual.

## Source decisions

- Blue replaces black as the primary interaction colour for buttons, links, checkboxes, radio buttons, loading indicators, and other interactive controls.
- The Navigation Rail uses the blue interaction token for active and hover states and the Etendo AI lime mark for its logo.
- The brand palette is exact: ink `#1B1A1F`, Etendo blue `#325CFF`, lime `#B8FA50`, and lavender `#B3A1FF`.
- Etendo is the corporate brand, `etendo.ai` is the SaaS product, and Agentic ERP is the category descriptor.
- Product AI states use the language and visual model `Propone`, `Ejecuta`, and `Completa`.
- Plus Jakarta Sans is used for headings.
- Inter remains the body and data font.
- Space Mono is available for widget headings and code-oriented labels.
- Lucide and Phosphor remain the product icon families until the cross-channel icon family is formally selected.

## Implementation boundary

The implementation is centralized in the app-shell semantic tokens in `tools/app-shell/src/index.css`, which keeps generated windows and per-window artifacts unchanged while making the identity survive pipeline regeneration. The official logo extracted from the supplied Dashboard reference is `tools/app-shell/public/logo-etendo-ai.png` and is used by the expanded and collapsed Navigation Rail, the company switcher, and the ValerIA support chat icon (`ValerIATile.jsx`, consumed by `SupportChatWidget.jsx`, `ConversationView.jsx`, and `TicketList.jsx`).

The source references are the [Confluence brand manual](https://etendoproject.atlassian.net/wiki/spaces/PYPI/pages/5268111361/Manual+de+marca+Etendo+etendo.ai), its `ManualdeMarcaEtendoV4.pdf` attachment, the email screenshots, and the [Etendo AI Figma file](https://www.figma.com/design/6cMWBbmrAt65GwZCT5YIF1/Etendo-AI-2026?node-id=2205-36210).
