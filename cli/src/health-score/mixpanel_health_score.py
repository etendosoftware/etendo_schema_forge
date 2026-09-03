#!/usr/bin/env python3
"""
Mixpanel Health Score Calculator — ETP-4210

Calcula health_score y health_band por account_id usando eventos de los últimos 30 días
y escribe los resultados en los Group Profiles de Mixpanel.
También enriquece cada cuenta con el email/nombre de sus usuarios activos.

Credentials: ALL secrets (Service Account credentials and per-project Mixpanel
tokens) are read exclusively from environment variables / a local `.env` file.
NONE of them are hardcoded in this file. See `.env.example` in this same
directory for the full list of required variables and how to name them.

Setup:
  1. Crear un Service Account en Mixpanel → Settings → Service Accounts
  2. Copiar el token del proyecto en Mixpanel → Settings → Overview → Project Token
  3. Copiar cli/src/health-score/.env.example a .env (o exportar las variables
     en tu shell) y completar los valores reales — NUNCA committear ese .env.

Uso:
  pip install -r requirements.txt
  python3 mixpanel_health_score.py
  python3 mixpanel_health_score.py --dry-run   # solo muestra scores, no escribe
"""

import os
import sys
import json
import argparse
import requests
from datetime import datetime, timedelta, timezone
from collections import defaultdict

# ─── PROJECT CONFIGS ───────────────────────────────────────────────────────────
# "id" is the Mixpanel project id (not a secret). "token_env" names the
# environment variable that holds that project's real Mixpanel token — the
# token itself is NEVER hardcoded here, see .env.example.
PROJECTS = {
    "testing": {
        "id":        "4035558",
        "token_env": "MIXPANEL_TOKEN_TESTING",
        "account_names": {
            "3975AF7B70E24ED1B2AC7429807FFB72": "SMF Consulting",
            "CLIENT_1":                          "QA Admin",
        },
    },
    "etendo-go": {
        "id":        "4026645",
        "token_env": "MIXPANEL_TOKEN_ETENDO_GO",
        "account_names": {},
    },
}

# ─── CONFIG ────────────────────────────────────────────────────────────────────
# Resolved after argparse (see main()). No hardcoded secrets or defaults here —
# all credentials must come from the environment / .env file.
PROJECT_ID    = os.getenv("MIXPANEL_PROJECT_ID", "")
PROJECT_TOKEN = os.getenv("MIXPANEL_TOKEN", "")
SA_USERNAME   = os.getenv("MIXPANEL_SA_USERNAME")
SA_SECRET     = os.getenv("MIXPANEL_SA_SECRET")

# ─── ACCOUNT NAMES ─────────────────────────────────────────────────────────────
ACCOUNT_NAMES: dict = {}  # populated at startup from selected project config

def account_display_name(account_id: str, primary_user: str = "") -> str:
    if account_id in ACCOUNT_NAMES:
        return ACCOUNT_NAMES[account_id]
    # Fallback: username del usuario principal (email o no), único por cuenta en cuentas de un solo usuario
    if primary_user:
        return primary_user
    return account_id

# ─── ENDPOINTS (EU) ────────────────────────────────────────────────────────────
EXPORT_URL  = "https://data-eu.mixpanel.com/api/2.0/export"
ENGAGE_URL  = "https://eu.mixpanel.com/api/2.0/engage"
GROUPS_URL  = "https://api-eu.mixpanel.com/groups#set"
GROUP_KEY   = "account_id"
LOOKBACK_DAYS = 30

# ─── SCORING ───────────────────────────────────────────────────────────────────
def activity_score(tx_count: int) -> int:
    if tx_count >= 20: return 35
    if tx_count >= 5:  return 28
    if tx_count >= 1:  return 15
    return 0

def depth_score(distinct_areas: int) -> int:
    if distinct_areas >= 3: return 25
    if distinct_areas == 2: return 16
    if distinct_areas == 1: return 8
    return 0

def login_score(days_since_last) -> int:
    if days_since_last is None: return 0
    if days_since_last <= 2:    return 20
    if days_since_last <= 7:    return 14
    if days_since_last <= 14:   return 7
    return 0

