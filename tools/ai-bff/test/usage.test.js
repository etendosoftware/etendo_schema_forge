import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  USAGE_TIMEOUT_MS,
  buildAgentMessageEvent,
  createTurnRecorder,
  postUsageEvent,
  sumStepUsage,
  usageEndpoint,
} from '../src/usage.js';

const tick = () => new Promise(resolve => setImmediate(resolve));

/** fetch double: records calls, answers with `respond()` (default 200). */
function fakeFetch(respond = () => Promise.resolve({ ok: true, status: 200 })) {
  const calls = [];
  const fetchImpl = (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return respond(url, init);
  };
  return { calls, fetchImpl };
}

/** Clock double: each call returns the next value in the list (last value repeats). */
function clock(...values) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function recorder(overrides = {}) {
  const net = fakeFetch();
  const logs = [];
  const rec = createTurnRecorder({
    url: 'http://etendo/sws/neo/usage',
    authorization: 'Bearer tok',
    sessionKey: 'sess-1',
    target: 'agent-chat',
    modelId: 'kimi-k2.6',
    now: clock(1_000, 1_250),
    fetchImpl: net.fetchImpl,
    log: m => logs.push(m),
    ...overrides,
  });
  return { rec, calls: net.calls, logs };
}

// --- usageEndpoint ---------------------------------------------------------

test('usageEndpoint derives /sws/neo/usage from the MCP URL', () => {
  assert.equal(usageEndpoint('http://localhost:8080/etendo/sws/mcp', ''), 'http://localhost:8080/etendo/sws/neo/usage');
  assert.equal(usageEndpoint('http://localhost:8080/etendo/sws/mcp/', ''), 'http://localhost:8080/etendo/sws/neo/usage');
});

test('usageEndpoint honours an explicit override', () => {
  assert.equal(usageEndpoint('http://x/sws/mcp', 'http://other/usage'), 'http://other/usage');
});

test('usageEndpoint reads ETENDO_USAGE_URL by default', () => {
  const previous = process.env.ETENDO_USAGE_URL;
  try {
    process.env.ETENDO_USAGE_URL = 'http://env/usage';
    assert.equal(usageEndpoint('http://x/sws/mcp'), 'http://env/usage');
    delete process.env.ETENDO_USAGE_URL;
    assert.equal(usageEndpoint('http://x/sws/mcp'), 'http://x/sws/neo/usage');
  } finally {
    if (previous === undefined) delete process.env.ETENDO_USAGE_URL;
    else process.env.ETENDO_USAGE_URL = previous;
  }
});

// --- buildAgentMessageEvent ------------------------------------------------

test('buildAgentMessageEvent builds the exact ai.agent.message envelope', () => {
  const event = buildAgentMessageEvent({
    outcome: 'ok',
    durationMs: 250,
    sessionKey: 'sess-1',
    target: 'page-help',
    model: 'kimi-k2.6',
    usage: { inputTokens: 100, outputTokens: 20, inputTokenDetails: { cacheReadTokens: 40 } },
    steps: [{ toolCalls: [{}, {}] }, { toolCalls: [{}] }, {}],
    finishReason: 'stop',
  });
  assert.deepEqual(event, {
    eventType: 'ai.agent.message',
    source: 'ai-bff',
    target: 'page-help',
    action: 'reply',
    outcome: 'ok',
    durationMs: 250,
    sessionKey: 'sess-1',
    properties: {
      model: 'kimi-k2.6',
      inputTokens: 100,
      outputTokens: 20,
      cachedInputTokens: 40,
      steps: 3,
      toolCalls: 3,
      finishReason: 'stop',
    },
  });
});

test('cachedInputTokens is omitted when unreported and kept when 0', () => {
  const unreported = buildAgentMessageEvent({ usage: { inputTokens: 1, outputTokens: 1 } });
  assert.equal('cachedInputTokens' in unreported.properties, false);
  const zero = buildAgentMessageEvent({ usage: { inputTokens: 1, outputTokens: 1, inputTokenDetails: { cacheReadTokens: 0 } } });
  assert.equal(zero.properties.cachedInputTokens, 0);
});

test('missing usage, steps, model and finishReason fall back to zeros / omission', () => {
  const event = buildAgentMessageEvent({ outcome: 'error' });
  assert.deepEqual(event.properties, { inputTokens: 0, outputTokens: 0, steps: 0, toolCalls: 0 });
});

// --- sumStepUsage ----------------------------------------------------------

test('sumStepUsage adds per-step tokens and cache reads', () => {
  assert.deepEqual(sumStepUsage([
    { usage: { inputTokens: 10, outputTokens: 2, inputTokenDetails: { cacheReadTokens: 0 } } },
    { usage: { inputTokens: 5, outputTokens: 3 } },
    { usage: { inputTokens: 1, outputTokens: 1, inputTokenDetails: { cacheReadTokens: 4 } } },
    {},
  ]), { inputTokens: 16, outputTokens: 6, inputTokenDetails: { cacheReadTokens: 4 } });
});

