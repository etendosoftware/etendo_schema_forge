import { useCallback, useState } from 'react';
import { executeTool, extractAnswerText, uploadFile } from '../copilotApi';

/**
 * `error` value set when the tool answered but nothing usable came out of the
 * document (blank/corrupt PDF: all-null payload or unparseable response). It is
 * a sentinel, not display text — the UI maps it to the translated message.
 */
export const OCR_NO_DATA_ERROR = 'ocr-no-data';

class OcrNoDataError extends Error {}

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
      setError(err.message || 'Upload failed');
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
      setError(err instanceof OcrNoDataError ? OCR_NO_DATA_ERROR : (err.message || 'Extraction failed'));
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
