/* Unit tests for the matching engine (no browser needed): node tools/test_match.js

   Two kinds of test, deliberately separated:

   A. BEHAVIOUR tests run against small fixtures declared in this file. They must not
      depend on the contents of data/providers.json — the dataset grows with every field
      pass, and a test that asserts "exactly two results" silently becomes a test of how
      many providers happen to be in the file. Behaviour is fixed; data is not.

   B. INTEGRITY tests run against the real data files and assert properties that must
      hold no matter how large the dataset gets: gates are respected, every referenced
      vocabulary key exists, every provider carries verification and a source.
*/
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..");
const M = require(path.join(dir, "js/match.js")).Match;
const providers = JSON.parse(fs.readFileSync(path.join(dir, "data/providers.json"), "utf8")).providers;
const V = JSON.parse(fs.readFileSync(path.join(dir, "data/vocabularies.json"), "utf8"));

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  cond ? pass++ : fail++;
  console.log((cond ? "  ok   " : "  FAIL ") + name + (cond ? "" : "  -> " + JSON.stringify(extra)));
};

// ---------------------------------------------------------------- fixtures
const off = (o) => Object.assign({ id: "o", d0: "fabrication_facility", title: "t" }, o);
const prov = (id, o) => ({
  id, name: id, geo: { lat: 1, lon: 1, nuts: ["DE300"] },
  verification: { level: "page_level", sources: ["https://example.org"] },
  offerings: o
});

// A rich offering and a bare one, so met / not_met / unknown are all reachable.
const RICH = off({
  d1: { material_facet: ["metals"], process_facet: ["material_extrusion", "separating"], materials: ["pla"], equipment: [] },
  d2: ["design_prototyping"], d3: { min: 3, max: 7 }, d4: ["recycle"],
  d6: ["membership"], d7: "commercial", d8: ["startup"],
  d9: [{ type: "mentoring", intensity: "consultative" }]
});
const BARE = off({ d1: { material_facet: [], process_facet: [], materials: [], equipment: [] }, d6: ["free"], d7: "community_governed", d8: ["sme"] });

console.log("\n1. Three-state evaluation");
let ev = M.evaluateOffering(RICH, { processes: ["material_extrusion"] });
t("stated + present -> met", ev.met === 1 && ev.not_met === 0 && ev.unknown === 0, ev);
ev = M.evaluateOffering(RICH, { processes: ["knitting"] });
t("stated + absent from a filled field -> not met", ev.not_met === 1 && ev.met === 0, ev);
ev = M.evaluateOffering(RICH, { d4: ["repair"] });
t("stated + value not held -> not met (field is filled)", ev.not_met === 1, ev);
ev = M.evaluateOffering(BARE, { d4: ["repair"] });
t("blank field -> unknown, never a miss", ev.unknown === 1 && ev.not_met === 0, ev);
ev = M.evaluateOffering(RICH, {});
t("no criteria stated -> nothing evaluated", ev.total === 0, ev);
ev = M.evaluateOffering(RICH, { processes: ["material_extrusion", "knitting"] });
t("partial hit inside one criterion counts as met", ev.met === 1 && ev.lines[0].matched.length === 1, ev.lines);
ev = M.evaluateOffering(RICH, { processes: ["separating"], d2: ["production"], d4: ["reuse"] });
t("met / not_met / unknown are counted independently", ev.met === 1 && ev.not_met === 2 && ev.total === 3, ev);

console.log("\n2. Readiness band");
t("TRL inside band -> met", M.evaluateOffering(RICH, { trl: 5 }).met === 1);
t("TRL at band edge -> met", M.evaluateOffering(RICH, { trl: 7 }).met === 1);
t("TRL outside band -> not met", M.evaluateOffering(RICH, { trl: 8 }).not_met === 1);
t("no band recorded -> unknown, not a miss", M.evaluateOffering(BARE, { trl: 5 }).unknown === 1);