def support_score(ticket_count: int) -> int:
    if ticket_count == 0:  return 20
    if ticket_count <= 2:  return 14
    if ticket_count <= 4:  return 8
    return 0

def apply_activation_gate(raw_score: int, has_transaction: bool, first_session: datetime, today: datetime) -> int:
    """Cap score at 30 if no transaction posted within 14 days of first session."""
    if has_transaction:
        return raw_score
    if first_session and (today - first_session).days > 14:
        return min(raw_score, 30)
    return raw_score

def health_band(score: int) -> str:
    if score >= 70: return "green"
    if score >= 40: return "yellow"
    return "red"

# ─── FETCH EVENTS ──────────────────────────────────────────────────────────────
def fetch_events(from_date: str, to_date: str) -> list:
    events = ["transaction_posted", "document_created", "session_started", "support_ticket_created"]
    params = {
        "project_id": PROJECT_ID,
        "from_date":  from_date,
        "to_date":    to_date,
        "event":      json.dumps(events),
    }
    resp = requests.get(
        EXPORT_URL,
        params=params,
        auth=(SA_USERNAME, SA_SECRET),
        stream=True,
        timeout=120,
    )
    resp.raise_for_status()

    rows = []
    for line in resp.iter_lines():
        if line:
            rows.append(json.loads(line))
    return rows

# ─── FETCH USER PROFILES ───────────────────────────────────────────────────────
def fetch_user_profiles(distinct_ids: list, debug: bool = False) -> dict:
    """
    Consulta la Engage API para obtener $email y $name de una lista de distinct_ids.
    Devuelve dict: { distinct_id -> {"email": ..., "name": ...} }
    """
    if not distinct_ids:
        return {}

    profiles = {}
    batch_size = 50  # evitar URLs demasiado largas

    for i in range(0, len(distinct_ids), batch_size):
        batch = distinct_ids[i : i + batch_size]

        # Construir filtro JQL
        conditions = " or ".join(
            f'user["$distinct_id"] == "{did}"' for did in batch
        )

        try:
            resp = requests.get(
                ENGAGE_URL,
                params={"project_id": PROJECT_ID, "where": conditions},
                auth=(SA_USERNAME, SA_SECRET),
                timeout=60,
            )
            if debug:
                print(f"\n  [debug] Engage API status: {resp.status_code}")
                print(f"  [debug] Engage API response: {resp.text[:500]}")
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"  [warn] No se pudieron obtener perfiles de usuario: {e}")
            continue

        for profile in data.get("results", []):
            did   = profile.get("$distinct_id", "")
            props = profile.get("$properties", {})
            email = props.get("$email", "")
            name  = props.get("$name", "") or props.get("$first_name", "")
            if email or name:
                profiles[did] = {"email": email, "name": name}

    return profiles

