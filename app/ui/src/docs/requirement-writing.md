# Writing good requirements

EmbedForge drafts requirements from your description and checks them before any design starts.
These rules are an original summary. The source is the INCOSE *Guide to Writing
Requirements*, which is not reproduced here.

A good requirement is:

- **Necessary**: removing it would leave something the project must do unspecified.
- **Singular**: it states one thing. Split "and/or" into separate requirements.
- **Unambiguous**: it has one reading. Name signals exactly ("input A"), give units and ranges
  ("0 V to 5 V"), and give tolerances for comparisons ("within 0.05 V").
- **Verifiable**: it can be shown to pass by test, emulation, analysis or inspection.
- **Traceable**: it links back to your description and forward to blocks, code and tests.

## Words EmbedForge flags

These words make a requirement vague. Replace each one with a number or a precise condition:

- *fast, slow, approximately, about*
- *appropriate, adequate*
- *user-friendly, easy*
- *etc., and/or, as needed, if possible*
- *popular, typical*

The list can be extended per project.

## Examples

| Vague | Better |
|---|---|
| "Switch U on when A equals B" | "U shall switch ON when \|A − B\| ≤ 0.05 V, with 0.02 V hysteresis" |
| "Increment U when C and D are on" | "On each rising edge of (C AND D AND NOT E), the counter shall increase by 1, saturating at 255" |
