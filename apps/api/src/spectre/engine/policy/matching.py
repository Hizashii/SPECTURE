"""Pattern matching for the supported IAM-like subset (see README, "Authorization subset").

Patterns are case-sensitive. ``*`` matches everything; a trailing ``*`` is a prefix match;
anything else is an exact match. No other wildcard forms exist.
"""


def covers(pattern: str, value: str) -> bool:
    """True if ``pattern`` covers every string ``value`` can stand for.

    ``value`` may itself be a pattern (a "probe", e.g. ``s3:*``). A probe is covered only
    when the whole pattern is, so a Deny on ``s3:GetObject`` does not cover the probe
    ``s3:*``: the other s3 actions stay allowed.
    """
    if pattern == "*":
        return True
    if pattern.endswith("*"):
        return value.startswith(pattern[:-1])
    return pattern == value
