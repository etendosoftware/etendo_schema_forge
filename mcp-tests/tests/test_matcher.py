"""`expectAnswer` matcher (D46, plan §5.5): numbers in Spanish and English formats, text.

@covers mcp-tests/runner/matcher.py
"""

from __future__ import annotations

import time
import unittest

from runner import matcher


class NumberNormalizationTest(unittest.TestCase):
    TABLE = [
        ("1.234,56", [1234.56]),        # Spanish
        ("1,234.56", [1234.56]),        # English
        ("1 234,56", [1234.56]),   # NBSP-grouped
        ("121,00", [121.0]),
        ("121", [121.0]),
        ("0.75", [0.75]),
        ("-5,5", [-5.5]),
        ("1.234.567", [1234567.0]),
        ("1,234,567", [1234567.0]),
        ("1.234", [1234.0, 1.234]),     # ambiguous: both readings
        ("0,500", [0.5]),               # leading zero: decimal only
        ("12,5", [12.5]),
    ]

    def test_the_table(self):
        for token, expected in self.TABLE:
            with self.subTest(token=token):
                self.assertEqual(matcher.number_candidates(token), expected)

    def test_currency_signs_and_words_are_not_part_of_the_number(self):
        found = [n["token"] for n in matcher.extract_numbers("Te debe € 1.234,56 (EUR) y 3 cervezas")]
        self.assertEqual(found, ["1.234,56", "3"])
        self.assertEqual([n["values"] for n in matcher.extract_numbers("$121.00")], [[121.0]])


class TokenContextTest(unittest.TestCase):
    """v2: a number inside an id, a date or a percentage is not an amount."""

    def _tokens(self, text):
        return [(n["token"], n["percent"]) for n in matcher.extract_numbers(text)]

    def test_ids_and_dates_give_no_numbers(self):
        for text in ("FV/2026/0010 del 14/10/2026", "FV-2026", "2026-10-14", "14.10.2026",
                     "FV2026", "pedido SO_0012"):
            with self.subTest(text=text):
                self.assertEqual(self._tokens(text), [])

    def test_free_standing_numbers_survive(self):
        self.assertEqual(self._tokens("debe -5,5 y (121,00) total: 121."),
                         [("-5,5", False), ("121,00", False), ("121", False)])

    def test_percentages_are_marked(self):
        self.assertEqual(self._tokens("IVA 21% o 21 %"), [("21", True), ("21", True)])

    def test_a_plain_space_does_not_group(self):
        self.assertEqual(self._tokens("Hay 3 120 unidades"), [("3", False), ("120", False)])
        self.assertEqual([n["values"] for n in matcher.extract_numbers("1\u00a0234,56")], [[1234.56]])


