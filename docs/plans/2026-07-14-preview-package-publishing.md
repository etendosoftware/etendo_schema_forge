# Propuesta: Sistema de "preview versions" de los paquetes de `schema_forge_core`

> **Estado:** IMPLEMENTADO (2026-07-14) en `schema_forge_core@feature/ETP-4394`, commit
> `31822cdcd`. **Pendiente: validación end-to-end en vivo** (disparar el preview, pinear en
> `schema_forge`, confirmar resolución por paquete publicado) + cerrar 2 preguntas abiertas de infra
> (permiso de borrado y nombre del paquete en la REST API). Relacionado con ETP-4394 (migración de
> `AuthorizePage` a core) y con el "Paso 6 — Release + bump" de
> `docs/plans/2026-07-02-mcp-client-setup-redesign.md`.
>
> ## Cómo retomar (resumen para la próxima sesión)
>
> El diseño de abajo (D1–D7) está **todo implementado**. Lo que falta es **probarlo en vivo** y
> resolver dos incógnitas de permisos/API que solo se confirman ejecutando. Para retomar:
>
> 1. **Pushear la rama** `feature/ETP-4394` de `schema_forge_core` (el commit `31822cdcd` ya está
>    hecho, sin push). El push dispara `publish-preview.yml` automáticamente.
> 2. **Mirar el run** de `publish-preview.yml` en Actions:
>    - ¿Publicó los 6 paquetes bajo `alpha` con versión `0.3.7-preview.feature-ETP-4394.<ts>.<sha>`?
>    - El paso "Prune older previews of this branch" (D5a) tiene `continue-on-error: true` — si da
>      **403 al borrar**, es la **pregunta abierta del permiso de borrado**: el `GITHUB_TOKEN` no
>      alcanza y hay que pasar un PAT con `delete:packages` (ver más abajo).
>    - Si el listado/borrado falla por **nombre de paquete**, revisar la 2ª pregunta abierta (ruta
>      REST para npm scopeado). El script `cleanup-preview-packages.mjs` ya intenta matchear tanto el
>      nombre scopeado como el último segmento — confirmar cuál usa GitHub en la práctica.
> 3. **Pinear el preview** en `schema_forge/tools/app-shell/package.json` (versión exacta, a mano) y
>    correr la resolución por paquete publicado (sin `LOCAL_CORE`) para validar la migración de
>    `AuthorizePage`.
> 4. **Probar cleanup D5b** manualmente sin esperar un release: `workflow_dispatch` de
>    `cleanup-preview-packages.yml` con `dry_run: true` → ver qué borraría.
>
> ### Archivos entregados (commit `31822cdcd` + follow-up D8, repo `schema_forge_core`)
>
> | Archivo | Qué es |
> |---|---|
> | `scripts/preview-version.mjs` | Resuelve la versión preview lockstep; reusa `writeVersionEverywhere`/`resolveNextVersion` de `release-version.mjs` (no divergen). Exporta `sanitizeBranchId`, `buildPreviewVersion`. `main()` guardado para invocación directa (no corre al importarse). |
> | `scripts/cleanup-preview-packages.mjs` | Borrado en 2 modos: `same-branch` (D5a) y `stale-feature` (D5b, 7d hardcoded). Fail-soft (exit 0). Guard duro: solo toca nombres con `-preview.`. |
> | `scripts/release-version.mjs` | Refactor **behavior-preserving**: extrae funciones compartidas + guarda `main()`. Verificado: `version=0.3.7 / tag=0.3.7` igual que antes. |
> | `.github/workflows/publish-preview.yml` | `on: push: feature/** + workflow_dispatch`. Tests → resolve preview → publish `alpha` (6 pkgs) → D5a → **commit status + comentario sticky en el PR** (D8, ambos fail-soft). **No** notifica al repo funcional (D7). |
> | `.github/workflows/cleanup-preview-packages.yml` | Reusable (`workflow_call` + `workflow_dispatch` con `dry_run`). Modo `stale-feature`, 7d. |
> | `.github/workflows/release.yml` | Solo job aditivo `cleanup-previews` (`needs: release`) — el release real quedó intacto. |