# ─── COMPUTE ───────────────────────────────────────────────────────────────────
def compute_scores(events: list, today: datetime) -> tuple:
    """Returns (scores dict, distinct_ids_by_account dict)"""
    cutoff = today - timedelta(days=LOOKBACK_DAYS)

    tx_counts             = defaultdict(int)
    functional_areas      = defaultdict(set)
    last_session          = {}
    first_session         = {}
    support_counts        = defaultdict(int)
    distinct_ids_by_acct  = defaultdict(set)
    usernames_by_acct     = defaultdict(set)

    for event in events:
        props      = event.get("properties", {})
        account_id = props.get("account_id")
        if not account_id:
            continue
        if isinstance(account_id, list):
            account_id = account_id[0] if account_id else None
            if not account_id:
                continue
        account_id = str(account_id)

        # Recolectar distinct_id y username del usuario que disparó el evento
        distinct_id = props.get("distinct_id") or props.get("$distinct_id")
        if distinct_id:
            distinct_ids_by_acct[account_id].add(str(distinct_id))
        username = props.get("username")
        if username and isinstance(username, str):
            usernames_by_acct[account_id].add(username)

        event_time = datetime.fromtimestamp(props.get("time", 0), tz=timezone.utc)
        event_name = event.get("event")

        if event_name == "transaction_posted" and event_time >= cutoff:
            tx_counts[account_id] += 1

        if event_name == "document_created" and event_time >= cutoff:
            area = props.get("functional_area")
            if area:
                areas_list = area if isinstance(area, list) else [area]
                for item in areas_list:
                    if isinstance(item, list):
                        functional_areas[account_id].update(str(i) for i in item)
                    elif item:
                        functional_areas[account_id].add(str(item))

        if event_name == "session_started":
            prev_last = last_session.get(account_id)
            if prev_last is None or event_time > prev_last:
                last_session[account_id] = event_time
            prev_first = first_session.get(account_id)
            if prev_first is None or event_time < prev_first:
                first_session[account_id] = event_time

        if event_name == "support_ticket_created" and event_time >= cutoff:
            support_counts[account_id] += 1

    all_accounts = set(tx_counts) | set(functional_areas) | set(last_session) | set(support_counts)

    scores = {}
    for account_id in all_accounts:
        tx      = tx_counts[account_id]
        areas   = len(functional_areas[account_id])
        tickets = support_counts[account_id]

        last_s     = last_session.get(account_id)
        days_since = (today - last_s).days if last_s else None

        act  = activity_score(tx)
        dep  = depth_score(areas)
        log  = login_score(days_since)
        sup  = support_score(tickets)
        raw  = act + dep + log + sup

        # Activation gate: cap at 30 if no transaction within 14 days of first session
        has_tx   = tx > 0
        first_s  = first_session.get(account_id)
        total    = apply_activation_gate(raw, has_tx, first_s, today)
        gated    = total < raw

        scores[account_id] = {
            "health_score": total,
            "health_band":  health_band(total),
            "users":        [],
            "_debug": {
                "activity_pts":            act,
                "tx_count_30d":            tx,
                "depth_pts":               dep,
                "distinct_areas_30d":      areas,
                "login_pts":               log,
                "support_pts":             sup,
                "ticket_count_30d":        tickets,
                "days_since_last_session": days_since,
                "activation_gated":        gated,
            },
        }

    # Inyectar usernames directamente desde los eventos (campo "username" = email)
    for account_id, data in scores.items():
        data["users"] = sorted(usernames_by_acct.get(account_id, set()))

    return scores, distinct_ids_by_acct

# ─── ENRICH WITH USER INFO ─────────────────────────────────────────────────────
def enrich_with_users(scores: dict, distinct_ids_by_acct: dict, debug: bool = False) -> None:
    """Añade lista de usuarios (email/name) a cada cuenta en scores (in-place)."""
    all_dids = list({did for dids in distinct_ids_by_acct.values() for did in dids})
    if not all_dids:
        print("      [warn] No se encontraron distinct_ids en los eventos.")
        return

    if debug:
        print(f"\n  [debug] distinct_ids recolectados ({len(all_dids)}):")
        for acct, dids in distinct_ids_by_acct.items():
            print(f"    {acct}: {sorted(dids)}")

    print(f"      Consultando perfiles de {len(all_dids)} usuario(s)...")
    profiles = fetch_user_profiles(all_dids, debug=debug)

    if debug:
        print(f"\n  [debug] Perfiles encontrados en Engage API: {len(profiles)}")
        for did, info in profiles.items():
            print(f"    {did}: {info}")

    for account_id, data in scores.items():
        users = []
        for did in distinct_ids_by_acct.get(account_id, []):
            info = profiles.get(did)
            if info:
                label = info["email"] or info["name"] or did
                users.append(label)
            elif debug:
                print(f"  [debug] Sin perfil para distinct_id={did} (cuenta {account_id})")
        # Merge: añadir lo de Engage API a lo ya recolectado desde eventos
        existing = set(data.get("users", []))
        existing.update(users)
        data["users"] = sorted(existing)

