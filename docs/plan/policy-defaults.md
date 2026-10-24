# Crediting policy defaults (phase P07)

These are the shipped defaults for `defaultPolicy(policyId)`; operators may
override any of them per policy version.

- `dateBasis: service_date` — credit dates follow the service date, not the
  posting date.
- `scheduleBasis: service_date` — the active RVU schedule is chosen by schedule
  version effective range coverage of the service date; contractual fixed
  versions are an explicit per-policy choice.
- `statusRules`: `final: credit`, `pending: exclude`, `voided: exclude`.
- `maxUnitsPerLine: 1000` — policy validation accepts integers 1..100000; the
  conservative default is well inside that range.
- `modifiers`: no rules ship by default. Every non-empty modifier set therefore
  reviews as `modifier_not_supported` until rules are configured. Recommended
  starter rules should be reviewed with clinical staff before rollout.
- `correctionRule: original_period_while_open` — corrections land in the
  original period while it is open; once reporting closes the period they land
  as adjustments in the current period (`always_adjustment` forces the
  adjustment behavior for every correction).

Evaluation order is fixed (first failing check wins): status rule, provider
mapping (`provider_unmapped`), unit validity (`invalid_units`), modifier
rules (`modifier_excluded` / review), schedule availability and coverage
(`no_schedule_available`, `schedule_mismatch`), then the code lookup
(`code_not_in_schedule`, `no_rvu_value`), then the credited calculation.

Rounding: `wrvu = round4(workRvu x units x factor)`, one rounding step, scale
four, `HALF_UP` (ADR 0006). Multiplier factors must be positive decimals with
at most four fractional digits; NUMERIC(12,4) storage applies to credited
values.
