# Mapping & Service Finder

**Find urban manufacturing services by what they can actually do.**

An open-source, browser-based tool that describes manufacturing service providers —
workshops, Fab Labs, material suppliers, testing and certification bodies, advisory
services — in one shared vocabulary, and matches them against what a project actually
needs. Every result carries a per-criterion verdict: which requirements the provider
meets, which it does not, and which have never been researched.

No server, no build step, no installation. Open `index.html` in a browser and it runs.

---

## The problem

Urban manufacturing infrastructure supports sustainable production, but it is hard to
find. Provider websites describe what they do in aspirational terms rather than stating
which machines they operate or how work is charged. General search engines index
documents rather than capabilities and rank results by popularity, which systematically
buries small local workshops. Existing directories list facilities, but as free text
that cannot be filtered or compared.

The result is that a project needing a five-axis mill, recycled filament, or a repair
service in its own city may never find the workshop two streets away.

This tool takes the opposite approach. A fixed set of ten dimensions describes both what
providers offer and what projects need, so the two can be compared directly rather than
by keyword.

---

## The research paper

This repository is the software reported in:

> **Mapping & Service Finder for Specific Technology Infrastructure for Sustainable
> Manufacturing in Urban Settings**
> Yash Amit Barhanpurkar, Harsith Suresh Kumar, Pradosh Kandasamy, Julien Colomb,
> Robert Mies — Global Production Engineering, Technische Universität Berlin.

The paper develops the ten-dimension taxonomy from a review of 45 sources and a pass
over recognised classification standards, documents how the Berlin provider dataset was
collected, and validates the tool against three real projects: **windkit** (an
open-hardware wind turbine), **Verdant Ascent** (a modular vertical garden) and **AERO**
(a recycled-plastic air cleaner). Those three cases are built into the interface as
one-click presets, so you can reproduce the results the paper reports.

Project context: LAUDS Factories, Horizon Europe GA 101135986.

*The paper is in preparation; a full citation and DOI will be added here on publication.*

---

## How it works

Three decisions shape everything else.

**The unit is the offering, not the provider.** One organisation can run a fabrication
workshop, rent desks, and sell consulting from the same address. Those are three
different things to search for, so each is classified separately, with the provider as a
parent record holding location, verification level and sources.

**Resource type is a hard gate.** Every offering is exactly one of: fabrication facility,
material supplier, testing service, certification service, advisory service, or
workspace. That choice determines which of the remaining dimensions even apply — a
workspace has no fabrication process, so the tool never asks for one and never displays
an empty field where one cannot exist. The same applicability matrix drives the data
entry form, the search questions, and the result cards, so the three cannot drift apart.

**Matching is equal-weight criteria satisfaction.** Each requirement you state resolves
to *met*, *not met*, or *unknown*, and results are ranked by fewest mismatches, then most
criteria met, then fewest unknowns, then verification confidence. There are no importance
weights, because no empirical basis exists for choosing them. Crucially, **missing data
is not a mismatch** — a provider with a sparse website is not punished for it, and the
gap is shown as a gap rather than hidden inside a score.

You always see *why* a provider ranked where it did, criterion by criterion.

---

## The ten dimensions

| | Dimension | What it records |
|---|---|---|
| **D0** | Resource Type | What kind of thing this offering is; gates all the others |
| **D1** | Technology Domain | Process, equipment, material family, specific material |
| **D2** | Production Stage | Education & concept, design & prototyping, production |
| **D3** | TRL Range | The readiness band of client projects the provider can support |
| **D4** | Circularity | Which of the 10R strategies the offering supports |
| **D5** | Openness Level | Transparency, replicability, reusability, accessibility |
| **D6** | Access Model | Free, membership, pay-per-use, grant-funded, institutional |
| **D7** | Governance Model | Community-governed, policy-driven, hybrid, commercial |
| **D8** | Target User Profile | SMEs, startups, scaleups, innovator teams, research, creatives |
| **D9** | Support Services | Co-design, distribution, mentoring, certification support |

Vocabularies are seeded from recognised standards — DIN 8580 and EN ISO/ASTM 52900 for
processes, the 10R framework for circularity, the OSTRL scale and DIN SPEC 3105 for
openness, NUTS and ISO 3166 for geography, Commission Recommendation 2003/361/EC for
company size — and are editable in the admin interface. Leaf values grow through field
research; they are never inferred.

---

## Try it

Open `index.html` in any browser. Nothing to install. Map tiles need an internet
connection; everything else works offline.

**Try a real case** at the top of the sidebar fills the entire form in one click from one
of the three demand profiles used in the paper's validation. Each profile comes from that
project's own public record, so the counts on screen are the ones the paper reports.
Click the active case again, or **Clear all**, to reset.

