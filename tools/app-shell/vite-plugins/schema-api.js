import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';

const ARTIFACTS_DIR = resolve(import.meta.dirname, '../../../artifacts');
const REPO_ROOT = resolve(ARTIFACTS_DIR, '..');
const CONTRACT_GENERATOR = resolve(import.meta.dirname, '../../../cli/src/generate-contract.js');
const FRONTEND_GENERATOR = resolve(import.meta.dirname, '../../../cli/src/generate-frontend.js');

const SAFE_WINDOW_RE = /^[a-z0-9-]+$/;
const SAFE_REF_RE = /^[a-f0-9]{7,40}$/;
const ALLOWED_ARTIFACT_FILES = ['schema-raw.json', 'schema-curated.json', 'contract.json'];

/**
 * Vite plugin that exposes REST endpoints for the Schema Inspector
 * and the Artifact Viewer.
 *
 * Schema Inspector:
 *   GET  /api/schema/:window           — read schema-curated.json
 *   GET  /api/schema-raw/:window       — read schema-raw.json
 *   POST /api/schema/:window           — write schema, regenerate contract + frontend
 *
 * Artifact Viewer:
 *   GET  /api/artifacts                 — list windows with artifact files
 *   GET  /api/artifacts/:window/history — git history for a window's files
 *   GET  /api/artifacts/:window/:file   — read artifact file (optional ?ref= for git version)
 */
export default function schemaApiPlugin() {
  return {
    name: 'schema-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const parsedUrl = new URL(req.url, 'http://localhost');
        const pathname = parsedUrl.pathname;

        // --- Artifact Viewer endpoints ---

        // GET /api/artifacts (list windows)
        if (pathname === '/api/artifacts' && req.method === 'GET') {
          return handleListArtifacts(res);
        }

        // GET /api/artifacts/:window/history
        const historyMatch = pathname.match(/^\/api\/artifacts\/([^/]+)\/history$/);
        if (historyMatch && req.method === 'GET') {
          const windowName = historyMatch[1];
          if (!SAFE_WINDOW_RE.test(windowName)) {
            return sendError(res, 400, 'Invalid window name');
          }
          return handleArtifactHistory(res, windowName);
        }

        // GET /api/artifacts/:window/:file?ref=hash
        const fileMatch = pathname.match(/^\/api\/artifacts\/([^/]+)\/([^/]+)$/);
        if (fileMatch && req.method === 'GET') {
          const windowName = fileMatch[1];
          const fileName = fileMatch[2];
          if (!SAFE_WINDOW_RE.test(windowName)) {
            return sendError(res, 400, 'Invalid window name');
          }
          if (!ALLOWED_ARTIFACT_FILES.includes(fileName)) {
            return sendError(res, 400, 'File not allowed. Must be one of: ' + ALLOWED_ARTIFACT_FILES.join(', '));
          }
          const ref = parsedUrl.searchParams.get('ref') || null;
          if (ref && !SAFE_REF_RE.test(ref)) {
            return sendError(res, 400, 'Invalid git ref format');
          }
          return handleArtifactFile(res, windowName, fileName, ref);
        }

        // --- Schema Inspector endpoints ---

        // GET /api/schema-raw/:window
        const rawMatch = pathname.match(/^\/api\/schema-raw\/([^/?]+)/);
        if (rawMatch && req.method === 'GET') {
          const windowName = rawMatch[1];
          if (!SAFE_WINDOW_RE.test(windowName)) {
            return sendError(res, 400, 'Invalid window name');
          }
          return serveJson(res, windowName, 'schema-raw.json');
        }

        // GET /api/schema/:window
        const getMatch = pathname.match(/^\/api\/schema\/([^/?]+)/);
        if (getMatch && req.method === 'GET') {
          const windowName = getMatch[1];
          if (!SAFE_WINDOW_RE.test(windowName)) {
            return sendError(res, 400, 'Invalid window name');
          }
          return serveJson(res, windowName, 'schema-curated.json');
        }

        // POST /api/schema/:window
        const postMatch = req.url?.match(/^\/api\/schema\/([^/?]+)/);
        if (postMatch && req.method === 'POST') {
          const windowName = postMatch[1];
          if (!SAFE_WINDOW_RE.test(windowName)) {
            return sendError(res, 400, 'Invalid window name');
          }
          return handlePost(req, res, windowName);
        }

        next();
      });
    },
  };
}

