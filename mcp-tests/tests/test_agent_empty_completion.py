"""An empty model turn is asked again, never read as "the agent is done".

Regression for run 20261001T1912-local-45e9: three probes ended with 0 tool calls
and a verdict saying "no tools were provided" while 28 tools were bound — the
Gemini route had answered the first turn with an empty `stop`.
"""

from __future__ import annotations

import asyncio
import unittest
from unittest import mock

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

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
                state = state + [message]
                yield {"messages": state}
        return gen()


class FakeModel:
    def with_structured_output(self, *_a, **_k):
        class R:
            async def ainvoke(self, _messages):
                return _verdict()
        return R()


def _run(fake_agent):
    with mock.patch("langchain_mcp_adapters.tools.load_mcp_tools", mock.AsyncMock(return_value=[])), \
         mock.patch("langgraph.prebuilt.create_react_agent", return_value=fake_agent), \
         mock.patch.object(agent, "build_model", return_value=FakeModel()):
        return asyncio.run(agent.run_probe(session=None, provider={}, prompt="hola", max_steps=5))


CALL = AIMessage("", tool_calls=[{"name": "neo_list", "args": {}, "id": "c1"}])
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


if __name__ == "__main__":
    unittest.main()
