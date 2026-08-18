#!/usr/bin/env bash
# Creates an idempotent, per-developer Kubernetes pre-push runner and cache.
set -euo pipefail

fail() { echo "ERROR: $*" >&2; exit 1; }

REPO_DIR="$(git rev-parse --show-toplevel)"
KUBECONFIG_PATH="${PREPUSH_KUBECONFIG:-}"
KUBE_CONTEXT="${PREPUSH_KUBE_CONTEXT:-}"
DEVELOPER_EMAIL="${PREPUSH_DEVELOPER_EMAIL:-$(git -C "$REPO_DIR" config user.email 2>/dev/null || true)}"
DEVELOPER_SLUG="$(printf '%s' "$DEVELOPER_EMAIL" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | sed 's/^-*//; s/-*$//')"
[[ -n "${PREPUSH_NAMESPACE:-}" || -n "$DEVELOPER_SLUG" ]] || \
  fail "Git user.email is required to derive the personal runner namespace; set PREPUSH_NAMESPACE to override it."
NAMESPACE="${PREPUSH_NAMESPACE:-prepush-$DEVELOPER_SLUG}"
DEPLOYMENT="${PREPUSH_DEPLOYMENT:-prepush-runner}"
PVC_NAME="${PREPUSH_PVC:-runner-state}"
CACHE_SIZE="${PREPUSH_CACHE_SIZE:-20Gi}"
CPU_REQUEST="${PREPUSH_CPU_REQUEST:-4}"
CPU_LIMIT="${PREPUSH_CPU_LIMIT:-8}"
MEMORY_REQUEST="${PREPUSH_MEMORY_REQUEST:-8Gi}"
MEMORY_LIMIT="${PREPUSH_MEMORY_LIMIT:-16Gi}"

if [[ -z "$KUBECONFIG_PATH" && -f "$REPO_DIR/.env" ]]; then
  KUBECONFIG_PATH="$(awk -F= '$1 == "PREPUSH_KUBECONFIG" { value = substr($0, index($0, "=") + 1); gsub(/^[[:space:]\"'"'"']+|[[:space:]\"'"'"']+$/, "", value); print value; exit }' "$REPO_DIR/.env")"
fi
[[ -n "$KUBECONFIG_PATH" && -f "$KUBECONFIG_PATH" ]] || fail "PREPUSH_KUBECONFIG must point to a readable kubeconfig."
command -v kubectl >/dev/null 2>&1 || fail "kubectl is not available in PATH."
KUBECTL_ARGS=(--kubeconfig "$KUBECONFIG_PATH")
[[ -n "$KUBE_CONTEXT" ]] && KUBECTL_ARGS+=(--context "$KUBE_CONTEXT")
kube() { kubectl "${KUBECTL_ARGS[@]}" "$@"; }

kube apply -f - <<EOF
apiVersion: v1
kind: Namespace
metadata:
  name: $NAMESPACE
  labels:
    app.kubernetes.io/part-of: developer-prepush-runner
    app.kubernetes.io/managed-by: prepush-provisioner
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: $PVC_NAME
  namespace: $NAMESPACE
  labels:
    app.kubernetes.io/name: $DEPLOYMENT
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: do-block-storage
  resources:
    requests:
      storage: $CACHE_SIZE
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: $DEPLOYMENT
  namespace: $NAMESPACE
  labels:
    app.kubernetes.io/name: $DEPLOYMENT
spec:
  # Compute is started by a cloud pre-push and scaled back to zero on exit.
  replicas: 0
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app.kubernetes.io/name: $DEPLOYMENT
  template:
    metadata:
      labels:
        app.kubernetes.io/name: $DEPLOYMENT
      annotations:
        cluster-autoscaler.kubernetes.io/safe-to-evict: "false"
    spec:
      # The validation has already ended when the wrapper scales down. Keep a
      # short grace period so an idle runner does not reserve compute for ten
      # additional minutes.
      terminationGracePeriodSeconds: 30
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        fsGroup: 1000
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: runner
          image: node:22-bookworm
          imagePullPolicy: IfNotPresent
          command: [sh, -ceu, "mkdir -p /state/npm-cache /state/sonar-cache /state/tools /state/runs /state/vite-cache /state/git; while true; do sleep 3600; done"]
          resources:
            requests: {cpu: "$CPU_REQUEST", memory: $MEMORY_REQUEST}
            limits: {cpu: "$CPU_LIMIT", memory: $MEMORY_LIMIT}
          securityContext:
            allowPrivilegeEscalation: false
            capabilities: {drop: [ALL]}
            readOnlyRootFilesystem: true
          volumeMounts:
            - {name: runner-state, mountPath: /state}
            - {name: tmp, mountPath: /tmp}
      volumes:
        - name: runner-state
          persistentVolumeClaim: {claimName: $PVC_NAME}
        - name: tmp
          emptyDir: {}
EOF

printf '\nPersonal runner provisioned and scaled to zero.\nNamespace: %s\nDeployment: %s\nPVC: %s (%s)\nBurst resources: %s CPU / %s memory (requested %s CPU / %s)\n' \
  "$NAMESPACE" "$DEPLOYMENT" "$PVC_NAME" "$CACHE_SIZE" "$CPU_LIMIT" "$MEMORY_LIMIT" "$CPU_REQUEST" "$MEMORY_REQUEST"
