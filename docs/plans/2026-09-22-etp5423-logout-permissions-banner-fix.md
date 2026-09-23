# ETP-5423 — Logout muestra incorrectamente "Tus permisos fueron actualizados" — Investigación y Plan de Solución

**Ticket:** [ETP-5423](https://etendoproject.atlassian.net/browse/ETP-5423) — Cierre de sesión muestra incorrectamente el mensaje "Tus permisos fueron actualizados"
**Relacionado:** [ETP-5189](https://etendoproject.atlassian.net/browse/ETP-5189) — introdujo el banner (`RoleChangedBanner.jsx`) y el hook que lo controla (`useRoleChangeNotice.js`), y el hermano `useRoleMenu.js` que SÍ resuelve correctamente el caso que este ticket reporta.
**Branch:** `feature/ETP-5423` (a crear desde `develop`, checkout principal, sin worktree)
**Fecha:** 2026-09-22
**Estado:** Investigación completa, causa raíz confirmada por lectura de código y en vivo contra `https://app.etendo.software/`. Implementación NO iniciada — plan pendiente de confirmación con el usuario antes de pasar a DEV.

## 0. Resumen (leer primero)

Al hacer logout en Etendo Go, la pantalla de login muestra el banner de advertencia "Tus permisos fueron actualizados" (`RoleChangedBanner.jsx`, ETP-5189) aunque no hubo ningún cambio real de permisos — solo un cierre de sesión normal.

**Causa raíz confirmada:** `useRoleChangeNotice.js` (el hook que decide si el banner se muestra) nunca resetea su `baseline` de comparación cuando la sesión se cierra. El banner está montado como hermano de `<Routes>` en `App.jsx` (fuera de `AppLayout`) precisamente para sobrevivir a cualquier navegación — pero eso significa que **también sobrevive al logout**, y su hook arrastra el `baseline` de la sesión que acaba de cerrarse hasta la siguiente vez que `accessLoaded` se vuelve a asentar (que ocurre casi de inmediato, para la sesión NO autenticada, con objetos `{}` nuevos). El hook compara esos `{}` nuevos contra los mapas de permisos poblados de la sesión anterior, ve referencias distintas, y dispara `setChanged(true)` — el mismo camino que usa para un cambio de rol real en caliente.

El propio ticket ETP-5189 ya resolvió esta clase de problema en su hook hermano, `useRoleMenu.js`: ese hook gatea explícitamente en `isAuthenticated` y resetea su estado a `null` en la rama de logout, con un comentario que documenta exactamente el motivo ("a login... would leave `allowedIds` at the previous... state until this fetch resolves"). `useRoleChangeNotice.js` es el único hook de ese mismo ticket al que ese mismo tratamiento no se le aplicó.

**La solución:** replicar en `useRoleChangeNotice.js` el mismo patrón que `useRoleMenu.js` ya usa — leer `isAuthenticated` de `useAuth()` y, cuando pasa a `false` (logout), resetear `baseline.current` a `null` y `changed` a `false` en vez de dejar que el efecto compare contra el baseline obsoleto. Cambio de ~10 líneas en un único archivo, sin tocar `AuthContext.jsx` (que vive en el paquete publicado `@etendosoftware/app-shell-core`, fuera de este repo).

## 1. Qué reporta ETP-5423

- **Pasos:** iniciar sesión → ejecutar logout.
- **Actual:** la pantalla de login muestra "Tus permisos fueron actualizados" inmediatamente después del logout.
- **Esperado:** el usuario vuelve al login sin ningún mensaje de advertencia de permisos.
- **Entorno afectado:** PRO (`https://app.etendo.software/`).
- **Prioridad:** Menor.

## 2. Método de investigación

1. Lectura del ticket en Jira vía Claude in Chrome.
2. Lectura de código: `RoleChangedBanner.jsx`, `useRoleChangeNotice.js` (este repo, `tools/app-shell/src/`), `AuthContext.jsx` y `sessionController.js` (paquete publicado `@etendosoftware/app-shell-core`, inspeccionado vía `node_modules/@etendosoftware/app-shell-core/src/auth/`), y el hook hermano `useRoleMenu.js` (mismo ticket ETP-5189, mismo repo).
3. Reproducción en vivo contra `https://app.etendo.software/` (entorno que sigue `develop`; el entorno local no estaba disponible durante esta investigación): login como `GOAdmin`, logout desde el menú de usuario. **Confirmado:** el banner amarillo "Tus permisos fueron actualizados." aparece en la pantalla de login inmediatamente tras el logout. No se persistió ningún dato de prueba (un borrador de Albarán de Devolución abierto accidentalmente durante la navegación se canceló sin guardar).

## 3. Causa raíz

### 3.1 Dónde vive el banner y por qué sobrevive al logout

`App.jsx:439` monta `<RoleChangedBanner />` como hijo directo de `AppShellRuntime`, hermano de `<Routes>` — **no** dentro de `AppLayout` ni gateado por autenticación. El comentario en el propio código lo explica: está ahí para ser visible "regardless of which window is open" cuando el cambio de permisos llega. Efecto colateral no buscado: el componente (y su hook) nunca se desmontan al hacer logout, así que cualquier estado interno que no se resetee explícitamente sobrevive la transición logout → login.

### 3.2 Qué pasa en `AuthContext`/`sessionController` durante el logout

`sessionController.js`: `logout: () => replace({}, { clear: true })`. Dentro de `replace()`:

```js
state = {
  ...state, session,
  ...(bump ? { generation: state.generation + 1, authRevision: state.authRevision + 1 } : {}),
  needsRefresh: !!session.token && refresh,       // false (sin token)
  isSessionReady: !session.token || (!refresh && ready),  // true (sin token)
  ...
  windowAccess: access?.windowAccess ?? {},   // {} nuevo (access es undefined)
  capabilities: access?.capabilities ?? {},   // {} nuevo
  menuAccess: access?.menuAccess ?? {},       // {} nuevo
  accessLoaded: access !== undefined,         // false
};
```

Es decir: justo tras el logout, `isSessionReady=true` pero `accessLoaded=false` (con `windowAccess/capabilities/menuAccess` ya en `{}` nuevos, pero eso no importa todavía).

Casi de inmediato, el propio `AuthContext.jsx` (líneas 261-278) dispara su efecto de carga de acceso, porque la condición `!state.isSessionReady || state.needsRefresh || state.accessLoaded` ya no bloquea (`isSessionReady=true`, `needsRefresh=false`, `accessLoaded=false`):

```js
loadAccess(state.session, snapshot).then((access) => {
  if (!cancelled && controller.isCurrent(snapshot)) controller.publish({
    windowAccess: access.windowAccess ?? {}, capabilities: access.capabilities ?? {},
    menuAccess: access.menuAccess ?? {}, accessLoaded: true,
  });
});
```

`loadAccess()` ve una sesión sin `selectedRole` y devuelve `{}` sin red. El `publish` resultante crea **objetos `{}` nuevos otra vez** (distintos de los del paso anterior) y pone `accessLoaded: true`.

### 3.3 Por qué `useRoleChangeNotice` lo malinterpreta como un cambio real

```js
useEffect(() => {
  if (!isSessionReady || !accessLoaded) return;          // (a)
  const current = { windowAccess, capabilities, menuAccess };
  if (baseline.current === null) {                        // (b)
    baseline.current = current;
    return;
  }
  const isDifferent = baseline.current.windowAccess !== windowAccess
    || baseline.current.capabilities !== capabilities
    || baseline.current.menuAccess !== menuAccess;
  baseline.current = current;
  if (isDifferent) setChanged(true);                       // (c)
}, [isSessionReady, accessLoaded, windowAccess, capabilities, menuAccess]);
```

Secuencia real tras el logout:

1. **Render con `accessLoaded=false`** (justo tras `replace({}, {clear:true})`, §3.2): la guarda (a) corta el efecto ANTES de llegar a (b) — `baseline.current` **no se toca**, sigue apuntando a los mapas de permisos poblados de la sesión que acaba de cerrarse.
2. **Render con `accessLoaded=true`** (el `publish` del efecto de `AuthContext.jsx`, unas líneas después, §3.2): ahora (a) no corta. `current` son los `{}` nuevos de la sesión sin autenticar. `baseline.current` sigue siendo el de la sesión ANTERIOR (paso 1 nunca lo actualizó). Referencias distintas → `isDifferent = true` → `setChanged(true)`.

El banner se muestra en la pantalla de login con el mismo mecanismo que usaría para un cambio de rol real en caliente — el hook no tiene forma de distinguir "cambiaron mis permisos en la misma sesión" de "esto es una sesión completamente distinta (vacía) que nunca debió compararse contra la anterior".

### 3.4 El propio ticket ETP-5189 ya resolvió esto en el hook hermano — precedente directo

`useRoleMenu.js` (mismo ticket ETP-5189, mismo repo, mismo problema de fondo: estado derivado de `useAuth()` que debe sobrevivir a la navegación pero no al logout) ya gatea explícitamente en `isAuthenticated`:

```js
useEffect(() => {
  if (!isAuthenticated) {
    setAllowedIds(null);
    return undefined;
  }
  ...
  // Reset to the in-flight state on every new authenticated fetch — otherwise a
  // login (isAuthenticated flipping false -> true without a full page reload)
  // would leave `allowedIds` at the previous `null` from the unauthenticated
  // branch until this fetch resolves, re-enabling the unfiltered sidebar and
  // reintroducing the flash-of-full-menu-then-shrink this hook exists to avoid.
  setAllowedIds(undefined);
  ...
}, [isAuthenticated, isSessionReady, accessLoaded, authRevision, menuAccess, captureSession, isCurrentSession]);
```

`useRoleChangeNotice.js` es el único hook de ETP-5189 al que este mismo tratamiento no se le aplicó — no gatea en `isAuthenticated` en absoluto, ni resetea su `baseline` en logout. Es una omisión puntual en un hook, no un problema de diseño del banner ni de `AuthContext`.

## 4. Propuesta de solución

**Alcance:** únicamente `tools/app-shell/src/hooks/useRoleChangeNotice.js` (este repo). Sin cambios en `AuthContext.jsx`/`sessionController.js` (paquete publicado `@etendosoftware/app-shell-core` — fuera de este repo y no hace falta tocarlo), sin cambios en `RoleChangedBanner.jsx`, sin cambios en `decisions.json` de ninguna ventana.

Leer `isAuthenticated` de `useAuth()` (ya expuesto — `AuthContext.jsx:324`, `isAuthenticated: !!state.session.token` — y ya consumido por los hooks hermanos `useRoleMenu.js`/`useViewerRole.js`/`useSurveyEngine.js`) y, cuando pasa a `false`, resetear el hook a su estado "sin baseline" en vez de dejar que la siguiente carga de acceso se compare contra el baseline de la sesión anterior:

```js
export function useRoleChangeNotice() {
  const { isAuthenticated, isSessionReady, accessLoaded, windowAccess, capabilities, menuAccess } = useAuth();
  const baseline = useRef(null);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    // ETP-5423 — a logout (isAuthenticated flipping true -> false) is a session
    // boundary, not a permission change to diff. Without this, the baseline
    // captured for the just-closed session survives (the effect below bails out
    // on the accessLoaded:false render right after logout, before it can reach
    // the diff), and the NEXT accessLoaded settle — for the unauthenticated
    // session's own empty {} access maps — gets compared against it and
    // misreads a plain logout as a real permission change. Mirrors
    // useRoleMenu.js's own isAuthenticated-gated reset (same ETP-5189 ticket).
    if (!isAuthenticated) {
      baseline.current = null;
      setChanged(false);
      return;
    }
    if (!isSessionReady || !accessLoaded) return;
    const current = { windowAccess, capabilities, menuAccess };
    if (baseline.current === null) {
      baseline.current = current;
      return;
    }
    const isDifferent = baseline.current.windowAccess !== windowAccess
      || baseline.current.capabilities !== capabilities
      || baseline.current.menuAccess !== menuAccess;
    baseline.current = current;
    if (isDifferent) setChanged(true);
  }, [isAuthenticated, isSessionReady, accessLoaded, windowAccess, capabilities, menuAccess]);

  const dismiss = useCallback(() => setChanged(false), []);

  return { changed, dismiss };
}
```

Por qué también resetea `changed` (no solo `baseline`): si el banner ya estaba visible (dismiss pendiente) en el momento del logout, sin este reset seguiría visible tras el logout — el componente no se desmonta (§3.1), así que `changed` no vuelve a `false` por sí solo.

Por qué el siguiente login no vuelve a disparar el banner: tras el reset, `baseline.current` es `null` de nuevo, así que el primer settle autenticado de la nueva sesión (`isSessionReady && accessLoaded` con los mapas ya reales) cae en la rama (b) — "primer settle = baseline", no diff — exactamente el mismo comportamiento ya cubierto por el test existente `'returns false on first render even when isSessionReady && accessLoaded are both true'`.

## 5. Impacto en tests existentes

- `tools/app-shell/src/hooks/__tests__/useRoleChangeNotice.vitest.jsx`: el helper `authState()` no incluye `isAuthenticated` hoy — con el fix, todas las llamadas a `mockUseAuth` deberán incluir `isAuthenticated: true` (por defecto en el helper) para que los 10 tests existentes seguirán pasando sin modificarlos uno a uno. Añadir casos nuevos: (a) logout limpio (`isAuthenticated: true→false`) tras un baseline ya asentado → `changed` permanece `false`; (b) logout mientras el banner ya está visible (`changed: true`) → pasa a `false`; (c) el ciclo completo logout → login (nueva sesión con mapas `{}`→poblados) → `changed` permanece `false` en el primer settle post-login, reproduciendo exactamente la secuencia de §3.3.
- `tools/app-shell/src/components/__tests__/RoleChangedBanner.vitest.jsx`: mockea `useRoleChangeNotice` directamente, no `useAuth()` — no necesita cambios, pero vale la pena confirmar que sigue pasando.

Por la política del repo, la escritura/extensión de estos tests se delega a **Tester** (`test-generator`), no al Developer.

## 6. Preguntas abiertas para DEV/QA

- **Cobertura del ciclo logout→login sin recarga completa:** confirmar en vivo (local o PRO) que, tras el fix, un logout seguido de un login inmediato (sin F5) no deja ningún residuo — ninguno de los casos de prueba del propio ticket ("Given: el usuario cierra sesión y vuelve a iniciar sesión... Then: no aparece ningún cartel residual") debería fallar, pero merece verificación explícita ya que es exactamente el escenario que este bug rompía.
- **¿Existe algún otro consumidor de `useRoleChangeNotice` además de `RoleChangedBanner`?** Búsqueda rápida no encontró otros; confirmar en REVIEW por si acaso, ya que el cambio de comportamiento (reset en logout) afectaría a cualquier otro consumidor futuro.

## 7. Enrutamiento en el pipeline

- **DEV** — Schema Forge Developer. Archivo único: `tools/app-shell/src/hooks/useRoleChangeNotice.js`.
- **REVIEW** — Alex: confirmar que el patrón replica fielmente el de `useRoleMenu.js` (mismo ticket, mismo repo); confirmar que no se toca `AuthContext.jsx`/paquete publicado; `npx sf-validate-pipeline` no debería reportar nada (no hay cambios en `decisions.json`/`generated/`).
- **QA** — Sentinel: los dos casos Given/When/Then del ticket, más el ciclo logout→login sin recarga (ver §6), verificados en el entorno que esté disponible (local o PRO).
- **DOCS** — Sage: no hay guía de ventana afectada (el banner es transversal, no de una ventana); revisar si existe alguna doc general de sesión/auth que mencione `RoleChangedBanner`/ETP-5189 y deba actualizarse con la nota del fix.
