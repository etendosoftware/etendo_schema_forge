# DetailView growth guard

Claude's project hook rejects `Edit`, `Write`, and `MultiEdit` operations that would leave `DetailView.jsx` or `DetailView.tsx` longer than the merge-base of the current branch and its base ref.

The hook searches for a base in this order:

1. `DETAILVIEW_BASE_REF`, when configured;
2. `origin/epic/ETP-3504`;
3. `epic/ETP-3504`;
4. `origin/main`, `main`, `origin/develop`, or `develop`.

Override the automatic choice when needed:

```sh
DETAILVIEW_BASE_REF=epic/ETP-3504 claude
```

The check is predictive for Claude `Edit` and `Write` payloads. It fails closed when it cannot resolve the base, read the baseline, or calculate the proposed file contents.
