"""`aggregate:` on a setup step: the expected figure of a read probe, summed from a tool's rows.

A query probe ("how much did we invoice this month?") is checked against the right figure, read
right before the prompt. Etendo has widgets that return the figure already summed; Holded's MCP
only lists the documents. `aggregate` lets the runner sum them itself, with the platform's own
tool, so the check still reads through that platform's MCP (plan §3.3: posible = hacerlo y
comprobarlo con el propio MCP).

    - tool: list_invoices
      args: { start_date: "{{monthStart}}", limit: 200 }
      saveAs: month
      aggregate:
        rows: items.*.lines                 # optional; the rows of the list by default; a longer
                                            # path walks into each row (`*` flattens a list level);
                                            # a path not under items/data walks one record:
                                            # `warehouses` of get_product_stock
        where: { draft: false }             # exact match, the same rule as expectEffect.where
        value: subtotal                     # a field, or arithmetic over fields:
                                            #   units * (price - cost_price)
        groupBy: contact_name               # optional; then `top` (optional) keeps the largest

Saved as `{sum, count}` — or, with `groupBy`, `{groups: [{key, sum, count}, ...]}` sorted from the
largest sum — so the check reads `{{steps.month.sum}}` or `{{steps.top.groups.0.key}}`.

Every row must carry a number where `value` points: a row that does not is a broken read, not a
zero, and fails the step. A cursor page that says more rows follow fails it too
(`extract_rows`): a sum over part of the documents is not the figure.
"""

from __future__ import annotations

import ast
import operator
from typing import Any

from .mcp_client import _MISSING, _as_number, _path, _same, extract_rows

_KEYS = {"rows", "where", "value", "groupBy", "top"}
_OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}


class AggregateError(ValueError):
    """The rows could not be summed: a missing or non-numeric value, or a bad spec."""


def validate(raw: Any, where: str) -> dict[str, Any]:
    """Check an `aggregate:` mapping when the suite is loaded."""
    if not isinstance(raw, dict) or not raw.get("value"):
        raise ValueError(f"{where}: aggregate needs a `value` (a field or an expression over fields).")
    unknown = set(raw) - _KEYS
    if unknown:
        raise ValueError(f"{where}: aggregate has unknown key(s) {sorted(unknown)}.")
    _compile(raw["value"], where)
    if "top" in raw and (not isinstance(raw["top"], int) or raw["top"] < 1 or "groupBy" not in raw):
        raise ValueError(f"{where}: aggregate.top is a positive integer and needs `groupBy`.")
    if "where" in raw and not (isinstance(raw["where"], dict) and raw["where"]):
        raise ValueError(f"{where}: aggregate.where is a non-empty mapping.")
    return raw


def _compile(expr: str, where: str) -> ast.expr:
    try:
        tree = ast.parse(str(expr), mode="eval").body
    except SyntaxError as exc:
        raise ValueError(f"{where}: aggregate.value {expr!r} is not an expression: {exc.msg}") from exc
    for node in ast.walk(tree):
        allowed = (ast.BinOp, ast.Name, ast.Attribute, ast.Constant, ast.Load, ast.UnaryOp, ast.USub,
                   *_OPS)
        if not isinstance(node, allowed) or (isinstance(node, ast.Constant)
                                            and not isinstance(node.value, (int, float))):
            raise ValueError(f"{where}: aggregate.value {expr!r} may only use fields, numbers and + - * /.")
    return tree


def _field(node: ast.expr) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return f"{_field(node.value)}.{node.attr}"
    raise AggregateError("unsupported field reference")


def _evaluate(node: ast.expr, row: Any) -> float:
    if isinstance(node, ast.Constant):
        return float(node.value)
    if isinstance(node, ast.UnaryOp):
        return -_evaluate(node.operand, row)
    if isinstance(node, ast.BinOp):
        return _OPS[type(node.op)](_evaluate(node.left, row), _evaluate(node.right, row))
    name = _field(node)
    raw = _path(row, name)
    number = None if raw is _MISSING else _as_number(raw)
    if number is None:
        shown = "missing" if raw is _MISSING else repr(raw)
        raise AggregateError(f"row has no number at {name!r} ({shown})")
    return number


def _rows(payload: Any, path: str | None) -> list[Any]:
    """The rows to sum. The list itself comes from `extract_rows`, so a partial cursor page fails;
    a longer path walks into each row (`items.*.lines` — `*` is implied after the list)."""
    parts = (path or "").split(".")
    if parts[0] in ("", "data", "items", "results", "records"):
        rows, parts = extract_rows(payload), parts[1:]
    else:
        rows = [payload]  # a list nested in a single record: `warehouses` of get_product_stock
    if parts and parts[0] == "*":
        parts = parts[1:]
    level: list[Any] = rows
    for part in parts:
        nxt: list[Any] = []
        for node in level:
            if part == "*":
                if not isinstance(node, list):
                    raise AggregateError(f"`*` in rows {path!r} is not over a list")
                nxt.extend(node)
                continue
            value = _path(node, part)
            if value is _MISSING:
                raise AggregateError(f"rows {path!r}: no {part!r} in a row")
            nxt.extend(value if isinstance(value, list) else [value])
        level = nxt
    return level


def aggregate(payload: Any, spec: dict[str, Any]) -> dict[str, Any]:
    """Sum `spec.value` over the rows of `payload` (see the module docstring)."""
    rows = _rows(payload, spec.get("rows"))
    where = spec.get("where") or {}
    rows = [r for r in rows if all(_same(_path(r, k), v) for k, v in where.items())]
    tree = _compile(spec["value"], "aggregate")
    if "groupBy" not in spec:
        return {"sum": round(sum(_evaluate(tree, r) for r in rows), 6), "count": len(rows)}
    groups: dict[Any, dict[str, Any]] = {}
    for row in rows:
        key = _path(row, spec["groupBy"])
        if key is _MISSING:
            raise AggregateError(f"row has no {spec['groupBy']!r} to group by")
        group = groups.setdefault(key, {"key": key, "sum": 0.0, "count": 0})
        group["sum"] += _evaluate(tree, row)
        group["count"] += 1
    ordered = sorted(groups.values(), key=lambda g: g["sum"], reverse=True)
    for group in ordered:
        group["sum"] = round(group["sum"], 6)
    return {"groups": ordered[: spec["top"]] if spec.get("top") else ordered}
