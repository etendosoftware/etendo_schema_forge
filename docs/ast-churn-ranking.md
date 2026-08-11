# AST churn ranking

Use the Make target to rank AST-derived units by churn from the last 15 days and show the current branch delta against `origin/main` when that ref is available:

```sh
make ast-churn-ranking
```

Useful overrides:

```sh
make ast-churn-ranking HOTSPOT_FILE=tools/app-shell/src/components/contract-ui/DataTable.jsx
make ast-churn-ranking HOTSPOT_DAYS=30 BASE_REF=main HOTSPOT_LIMIT=20
```

`BASE_REF` is resolved through `git merge-base BASE_REF HEAD` and the delta is measured with `git diff` from that merge-base to `HEAD`. If the base ref cannot be resolved, the ranking still runs and reports the delta as unavailable.
