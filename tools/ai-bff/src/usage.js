/**
 * Record the token usage of one agent chat turn in ETGO_USAGE_EVENT.
 *
 * The BFF cannot use the Java recorder, so it posts to NEO's `POST /sws/neo/usage` with the
 * caller's own credential — the same headers it already forwards to the Etendo MCP endpoint, under
 * either session scheme (bearer or cookie + CSRF). User, role and tenant come from that session on
 * the server; the body cannot name them, and `source: 'ai-bff'` is a label, not a trust boundary.
 *
 * Usage never affects the chat: the post is fire-and-forget, bounded by a short timeout, and every
 * failure collapses into one log line.
 */

export const USAGE_TIMEOUT_MS = 3_000;

/** `…/sws/mcp` → `…/sws/neo/usage`; `ETENDO_USAGE_URL` overrides the derivation. */
export function usageEndpoint(mcpUrl, override = process.env.ETENDO_USAGE_URL) {
  if (override) return override;
  return mcpUrl.replace(/\/sws\/mcp\/?$/, '/sws/neo/usage');
}

/**
 * Build the `ai.agent.message` event. `usage` is the SDK's aggregated LanguageModelUsage;
 * `cachedInputTokens` is emitted only when the provider reported it. `costUsd` (see
 * {@link sumStepCost}) is a top-level field, not a property: NEO stores it in its own
 * `COST_USD` column, which the billing engine sums; it is omitted when nothing was priced.
 */
export function buildAgentMessageEvent({ outcome, durationMs, sessionKey, target, model, usage, steps, finishReason }) {
  const stepList = steps || [];
  const cached = usage?.inputTokenDetails?.cacheReadTokens;
  const cost = sumStepCost(stepList);
  return {
    eventType: 'ai.agent.message',
    source: 'ai-bff',
    target,
    action: 'reply',
    outcome,
    durationMs,
    sessionKey,
    ...(cost === undefined ? {} : { costUsd: cost }),
    properties: {
      ...(model ? { model } : {}),
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      ...(cached === undefined ? {} : { cachedInputTokens: cached }),
      steps: stepList.length,
      toolCalls: stepList.reduce((count, step) => count + (step.toolCalls?.length || 0), 0),
      ...(finishReason ? { finishReason } : {}),
    },
  };
}

/** Sum per-step usage — for the error and abort paths, where the SDK gives no aggregate. */
export function sumStepUsage(steps) {
  let cached;
  const total = { inputTokens: 0, outputTokens: 0 };
  for (const step of steps || []) {
    total.inputTokens += step.usage?.inputTokens || 0;
    total.outputTokens += step.usage?.outputTokens || 0;
    const stepCached = step.usage?.inputTokenDetails?.cacheReadTokens;
    if (stepCached !== undefined) cached = (cached || 0) + stepCached;
  }
  return { ...total, inputTokenDetails: { cacheReadTokens: cached } };
}

/**
 * Sum the money the provider charged for the steps, in USD. LiteLLM (llm.etendo.software) puts
 * it in the raw usage of each streamed response as `usage.cost`; the SDK keeps that raw object
 * per step only (`step.usage.raw`), never in the aggregated total. Undefined when no step
 * reported a cost, so a provider that does not price requests is not recorded as free.
 */
export function sumStepCost(steps) {
  let total;
  for (const step of steps || []) {
    const cost = step?.usage?.raw?.cost;
    if (typeof cost === 'number' && Number.isFinite(cost)) total = (total || 0) + cost;
  }
  return total;
}

/**
 * Post one event with the caller's own credential headers (`credentialHeaders` in server.js:
 * `Authorization` under the bearer scheme; the session `Cookie`, `X-Go-CSRF`, `Origin` and
 * `Referer` under the cookie scheme). Returns a promise that never rejects; callers must not
 * await it.
 */
export function postUsageEvent(event, { url, headers, fetchImpl = fetch, log = console.warn } = {}) {
  // No credential of either scheme: nobody to record the event under. handleChat refuses such a
  // request before a recorder exists, so this only guards direct callers.
  if (!headers?.Authorization && !headers?.Cookie) return Promise.resolve();
  return Promise.resolve()
    .then(() => fetchImpl(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [event] }),
      signal: AbortSignal.timeout(USAGE_TIMEOUT_MS),
    }))
    .then(response => {
      if (!response.ok) log(`[ai-bff:usage] not recorded: HTTP ${response.status}`);
    })
    .catch(error => {
      log(`[ai-bff:usage] not recorded: ${error instanceof Error ? error.message : error}`);
    });
}

/**
 * One recorder per chat request. `track(step)` collects steps as they finish; the first of
 * `finish` / `fail` / `abort` records the turn and the rest are ignored, so a turn is counted once.
 */
export function createTurnRecorder({ url, headers, sessionKey, target, modelId, now = Date.now, fetchImpl, log }) {
  const startedAt = now();
  const trackedSteps = [];
  let recorded = false;

  const record = (outcome, { usage, steps, model, finishReason }) => {
    if (recorded) return;
    recorded = true;
    try {
      const event = buildAgentMessageEvent({
        outcome,
        durationMs: Math.max(0, now() - startedAt),
        sessionKey,
        target,
        model: model || modelId,
        usage,
        steps,
        finishReason,
      });
      postUsageEvent(event, { url, headers, fetchImpl, log });
    } catch (error) {
      (log || console.warn)(`[ai-bff:usage] not recorded: ${error instanceof Error ? error.message : error}`);
    }
  };

  return {
    track(step) { trackedSteps.push(step); },
    finish(event) {
      record('ok', {
        usage: event?.usage ?? event?.totalUsage,
        steps: event?.steps ?? trackedSteps,
        model: event?.model?.modelId ?? event?.response?.modelId,
        finishReason: event?.finishReason,
      });
    },
    fail() {
      record('error', { usage: sumStepUsage(trackedSteps), steps: trackedSteps, finishReason: 'error' });
    },
    abort(event) {
      const steps = event?.steps ?? trackedSteps;
      record('error', { usage: sumStepUsage(steps), steps, finishReason: 'abort' });
    },
  };
}
