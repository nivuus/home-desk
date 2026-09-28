"""The ONLY exit point that redisplays a subentry form, whether it is the
first display of a step or a rejection.

Review round 1 (task 6) had already fixed the same defect TWICE, in two
neighbouring modules: a rejection that redisplayed the previously STORED
values rather than the user's FAULTY input (`list_sections.py`, Important
2; `config_flow.py`, same debt inherited from task 5). Round 2: a third
occurrence of the hand-written idiom would have appeared as soon as
`_async_step_section` (list_sections.py) had, in turn, to reject a submission —
and a fourth would have followed it in task 7 (timers). The idiom therefore
lives only HERE, once, reused by the three callers.
"""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigSubentryFlow, SubentryFlowResult


def reafficher(
    flow: ConfigSubentryFlow,
    step_id: str,
    schema_form: vol.Schema,
    values: dict[str, Any] | None,
    errors: dict[str, str] | None = None,
    description_placeholders: dict[str, str] | None = None,
) -> SubentryFlowResult:
    """Redisplays `step_id` with `values` PRE-FILLED
    (`add_suggested_values_to_schema`): on first display, these are the
    STORED values (or nothing, for an addition); on a rejection, `values` MUST
    be the faulty input itself (`user_input`), never the previous values
    — it is the caller that chooses which one to pass, this function only
    performs the gesture common to all three."""
    return flow.async_show_form(
        step_id=step_id,
        data_schema=flow.add_suggested_values_to_schema(schema_form, values),
        errors=errors or {},
        description_placeholders=description_placeholders or {},
    )
