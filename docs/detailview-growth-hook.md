# DetailView growth guard

Claude's project hook rejects `Edit`, `Write`, and `MultiEdit` operations that would leave `DetailView.jsx` or `DetailView.tsx` longer than the merge-base of the current branch and its base ref.

The hook searches for a base in this order:

1. `DETAILVIEW_BASE_REF`, when configured;
2. `origin/develop`;
3. `develop`;
4. `origin/main` or `main`.

Override the automatic choice when needed:

```sh
DETAILVIEW_BASE_REF=origin/develop claude
```

The check is predictive for Claude `Edit` and `Write` payloads. It fails closed when it cannot resolve the base, read the baseline, or calculate the proposed file contents.
