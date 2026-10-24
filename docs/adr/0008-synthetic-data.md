# ADR 0008: Synthetic data rules for the testing package

- Status: Accepted
- Date: 2026-10-22
- Owners: RVU Monitoring team
- Phase: P1b

## Context

Phases P8 onwards (ingestion, crediting, reconciliation) need realistic
service-line data flowing through import, crediting and reconciliation long
before the practice provides a real export. The system is HIPAA-adjacent:
any patient field in test data invites real PHI into environments that never
needed it, and P16's "completeness banner" judgment about totals hinges on
tests being able to trust the data they run on. The brief also warns that
CPT descriptions are AMA-owned, so even synthetic descriptions must never
pretend to be real CPT content. Finally, every red/green cycle in later
phases relies on "same seed gives identical data": two agents on two
operating systems must see byte-identical files to compare dashboard totals.

The testing package (`packages/testing`) already imports only
`packages/shared-kernel` (ADR 0005). Generating data there needs randomness;
the kernel bans `Math.random` in domain/application code, and test data
generation must itself be reproducible.

## Decision

`packages/testing/src/synthetic/` generates all synthetic datasets under
these rules:

- **Synthetic codes only.** Code identifiers are drawn from `Z0001` to
  `Z0099`. No real CPT or HCPCS code is ever generated, and no clinical
  descriptions are attached to codes at all. The `Z` prefix makes synthetic
  data visually obvious in any leaked screenshot or exported file.
- **No patient fields of any kind.** `SyntheticServiceLine` has exactly 13
  fields (`sourceSystem`, `sourceLineId`, `encounterRef`, optional
  `versionRef`, `serviceDate`, `code`, `modifiers`, `units`,
  `placeOfService`, `renderingProviderId`, `locationId`, `status`,
  `postedDate`). No name, date of birth, MRN, address, phone or insurance
  identifier exists anywhere in the synthetic types. A test pins the exact
  key set of `SyntheticServiceLine` against an allowlist, so any field
  addition - patient or otherwise - fails the suite until that allowlist is
  consciously updated. Patient-adjacent terms (`patient`, `dob`, `birth`,
  `mrn`, `insurance`) are additionally asserted absent from generated CSV
  output, not just from the type.
- **Seeded determinism.** All randomness comes from `createRandom(seed)`, a
  mulberry32 stream seeded by an explicit integer. `generateDataset` walks
  days then per-day line slots in fixed order and draws from that single
  stream, so the same options produce byte-identical CSV output on any
  platform, and different seeds produce different datasets. There is no
  use of `Math.random()`, `Date.now()` or the wall clock anywhere in the
  package. `FixedClock` and `SequentialIdGenerator` exist so domain code
  tested against this data never touches ambient time or id generation
  either.
- **LF-only CSV, deviating from RFC 4180.** `toCsv` joins row entries with
  `\n` only and never emits `\r`. RFC 4180 specifies CRLF: the deviation is
  deliberate. Source control (.gitattributes) already enforces LF, the
  ingestion parser (P8) owns line-ending tolerance on input, and CRLF
  emission from tests on Windows would create fake platform asymmetries
  inside a repo whose contract is "everything must behave identically on
  ubuntu and windows". A test pins `csv.includes('\r') === false`.
- **RFC-quoting is kept where it matters.** A field containing a comma, a
  double quote, CR or LF is quoted and interior quotes doubled; modifiers
  are joined with `|` inside their single field; dates render as
  `YYYY-MM-DD` via `LocalDate.toString()`; absent optional fields are empty
  strings. The acceptance round trip uses a snapshot parser that lives
  inside the CSV test file only, so the production parser (P8) never shares
  test code.

## Consequences

### Positive

- Synthetic fixtures are safe to commit, leak, or show at a demo.
- Deterministic seeds make cross-agent, cross-OS comparisons exact:
  dashboard totals in later phases can be asserted to the last `DecimalValue`.
- The allowlist test makes accidental enrichment of the synthetic line type
  (the usual path by which PHI creeps into test data) fail loudly.
- Test and production randomness are clearly separated: the testing package
  owns seeded streams; kernel/domain code owns ports (`Clock`,
  `IdGenerator`).

### Negative

- The allowlist test must be maintained whenever `SyntheticServiceLine`
  legitimately evolves (a conscious, reviewable change by design).
- LF-only output differs from the most literal reading of RFC 4180; a
  downstream consumer that strictly requires CRLF would need a wrapper.
  The ingestion pipeline's parser is required to accept both.
- Determinism is a property of the *combination* of seed and build list:
  changing `generateDataset` code changes all seeds' outputs at once, so
  fixture-stability-sensitive golden files must be regenerated deliberately.

## References

- ADR 0005: Layer and package dependency rules (testing imports kernel only).
- ADR 0006: Decimal and rounding rules (`DecimalValue` for all RVU values).
- ADR 0007: Dates and time (`LocalDate` for service and posting dates).
- `docs/phases/P01b-handoff.md`.
