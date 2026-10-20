"""`agent.run_probe`: what it records around the tool loop.

An empty model turn is asked again, never read as "the agent is done".
Regression for run 20261001T1912-local-45e9: three probes ended with 0 tool calls
and a verdict saying "no tools were provided" while 28 tools were bound — the
Gemini route had answered the first turn with an empty `stop`.

Run schema v4 (plan 2026-10-14 §5.5, §5.7): the final answer is the last loop
turn, never the report; tokens are summed over the loop only; missing usage is
null, never 0.

@covers mcp-tests/runner/agent.py
"""

from __future__ import annotations

import asyncio
import unittest
from unittest import mock

from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, ToolMessage
from langgraph.errors import GraphRecursionError

from runner import agent
from runner.verdict import Verdict


def _verdict() -> Verdict:
    return Verdict.model_validate({
        "outcome": "OKAY", "summary": "s", "achieved": "a",
        "frictions": [], "failures": [], "wastedCalls": [], "suggestions": [],
    })


class FakeAgent:
    """Each astream() call plays the next scripted segment — the messages one graph
    run adds until the model stops — on top of the inputs it was given."""

    def __init__(self, segments):
        self.segments = list(segments)
        self.inputs = []
        self.limits = []

    def astream(self, payload, config, stream_mode):
        inputs = [HumanMessage(m[1]) if isinstance(m, tuple) else m for m in payload["messages"]]
        self.inputs.append(inputs)
        self.limits.append(config["recursion_limit"])
        segment = self.segments.pop(0)

        async def gen():
            state = list(inputs)
            for message in segment:
                # An exception in a segment is raised mid-stream, after the
                # states before it were yielded (a blown step cap does that).
                if isinstance(message, BaseException):
                    raise message
                state = state + [message]
                yield {"messages": state}
        return gen()


class FakeModel:
    """The reporter answers like LangChain's `include_raw=True`: the parsed
    verdict plus the raw AI turn it came from."""

    def __init__(self, report_raw=None, answer=None):
        self.report_raw = report_raw if report_raw is not None else AIMessage("")
        # `answer` overrides the whole reporter reply, to script its failures.
        self.answer = answer

    def with_structured_output(self, *_a, **_k):
        raw = self.report_raw
        answer = self.answer

        class R:
            async def ainvoke(self, _messages):
                if answer is not None:
                    return answer
                return {"raw": raw, "parsed": _verdict(), "parsing_error": None}
        return R()


def _run(fake_agent, model=None):
    with mock.patch("langchain_mcp_adapters.tools.load_mcp_tools", mock.AsyncMock(return_value=[])), \
         mock.patch("langgraph.prebuilt.create_react_agent", return_value=fake_agent), \
         mock.patch.object(agent, "build_model", return_value=model or FakeModel()):
        return asyncio.run(agent.run_probe(session=None, provider={}, prompt="hola", max_steps=5))


def _ai(content="", *, usage=None, model=None, fingerprint=None, tool_calls=None):
    meta = {k: v for k, v in (("model_name", model), ("system_fingerprint", fingerprint)) if v}
    kwargs = {"response_metadata": meta}
    if usage is not None:
        inp, out, cached = usage
        kwargs["usage_metadata"] = {
            "input_tokens": inp, "output_tokens": out, "total_tokens": inp + out,
            **({"input_token_details": {"cache_read": cached}} if cached is not None else {}),
        }
    if tool_calls:
        kwargs["tool_calls"] = tool_calls
    return AIMessage(content, **kwargs)


CALL = AIMessage("", tool_calls=[{"name": "etendo_list", "args": {}, "id": "c1"}])
RESULT = ToolMessage("[]", tool_call_id="c1")
ANSWER = AIMessage("listo")
EMPTY = AIMessage("")