## Problema

Hoy, para probar un cambio de `@etendosoftware/app-shell-core` **por el camino de paquete
publicado** (no `LOCAL_CORE`), hay que pasar por el ciclo completo de release:

```
PR en core → release manual (publish-private-packages.yml, workflow_dispatch)
           → PR de bump del pin en schema_forge (bump-core-on-release.yml, merge humano)
           → recién ahí queda live
```

Ese ciclo es lento y "caro" (consume una versión formal `latest` que ven todos los consumidores).
Durante desarrollo se mitiga con `LOCAL_CORE=1` / `make dev-local-core`, pero eso **no valida el
camino real de resolución de paquete publicado** (exports del `package.json`, shims resolviendo
contra el registro, etc.). Falta un mecanismo intermedio: **publicar versiones preview**,
descartables, que permitan pinear y testear el paquete publicado sin comprometer un release `latest`.

## Contexto técnico confirmado (2026-07-14)

- **Registro = GitHub Packages, privado.** `publishConfig` del paquete:
  `{ "registry": "https://npm.pkg.github.com", "access": "restricted" }`. **No** se publica en el npm
  público (`registry.npmjs.org`). Es el mismo registro del que `schema_forge` ya consume core.
- **El paquete no tiene build step.** `files: ["src", "!src/**/__tests__/**"]`, `main` undefined —
  se publica el `src/` crudo. Publicar es `pack + upload`, sin compilar → barato, sin artefactos.
- **`publish-private-packages.yml` ya es `workflow_dispatch`** con inputs `tag` (alpha/beta/latest) y
  `dry_run`. Publica la versión de `package.json` **tal cual** y **saltea si ya existe**
  (`npm view $NAME@$VERSION && skip`). Su `actions/checkout@v4` no fija `ref` → clona la rama que
  dispara el run.
- **`release.yml`** es el publish automático (`on: push: main`): lockstep, auto-patch, tag `latest`.
  Ese es el que "solo pasa en main". El preview NO usa este camino.
- Pin actual en `schema_forge/tools/app-shell/package.json`: `@etendosoftware/app-shell-core: 0.3.6`.
  Versión en `packages/app-shell-core/package.json` de la rama de core: `0.3.0` (el número final lo
  resuelve el release en el runner).

## Decisiones tomadas

### D1 — Enfoque: modo preview dentro del Action (no publish local)
Se agrega un modo "preview" a `publish-private-packages.yml` en vez de publicar a mano desde la
máquina. Razones: mantiene los test-gates del CI, corre desde un checkout limpio de la rama, es
reproducible y no exige un token personal `write:packages`. (El publish local quedó descartado como
mecanismo estable; sirve solo como hack puntual.)

### D2 — dist-tag `alpha`, nunca `latest`
Los previews se publican bajo dist-tag `alpha` para que **no pisen el `latest`** que consumen los
demás. `schema_forge` pinea el preview explícitamente para testear; nadie lo recibe por defecto.

### D3 — Esquema de versión: prerelease con rama + timestamp + sha
```
<base>-preview.<branchid>.<timestamp>.<shortsha>
ej.  0.3.7-preview.feature-ETP-4394.20260714153045.a1b2c3d
```
- `<base>` = semver base del `package.json`.
- `<branchid>` = **nombre completo** de la rama **sanitizado** para SemVer (el prerelease solo admite
  `[0-9A-Za-z-]` separados por punto → `/` y otros inválidos se reemplazan por `-`, ej.
  `feature/ETP-4394` → `feature-ETP-4394`). Rama completa (no solo el ticket) por las dudas, para
  evitar colisiones si dos ramas comparten ticket. **No es cosmético**: es la clave con la que se
  identifican "previews de la misma rama" (D5a) y las ramas `feature` (D5b).
- `<timestamp>` = `date -u +%Y%m%d%H%M%S` en el runner (da orden natural y es legible).
- `<shortsha>` = commit exacto publicado (trazabilidad).
- Cada preview es una **versión única** → evita el guard de "ya publicado", permite iterar.
- Para políticas de **edad** se usa el `created_at` del registro, **no** se parsea el timestamp del
  nombre. Para políticas de **misma-rama** se usa el `<branchid>` del nombre.

