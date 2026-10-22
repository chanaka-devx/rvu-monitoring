# ADR 0006: Decimal and rounding rules

- Status: Accepted
- Date: 2026-10-22
- Owners: RVU Monitoring team
- Phase: P1a

## Context

RVU values, money-like amounts and certified percentages must be reproducible:
the same inputs must always produce the same ledger totals, and totals must be
explainable against a golden reference report. JavaScript `number` is binary
floating point, so `0.1 + 0.2 !== 0.3` and money arithmetic silently drifts.
`parseFloat` is already banned in domain/application code by the determinism
lint rules (ADR 0005), but without a single shared decimal type every module
would invent its own parsing and rounding behavior.

The result columns are planned as `NUMERIC(12,4)` plus `NUMERIC(12,4)` counts
that must never overflow silently: a value that does not fit must be rejected
loudly, not clipped on write.

`decimal.js` provides arbitrary-precision decimal arithmetic, but its global
configuration (default precision 20, default rounding mode) is process-wide
mutable state, which is not acceptable inside a kernel shared by all modules.

## Decision

`packages/shared-kernel` owns one decimal type, `DecimalValue`, built on
`decimal.js`:

- The decimal.js constructor is **cloned** with `precision: 40` and
  `rounding: ROUND_HALF_UP`. The global `Decimal` configuration is never
  mutated via `Decimal.set`, and decimal.js is never configured anywhere else
  in the codebase.
- **No floats in, no floats out.** Creation is only through strict
  `DecimalValue.parse(string)` (pattern `^-?\d+(\.\d+)?$`; exponent notation,
  whitespace, `NaN` and `Infinity` are rejected), `DecimalValue.fromInteger`
  (safe integers only), and `DecimalValue.zero()`. There is **no constructor
  from a float** and **no `toNumber()`**. Values leave as strings via
  `toFixed(scale)`, `toJSON()`, `toString()` (initializers are part of the
  contract) `toNumeric(precision, scale)`.
- **Arithmetic** (`add`, `subtract`, `multiply`) is exact within precision 40
  and cannot fail. `divide(by, scale, mode?)` is rounded to an explicit scale
  and returns a `Result`, with an error when the divisor is zero.
  `percentOf(total, scale)` computes `this / total * 100` rounded HALF_UP and
  returns a `Result` (error when `total` is zero).
- **Rounding** is always explicit through `round(scale, mode)` or the `mode`
  argument, with `HALF_UP` as the project default because it is what RVU and
  money rounding is audited against. Supported modes mirror decimal.js:
  `UP`, `DOWN`, `CEIL`, `FLOOR`, `HALF_UP`, `HALF_DOWN`, `HALF_EVEN`,
  `HALF_CEIL`, `HALF_FLOOR`.
- **`toNumeric(precision, scale)` is strict, no silent rounding.** It returns
  an error (`decimal/numeric-overflow`) when the value has more fractional
  digits than `scale`, or more integer digits than `precision - scale`,
  counting significant digits (trailing zeros do not count). Example:
  `NUMERIC(12,4)` accepts `99999999.9999` and rejects `100000000` and
  `1.00001`. This is the gate every DecimalValue must pass before being stored
  in a `NUMERIC` column.
- `equals` and `compare` compare numeric values, so `0.30 == 0.3`.

Representation details that follow from decimal.js behavior: trailing zeros in
an input string are normalized away (`'1.50'` is stored as `1.5`, and
`toFixed(2)` re-renders `'1.50'`), and zero is always representable regardless
of `precision - scale`.

## Consequences

### Positive

- Decimal arithmetic is exact and reproducible on Windows, Linux and inside
  Postgres `NUMERIC` columns.
- Rounding is visible at the call site, and the project default (HALF_UP) is
  one grep away.
- Overflow of `NUMERIC(12,4)` is a loud domain error instead of a silent
  round-up on write.
- Fee- and value-derived floats cannot enter through the decimal boundary at
  all.

### Negative

- Every numeric in the codebase is a `DecimalValue` or a string; accidental
  `number` usage is a type error, but `number` arithmetic in non-critical code
  must be watched by review.
- decimal.js rounds silently at significant-digit 40 for arithmetic that
  overflows precision; values of more than ~40 significant digits are outside
  the intended domain and rejected by `toNumeric` storage gates.
- Callers who need a bare `number` for chart rendering must format strings
  themselves (deliberate; floats never re-enter crediting).

### Follow-up

- Decide the persistence mapping (string, not float) in P2 when the data-access
  library is chosen.
- If compensation (P19a) needs banker's rounding on pay runs, use explicit
  `HALF_EVEN` at those call sites, not new types.

## Alternatives considered

- **JavaScript `number` with care.** Rejected: non-reproducible sums violate
  the audit brief.
- **BigInt-based homegrown fixed-point.** Rejected: re-implements decimal.js
  with more risk and no regression suite.
- **Mutating global decimal.js config.** Rejected: global mutable state in a
  shared kernel couples every consumer to process-wide settings.
- **Big.js or BN.js.** Rejected: decimal.js already selected in the tech stack
  (ADR 0001 references); its API covers everything needed.

## References

- ADR 0001: Modular monolith (tech stack numbers row).
- ADR 0005: Layer and package dependency rules (determinism lint, decimal
  parsing ban).
- `docs/phases/P01a-handoff.md`.
