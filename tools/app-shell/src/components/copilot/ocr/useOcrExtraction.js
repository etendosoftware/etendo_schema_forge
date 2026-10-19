import { useCallback, useState } from 'react';
import { isNetworkError } from '@etendosoftware/app-shell-core/auth';
import { executeTool, extractAnswerText, uploadFile } from '../copilotApi';

/**
 * `error` value set when the tool answered but nothing usable came out of the
 * document (blank/corrupt PDF: all-null payload or unparseable response). It is
 * a sentinel, not display text — the UI maps it to the translated message.
 */
export const OCR_NO_DATA_ERROR = 'ocr-no-data';

/**
 * `error` value for a gateway cut-off (502/503/504). The extraction may still be running server
 * side, so the UI offers a manual retry, never an automatic one. A sentinel, like
 * OCR_NO_DATA_ERROR.
 */
export const OCR_TIMEOUT_ERROR = 'ocr-timeout';

/**
 * `error` value for a request that got no HTTP answer at all (offline, DNS, connection reset):
 * a connection problem, not a slow server. The UI shows the core's translated network message.
 */
export const OCR_NETWORK_ERROR = 'ocr-network';

/**
 * `error` value for a request that core aborted because the session changed while it was in
 * flight (`staleSessionError()` in app-shell-core `auth/api.js`: a DOMException named
 * 'AbortError'). By design: no logout, and the response must never be replayed under another
 * identity.
 */
export const OCR_SESSION_CHANGED_ERROR = 'ocr-session-changed';

const GATEWAY_STATUSES = new Set([502, 503, 504]);

class OcrNoDataError extends Error {}

/**
 * Map a caught error to the value stored in `error`. This hook never creates an AbortController
 * nor passes a `signal` (neither does `copilotRequest`), so an 'AbortError' reaching it can only
 * be core's stale-session abort. If a caller-owned signal is ever added here, check it BEFORE
 * this branch so an intentional abort does not read as a session change.
 */
function classifyError(err, fallback) {
  if (err instanceof OcrNoDataError) return OCR_NO_DATA_ERROR;
  if (err?.name === 'AbortError') return OCR_SESSION_CHANGED_ERROR;
  if (isNetworkError(err)) return OCR_NETWORK_ERROR;
  if (GATEWAY_STATUSES.has(err?.status)) return OCR_TIMEOUT_ERROR;
  return err?.message || fallback;
}

/**
 * Strip Markdown code fences that some OCR outputs still include around JSON.
 * String-based to avoid regex backtracking concerns on adversarial inputs.
 */
function stripCodeFences(text) {
  if (!text) return '';
  const trimmed = text.trim();
  if (!trimmed.startsWith('```') || !trimmed.endsWith('```') || trimmed.length < 6) {
    return trimmed;
  }
  // Drop the opening fence, then the optional "json" language tag (case-insensitive),
  // then any leading whitespace, then drop the closing fence.
  let body = trimmed.slice(3, -3);
  if (body.toLowerCase().startsWith('json')) {
    body = body.slice(4);
  }
  return body.trim();
}

/**
 * Best-effort JSON parse that pulls the first object/array from a text blob
 * even if the response wraps it in explanatory prose. The direct-tool endpoint
 * should return clean JSON, but the parser survives stray wrapping.
 */
function parseLooseJson(text) {
  if (text && typeof text === 'object') return text;
  const cleaned = stripCodeFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first >= 0 && last > first) {
      const slice = cleaned.slice(first, last + 1);
      try {
        return JSON.parse(slice);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Hook that runs a copilot tool directly against an uploaded file and parses
 * its JSON output. Skips the agent reasoning roundtrip (~1–3s) and the
 * post-formatting step by calling `/executeTool` instead of `/question`.
 *
 * Schema sourcing: when `structuredOutputSchema` is provided, the literal
 * JSON Schema is sent and the tool ignores `structuredOutput`. The latter is
 * kept for callers that still rely on named Pydantic schemas in
 * `tools/schemas/`.
 *
 * @param {{
 *   token: string,
 *   toolName?: string,
 *   question: string,
 *   structuredOutput?: string,
 *   structuredOutputSchema?: object,
 *   agentId?: string,
 *   hasData?: (payload: object) => boolean,
 * }} params
 *
 * `hasData` (optional) decides whether a parsed payload carries anything usable.
 * When it returns false — or the response is unparseable — `error` becomes
 * `OCR_NO_DATA_ERROR` and `extract` rejects, so callers never act on an empty result.
 */
export function useOcrExtraction({
  token,
  toolName = 'SimpleOcrTool',
  question,
  structuredOutput,
  structuredOutputSchema,
  agentId,
  hasData,
}) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  const extract = useCallback(async (file) => {
    if (!file) throw new Error('No file provided');

    setError(null);
    setStatus('uploading');

    let uploadedPath;
    try {
      const uploadResp = await uploadFile(token, file);
      // Java RestService returns the form field keyed by its name ("file"), with
      // the Python-side absolute path as the value.
      uploadedPath = uploadResp?.file
        || uploadResp?.fileId
        || (uploadResp && typeof uploadResp === 'object'
          ? Object.values(uploadResp).find(v => typeof v === 'string')
          : null);
      if (!uploadedPath) throw new Error('Upload did not return a file path');
    } catch (err) {
      setError(classifyError(err, 'Upload failed'));
      setStatus('error');
      throw err;
    }

    setStatus('extracting');
    try {
      const toolParams = { path: uploadedPath, question };
      if (structuredOutputSchema) toolParams.structured_output_schema = structuredOutputSchema;
      else if (structuredOutput) toolParams.structured_output = structuredOutput;

      const resp = await executeTool(token, {
        toolName,
        params: toolParams,
        agentId,
      });

      const answer = resp?.answer ?? extractAnswerText(resp);
      const parsed = parseLooseJson(answer);
      if (!parsed || typeof parsed !== 'object') {
        throw new OcrNoDataError('Tool returned an unparseable response');
      }
      if (hasData && !hasData(parsed)) {
        throw new OcrNoDataError('Tool returned no extractable data');
      }
      setStatus('done');
      return parsed;
    } catch (err) {
      setError(classifyError(err, 'Extraction failed'));
      setStatus('error');
      throw err;
    }
  }, [token, toolName, question, structuredOutput, structuredOutputSchema, agentId, hasData]);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
  }, []);

  return { extract, status, error, reset };
}