### D6 — Alcance: todos los paquetes publicables (lockstep)
El modo preview publica **los 6 paquetes publicables** en lockstep con la misma versión preview,
igual que hace el publish real. No se publica solo el paquete tocado.

### D7 — El preview NO dispara el chore de bump del pin
El preview **no** debe abrir el PR automático de bump del pin en `schema_forge`
(`bump-core-on-release.yml`). Eso es exclusivo del release real. Verificado (2026-07-14):
`bump-core-on-release.yml` escucha **solo** `repository_dispatch: [core-released]`, y ese evento lo
emite **únicamente** `schema_forge_core/.github/workflows/release.yml:119-126` ("Notify functional
repo of new release", solo en push a `main`). Por lo tanto, basta con que el workflow de preview
**no** incluya ningún paso de notificación / `repository_dispatch` — al no emitir `core-released`, el
chore de bump nunca se dispara. El pin del preview se cambia **a mano** (decisión de pin exacto).

### D8 — Superficie: la versión publicada, "visible fácil" en el commit y el PR
El pin es manual (D7), así que el paso lento es **saber qué versión salió** sin abrir el run. El
workflow lo expone por dos vías, ambas **fail-soft** (`continue-on-error`, nunca bloquean el publish):

1. **Commit status** (`preview-package`) sobre el SHA publicado, con `description = "alpha: <version>"`
   y `target_url` al run. Aparece como check ✅ en el commit **y** en la lista de checks del PR — se
   ve la versión sin abrir el run. Requiere `permissions: statuses: write`.
2. **Comentario sticky** en el PR abierto de la rama (si existe): busca el PR por `--head`, y hace
   *upsert* de un único comentario (marcado con `<!-- preview-packages-bot -->`) — nunca spammea, se
   actualiza en cada push. Incluye la versión y el snippet exacto del pin
   (`"@etendosoftware/app-shell-core": "<version>"`). Si no hay PR abierto, se saltea en silencio.
   Requiere `permissions: pull-requests: write`.

### D4 — Trigger: automático en cada push a una rama `feature/**` de core
El preview se publica **solo, en cada push** a una rama `feature/**` del repo `schema_forge_core`
(`on: push: branches: ['feature/**']`). No hay que dispararlo a mano. Se conserva además
`workflow_dispatch` como escape manual (correr un preview sin pushear).

Ventaja del `on: push` frente al `workflow_dispatch`: el push usa el archivo de workflow **de la rama
pusheada** y publica **el código de esa misma rama** (via `github.ref_name` para el `<branchid>` y el
sha del commit). Esto **elimina la fricción** que tendría el input de `workflow_dispatch` (que se lee
de la rama default) — no hay input que validar contra main.

`main` queda **fuera** de este trigger (solo `feature/**`): el push a `main` lo maneja `release.yml`
(publish real `latest` + cleanup D5b). Contrapartida asumida: cada push a una feature corre la suite
de tests de los 6 paquetes y publica un preview (D5a autopurga los anteriores de esa rama).

### D5 — Cleanup en dos momentos, atado a la cadencia de publicación (no cron)
Dos mecanismos complementarios, ninguno agendado — se disparan cuando se publica:

**D5a — Al publicar un preview de una rama → borrar los previews anteriores de ESA misma rama.**
Cada rama conserva **solo su último preview**. Tras publicar, para cada paquete: listar versiones
cuyo nombre matchee el prefijo `<base>-preview.<branchid>.`, conservar la recién publicada (la más
nueva por `created_at`) y borrar el resto. Esto contiene la acumulación del loop "iterar sobre la
misma rama".

**D5b — Al publicar el release real en `main` → barrer los previews de `feature` > 7 días.**
Vive en un **workflow reusable aparte** (`cleanup-preview-packages.yml`), invocado tanto por
`release.yml` (en cada push a `main`) como por `workflow_dispatch` manual (para limpiar sin esperar
un release). Borra **solo** los previews de ramas `feature` (`<branchid>` que empieza con `feature-`)
con `created_at > 7 días`. Los previews de ramas no-`feature` (ej. `epic-`, `hotfix-`) **no** los
toca este barrido — se apoyan solo en su autopurga de D5a.

Ambos usan la REST API de Packages (`actions/delete-package-versions` filtra por cantidad, no por
edad ni por patrón de nombre):
1. `GET .../packages/npm/<pkg>/versions` → cada versión con `name`, `created_at`, `id`.
2. `jq`: filtrar (D5a: `name` empieza con `<base>-preview.<branchid>.`, todas menos la última) /
   (D5b: `name` matchea `-preview.feature-` **y** `created_at < now - 7 días`).
3. `DELETE .../versions/{id}` por cada una, para los 6 paquetes.

**Caveat:** el barrido de > 7 días (D5b) solo corre cuando hay un release real en `main`. Entre
releases, un preview de una rama que dejó de publicar puede superar los 7 días sin borrarse hasta el
próximo release. Como los previews de la misma rama ya se autopurgan en cada publish (D5a), lo único
que queda colgando son previews de ramas que dejaron de publicar — aceptable. Queda como pregunta
abierta si se quiere además un cron de backstop.

## Preguntas abiertas / a confirmar al implementar

- [ ] **Permiso de borrado.** Borrar versiones requiere scope `delete:packages`. ¿Alcanza el
      `GITHUB_TOKEN` (`permissions: packages: write`) para un paquete a nivel **org**, o hace falta un
      PAT con `delete:packages`? Verificar antes de dar por cerrado D5.
- [ ] **Nombre del paquete en la REST API** para un npm scopeado (`@etendosoftware/app-shell-core`):
      confirmar la ruta exacta (`/orgs/{org}/packages/npm/{name}/versions` — ¿`name` es
      `app-shell-core` sin scope?).
- [x] **Alcance del preview: todos los paquetes publicables** (lockstep, los 6). Ver D6.
- [x] **Cómo pinea `schema_forge` el preview**: **versión exacta** en `package.json`
      (`0.3.7-preview.<branchid>.<ts>.<sha>`), cambiada a mano. Reproducible; sabés exactamente qué
      estás probando. `@alpha` (blanco móvil) descartado. Después del test se revierte al pin real.
- [x] **Sanitización del `<branchid>`**: rama **completa** sanitizada (`feature/ETP-4394` →
      `feature-ETP-4394`), `/` → `-`. Ver D3. (Falta afinar qué se hace con otros caracteres
      inválidos si aparecieran, ej. `.` — regla tentativa: cualquier cosa fuera de `[0-9A-Za-z-]` → `-`.)
- [x] **Dónde vive D5b**: workflow **reusable** `cleanup-preview-packages.yml`, invocado por
      `release.yml` + `workflow_dispatch` manual. Solo limpia ramas `feature`. Ver D5b.
- [x] **Backstop opcional**: **no**. Alcanza con D5a (autopurga por rama) + D5b (barrido en cada
      release). Sin cron.
- [x] **Retención**: **7 días hardcodeado**. Sin input configurable.

## Próximos pasos

- [x] **Decidir estructura**: workflow dedicado (`publish-preview.yml`), como se preveía.
- [x] **Preparar el diff de las piezas** (preview publish + cleanup reusable). Hecho, commit
      `31822cdcd`. Ver tabla "Archivos entregados" al inicio.
- [ ] **Push + PR de infra a main** (aditivo; no publica ni borra nada hasta que se dispare a
      mano / hasta el próximo release real). El commit está local, sin push.
- [ ] **Cerrar permiso de borrado** — se confirma ejecutando: mirar si el paso D5a da 403. Si sí,
      cambiar `GITHUB_TOKEN` por un PAT con `delete:packages` en `publish-preview.yml` y
      `cleanup-preview-packages.yml`.
- [ ] **Confirmar nombre del paquete en la REST API** — se ve en el mismo run (el script ya soporta
      ambas formas; verificar cuál matchea de verdad).
- [ ] **Validar end-to-end**: disparar preview contra `feature/ETP-4394`, pinear en `schema_forge`,
      confirmar que la migración de `AuthorizePage` resuelve por camino de paquete publicado.
