/* Matching engine — pure data in / data out, no DOM, so it can be tested directly.

   Model: gated, equal-weight criteria satisfaction (project doc §7 decision).
   - Resource type (D0) and region are HARD GATES, not scored: an offering of the wrong
     type, or a provider confirmed to be in another region, is excluded outright.
   - Every stated requirement is then evaluated against the offering in one of three
     states:  met  ·  not met  ·  unknown (the provider has no data for that field).
     Unknown is never counted as a miss — a blank means "not yet researched", not
     "unsuitable" — but it is reported, so the uncertainty stays visible.
   - No importance weights: requirements are equal, and the result is a legible count
     ("meets 4 of 5, 1 unknown") rather than an opaque percentage.
   - Ranking is tiered: fewest not-met first, then most met, then fewest unknown, then
     better verification confidence, then name.

   Criteria object: { materials:[], processes:[], material_tags:[], d2:[], trl:Number|null,
                      d4:[], d6:[], d8:[], d9:[], certification_scope:[] }
   Any empty array / null means "no preference" and is not evaluated at all.
*/
(function (root) {
  "use strict";

  const VERIF_RANK = { page_level: 0, company_level: 1, unverified: 2 };

  // Each criterion: how to read the offering's value for it, and its user-facing label.
  const CRITERIA = [
    { key: "materials",           label: "Material / field",        get: o => (o.d1 || {}).material_facet },
    { key: "processes",           label: "Process",                 get: o => (o.d1 || {}).process_facet },
    { key: "material_tags",       label: "Specific material",       get: o => (o.d1 || {}).materials },
    { key: "d2",                  label: "Production stage",        get: o => o.d2 },
    { key: "d4",                  label: "Circularity",             get: o => o.d4 },
    { key: "d6",                  label: "Access model",            get: o => o.d6 },
    { key: "d8",                  label: "Serves your kind of user",get: o => o.d8 },
    { key: "d9",                  label: "Support service",         get: o => (o.d9 || []).map(s => s.type) },
    { key: "certification_scope", label: "Can certify against",     get: o => o.certification_scope }
  ];

  const isBlank = v => v === undefined || v === null || (Array.isArray(v) && v.length === 0);

  /** Evaluate one offering against the criteria. */
  function evaluateOffering(offering, criteria) {
    const lines = [];

    CRITERIA.forEach(c => {
      const wanted = criteria[c.key];
      if (!wanted || !wanted.length) return;                 // no preference stated
      const have = c.get(offering);
      if (isBlank(have)) { lines.push({ key: c.key, label: c.label, state: "unknown", wanted }); return; }
      const hit = wanted.filter(w => have.indexOf(w) !== -1);
      lines.push({ key: c.key, label: c.label, state: hit.length ? "met" : "not_met", wanted, matched: hit });
    });

    // Readiness: the user states where their project is; the offering states the band it supports.
    if (typeof criteria.trl === "number") {
      const band = offering.d3;
      if (!band) lines.push({ key: "trl", label: "Readiness band", state: "unknown", wanted: [criteria.trl] });
      else lines.push({
        key: "trl", label: "Readiness band", wanted: [criteria.trl], band,
        state: (criteria.trl >= band.min && criteria.trl <= band.max) ? "met" : "not_met"
      });
    }

    const count = s => lines.filter(l => l.state === s).length;
    return { lines, met: count("met"), not_met: count("not_met"), unknown: count("unknown"), total: lines.length };
  }

  /** Run one need (a single D0 type) across all providers. */
  function findForNeed(providers, need, criteria, opts) {
    const o = opts || {};
    const results = [];

    providers.forEach(p => {
      if (p.status === "defunct") return;                                    // never shown
      const regionKnown = Array.isArray(p.geo && p.geo.nuts) && p.geo.nuts.length > 0;
      const regionMatch = !o.nuts || (regionKnown && p.geo.nuts.indexOf(o.nuts) !== -1);
      if (o.nuts && !regionMatch) return;                                    // hard gate

      p.offerings.filter(off => off.d0 === need).forEach(off => {            // hard gate
        const ev = evaluateOffering(off, criteria);
        results.push({
          provider: p, offering: off, ...ev,
          verification: (p.verification || {}).level || "unverified"
        });
      });
    });

    results.sort((a, b) =>
      a.not_met - b.not_met ||
      b.met - a.met ||
      a.unknown - b.unknown ||
      (VERIF_RANK[a.verification] ?? 3) - (VERIF_RANK[b.verification] ?? 3) ||
      a.provider.name.localeCompare(b.provider.name));

    return results;
  }

  /** Compound needs: several resource types at once → one result set per need.
      Real users routinely need more than one type (field finding), and no single
      provider need cover them all, so results are reported per need, never merged. */
  function findAll(providers, needs, criteria, opts) {
    return (needs || []).map(need => ({ need, results: findForNeed(providers, need, criteria, opts) }));
  }

  root.Match = { CRITERIA, evaluateOffering, findForNeed, findAll };
})(typeof module !== "undefined" && module.exports ? module.exports : window);