# ─── WRITE GROUP PROFILES ──────────────────────────────────────────────────────
def update_group_profiles(scores: dict) -> None:
    items      = list(scores.items())
    batch_size = 50

    for i in range(0, len(items), batch_size):
        batch   = items[i : i + batch_size]
        payload = []
        for account_id, data in batch:
            d = data["_debug"]
            set_props = {
                "health_score":            data["health_score"],
                "health_band":             data["health_band"],
                "health_score_updated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                "hs_activity_pts":         d["activity_pts"],
                "hs_depth_pts":            d["depth_pts"],
                "hs_login_pts":            d["login_pts"],
                "hs_support_pts":          d["support_pts"],
                "hs_activation_gated":     d["activation_gated"],
            }
            primary = data["users"][0] if data["users"] else ""
            display = account_display_name(account_id, primary)
            set_props["$name"]               = display
            set_props["account_name"]        = display
            if primary:
                set_props["account_primary_user"] = primary
            payload.append({
                "$token":     PROJECT_TOKEN,
                "$group_key": GROUP_KEY,
                "$group_id":  account_id,
                "$set":       set_props,
            })

        resp = requests.post(
            GROUPS_URL,
            data={"data": json.dumps(payload)},
            timeout=30,
        )
        resp.raise_for_status()
        print(f"  Batch {i // batch_size + 1}: {len(batch)} cuentas actualizadas")

# ─── TRACK HEALTH SCORE EVENTS ────────────────────────────────────────────────
IMPORT_URL = "https://api-eu.mixpanel.com/import"

def track_health_score_events(scores: dict, today: datetime) -> None:
    """Envía un evento health_score_calculated por cuenta vía Import API.

    NOTE: $insert_id incluye la fecha a propósito. Mixpanel's $insert_id
    dedup keeps the FIRST event and silently drops later ones with the same
    insert_id (verified empirically) — it is NOT an upsert. Removing the
    date would freeze every account's score at its first-ever computed
    value forever. Keep the per-day suffix; dedupe re-runs on the SAME day
    only, and clean up historical duplicates via Mixpanel's Data Deletion
    API (or a "most recent per account" filter in reports) instead.
    """
    date_str = today.strftime("%Y-%m-%d")
    ts       = int(today.timestamp())
    events   = []
    for account_id, data in scores.items():
        d = data["_debug"]
        events.append({
            "event": "health_score_calculated",
            "properties": {
                "token":                   PROJECT_TOKEN,
                "distinct_id":             "health-score-calculator",
                "$insert_id":              f"hs_{account_id}_{date_str}",
                "time":                    ts,
                "account_id":              account_id,
                "$groups":                 {GROUP_KEY: account_id},
                "health_score":            data["health_score"],
                "health_band":             data["health_band"],
                "hs_activity_pts":         d["activity_pts"],
                "hs_depth_pts":            d["depth_pts"],
                "hs_login_pts":            d["login_pts"],
                "hs_support_pts":          d["support_pts"],
                "hs_activation_gated":     d["activation_gated"],
                "tx_count_30d":            d["tx_count_30d"],
                "distinct_areas_30d":      d["distinct_areas_30d"],
                "ticket_count_30d":        d["ticket_count_30d"],
                "days_since_last_session": d["days_since_last_session"],
                "period_days":             LOOKBACK_DAYS,
                "primary_user":            data["users"][0] if data["users"] else None,
                "account_name":            account_display_name(account_id, data["users"][0] if data["users"] else ""),
            },
        })

    resp = requests.post(
        IMPORT_URL,
        params={"strict": 1, "project_id": PROJECT_ID},
        json=events,
        auth=(SA_USERNAME, SA_SECRET),
        timeout=30,
    )
    resp.raise_for_status()
    result = resp.json()
    imported = result.get("num_records_imported", len(events))
    print(f"  {imported} eventos health_score_calculated importados")

