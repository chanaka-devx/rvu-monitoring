# ADR 0016: Crediting core is a pure domain function

Status: accepted

The crediting module's calculation core is a pure domain function with no I/O:
`decideCredit(line, schedule | null, policy)` returns a `CreditDecision`
(`Credited` / `NeedsReview` / `Excluded`) and never throws for malformed input.
Status, provider mapping, units, modifiers, schedule availability, coverage and
the code lookup are evaluated as a fixed ordered gate; the first failing check
wins and every later check is skipped. RVU arithmetic uses `DecimalValue`, is
rounded once, at scale four, `HALF_UP` (`AGENTS.md`, ADR 0006), and true zero
schedules credit `0.0000`.

`CreditingPolicy` is a versioned value object built by
`CreditingPolicy.create(config)`; invalid configurations fail once with error
code `crediting/policy-invalid` carrying `details.problems` — an array of every
found problem, so failures are collected rather than short-circuited.
`fromJson(input)` validates the unknown canonical shape (rejecting unknown
fields and non-decimal factor strings) and returns the same failure contract;
`toCanonical()` emits a key-ordered, deduplicated and sorted JSON form.
`equals` compares canonical forms, so declaration order never affects identity.
Unsupported modifiers, ambiguous multipliers, schedule mismatch and absent RVU
values return `NeedsReview` reasons instead of invented values.

Schedule basis (`service_date` vs contractual `fixed`), date basis
(`service_date` vs `posting_date`) and the correction-period rule
(`original_period_while_open` vs `always_adjustment`) are policy data; the
default policy ships `service_date` everywhere, credits only final lines,
caps units at 1000, has no modifier rules, and keeps corrections in the
original period while open (documented in docs/plan/policy-defaults.md).

Closed-period tracking lives with reporting; crediting takes the
`isClosed` boolean as an input to `assignCorrectionPeriod` until the
reporting phase provides the port.