class CheckAnswerTest(unittest.TestCase):
    def test_numbers_match_within_tolerance_in_either_convention(self):
        spec = [{"number": 1234.56, "tolerance": 0.01}]
        for answer in ("Te debe 1.234,56 €", "It is 1,234.56 EUR", "total: 1234,56"):
            with self.subTest(answer=answer):
                self.assertTrue(matcher.check_answer(answer, spec)["verified"])
        self.assertFalse(matcher.check_answer("Te debe 1.234,50 €", spec)["verified"])

    def test_an_ambiguous_token_matches_either_reading(self):
        self.assertTrue(matcher.check_answer("son 1.234 unidades", [{"number": 1234}])["verified"])
        self.assertTrue(matcher.check_answer("son 1.234 kg", [{"number": 1.234}])["verified"])

    def test_a_number_in_an_id_or_date_does_not_match(self):
        answer = "La factura FV/2026/0010 del 14/10/2026 tiene IVA 21%"
        self.assertFalse(matcher.check_answer(answer, [{"number": 10, "near": "factura"}])["verified"])
        self.assertFalse(matcher.check_answer(answer, [{"number": 21, "tolerance": 0.5}])["verified"])
        self.assertTrue(matcher.check_answer(answer, [{"number": 21, "percent": True}])["verified"])

    def test_near_needs_the_anchor_close_by(self):
        spec = [{"number": 3, "near": "unidades"}]
        self.assertTrue(matcher.check_answer("Quedan 3 unidades y 10 cajas", spec)["verified"])
        self.assertFalse(matcher.check_answer("Quedan 10 unidades", spec)["verified"])
        far = "Quedan 3 cajas" + " y bastante texto en el medio" * 3 + " de unidades"
        self.assertFalse(matcher.check_answer(far, spec)["verified"])
        self.assertTrue(matcher.check_answer("3 UNIDADES", spec)["verified"])

    def test_near_binds_the_anchor_to_its_nearest_number_only(self):
        answer = "Hay 10 unidades y 3 cajas"
        def ok(number, near):
            return matcher.check_answer(answer, [{"number": number, "near": near}])["verified"]
        self.assertFalse(ok(3, "unidades"))
        self.assertTrue(ok(10, "unidades"))
        self.assertTrue(ok(3, "cajas"))
        self.assertFalse(ok(10, "cajas"))

    def test_near_a_tie_goes_to_the_number_before_the_anchor(self):
        spec = lambda n: [{"number": n, "near": "uds"}]
        self.assertTrue(matcher.check_answer("10 uds 3", spec(10))["verified"])
        self.assertFalse(matcher.check_answer("10 uds 3", spec(3))["verified"])

    def test_near_any_anchor_occurrence_may_carry_the_number(self):
        answer = "Pedido: 4 cajas. Almacén: 7 unidades y 2 cajas"
        spec = lambda n: [{"number": n, "near": "cajas"}]
        self.assertTrue(matcher.check_answer(answer, spec(4))["verified"])
        self.assertTrue(matcher.check_answer(answer, spec(2))["verified"])
        self.assertFalse(matcher.check_answer(answer, spec(7))["verified"])

    def test_text_matches_whole_words_only(self):
        self.assertFalse(matcher.check_answer("posiblemente", [{"text": "si"}])["verified"])
        self.assertTrue(matcher.check_answer("Sí, está pagada", [{"text": "si"}])["verified"])
        self.assertTrue(matcher.check_answer("está   pagada", [{"text": "Está pagada"}])["verified"])

    def test_small_literals_are_flagged(self):
        self.assertTrue(matcher.is_small_literal({"number": 10}))
        self.assertFalse(matcher.is_small_literal({"number": 10, "near": "cajas"}))
        self.assertFalse(matcher.is_small_literal({"number": 121}))
        self.assertFalse(matcher.is_small_literal({"number": "{{steps.x.total}}"}))
        self.assertFalse(matcher.is_small_literal({"number": 10, "percent": True}))

    def test_text_is_case_and_accent_insensitive(self):
        spec = [{"text": "Cliente Pérez"}]
        self.assertTrue(matcher.check_answer("La factura es de CLIENTE  PEREZ.", spec)["verified"])
        self.assertFalse(matcher.check_answer("La factura es de otro.", spec)["verified"])

    def test_none_items_must_be_absent(self):
        spec = {"all": [{"number": 121}], "none": [{"text": "no hay nada"}]}
        self.assertTrue(matcher.check_answer("Quedan 121,00 €", spec)["verified"])
        self.assertFalse(matcher.check_answer("No hay nada pendiente, 121", spec)["verified"])

    def test_no_answer_is_not_the_expected_answer(self):
        result = matcher.check_answer(None, [{"text": "x"}])
        self.assertFalse(result["verified"])
        self.assertFalse(result["answered"])

    def test_expected_numbers_may_be_resolved_strings(self):
        self.assertTrue(matcher.check_answer("121,00", [{"number": "121.00"}])["verified"])
        self.assertTrue(matcher.check_answer("1.234,56", [{"number": "1.234,56"}])["verified"])
        # A machine-formatted string (what a resolved reference usually is)
        # reads the Python way; a locale string that could mean two things is refused.
        self.assertTrue(matcher.check_answer("1,234 kg", [{"number": "1.234"}])["verified"])
        with self.assertRaises(ValueError):
            matcher.check_answer("1234", [{"number": "1,234"}])

    def test_a_unicode_minus_is_a_sign(self):
        # U+2212, what typeset text and some formatters write for a negative.
        self.assertEqual(matcher.number_candidates("\u22121.234,56"), [-1234.56])
        answer = "Saldo a favor: \u22121.234,56 \u20ac"
        self.assertTrue(matcher.check_answer(answer, [{"number": -1234.56}])["verified"])
        self.assertFalse(matcher.check_answer(answer, [{"number": 1234.56}])["verified"])
        # Still not a sign when it joins an id.
        self.assertEqual(matcher.extract_numbers("FV\u22122026"), [])

    def test_a_percentage_may_have_a_non_breaking_space_before_the_sign(self):
        for answer in ("IVA 21\u00a0%", "IVA 21\u202f%", "IVA 21 %"):
            with self.subTest(answer=answer):
                self.assertTrue(matcher.check_answer(answer, [{"number": 21, "percent": True}])["verified"])
                # A percentage never answers a plain-number item.
                self.assertFalse(matcher.check_answer(answer, [{"number": 21, "tolerance": 0.5}])["verified"])

    def test_a_number_after_a_numero_abbreviation_is_a_document_number(self):
        for text in ("Nº 10", "nº 10", "N.º 10", "N° 10", "No. 10", "núm. 10", "num 10", "#10", "# 10",
                     "nº10"):
            with self.subTest(text=text):
                self.assertEqual(matcher.extract_numbers(text), [])
        self.assertFalse(matcher.check_answer("Pedido Nº 10 sin importe",
                                              [{"number": 10, "near": "pedido"}])["verified"])
        # "no" without a dot is the Spanish negation, not the abbreviation.
        self.assertEqual([n["token"] for n in matcher.extract_numbers("no 10 unidades")], ["10"])
        # The amount after the document number is still read.
        self.assertTrue(matcher.check_answer("Factura nº 7 por 1.234,56 €",
                                             [{"number": 1234.56}])["verified"])

    def test_times_are_not_numbers(self):
        for text in ("a las 10:00", "10:00:59", "2026-10-14T10:00:00Z", "entre 9:30 y 10:15"):
            with self.subTest(text=text):
                self.assertEqual(matcher.extract_numbers(text), [])
        # A colon that is a label separator does not hide the amount.
        self.assertTrue(matcher.check_answer("Total: 121,00 €", [{"number": 121}])["verified"])
        self.assertTrue(matcher.check_answer("Total:121", [{"number": 121}])["verified"])

    def test_international_phone_numbers_are_not_numbers(self):
        for text in ("+34 600 123 456", "+34 600123456", "+34-600-123-456", "+1 415 555 0100",
                     "Tel. +34\u00a0600\u00a0123\u00a0456"):
            with self.subTest(text=text):
                self.assertEqual(matcher.extract_numbers(text), [])
        self.assertTrue(matcher.check_answer("Llame al +34 600 123 456: debe 121 €",
                                             [{"number": 121}])["verified"])
        # A signed amount is not a phone.
        self.assertEqual([n["token"] for n in matcher.extract_numbers("ajuste +12 €")], ["12"])

    def test_dates_and_ids_stay_out_under_v4(self):
        self.assertEqual(matcher.MATCHER_VERSION, 4)
        answer = ("Factura FV/2026/0121 del 14/10/2026 (2026-10-14), id 95E2A8B50A254B2AAE6774B8C2F28120, "
                  "pedido SO-0121, uuid 3f2a9c1e-77b0-4d2e-9a11-0c5e2b7d0121, v1.2.1")
        self.assertEqual(matcher.extract_numbers(answer), [])
        self.assertFalse(matcher.check_answer(answer, [{"number": 121}])["verified"])
        self.assertFalse(matcher.check_answer(answer, [{"number": 2026}])["verified"])

    def test_near_with_the_anchor_absent_is_a_mismatch(self):
        result = matcher.check_answer("Quedan 3 en el almac\u00e9n", [{"number": 3, "near": "unidades"}])
        self.assertFalse(result["verified"])
        self.assertEqual((result["all"][0]["found"], result["all"][0]["near"]), ([], "unidades"))

    def test_a_long_answer_is_matched_in_reasonable_time(self):
        # ~20 KB with ~700 numbers and ~350 anchor occurrences: far above a
        # normal answer. A sanity bound, not a benchmark.
        answer = "L\u00ednea con 12 unidades y 1.234,56 \u20ac de importe. " * 350 + "Total 98.765,43 \u20ac"
        spec = {"all": [{"number": 98765.43}, {"number": 12, "near": "unidades"}],
                "none": [{"text": "no encontr\u00e9"}]}
        started = time.perf_counter()
        result = matcher.check_answer(answer, spec)
        self.assertLess(time.perf_counter() - started, 2.0)
        self.assertTrue(result["verified"])

    def test_a_megabyte_answer_is_matched_in_seconds(self):
        # ~1.2 MB, ~40k numbers, ~20k anchors: `near:` must not be anchors x numbers.
        answer = "L\u00ednea con 12 unidades y 1.234,56 \u20ac de importe. " * 20000 + "Total 98.765,43 \u20ac"
        spec = {"all": [{"number": 98765.43}, {"number": 12, "near": "unidades"},
                        {"number": 98765.43, "near": "total"}],
                "none": [{"text": "no encontr\u00e9"}, {"number": 1234.56, "near": "total"}]}
        started = time.perf_counter()
        result = matcher.check_answer(answer, spec)
        self.assertLess(time.perf_counter() - started, 5.0)
        self.assertTrue(result["verified"])

    def test_the_result_carries_the_matcher_version(self):
        self.assertEqual(matcher.check_answer("1", [{"number": 1}])["matcherVersion"],
                         matcher.MATCHER_VERSION)

    def test_spec_validation(self):
        for bad in ({}, {"all": []}, {"some": [{"text": "x"}]}, [{"text": "x", "number": 1}],
                    [{"number": 1, "tolerance": -1}], [{"text": "x", "tolerance": 1}], ["x"],
                    [{"text": "x", "near": "y"}], [{"number": 1, "near": " "}]):
            with self.subTest(spec=bad), self.assertRaises(ValueError):
                matcher.normalize_spec(bad)


if __name__ == "__main__":
    unittest.main()