class EmptyCompletionTest(unittest.TestCase):
    def test_detects_only_a_turn_with_nothing_in_it(self):
        self.assertTrue(agent.is_empty_completion(EMPTY))
        self.assertTrue(agent.is_empty_completion(AIMessage("   ")))
        self.assertFalse(agent.is_empty_completion(ANSWER))
        self.assertFalse(agent.is_empty_completion(CALL))
        self.assertFalse(agent.is_empty_completion(RESULT))

    def test_an_empty_first_turn_is_asked_again(self):
        fake = FakeAgent([[EMPTY], [CALL, RESULT, ANSWER]])
        result = _run(fake)
        self.assertEqual(result["toolCallCount"], 1)
        self.assertEqual(result["emptyCompletions"], 1)
        # The second attempt starts from the prompt alone: the empty turn is dropped.
        self.assertEqual([m.content for m in fake.inputs[1]], ["hola"])

    def test_a_mid_loop_empty_turn_resumes_from_the_same_state(self):
        fake = FakeAgent([[CALL, RESULT, EMPTY], [ANSWER]])
        result = _run(fake)
        self.assertEqual(result["emptyCompletions"], 1)
        self.assertEqual(result["toolCallCount"], 1)
        resumed = fake.inputs[1]
        self.assertIs(resumed[-1], RESULT)
        # One AI turn was already spent, so the resumed stream gets less budget.
        self.assertLess(fake.limits[1], fake.limits[0])

    def test_gives_up_as_a_provider_failure(self):
        fake = FakeAgent([[EMPTY]] * (agent.MAX_EMPTY_COMPLETIONS + 1))
        with self.assertRaises(agent.ProbeAborted) as ctx:
            _run(fake)
        self.assertIsInstance(ctx.exception.cause, agent.EmptyCompletion)
        self.assertEqual(ctx.exception.partial["toolCallCount"], 0)

    def test_a_normal_probe_is_unchanged(self):
        result = _run(FakeAgent([[CALL, RESULT, ANSWER]]))
        self.assertEqual((result["toolCallCount"], result["emptyCompletions"]), (1, 0))