function sendError(res, status, message) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: message }));
}

/** List all windows that have at least one of the 3 artifact files. */
function handleListArtifacts(res) {
  try {
    const entries = readdirSync(ARTIFACTS_DIR, { withFileTypes: true });
    const windows = entries
      .filter((e) => e.isDirectory())
      .filter((e) => {
        const dir = join(ARTIFACTS_DIR, e.name);
        return ALLOWED_ARTIFACT_FILES.some((f) => existsSync(join(dir, f)));
      })
      .map((e) => e.name)
      .sort();

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ windows }));
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

/** Git history for a window's artifact files (last 50 commits). */
function handleArtifactHistory(res, windowName) {
  try {
    const filePaths = ALLOWED_ARTIFACT_FILES.map(
      (f) => `artifacts/${windowName}/${f}`
    ).join(' ');

    const cmd = `git log -50 --pretty=format:'%h||%ci||%s' --follow -- ${filePaths}`;
    const output = execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 10000 });

    const commits = output
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const [hash, date, ...subjectParts] = line.split('||');
        return { hash, date, subject: subjectParts.join('||') };
      });

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ commits }));
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

/** Read an artifact file, optionally at a specific git ref. */
function handleArtifactFile(res, windowName, fileName, ref) {
  try {
    let data;
    if (ref) {
      const gitPath = `artifacts/${windowName}/${fileName}`;
      const cmd = `git show ${ref}:${gitPath}`;
      data = execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf-8', timeout: 10000 });
    } else {
      const filePath = join(ARTIFACTS_DIR, windowName, fileName);
      data = readFileSync(filePath, 'utf-8');
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT' || (err.stderr && err.stderr.includes('does not exist'))) {
      sendError(res, 404, 'File not found at this version');
    } else {
      sendError(res, 500, err.message);
    }
  }
}

function serveJson(res, window, filename) {
  try {
    const filePath = join(ARTIFACTS_DIR, window, filename);
    const data = readFileSync(filePath, 'utf-8');
    res.setHeader('Content-Type', 'application/json');
    res.end(data);
  } catch (err) {
    res.statusCode = err.code === 'ENOENT' ? 404 : 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message }));
  }
}

async function handlePost(req, res, window) {
  const start = performance.now();

  try {
    const body = await readBody(req);
    const { schema } = JSON.parse(body);

    if (!schema) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing "schema" in request body' }));
      return;
    }

    const windowDir = join(ARTIFACTS_DIR, window);
    mkdirSync(windowDir, { recursive: true });

    // 1. Write schema-curated.json
    const schemaPath = join(windowDir, 'schema-curated.json');
    writeFileSync(schemaPath, JSON.stringify(schema, null, 2));

    // 2. Generate contract
    const { generateContract } = await import(CONTRACT_GENERATOR);
    const contract = generateContract(schema);
    const contractPath = join(windowDir, 'contract.json');
    writeFileSync(contractPath, JSON.stringify(contract, null, 2));

    // 3. Generate frontend files
    const { generateAll } = await import(FRONTEND_GENERATOR);
    const files = generateAll(contract);
    const webDir = join(windowDir, 'generated', 'web', window);
    mkdirSync(webDir, { recursive: true });

    const writtenFiles = [];
    for (const [filename, code] of Object.entries(files)) {
      const filePath = join(webDir, filename);
      writeFileSync(filePath, code);
      writtenFiles.push(filename);
    }

    const duration = ((performance.now() - start) / 1000).toFixed(1);

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      ok: true,
      regenerated: true,
      duration: `${duration}s`,
      files: writtenFiles,
    }));
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message }));
  }
}

function readBody(req, limit = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}