console.log("\n3. Hard gates");
const GATED = [
  prov("fab-a", [RICH]),
  prov("cert-a", [off({ id: "c", d0: "certification_service", certification_scope: ["ce_emc"] })]),
  Object.assign(prov("out-of-region", [RICH]), { geo: { lat: 1, lon: 1, nuts: ["DE404"] } }),
  Object.assign(prov("no-region", [RICH]), { geo: { lat: null, lon: null, nuts: [] } }),
  Object.assign(prov("closed", [RICH]), { status: "defunct" })
];
let r = M.findForNeed(GATED, "certification_service", {});
t("D0 gate: only offerings of the requested type", r.length === 1 && r[0].offering.d0 === "certification_service", r.map(x => x.provider.id));
r = M.findForNeed(GATED, "fabrication_facility", {}, { nuts: "DE300" });
t("region gate keeps the stated region", r.map(x => x.provider.id).join() === "fab-a", r.map(x => x.provider.id));
t("region gate excludes a provider confirmed elsewhere", !r.some(x => x.provider.id === "out-of-region"), r.map(x => x.provider.id));
t("region gate excludes a provider with no region recorded", !r.some(x => x.provider.id === "no-region"), r.map(x => x.provider.id));
r = M.findForNeed(GATED, "fabrication_facility", {});
t("defunct providers are never returned", !r.some(x => x.provider.id === "closed"), r.map(x => x.provider.id));
t("no region stated -> region is not gated at all", r.length === 3, r.map(x => x.provider.id));

console.log("\n4. Ranking");
const RANK = [
  prov("two-misses", [off({ id: "a", d1: { process_facet: ["knitting"], material_facet: ["textiles_apparel"] }, d8: ["creatives"] })]),
  prov("one-miss", [off({ id: "b", d1: { process_facet: ["material_extrusion"], material_facet: ["textiles_apparel"] }, d8: ["startup"] })]),
  prov("clean", [off({ id: "c", d1: { process_facet: ["material_extrusion"], material_facet: ["metals"] }, d8: ["startup"] })]),
  prov("clean-but-unknown", [off({ id: "d", d1: { process_facet: ["material_extrusion"], material_facet: ["metals"] } })])
];
const CRIT = { processes: ["material_extrusion"], materials: ["metals"], d8: ["startup"] };
r = M.findForNeed(RANK, "fabrication_facility", CRIT);
t("fewest mismatches ranks first", r[0].not_met === 0, r.map(x => [x.provider.id, x.met, x.not_met, x.unknown]));
t("among equal mismatches, more met ranks higher", r[0].provider.id === "clean" && r[1].provider.id === "clean-but-unknown", r.map(x => x.provider.id));
t("unknowns rank below met but above mismatches", r[1].unknown === 1 && r[2].not_met === 1, r.map(x => [x.provider.id, x.unknown, x.not_met]));
t("every offering is reported, none dropped by scoring", r.length === RANK.length, r.length);
const VER = [
  Object.assign(prov("unverified-one", [RICH]), { verification: { level: "unverified", sources: [] } }),
  prov("page-level-one", [RICH])
];
r = M.findForNeed(VER, "fabrication_facility", { processes: ["material_extrusion"] });
t("verification confidence breaks an otherwise exact tie", r[0].provider.id === "page-level-one", r.map(x => [x.provider.id, x.verification]));

console.log("\n5. Compound needs");
const all = M.findAll(GATED, ["fabrication_facility", "certification_service"], { d8: ["startup"] });
t("one result set per need, in the order asked", all.length === 2 && all[0].need === "fabrication_facility" && all[1].need === "certification_service", all.map(a => a.need));
t("needs are ranked independently, never merged", all[0].results.every(x => x.offering.d0 === "fabrication_facility") && all[1].results.every(x => x.offering.d0 === "certification_service"), all.map(a => a.results.length));
t("a need with no provider returns an empty set, not an error", M.findAll(GATED, ["material_supplier"], {})[0].results.length === 0);

console.log("\n6. Certification scope");
const CERTS = [
  prov("scope-recorded", [off({ id: "s", d0: "certification_service", certification_scope: ["ce_emc", "ce_lvd"] })]),
  prov("scope-blank", [off({ id: "b", d0: "certification_service" })]),
  prov("scope-other", [off({ id: "o", d0: "certification_service", certification_scope: ["iso13485"] })])
];
r = M.findForNeed(CERTS, "certification_service", { certification_scope: ["ce_emc"] });
t("recorded matching scope ranks first", r[0].provider.id === "scope-recorded" && r[0].met === 1, r.map(x => [x.provider.id, x.met, x.unknown, x.not_met]));
t("blank scope is unknown, and outranks a recorded mismatch", r[1].provider.id === "scope-blank" && r[1].unknown === 1 && r[2].not_met === 1, r.map(x => x.provider.id));
t("certifications held are never read as certification scope",
  M.evaluateOffering(off({ d0: "certification_service" }), { certification_scope: ["iso9001"] }).unknown === 1);

