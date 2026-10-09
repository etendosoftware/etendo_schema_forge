// Environment for git commands that act on a path other than the repo the process was started in
// (a temp fixture repo, a child script pointed at another root). git hooks export GIT_DIR,
// GIT_WORK_TREE, GIT_INDEX_FILE, GIT_PREFIX and friends into the hook environment; an inherited
// one silently redirects every git call to the hook's repo, whatever `cwd` says.
export function sanitizedGitEnv(env = process.env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.startsWith('GIT_')));
}
