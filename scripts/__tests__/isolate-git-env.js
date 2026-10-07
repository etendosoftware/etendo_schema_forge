// Imported for its side effect by the tests that build a git fixture repository.
//
// Inside a git hook (the pre-push runs these tests) git exports GIT_DIR, GIT_INDEX_FILE and the
// like, pointing at the real repository, and every `git` a test starts, directly or through the
// script under test, follows them instead of its `cwd`. Pushing from a worktree, the fixture's
// init/add/commit then landed in the real repository: it was marked bare, its index replaced and
// two commits added to the branch being pushed. Each test file runs in its own process and ESM
// imports are evaluated before the importing module's body, so importing this first is enough.
// Same list as cli/test/ast-churn-hotspot.test.js.
for (const key of [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_PREFIX',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
]) delete process.env[key];