# ─── PRINT TABLE ───────────────────────────────────────────────────────────────
def print_table(scores: dict) -> None:
    header = (
        f"  {'account_id':<38} {'score':>5}  {'band':<8}  {'gate':<5}"
        f"  {'act':>4}  {'dep':>4}  {'log':>4}  {'sup':>4}"
        f"  {'tx':>4}  {'areas':>5}  {'tkts':>4}  {'days':>4}"
        f"  usuarios"
    )
    print(header)
    print("  " + "─" * (len(header) - 2))
    for account_id, data in sorted(scores.items(), key=lambda x: -x[1]["health_score"]):
        d      = data["_debug"]
        users  = ", ".join(data["users"]) if data["users"] else "—"
        gate   = "⚠️" if d["activation_gated"] else "—"
        print(
            f"  {account_id:<38}"
            f"  {data['health_score']:>5}"
            f"  {data['health_band']:<8}"
            f"  {gate:<5}"
            f"  {d['activity_pts']:>4}"
            f"  {d['depth_pts']:>4}"
            f"  {d['login_pts']:>4}"
            f"  {d['support_pts']:>4}"
            f"  {d['tx_count_30d']:>4}"
            f"  {d['distinct_areas_30d']:>5}"
            f"  {d['ticket_count_30d']:>4}"
            f"  {str(d['days_since_last_session']):>4}"
            f"  {users}"
        )

# ─── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Calcula y publica health scores en Mixpanel.")
    parser.add_argument("--dry-run",  action="store_true", help="Solo muestra scores, no escribe en Mixpanel.")
    parser.add_argument("--debug",    action="store_true", help="Muestra info de diagnóstico.")
    parser.add_argument(
        "--project",
        choices=list(PROJECTS.keys()),
        default="testing",
        help="Proyecto Mixpanel destino (default: testing).",
    )
    args = parser.parse_args()

    # Resolve project config — env vars override the selected project defaults.
    # The real token is NEVER hardcoded: it comes from the project-specific
    # env var (see PROJECTS[...]["token_env"] and .env.example), optionally
    # overridden by the generic MIXPANEL_TOKEN.
    proj = PROJECTS[args.project]
    global PROJECT_ID, PROJECT_TOKEN, ACCOUNT_NAMES
    PROJECT_ID    = os.getenv("MIXPANEL_PROJECT_ID", proj["id"])
    PROJECT_TOKEN = os.getenv("MIXPANEL_TOKEN") or os.getenv(proj["token_env"], "")
    ACCOUNT_NAMES = proj["account_names"].copy()

    if not SA_USERNAME or not SA_SECRET:
        print(
            "ERROR: MIXPANEL_SA_USERNAME y MIXPANEL_SA_SECRET son requeridos. "
            "Definilos como variables de entorno (o en un .env local, ver "
            "cli/src/health-score/.env.example) antes de correr el script."
        )
        sys.exit(1)

    if not args.dry_run and not PROJECT_TOKEN:
        print(
            f"ERROR: falta el token de Mixpanel para el proyecto '{args.project}'. "
            f"Definí {proj['token_env']} (o MIXPANEL_TOKEN) como variable de entorno "
            "— ver cli/src/health-score/.env.example."
        )
        sys.exit(1)

    today     = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    from_date = (today - timedelta(days=LOOKBACK_DAYS)).strftime("%Y-%m-%d")
    to_date   = today.strftime("%Y-%m-%d")

    print(f"\n=== Mixpanel Health Score — ETP-4210 ===")
    print(f"Proyecto: {PROJECT_ID} | Período: {from_date} → {to_date}\n")

    print(f"[1/3] Descargando eventos...")
    events = fetch_events(from_date, to_date)
    print(f"      {len(events)} eventos descargados\n")

    print(f"[2/3] Calculando scores...")
    scores, distinct_ids_by_acct = compute_scores(events, today)
    print(f"      {len(scores)} cuentas encontradas")
    enrich_with_users(scores, distinct_ids_by_acct, debug=args.debug)
    print()

    print_table(scores)
    print()

    if args.dry_run:
        print("Modo dry-run: no se escribió nada en Mixpanel.")
        return

    answer = input("[3/3] ¿Escribir scores en Mixpanel Group Profiles? [s/N] ").strip().lower()
    if answer != "s":
        print("Cancelado.")
        return

    print("\nActualizando Group Profiles...")
    update_group_profiles(scores)

    print("\nRegistrando eventos health_score_calculated...")
    track_health_score_events(scores, today)

    print("\n✅ Listo. Los scores ya están disponibles como propiedades de grupo en Mixpanel.")

if __name__ == "__main__":
    main()