// ---------------------------------------------------------------- B. integrity
console.log("\n7. Dataset integrity (real data, size-independent)");
const vocabKeys = new Set();
const add = a => (a || []).forEach(x => vocabKeys.add(x.key));
add(V.d0_resource_types); add(V.d1_material_facet.values); add(V.materials_tags.values);
add(V.equipment_leaf.values); add(V.d2_production_stage); add(V.d6_access_model);
add(V.d7_governance); add(V.d8_target_user); add(V.d9_support_services.values);
V.d1_process_facet.schemes.forEach(s => add(s.values));
V.d4_circularity.tiers.forEach(x => add(x.values));
V.certifications.categories.forEach(c => add(c.values));
const nuts = new Set(V.geography.nuts3_seed.map(n => n.code));

const badKeys = [], badVerif = [], badMatrix = [], badGeo = [], badTrl = [];
providers.forEach(p => {
  const v = p.verification || {};
  if (!v.level || !(v.sources || []).length) badVerif.push(p.id);
  (p.geo && p.geo.nuts || []).forEach(c => { if (!nuts.has(c)) badGeo.push([p.id, c]); });
  (p.certifications_held || []).forEach(c => { if (!vocabKeys.has(c.cert)) badKeys.push([p.id, c.cert]); });
  p.offerings.forEach(o => {
    const rules = V.applicability_matrix[o.d0] || {};
    const facets = rules.D1_facets || [];
    const d1 = o.d1 || {};
    if (!vocabKeys.has(o.d0)) badKeys.push([p.id, o.d0]);
    [].concat(d1.material_facet || [], d1.process_facet || [], d1.materials || [], d1.equipment || [],
              o.d2 || [], o.d4 || [], o.d6 || [], o.d8 || [], (o.d9 || []).map(s => s.type),
              o.certification_scope || [], o.d7 ? [o.d7] : [])
      .forEach(k => { if (!vocabKeys.has(k)) badKeys.push([p.id, o.id, k]); });
    if ((d1.process_facet || []).length && !facets.includes("process")) badMatrix.push([p.id, o.id, "process on " + o.d0]);
    if ((d1.material_facet || []).length && !facets.includes("material")) badMatrix.push([p.id, o.id, "material on " + o.d0]);
    ["D2", "D3", "D4", "D5"].forEach(d => {
      const val = o[d.toLowerCase()];
      if (val != null && !(Array.isArray(val) && !val.length) && rules[d] === "none") badMatrix.push([p.id, o.id, d + " on " + o.d0]);
    });
    if (o.d3 && !(o.d3.min >= 1 && o.d3.max <= 9 && o.d3.min <= o.d3.max)) badTrl.push([p.id, o.id, o.d3]);
  });
});
t("every value used by a provider exists in the vocabulary", badKeys.length === 0, badKeys.slice(0, 6));
t("every provider carries a verification level and >=1 source", badVerif.length === 0, badVerif);
t("no record violates the applicability matrix", badMatrix.length === 0, badMatrix.slice(0, 6));
t("every NUTS code used is in the geography seed", badGeo.length === 0, badGeo);
t("every recorded TRL band is a valid 1-9 range", badTrl.length === 0, badTrl);
t("every provider id is unique", new Set(providers.map(p => p.id)).size === providers.length);
t("every offering id is unique within its provider",
  providers.every(p => new Set(p.offerings.map(o => o.id)).size === p.offerings.length));

console.log("\n8. Engine invariants over the real dataset");
V.d0_resource_types.forEach(ty => {
  const res = M.findForNeed(providers, ty.key, {});
  t(`${ty.key}: every result is of the requested type`, res.every(x => x.offering.d0 === ty.key), res.length);
});
r = M.findForNeed(providers, "fabrication_facility", {}, { nuts: "DE300" });
t("region-gated results all carry the stated region", r.every(x => x.provider.geo.nuts.includes("DE300")), r.length);
const unfiltered = M.findForNeed(providers, "fabrication_facility", {});
const scored = M.findForNeed(providers, "fabrication_facility", { processes: ["material_extrusion"], d4: ["recycle"] });
t("stating criteria ranks but never removes results", scored.length === unfiltered.length, [scored.length, unfiltered.length]);
t("results are sorted by mismatches ascending",
  scored.every((x, i) => i === 0 || scored[i - 1].not_met <= x.not_met), scored.map(x => x.not_met));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
