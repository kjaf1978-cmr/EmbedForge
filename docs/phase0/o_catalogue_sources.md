# Phase 0 (o) — Parts-catalogue data sources and redistribution terms

- Baseline: prompt v3.2
- Version: 0.1.0 (26 September 2026)
- Status: draft; desk research, not legal advice. Human review record (DOC-12): pending.

## 1. Conclusion

None of the distributor data sources I could check allows its data to be stored and
redistributed in an offline application: DigiKey, Mouser, Farnell/element14, TME, Arrow, the
TI store API, and LCSC/JLCPCB. Nexar/Octopart could not be checked; its terms page did not
return the relevant clauses.

The only legally clean route is a **fact-only catalogue that we curate ourselves**:
- entered by hand, limited to a few hundred parts;
- each field with its source URL and the date it was checked;
- open data (KiCad, Wikidata) reused only for non-commercial fields.

This confirms risk R-06, which is now mitigated by strategy F0-05.

## 2. Source evaluation

| Source | Useful fields | Redistribution in offline app | Key clause | URL |
|---|---|---|---|---|
| Nexar / Octopart | Parametrics, lifecycle, multi-distributor offers | UNVERIFIED (likely no) | Terms page did not load the API sections | octopart.com/api/terms |
| DigiKey Product Information API | Parametrics, stock, lifecycle | **No** | §3.2(iv) no distribution to third parties; §5.1(e) no building your own database | developer.digikey.com/api-user-agreement |
| Mouser Search API | Same | **No** | §4 may not "cache, record, pre-fetch, or otherwise store"; no own database | mouser.com/en/apiterms |
| Farnell / element14 / Newark | Same | **No** | §4.A no storing; §4.B no own database | partner.element14.com/terms |
| TME API | Parametrics, stock | **No** | §8.5 personal desktop / own website only; §8.10 destroy data when access ends | developers.tme.eu terms 2026-07-01 |
| Arrow API | Price, availability | **No** | Cache ≤ 48 h; no hosting for third parties | developers.arrow.com terms |
| TI store API | Lifecycle, stock | **No** | §2(i) no providing TI data or derived data to third parties | ti.com/developer-api/store-api |
| LCSC / JLCPCB, jlcparts | Stock, basic parametrics | **No** (code MIT, data unlicensed and scraped) | JLCPCB terms forbid copying or redistribution | jlcpcb.com terms; github.com/yaqwsx/jlcparts |
| KiCad libraries | Symbol/footprint, datasheet URL, keywords (no MPN, lifecycle or sources) | Yes, CC-BY-SA 4.0, kept as a separate attributed file | Design exception | github.com/KiCad/kicad-footprints LICENSE.md |
| Manufacturer product and PCN pages | Official lifecycle, package | Yes, for single facts recorded by us with URL and date (EU Database Directive: Recital 45 says the database right does not protect facts; Art. 8(1) allows taking insubstantial parts; Art. 7(5) forbids systematic extraction) | Site terms UNVERIFIED | eur-lex 31996L0009 |
| Wikidata | Some MPNs (P13802) | Yes (CC0; UNVERIFIED this session) | — | wikidata.org |
| Part-DB, InvenTree, Kitspace, OEMsecrets | No open dataset (they fetch from APIs) | Not applicable / No | — | — |

## 3. Proposed catalogue strategy (F0-05, for decision D11)

1. **Separate licence.** The catalogue is an original, fact-only dataset under CC-BY-4.0,
   separate from the GPL code. Fields that come from KiCad stay CC-BY-SA-4.0 in a separate
   file.
2. **Lifecycle from the manufacturer.** Status is read from the manufacturer's own product or
   PCN page and stored with the URL, the date, and the manufacturer's original label (for
   example TI "Last Time Buy" is mapped to not-active, with the original label kept).
3. **Sources are recorded by hand.** For each of at least two vendors: vendor name, SKU, URL,
   the date checked and an "in stock" yes/no. Stock quantities and prices are not stored, and
   no API output is used.
4. **Passives are generic E-series entries** (for example "R 10 kΩ 1 % 0.25 W THT"), each with
   MPNs from at least two manufacturers. Lifecycle is recorded per MPN.
5. **Kit modules are generic modules.** Their identity is the reference design plus the main
   IC, and the *active* test follows the D9 rule (A3-02).
6. **Scale.** About 150–250 parts, entered by hand and reviewed by you (SS-07), with no bulk
   import from any vendor dataset.
7. **Provenance and dating.** Every signed catalogue package carries a snapshot date, the date
   of every field and a PROVENANCE file. The app warns when a snapshot is more than 12 months
   old.
8. **Later option (not in the first release):** a user-triggered online check using the
   user's own API key, run at runtime with nothing redistributed. This would need an INV-02
   extension, so it is not proposed now.
