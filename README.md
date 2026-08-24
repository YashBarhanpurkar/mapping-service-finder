# LAUDS Mapping & Service Finder — Demonstrator

Open-source, static, client-side demonstrator for the GPE project
**"Mapping & Service Finder for specific technology infrastructure on sustainable
manufacturing in urban settings"** (TU Berlin, SS 2026).

Built from scratch against the project reference document
(`LAUDS_Mapping_Service_Finder_Project.md`), Section 7 (taxonomy) in particular.
No server, no build step: HTML + CSS + JS, all data in JSON/GeoJSON,
Leaflet + OpenStreetMap for the map.

## Run it

Open `index.html` in a browser. Nothing to install.
(Map tiles need an internet connection; everything else works offline.)

## Status — module gates

| Module | Content | Status |
|---|---|---|
| M0 | Data schema + vocabularies + skeleton | **built** |
| M1 | Seed dataset — 17 providers / 25 offerings, own verification pass only | **built** |
| M2 | Faceted directory | **built** |
| M3 | Map (Leaflet / OSM / GeoJSON) | **built** |
| M4 | Criteria-satisfaction matching engine | **built** |
| M5 | Admin: provider editor + taxonomy builder | **built** |
| M6 | Packaging (licence, data-entry guide, FEDS test protocol) | pending |

M2–M4 are one page: browsing, searching and the map are the same operation, so they
share one criteria state and one engine.

## Pages

**`index.html` — Find providers.** Sidebar collects what the user needs; the map and the
result list are two renderings of the same result set.
- **Try a real case** (top of the sidebar) fills the whole form in one click from one of
  the three demand profiles used in the written validation — windkit, Verdant Ascent,
  AERO. Each profile is taken from that project's own public record, so the counts on
  screen are the same ones the project document reports. Clicking the active case again,
  or "Clear all", resets everything. Built for live demonstration; harmless otherwise.
- No criteria stated → every provider is listed, unranked (browse).
- Criteria stated → the same providers, ranked by fit, each card showing which criteria
  are met / mismatched / not researched yet.
- Optional strict toggle hides anything that does not meet every criterion.
- Several resource types at once → one result block per need.

**`admin.html` — Admin.** Two tabs:
- *Providers* — provider and offering editor in five collapsible sections, with the
  offering fields generated from the applicability matrix.
- *Taxonomy* — the taxonomy builder: resource types, the applicability matrix, process
  schemes, circularity tiers, certification categories and all dimension value lists.
  Every value shows its usage count; values in use cannot be deleted.

`map.html` and `find.html` are redirects to `index.html` (kept only so old links work).

## Layout

```
demonstrator_web/
  data/
    vocabularies.json     # the taxonomy: dimensions, values, applicability matrix
    providers.json        # provider + offering records
    *.js                  # auto-generated mirrors (needed for file:// use)
  schema/
    provider.schema.json  # parent record: geo (WGS84 + NUTS), certifications_held
                          #   (claimed|certified), verification confidence, offerings[]
    offering.schema.json  # unit of classification: single-valued D0 gate; D1 two facets
                          #   + equipment leaf + materials; D2–D9; certification_scope;
                          #   applicability matrix enforced via JSON-Schema conditionals
  js/
    app.js                # Find providers: one criteria state, map + list, over match.js
    match.js              # matching engine — pure data in/out, no DOM (unit-tested)
    admin.js              # provider editor + taxonomy builder
  css/style.css
  tools/
    mirror.py             # regenerate the JS data mirrors after editing the JSON
    test_match.js         # engine unit tests: node tools/test_match.js
    test_ui.js            # interface tests for the demonstration presets (needs jsdom)
  index.html              # Find providers
  admin.html              # Admin (Providers | Taxonomy)
```

## Editing data

The canonical data are the JSON files. Because browsers block local JSON fetches when a
page is opened by double-click, each JSON file has a generated `.js` mirror.

1. Edit in the Admin page (changes are held in a browser draft), or edit the JSON directly.
2. Download `providers.json` / `vocabularies.json` from the Admin sidebar.
3. Replace the files in `data/`.
4. Run `python3 tools/mirror.py` to regenerate the mirrors.

## Tests

```
node tools/test_match.js     # 44 checks: engine behaviour + dataset integrity
node tools/test_ui.js        # 44 checks: the demonstration presets (needs jsdom)
```

Two kinds of check, deliberately separated:

- **Behaviour** tests run against fixtures declared inside the test file, so they test the
  engine rather than the current size of the dataset.
- **Integrity** tests run against the real `data/` files and assert properties that hold at
  any dataset size: every value used exists in the vocabulary, no record violates the
  applicability matrix, every NUTS code is in the geography list, every provider carries a
  verification level and at least one source, every TRL band is a valid 1–9 range, and
  every result returned for a need is of that need's resource type.

## Design commitments (from the reference doc)

- **Unit of classification = service offering**; provider is the parent bundle (§7.1).
- **D0 is a hard gate**, single-valued per offering; the applicability matrix (§7.6)
  is enforced structurally in the offering schema and drives both the entry form and
  the search questions.
- **Matching = gated, equal-weight criteria satisfaction** — each stated requirement
  evaluates to met / not met / unknown; ranking is tiered (fewest mismatches, then most
  met, then fewest unknowns, then verification confidence). No importance weights.
  Blank data is never counted as a miss.
- **Certification triple** kept separate: core service (D0), add-on support (D9),
  credential held (provider metadata with claimed|certified status).
- **Geography two-grain**: WGS84 coordinate + NUTS code(s); GeoJSON (RFC 7946)
  export; worldwide by construction, Berlin/Brandenburg as the applied case.
- **Verification confidence on every provider** (page-level / company-level /
  unverified) with sources required; discrepancies recorded, never silently fixed.
- **Vocabularies are standards-seeded and admin-editable**; leaves grow through field
  research and are never inferred.
- **Nothing is lost silently**: providers without coordinates are listed as "not yet
  placed" rather than dropped; defunct providers are retained but never shown;
  taxonomy values in use cannot be deleted.

## Citing this software

If you use this demonstrator or its taxonomy, please cite the archived release
rather than the GitHub URL — GitHub history can be rewritten, the Zenodo record
cannot. Machine-readable metadata is in [`CITATION.cff`](CITATION.cff); GitHub
renders a "Cite this repository" button from it.

<!-- TODO Paste the Zenodo DOI badge here once the first release is archived:
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.XXXXXXX.svg)](https://doi.org/10.5281/zenodo.XXXXXXX)
-->

## Licence

Code (`js/`, `tools/`, `css/`, `*.html`) — MIT, see LICENSE.
Data (`data/`, `schema/`) — Creative Commons Attribution 4.0 International
(CC BY 4.0). If you reuse the provider dataset or the taxonomy, cite the
Zenodo record listed above.

## Reference document

The project reference document (`LAUDS_Mapping_Service_Finder_Project.md`) cited
above is not included in this repository; it is the written project deliverable
that the accompanying paper reports.