test('sumStepUsage leaves cacheReadTokens undefined when no step reports it', () => {
  assert.deepEqual(sumStepUsage(undefined), { inputTokens: 0, outputTokens: 0, inputTokenDetails: { cacheReadTokens: undefined } });
  assert.equal(sumStepUsage([{ usage: { inputTokens: 1 } }]).inputTokenDetails.cacheReadTokens, undefined);
});

// --- createTurnRecorder ----------------------------------------------------

test('finish records usage, steps, model.modelId, duration and target', async () => {
  const { rec, calls } = recorder();
  rec.finish({
    usage: { inputTokens: 30, outputTokens: 7 },
    steps: [{ toolCalls: [{}] }, { toolCalls: [] }],
    model: { modelId: 'actual-model' },
    finishReason: 'stop',
  });
  await tick();
  assert.equal(calls.length, 1);
  const [event] = calls[0].body.events;
  assert.equal(event.outcome, 'ok');
  assert.equal(event.target, 'agent-chat');
  assert.equal(event.sessionKey, 'sess-1');
  assert.equal(event.durationMs, 250);
  assert.deepEqual(event.properties, {
    model: 'actual-model', inputTokens: 30, outputTokens: 7, steps: 2, toolCalls: 1, finishReason: 'stop',
  });
});

test('finish falls back to totalUsage, tracked steps and the configured modelId', async () => {
  const { rec, calls } = recorder();
  rec.track({ toolCalls: [{}, {}] });
  rec.finish({ totalUsage: { inputTokens: 9, outputTokens: 4 } });
  await tick();
  const props = calls[0].body.events[0].properties;
  assert.equal(props.inputTokens, 9);
  assert.equal(props.outputTokens, 4);
  assert.equal(props.model, 'kimi-k2.6');
  assert.equal(props.steps, 1);
  assert.equal(props.toolCalls, 2);
});

test('finish prefers usage over totalUsage and reads response.modelId as a second fallback', async () => {
  const { rec, calls } = recorder();
  rec.finish({ usage: { inputTokens: 1, outputTokens: 1 }, totalUsage: { inputTokens: 99, outputTokens: 99 }, response: { modelId: 'resp-model' } });
  await tick();
  const props = calls[0].body.events[0].properties;
  assert.equal(props.inputTokens, 1);
  assert.equal(props.model, 'resp-model');
});

test('finish without an event records zero tokens and the configured model', async () => {
  const { rec, calls } = recorder();
  rec.finish();
  await tick();
  const props = calls[0].body.events[0].properties;
  assert.deepEqual([props.inputTokens, props.outputTokens, props.model], [0, 0, 'kimi-k2.6']);
});

test('finish then fail records exactly one ok event', async () => {
  const { rec, calls } = recorder();
  rec.finish({ usage: { inputTokens: 1, outputTokens: 1 } });
  rec.fail();
  rec.abort({ steps: [] });
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.events[0].outcome, 'ok');
});

test('fail then finish records exactly one error event', async () => {
  const { rec, calls } = recorder();
  rec.fail();
  rec.finish({ usage: { inputTokens: 1, outputTokens: 1 } });
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.events[0].outcome, 'error');
  assert.equal(calls[0].body.events[0].properties.finishReason, 'error');
});

test('fail sums the usage of the tracked steps', async () => {
  const { rec, calls } = recorder();
  rec.track({ usage: { inputTokens: 10, outputTokens: 1 }, toolCalls: [{}] });
  rec.track({ usage: { inputTokens: 20, outputTokens: 2, inputTokenDetails: { cacheReadTokens: 5 } } });
  rec.fail();
  await tick();
  assert.deepEqual(calls[0].body.events[0].properties, {
    model: 'kimi-k2.6', inputTokens: 30, outputTokens: 3, cachedInputTokens: 5, steps: 2, toolCalls: 1, finishReason: 'error',
  });
});

test('abort uses event.steps over the tracked ones', async () => {
  const { rec, calls } = recorder();
  rec.track({ usage: { inputTokens: 999, outputTokens: 999 } });
  rec.abort({ steps: [{ usage: { inputTokens: 3, outputTokens: 2 } }, { usage: { inputTokens: 1, outputTokens: 1 } }] });
  await tick();
  const [event] = calls[0].body.events;
  assert.equal(event.outcome, 'error');
  assert.deepEqual(
    [event.properties.inputTokens, event.properties.outputTokens, event.properties.steps, event.properties.finishReason],
    [4, 3, 2, 'abort'],
  );
});

test('abort without event.steps falls back to the tracked steps', async () => {
  const { rec, calls } = recorder();
  rec.track({ usage: { inputTokens: 7, outputTokens: 1 } });
  rec.abort();
  await tick();
  assert.equal(calls[0].body.events[0].properties.inputTokens, 7);
});

