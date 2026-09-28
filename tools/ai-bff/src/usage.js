/**
 * Record the token usage of one agent chat turn in ETGO_USAGE_EVENT.
 *
 * The BFF cannot use the Java recorder, so it posts to NEO's `POST /sws/neo/usage` with the
 * caller's own Bearer token — the same credential it already forwards to the Etendo MCP endpoint.
 * User, role and tenant come from that token on the server; the body cannot name them, and
 * `source: 'ai-bff'` is a label, not a trust boundary.
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
 * `cachedInputTokens` is emitted only when the provider reported it.
 */
export function buildAgentMessageEvent({ outcome, durationMs, sessionKey, target, model, usage, steps, finishReason }) {
  const stepList = steps || [];
  const cached = usage?.inputTokenDetails?.cacheReadTokens;
  return {
    eventType: 'ai.agent.message',
    source: 'ai-bff',
    target,
    action: 'reply',
    outcome,
    durationMs,
    sessionKey,
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

/** Post one event. Returns a promise that never rejects; callers must not await it. */
export function postUsageEvent(event, { url, authorization, fetchImpl = fetch, log = console.warn } = {}) {
  return Promise.resolve()
    .then(() => fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
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
export function createTurnRecorder({ url, authorization, sessionKey, target, modelId, now = Date.now, fetchImpl, log }) {
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
      postUsageEvent(event, { url, authorization, fetchImpl, log });
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