Otherwise: state nothing and you get every provider, unranked — a plain directory. State
criteria and you get the same providers ranked by fit, each card showing what is met,
mismatched, or not yet researched. A strict toggle hides anything that misses a
requirement. Ask for several resource types at once and you get one result block per need.

---

## The dataset

**17 providers, 25 offerings**, mostly Berlin (NUTS DE300), with a few Brandenburg and
Germany-wide providers included where a needed capability is otherwise unserved.

Collected in July 2026 by AI-assisted web research over each provider's own published
pages, then checked manually. Every record carries a verification level —

- `page-level` — the offering was confirmed on the provider's own pages
- `company-level` — the organisation was confirmed, but not that specific offering
- `unverified`

— and at least one source URL. Fields the source did not confirm are left blank rather
than guessed, and discrepancies are recorded rather than silently corrected.

This is a seed dataset built to demonstrate the method, not a comprehensive register of
Berlin's manufacturing infrastructure.

---

## Pages

**`index.html` — Find providers.** The sidebar collects what you need; the map and the
result list are two renderings of the same result set.

**`admin.html` — Admin.** Two tabs. *Providers* is the provider and offering editor, with
offering fields generated automatically from the applicability matrix. *Taxonomy* is the
taxonomy builder — resource types, the applicability matrix, process schemes, circularity
tiers, certification categories and every dimension's value list. Each value shows its
usage count, and values in use cannot be deleted.

`map.html` and `find.html` are redirects to `index.html`, kept so older links still work.

---

## Repository layout

```
data/
  vocabularies.json     the taxonomy: dimensions, values, applicability matrix
  providers.json        provider and offering records
  *.js                  generated mirrors (see "Editing the data")
schema/
  provider.schema.json  parent record: geography (WGS84 + NUTS), certifications held,
                        verification confidence, offerings[]
  offering.schema.json  the unit of classification; applicability matrix enforced
                        structurally through JSON Schema conditionals
js/
  app.js                Find providers: one criteria state, map and list
  match.js              the matching engine — pure data in, data out, no DOM
  admin.js              provider editor and taxonomy builder
tools/
  mirror.py             regenerate the JS data mirrors after editing the JSON
  test_match.js         engine and dataset tests
  test_ui.js            interface tests for the demonstration presets
css/style.css
index.html              Find providers
admin.html              Admin (Providers | Taxonomy)
```

The matching engine is deliberately separated from all interface code, so it can be run
and tested without a browser.

---

## Editing the data

The JSON files are canonical. Because browsers block local JSON fetches when a page is
opened by double-click, each JSON file has a generated `.js` mirror alongside it — which
is why both are committed.

1. Edit in the Admin page (changes are held as a browser draft), or edit the JSON directly.
2. Download `providers.json` / `vocabularies.json` from the Admin sidebar.
3. Replace the files in `data/`.
4. Run `python3 tools/mirror.py` to regenerate the mirrors.

Skipping step 4 means the page shows stale data while the JSON looks correct.

---

## Tests

```
node tools/test_match.js     # 44 checks: engine behaviour + dataset integrity
node tools/test_ui.js        # 44 checks: the demonstration presets (needs jsdom)
```

Two kinds of check, deliberately separated.

**Behaviour** tests run against fixtures declared inside the test file, so they test the
engine rather than the current size of the dataset.

**Integrity** tests run against the real `data/` files and assert properties that hold at
any dataset size: every value used exists in the vocabulary, no record violates the
applicability matrix, every NUTS code is in the geography list, every provider carries a
verification level and at least one source, every TRL band is a valid 1–9 range, and every
result returned for a need is of that need's resource type.

---

## Design commitments

- Blank data is never counted as a miss, and never hidden.
- Certification means three different things and is kept as three: a core service (D0),
  add-on support (D9), and a credential the provider holds (recorded on the provider,
  with claimed / certified status).
- Geography at two grains: a WGS84 coordinate and NUTS codes, exported as GeoJSON
  (RFC 7946). Worldwide by construction; Berlin-Brandenburg is simply the applied case.
- Nothing disappears silently. Providers without coordinates are listed as "not yet
  placed" rather than dropped; defunct providers are retained but never shown; taxonomy
  values in use cannot be deleted.

---

## Citing this software

Please cite the archived release rather than this GitHub URL — git history can be
rewritten, an archived record cannot. Machine-readable metadata is in
[`CITATION.cff`](CITATION.cff), which GitHub reads to produce the "Cite this repository"
button in the sidebar.

<!-- TODO Paste the Zenodo DOI badge here once the first release is archived:
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.XXXXXXX.svg)](https://doi.org/10.5281/zenodo.XXXXXXX)
-->

## Licence

Code (`js/`, `tools/`, `css/`, `*.html`) — MIT, see [LICENSE](LICENSE).

Data (`data/`, `schema/`) — Creative Commons Attribution 4.0 International (CC BY 4.0).
If you reuse the provider dataset or the taxonomy, please cite the archived record.