test('durationMs comes from the injected clock and is never negative', async () => {
  const backwards = recorder({ now: clock(5_000, 4_000) });
  backwards.rec.finish({});
  const forwards = recorder({ now: clock(0, 1_234) });
  forwards.rec.finish({});
  await tick();
  assert.equal(backwards.calls[0].body.events[0].durationMs, 0);
  assert.equal(forwards.calls[0].body.events[0].durationMs, 1_234);
});

test('finish returns synchronously and does not wait for the post', () => {
  let resolvePost;
  const rec = createTurnRecorder({
    url: 'u', authorization: 'Bearer t', now: clock(0),
    fetchImpl: () => new Promise(resolve => { resolvePost = resolve; }),
    log: () => {},
  });
  assert.equal(rec.finish({}), undefined);
  resolvePost?.({ ok: true });
});

// --- postUsageEvent --------------------------------------------------------

test('postUsageEvent POSTs the event with the forwarded Authorization and a timeout signal', async () => {
  const { calls, fetchImpl } = fakeFetch();
  const logs = [];
  const event = { eventType: 'ai.agent.message' };
  await postUsageEvent(event, { url: 'http://etendo/sws/neo/usage', authorization: 'Bearer abc', fetchImpl, log: m => logs.push(m) });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://etendo/sws/neo/usage');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer abc');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
  assert.deepEqual(calls[0].body, { events: [event] });
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal(calls[0].init.signal.aborted, false);
  assert.equal(USAGE_TIMEOUT_MS, 3_000);
  assert.deepEqual(logs, []);
});

test('postUsageEvent logs the status of a non-2xx answer and resolves', async () => {
  const { fetchImpl } = fakeFetch(() => Promise.resolve({ ok: false, status: 403 }));
  const logs = [];
  await assert.doesNotReject(postUsageEvent({}, { url: 'u', authorization: 'a', fetchImpl, log: m => logs.push(m) }));
  assert.equal(logs.length, 1);
  assert.match(logs[0], /HTTP 403/);
});

test('postUsageEvent logs a rejected fetch once and resolves', async () => {
  const logs = [];
  await assert.doesNotReject(postUsageEvent({}, {
    url: 'u', authorization: 'a', fetchImpl: () => Promise.reject(new Error('ECONNREFUSED')), log: m => logs.push(m),
  }));
  assert.deepEqual(logs, ['[ai-bff:usage] not recorded: ECONNREFUSED']);
});

test('postUsageEvent logs a synchronously throwing fetch once and resolves', async () => {
  const logs = [];
  await assert.doesNotReject(postUsageEvent({}, {
    url: 'u', authorization: 'a', fetchImpl: () => { throw new Error('bad url'); }, log: m => logs.push(m),
  }));
  assert.deepEqual(logs, ['[ai-bff:usage] not recorded: bad url']);
});

test('postUsageEvent logs a non-Error rejection as-is', async () => {
  const logs = [];
  await postUsageEvent({}, { url: 'u', authorization: 'a', fetchImpl: () => Promise.reject('nope'), log: m => logs.push(m) });
  assert.deepEqual(logs, ['[ai-bff:usage] not recorded: nope']);
});

test('a recorder whose post fails logs once and never throws', async () => {
  const logs = [];
  const rec = createTurnRecorder({
    url: 'u', authorization: 'a', now: clock(0),
    fetchImpl: () => Promise.reject(new Error('down')), log: m => logs.push(m),
  });
  assert.doesNotThrow(() => rec.finish({}));
  await tick();
  assert.equal(logs.length, 1);
});

// --- server.js wiring (source-reading: handleChat has no seam for streamText/createMCPClient) ---

const serverSrc = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');

test('handleChat builds one recorder with the derived endpoint, the caller token and the mode target', () => {
  assert.match(serverSrc, /createTurnRecorder\(\{[^}]*url: usageEndpoint\(mcpUrl\)/s);
  assert.match(serverSrc, /createTurnRecorder\(\{[^}]*authorization,/s);
  assert.match(serverSrc, /createTurnRecorder\(\{[^}]*sessionKey: opencodeSession/s);
  assert.match(serverSrc, /target: isPageHelpRequest \? 'page-help' : 'agent-chat'/);
});

test('handleChat feeds the recorder from every stream lifecycle callback', () => {
  assert.match(serverSrc, /onStepFinish: step => \{\s*usage\.track\(step\);/);
  assert.match(serverSrc, /onError: [\s\S]*?usage\.fail\(\);/);
  assert.match(serverSrc, /onAbort: event => usage\.abort\(event\)/);
});

test('onFinish records without awaiting and still closes the MCP client', () => {
  const onFinish = serverSrc.match(/onFinish: async event => \{([\s\S]*?)\n\s*\},/);
  assert.ok(onFinish, 'onFinish handler present');
  const body = onFinish[1];
  assert.match(body, /usage\.finish\(event\);/);
  assert.doesNotMatch(body, /await usage\.finish/);
  assert.match(body, /await mcpClient\?\.close\(\);/);
  assert.ok(body.indexOf('usage.finish') < body.indexOf('mcpClient?.close'));
});
