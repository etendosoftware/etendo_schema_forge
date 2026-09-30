---
task: ETP-5306
note: ETP-5306/005bb3a7
kind: backfill
date: 2026-09-14T21:07:00.000Z
authors:
  - Valentin Vivaldi
agents:
sessions:
commits:
  - 9207d64bc3
  - 00ced95b43
files:
  - Makefile
  - docs/plans/2026-09-11-mcp-test-harness-design.md
  - mcp-tests/.gitignore
  - mcp-tests/config.example.toml
  - mcp-tests/pyproject.toml
  - mcp-tests/runner/__init__.py
  - mcp-tests/runner/agent.py
  - mcp-tests/runner/cli.py
  - mcp-tests/runner/config.py
  - mcp-tests/runner/events.py
  - mcp-tests/runner/mcp_client.py
  - mcp-tests/runner/prompts/probe_system.md
  - mcp-tests/runner/suite.py
  - mcp-tests/runner/verdict.py
  - mcp-tests/suites/discoverability.yaml
  - mcp-tests/suites/full-flows.yaml
  - mcp-tests/suites/sales-order.yaml
  - mcp-tests/ui/__init__.py
  - mcp-tests/ui/app.py
  - mcp-tests/ui/launch.py
  - mcp-tests/ui/runs.py
  - mcp-tests/uv.lock
  - mcp-tests/findings/2026-09-14-businesspartner-selector-wildcard-returns-empty.md
  - mcp-tests/findings/2026-09-14-neo-create-accepts-unknown-field-silently.md
  - mcp-tests/findings/2026-09-14-no-discoverable-default-customer.md
  - mcp-tests/findings/2026-09-14-orderreference-writable-filterable-never-readable.md
  - mcp-tests/findings/2026-09-14-product-lookup-has-no-partial-text-search.md
  - mcp-tests/findings/2026-09-14-ref-key-breaks-every-gemini-model.md
  - mcp-tests/findings/2026-09-14-schema-understates-required-fields.md
  - mcp-tests/findings/2026-09-14-vector-search-targets-are-undiscoverable.md
  - mcp-tests/findings/README.md
---

## Resumen
Se implementó un harness de testing para agentes MCP (probe test harness) que ejecuta agentes LLM reales contra APIs MCP y registra comportamiento actual. La primera ejecución identificó 8 defectos en la superficie de API de las integraciones MCP.

## Decisiones
- Harness en Python bajo `mcp-tests/` — auto-contenido, fácil de ejecutar en CI/CD
- Verdict model v3 con esquema idéntico a `McpFeedbackVerdict.java` — consistencia entre pruebas de probe y feedback del neo
- Secrets por referencia (variables de entorno) en config.example.toml — no exponer credenciales en git
- Defectos documentados en archivos separados — permitir triaje y cierre independiente de cada hallazgo
- Panel Streamlit solo de lectura — análisis sin lógica en la UI

## Deuda dejada
- No hay tests para el harness mismo (runner, config, eventos)
- 7 de 8 defectos permanecen abiertos: selector BusinessPartner vacío, neo_create acepta campos desconocidos, sin cliente default descubible, orderReference no legible, búsqueda sin texto parcial, neo_schema subestima requeridos, vector-search no descubible
- Solo el defecto de ref key Gemini fue corregido en com.etendoerp.go

## Pendiente
- Resolver los 7 defectos documentados
- Agregar cobertura de tests al harness