class RunRecordV4Test(unittest.TestCase):
    def _loop(self):
        call = _ai(usage=(100, 10, 40), model="gpt-5.2-x", fingerprint="fp1",
                   tool_calls=[{"name": "etendo_list", "args": {}, "id": "c1"}])
        answer = _ai("Te debe 1.234,56 €", usage=(150, 20, 100), model="gpt-5.2-x", fingerprint="fp2")
        return [call, RESULT, answer]

    def test_final_answer_is_the_last_loop_turn_not_the_report(self):
        report = _ai("The task was completed.", usage=(500, 50, None))
        result = _run(FakeAgent([self._loop()]), FakeModel(report))
        self.assertEqual(result["finalAnswer"], "Te debe 1.234,56 €")

    def test_usage_is_summed_over_the_loop_only(self):
        report = _ai(usage=(500, 50, 0), model="gpt-5.2-y")
        result = _run(FakeAgent([self._loop()]), FakeModel(report))
        loop = result["usage"]["loop"]
        self.assertEqual(
            (loop["inputTokens"], loop["outputTokens"], loop["totalTokens"], loop["cachedInputTokens"]),
            (250, 30, 280, 140),
        )
        self.assertEqual((loop["turns"], loop["turnsWithUsage"]), (2, 2))
        self.assertEqual(result["usage"]["report"]["inputTokens"], 500)
        self.assertEqual(result["servedModel"],
                         {"models": ["gpt-5.2-x", "gpt-5.2-y"], "systemFingerprints": ["fp1", "fp2"]})

    def test_missing_usage_is_null_not_zero(self):
        result = _run(FakeAgent([[CALL, RESULT, ANSWER]]))
        loop = result["usage"]["loop"]
        self.assertIsNone(loop["inputTokens"])
        self.assertIsNone(loop["totalTokens"])
        self.assertEqual((loop["turns"], loop["turnsWithUsage"]), (2, 0))
        self.assertEqual(result["servedModel"], {"models": [], "systemFingerprints": []})

    def test_a_partly_reported_loop_has_no_total(self):
        # One turn without usage: a sum over the rest would understate the cost.
        answer = _ai("ok", usage=(150, 20, None))
        result = _run(FakeAgent([[CALL, RESULT, answer]]))
        loop = result["usage"]["loop"]
        self.assertIsNone(loop["inputTokens"])
        self.assertEqual((loop["turns"], loop["turnsWithUsage"]), (2, 1))

    def test_no_final_answer_when_the_loop_ends_on_a_tool_call(self):
        self.assertIsNone(agent.final_answer([HumanMessage("hola"), CALL, RESULT]))
        self.assertIsNone(agent.final_answer([HumanMessage("hola")]))

    def test_reasoning_blocks_are_not_part_of_the_answer(self):
        answer = AIMessage([{"type": "reasoning", "text": "pienso"}, {"type": "text", "text": "listo"}])
        self.assertEqual(agent.final_answer([answer]), "listo")

    def test_no_final_answer_when_the_step_cap_cuts_a_tool_call(self):
        # The loop blew its step cap on a turn that still asked for a tool: the
        # agent never told the user anything, so the answer is null, not "".
        call2 = AIMessage("", tool_calls=[{"name": "etendo_get", "args": {}, "id": "c2"}])
        result = _run(FakeAgent([[CALL, RESULT, call2, GraphRecursionError("cap")]]))
        self.assertTrue(result["exhausted"])
        self.assertIsNone(result["finalAnswer"])
        self.assertEqual(result["toolCallCount"], 2)

    def test_a_text_less_final_turn_is_an_empty_answer_not_null(self):
        # Reasoning only: not an empty completion (it carries a block), but the
        # user read nothing. Present and empty is "", distinct from "no answer".
        thinking = AIMessage([{"type": "reasoning", "text": "pienso"}])
        result = _run(FakeAgent([[CALL, RESULT, thinking]]))
        self.assertEqual(result["emptyCompletions"], 0)
        self.assertEqual(result["finalAnswer"], "")

    def _reporter_fails(self, answer):
        model = FakeModel(answer=answer)
        with self.assertRaises(agent.ProbeAborted) as ctx:
            _run(FakeAgent([self._loop()]), model)
        return ctx.exception

    def test_a_reporter_parsing_error_without_raw_aborts_with_no_report_usage(self):
        error = ValueError("bad json")
        aborted = self._reporter_fails({"raw": None, "parsed": None, "parsing_error": error})
        self.assertIs(aborted.cause, error)
        self.assertIsNone(aborted.partial["usage"]["report"])
        # The loop's evidence survives the reporter.
        self.assertEqual(aborted.partial["usage"]["loop"]["inputTokens"], 250)
        self.assertEqual(aborted.partial["finalAnswer"], "Te debe 1.234,56 €")

    def test_a_reporter_with_no_verdict_and_no_raw_aborts_with_no_report_usage(self):
        aborted = self._reporter_fails({"raw": None, "parsed": None, "parsing_error": None})
        self.assertIsInstance(aborted.cause, ValueError)
        self.assertIn("no verdict", str(aborted.cause))
        self.assertIsNone(aborted.partial["usage"]["report"])

    def test_a_reporter_that_answered_unparseably_still_records_its_usage(self):
        # The reporter DID answer (design: usage.report is null only until it
        # has), so its turn is recorded even though the parse failed.
        raw = _ai("not a verdict", usage=(500, 50, None), model="gpt-5.2-y")
        aborted = self._reporter_fails({"raw": raw, "parsed": None, "parsing_error": ValueError("x")})
        self.assertEqual(aborted.partial["usage"]["report"]["inputTokens"], 500)
        self.assertIn("gpt-5.2-y", aborted.partial["servedModel"]["models"])

    def test_usage_after_an_empty_retry_excludes_the_dropped_turn(self):
        empty = _ai(usage=(9000, 0, None))
        call = _ai(usage=(100, 10, 40), tool_calls=[{"name": "etendo_list", "args": {}, "id": "c1"}])
        answer = _ai("listo", usage=(150, 20, 100))
        result = _run(FakeAgent([[empty], [call, RESULT, answer]]))
        loop = result["usage"]["loop"]
        self.assertEqual(result["emptyCompletions"], 1)
        self.assertEqual((loop["turns"], loop["inputTokens"], loop["totalTokens"]), (2, 250, 280))

    def test_cached_tokens_are_null_when_a_turn_lacks_the_cache_split(self):
        call = _ai(usage=(100, 10, 40), tool_calls=[{"name": "etendo_list", "args": {}, "id": "c1"}])
        answer = _ai("listo", usage=(150, 20, None))
        loop = _run(FakeAgent([[call, RESULT, answer]]))["usage"]["loop"]
        # Every turn reported usage, so the totals stand; only the cache sum is unknown.
        self.assertEqual((loop["turnsWithUsage"], loop["inputTokens"]), (2, 250))
        self.assertIsNone(loop["cachedInputTokens"])

    def test_streamed_chunks_count_as_ai_turns(self):
        chunk = AIMessageChunk(
            "listo",
            usage_metadata={"input_tokens": 7, "output_tokens": 3, "total_tokens": 10},
            response_metadata={"model_name": "gpt-5.2-x"},
        )
        self.assertEqual(agent.final_answer([HumanMessage("hola"), chunk]), "listo")
        usage = agent.sum_usage([chunk])
        self.assertEqual((usage["turns"], usage["inputTokens"], usage["totalTokens"]), (1, 7, 10))
        self.assertEqual(agent.served_model([chunk])["models"], ["gpt-5.2-x"])
        self.assertTrue(agent.is_empty_completion(AIMessageChunk("")))
        self.assertIsNone(agent.final_answer([AIMessageChunk(
            "", tool_call_chunks=[{"name": "etendo_list", "args": "{}", "id": "c1", "index": 0}])]))

    def test_an_aborted_probe_still_records_the_v4_fields(self):
        fake = FakeAgent([[EMPTY]] * (agent.MAX_EMPTY_COMPLETIONS + 1))
        with self.assertRaises(agent.ProbeAborted) as ctx:
            _run(fake)
        partial = ctx.exception.partial
        self.assertIsNone(partial["finalAnswer"])
        self.assertIsNone(partial["usage"]["report"])


if __name__ == "__main__":
    unittest.main()
