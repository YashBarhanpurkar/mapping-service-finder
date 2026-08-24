/* Mapping & Service Finder — one page, one criteria state, one engine.

   Browsing and finding are the same operation: comparing what a user says they need
   against the offerings in the dataset. There is therefore one page, and all matching
   runs through js/match.js (unit-tested, no DOM).

   - No criteria stated  → every provider is listed, unranked. That is "browse".
   - Criteria stated     → the same providers, ranked by fit, each card showing which
                           criteria are met / mismatched / not researched yet.
   - Optional strict box → hides anything that does not meet every stated criterion,
                           for users who want a hard filter instead of a ranking.
   - Resource type and region are hard gates (never scored); a missing value on a
     provider is "not researched yet", never counted as a miss.
   - Map and result list are two renderings of the same result set. Providers without
     coordinates are listed separately rather than dropped.
*/
(function () {
  const V = window.__VOCAB__, P = window.__PROVIDERS__.providers, M = window.Match;
  const AM = V.applicability_matrix;
  const el = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const strip = s => s.replace(/\s*\([^)]*\)\s*$/, "");
  const pl = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  // ---------- labels & colours ----------
  const label = {};
  const put = arr => arr.forEach(o => label[o.key] = strip(o.label));
  put(V.d0_resource_types); put(V.d1_material_facet.values); put(V.materials_tags.values);
  put(V.equipment_leaf.values); put(V.d2_production_stage); put(V.d6_access_model);
  put(V.d7_governance); put(V.d8_target_user); put(V.d9_support_services.values);
  put(V.verification_confidence);
  V.d1_process_facet.schemes.forEach(s => put(s.values));
  V.d4_circularity.tiers.forEach(t => put(t.values));
  V.certifications.categories.forEach(c => put(c.values));
  V.d9_support_services.intensity.forEach(o => label["int:" + o.key] = o.label);
  const nutsLabel = {}; V.geography.nuts3_seed.forEach(n => nutsLabel[n.code] = n.label);

  const CSS_VAR = { fabrication_facility: "--chip-fab", material_supplier: "--chip-mat",
                    testing_service: "--chip-test", certification_service: "--chip-cert",
                    advisory_service: "--chip-adv", workspace: "--chip-ws" };
  const rs = getComputedStyle(document.documentElement), colour = {};
  Object.entries(CSS_VAR).forEach(([k, v]) => colour[k] = (rs.getPropertyValue(v) || "").trim() || "#444441");

  // ---------- criteria questions (only those applicable to the chosen type) ----------
  const QUESTIONS = [
    { key: "materials",     q: "Which material or field?",        items: () => V.d1_material_facet.values },
    { key: "processes",     q: "Which process?",                  grouped: true },
    { key: "material_tags", q: "Any specific material?",          items: () => V.materials_tags.values },
    { key: "d2",            q: "What stage are you at?",          items: () => V.d2_production_stage },
    { key: "trl",           q: "How far along is your project?",  trl: true },
    { key: "d4",            q: "Circular-economy strategy?",      items: () => V.d4_circularity.tiers.flatMap(t => t.values) },
    { key: "d6",            q: "How would you like to access it?",items: () => V.d6_access_model },
    { key: "d8",            q: "Which best describes you?",       items: () => V.d8_target_user },
    { key: "d9",            q: "Support beyond the service?",     items: () => V.d9_support_services.values },
    { key: "certification_scope", q: "Which standard or directive?", items: () => V.certifications.categories.flatMap(c => c.values) }
  ];

  const state = { needs: new Set(), nuts: "", q: "", strict: false, crit: {} };
  QUESTIONS.forEach(x => state.crit[x.key] = x.trl ? null : new Set());

  function applicableQuestions() {
    const out = new Set();
    state.needs.forEach(need => {
      const r = AM[need] || {}, f = r.D1_facets || [];
      if (f.includes("material")) { out.add("materials"); out.add("material_tags"); }
      if (f.includes("process")) out.add("processes");
      [["D2","d2"],["D3","trl"],["D4","d4"],["D6","d6"],["D8","d8"],["D9","d9"]].forEach(([d,k]) => {
        if (r[d] && r[d] !== "none") out.add(k);
      });
      if (need === "certification_service" || need === "testing_service") out.add("certification_scope");
    });
    return out;
  }

  const criteriaObject = () => {
    const c = {};
    Object.entries(state.crit).forEach(([k, v]) => c[k] = v instanceof Set ? [...v] : v);
    return c;
  };
  const anyCriteria = () => QUESTIONS.some(x =>
    x.trl ? typeof state.crit.trl === "number" : state.crit[x.key].size > 0);

  // ---------- run the engine ----------
  const textMatches = p => {
    if (!state.q) return true;
    const q = state.q.toLowerCase();
    return [p.name, p.address || ""].concat(
      p.offerings.flatMap(o => [o.title, o.notes || ""].concat(((o.d1 || {}).materials) || []))
    ).join(" ").toLowerCase().includes(q);
  };
  const placed = p => typeof p.geo.lat === "number" && typeof p.geo.lon === "number";

  function currentSets() {
    const pool = P.filter(textMatches);
    const needs = state.needs.size ? [...state.needs] : V.d0_resource_types.map(t => t.key);
    const crit = criteriaObject();
    return M.findAll(pool, needs, crit, { nuts: state.nuts })
      .map(s => ({ ...s, results: state.strict ? s.results.filter(r => r.not_met === 0 && r.unknown === 0) : s.results }))
      .filter(s => state.needs.size || s.results.length);       // hide empty types when browsing all
  }
  // one entry per provider (best-ranked offering) for the map
  function providersFromSets(sets) {
    const best = new Map();
    sets.forEach(s => s.results.forEach(r => {
      const cur = best.get(r.provider.id);
      if (!cur) best.set(r.provider.id, { provider: r.provider, results: [r] });
      else cur.results.push(r);
    }));
    return [...best.values()];
  }

  // ---------- rendering ----------
  const ICON = { met: "✓", not_met: "✗", unknown: "?" };
  const tags = keys => (keys || []).map(k => `<span class="tag">${esc(label[k] || k)}</span>`).join("");
  const kv = (t, html) => html ? `<div class="kv"><b>${t}</b>${html}</div>` : "";

  function lineHTML(l) {
    const wanted = (l.wanted || []).map(w => label[w] || w).join(", ");
    const detail = l.state === "met" && l.matched && l.matched.length
      ? ` — ${l.matched.map(m => esc(label[m] || m)).join(", ")}`
      : (l.key === "trl" && l.band ? ` — supports TRL ${l.band.min}–${l.band.max}` : "");
    const note = l.state === "unknown" ? " <em>not researched yet</em>" : "";
    return `<li class="cl ${l.state}"><span class="ci">${ICON[l.state]}</span>
      <span>${esc(l.label)}: ${esc(wanted)}${detail}${note}</span></li>`;
  }

  function offeringDetails(o) {
    const d1 = o.d1 || {};
    const d9 = (o.d9 || []).map(s =>
      `<span class="tag">${esc(label[s.type] || s.type)}${s.intensity ? " · " + esc(label["int:" + s.intensity]) : ""}</span>`).join("");
    return `<details><summary>details</summary>
      ${kv("Materials &amp; fields", tags(d1.material_facet))}
      ${kv("Processes", tags(d1.process_facet))}
      ${kv("Equipment", tags(d1.equipment))}
      ${kv("Specific materials", tags(d1.materials))}
      ${kv("Production stage", tags(o.d2))}
      ${o.d3 ? kv("Readiness band supported", `<span class="tag">TRL ${o.d3.min}–${o.d3.max}</span>`) : ""}
      ${kv("Circularity", tags(o.d4))}
      ${o.d5 ? kv("Openness", `<span class="tag">OSTRL ${o.d5}</span>`) : ""}
      ${kv("Access", tags(o.d6))}
      ${o.d7 ? kv("Governance", tags([o.d7])) : ""}
      ${kv("Who it serves", tags(o.d8))}
      ${kv("Support services", d9)}
      ${kv("Can certify against", tags(o.certification_scope))}
      ${o.notes ? `<div class="note">${esc(o.notes)}</div>` : ""}
    </details>`;
  }

  function resultHTML(r, isRepeat) {
    const p = r.provider, o = r.offering, scored = r.total > 0;
    const verdict = scored
      ? `Meets ${r.met} of ${r.total} criteria` +
        (r.unknown ? ` · ${r.unknown} could not be checked` : "") +
        (r.not_met ? ` · ${pl(r.not_met, "mismatch")}` : "")
      : "";
    const cls = !scored ? "" : (r.not_met === 0 && r.unknown === 0 ? "full" : (r.not_met === 0 ? "partial" : "weak"));
    const held = (p.certifications_held || []).length
      ? kv("Certifications held", p.certifications_held.map(c =>
          `<span class="tag">${esc(label[c.cert] || c.cert)} <em>(${c.status})</em></span>`).join(""))
      : "";
    return `<div class="rescard ${cls}" id="card-${esc(p.id)}-${esc(o.id)}">
      <div class="resheadline">
        <h3>${p.website ? `<a href="${esc(p.website)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p.name)}</h3>
        ${isRepeat ? `<span class="repeatnote">another offering from this provider</span>` : ""}
        <span class="badge ${r.verification}">${esc(label[r.verification])}</span>
      </div>
      <div class="meta">
        <span class="d0chip ${o.d0}">${esc(label[o.d0])}</span><span class="offname">${esc(o.title)}</span>
        <span>· ${p.geo.nuts.map(n => esc(nutsLabel[n] || n)).join(", ")}</span>
        ${p.address ? `<span>· ${esc(p.address)}</span>` : ""}
        ${placed(p) ? `<button class="linkbtn" data-locate="${esc(p.id)}">Show on map ↑</button>` : ""}
      </div>
      ${verdict ? `<p class="verdict">${esc(verdict)}</p>` : ""}
      ${r.lines.length ? `<ul class="clines">${r.lines.map(lineHTML).join("")}</ul>` : ""}
      ${held}
      ${offeringDetails(o)}
    </div>`;
  }

  // ---------- map ----------
  const map = L.map("map", { scrollWheelZoom: true }).setView([52.49, 13.405], 10);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  const markers = {};

  function markerIcon(types) {
    const cols = [...new Set(types)].map(t => colour[t] || "#444441");
    const bg = cols.length === 1 ? cols[0]
      : `conic-gradient(${cols.map((c, i) => `${c} ${i * 100 / cols.length}% ${(i + 1) * 100 / cols.length}%`).join(",")})`;
    return L.divIcon({ className: "pin", html: `<span style="background:${bg}"></span>`,
                       iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -10] });
  }

  function render() {
    const sets = currentSets();
    const provs = providersFromSets(sets);
    const onMap = provs.filter(x => placed(x.provider));
    const noCoord = provs.filter(x => !placed(x.provider));
    const nRes = sets.reduce((n, s) => n + s.results.length, 0);

    el("#summary").textContent = anyCriteria() || state.needs.size || state.nuts || state.q
      ? `${pl(provs.length, "provider")} · ${pl(nRes, "offering")}` +
        (anyCriteria() ? " · ranked by how many of your criteria they meet" : "")
      : `${pl(P.length, "provider")} · ${pl(P.reduce((n, p) => n + p.offerings.length, 0), "offering")} in the dataset`;

    // map
    layer.clearLayers(); Object.keys(markers).forEach(k => delete markers[k]);
    onMap.forEach(x => {
      const p = x.provider, offs = x.results.map(r => r.offering);
      const m = L.marker([p.geo.lat, p.geo.lon], { icon: markerIcon(offs.map(o => o.d0)), title: p.name })
        .bindPopup(`<div class="pop"><strong>${esc(p.name)}</strong>
          <div class="popmeta"><span class="badge ${p.verification.level}">${esc(label[p.verification.level])}</span>
            ${p.geo.nuts.map(n => esc(nutsLabel[n] || n)).join(", ")}</div>
          <ul class="poplist">${offs.map(o =>
            `<li><span class="d0chip ${o.d0}">${esc(label[o.d0])}</span> ${esc(o.title)}</li>`).join("")}</ul>
          <button class="popgoto" data-goto="${esc(p.id)}-${esc(offs[0].id)}">See full details ↓</button></div>`)
        .addTo(layer);
      markers[p.id] = m;
    });
    if (onMap.length) map.fitBounds(L.latLngBounds(onMap.map(x => [x.provider.geo.lat, x.provider.geo.lon])).pad(0.35), { maxZoom: 13 });

    el("#unplaced").innerHTML = noCoord.length ? `
      <div class="notice"><strong>${noCoord.length} not yet placed on the map:</strong>
        ${noCoord.map(x => `<a href="#card-${esc(x.provider.id)}-${esc(x.results[0].offering.id)}">${esc(x.provider.name)}</a>`).join(", ")}.
        <small>A missing coordinate means the address is not confirmed yet — not that the provider is outside this area.</small>
      </div>` : "";

    // results, grouped by need only when the user asked for more than one
    const multi = state.needs.size > 1;
    el("#results").innerHTML = nRes ? `
      ${multi ? `<div class="notice">You asked about ${state.needs.size} kinds of resource. Each is answered
        separately below — one provider need not cover them all.</div>` : ""}
      ${sets.filter(s => s.results.length).map(s => {
        const seen = {};
        return `
        <section class="resblock">
          ${state.needs.size ? `<h2>${esc(label[s.need])}</h2>` : ""}
          ${s.results.map(r => {
            const n = (seen[r.provider.id] = (seen[r.provider.id] || 0) + 1);
            return resultHTML(r, n > 1);
          }).join("")}
        </section>`; }).join("")}`
      : `<div class="empty"><strong>Nothing matches yet.</strong><br>
         <small>${state.strict
           ? "Strict mode hides providers with unresearched fields. Untick it to see partial matches."
           : "If you asked for a resource type nobody offers, that gap is itself a finding about the regional ecosystem."}</small></div>`;
  }

  window.buildGeoJSON = () => ({
    type: "FeatureCollection",
    features: providersFromSets(currentSets()).filter(x => placed(x.provider)).map(x => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [x.provider.geo.lon, x.provider.geo.lat] },
      properties: { id: x.provider.id, name: x.provider.name, nuts: x.provider.geo.nuts,
                    verification: x.provider.verification.level,
                    offerings: x.results.map(r => ({ id: r.offering.id, d0: r.offering.d0, title: r.offering.title })) }
    }))
  });

  // ---------- criteria UI ----------
  function renderQuestions() {
    const app = applicableQuestions();
    el("#f-dims").innerHTML = QUESTIONS.filter(x => app.has(x.key)).map(x => {
      const body = x.trl
        ? `<div class="trlrow">
             <label class="trltoggle"><input type="checkbox" id="f-trl-on"> I know roughly</label>
             <input type="range" id="f-trl" min="1" max="9" value="4" disabled>
             <span id="f-trl-out" class="trlout">no preference</span>
           </div>`
        : x.grouped
          ? V.d1_process_facet.schemes.map(s =>
              `<div class="sublabel">${esc(strip(s.label))}</div>
               <div class="group">${s.values.map(i =>
                 `<span class="facet" data-q="${x.key}" data-k="${i.key}">${esc(strip(i.label))}</span>`).join("")}</div>`).join("")
          : `<div class="group">${x.items().map(i =>
              `<span class="facet" data-q="${x.key}" data-k="${i.key}">${esc(strip(i.label))}</span>`).join("")}</div>`;
      const n = x.trl ? (typeof state.crit.trl === "number" ? 1 : 0) : state.crit[x.key].size;
      return `<details class="dd dimblock" data-dim="${x.key}">
        <summary>${esc(x.q)}<span class="count ${n ? "on" : ""}">${n}</span></summary>${body}</details>`;
    }).join("");

    QUESTIONS.forEach(x => { if (!app.has(x.key)) state.crit[x.key] = x.trl ? null : new Set(); });

    const on = el("#f-trl-on");
    if (on) {
      const range = el("#f-trl"), out = el("#f-trl-out");
      const sync = () => {
        range.disabled = !on.checked;
        out.textContent = on.checked ? "TRL " + range.value : "no preference";
        state.crit.trl = on.checked ? Number(range.value) : null;
        syncCounts(); render();
      };
      on.addEventListener("change", sync);
      range.addEventListener("input", sync);
    }
    el("#f-hint").hidden = app.size > 0;
    el("#strictwrap").hidden = !anyCriteria();
    syncCounts();
  }

  function syncCounts() {
    document.querySelectorAll("#f-dims .dimblock").forEach(b => {
      const k = b.dataset.dim, badge = b.querySelector("summary .count");
      const n = k === "trl" ? (typeof state.crit.trl === "number" ? 1 : 0) : state.crit[k].size;
      if (badge) { badge.textContent = n; badge.classList.toggle("on", n > 0); }
    });
    el("#strictwrap").hidden = !anyCriteria();
  }

  el("#f-dims").addEventListener("click", e => {
    const t = e.target;
    if (!t.dataset || !t.dataset.k || !t.dataset.q) return;
    const set = state.crit[t.dataset.q];
    set.has(t.dataset.k) ? set.delete(t.dataset.k) : set.add(t.dataset.k);
    t.classList.toggle("on");
    syncCounts(); render();
  });

  el("#f-d0").innerHTML = V.d0_resource_types.map(o =>
    `<span class="facet" data-k="${o.key}" title="${esc(o.definition || "")}">${esc(o.label)}</span>`).join("");
  el("#f-d0").addEventListener("click", e => {
    const k = e.target.dataset && e.target.dataset.k;
    if (!k) return;
    state.needs.has(k) ? state.needs.delete(k) : state.needs.add(k);
    e.target.classList.toggle("on");
    renderQuestions(); render();
  });

  el("#f-nuts").innerHTML = `<option value="">Anywhere</option>` +
    V.geography.nuts3_seed.map(n => `<option value="${n.code}">${esc(n.label)}</option>`).join("");
  el("#f-nuts").addEventListener("change", e => { state.nuts = e.target.value; render(); });
  el("#f-q").addEventListener("input", e => { state.q = e.target.value.trim(); render(); });
  el("#f-strict").addEventListener("change", e => { state.strict = e.target.checked; render(); });

  el("#legend").innerHTML = V.d0_resource_types.map(o =>
    `<div class="legrow"><span class="legdot" style="background:${colour[o.key]}"></span>${esc(o.label)}</div>`).join("");

  function resetAll() {
    state.needs.clear(); state.nuts = ""; state.q = ""; state.strict = false;
    QUESTIONS.forEach(x => state.crit[x.key] = x.trl ? null : new Set());
    document.querySelectorAll(".facet.on").forEach(f => f.classList.remove("on"));
    el("#f-nuts").value = ""; el("#f-q").value = ""; el("#f-strict").checked = false;
  }

  el("#f-clear").addEventListener("click", () => {
    resetAll(); el("#demonote").innerHTML = ""; activeDemo = null; paintDemoButtons();
    renderQuestions(); render();
  });

  /* ---------- demonstration presets ----------
     Each preset is a real demand profile taken from a project's own public record
     (see the validation section of the project document). They exist so the tool can be
     shown end-to-end without typing, and so what is shown on screen is the same profile
     the written validation reports — nothing here is invented for the demo. */
  const DEMOS = [
    {
      id: "windkit", name: "windkit",
      blurb: "A ten-person collective in Germany designed a small wind turbine — two metres across, 400 watts, enough for a shed or an off-grid cabin — and published the plans free so anyone can build one.",
      need: "Almost all of it goes together with ordinary hand tools. The exception is the aluminium and steel parts, which have to be laser-cut. They also want advice on the wind-turbine safety standard they are building to.",
      why: [["fabrication_facility", "somebody with a laser cutter who will take a two-part job"],
            ["advisory_service", "somebody who can advise on certification and next steps"]],
      cue: "The top result meets 8 of the 9 requirements with no mismatches at all, and the single question it cannot answer is a field nobody has researched yet — not a failure. Second place is a community workshop that is also mismatch-free.",
      needs: ["fabrication_facility", "advisory_service"],
      crit: { materials: ["metals"], processes: ["separating", "joining"], material_tags: ["aluminium", "steel"],
              d2: ["design_prototyping"], trl: 6, d4: ["repair"], d6: ["membership", "pay_per_use"],
              d8: ["innovator_team", "sme"], d9: ["co_design"] }
    },
    {
      id: "verdant", name: "Verdant Ascent",
      blurb: "A circular-design studio built a modular vertical garden — stackable planting units, 3D-printed in recycled plastic, watered without soil.",
      need: "A 3D printer big enough for the units, and somebody who sells recycled filament to print them with. The recycled feedstock is the point of the product, not a preference.",
      why: [["fabrication_facility", "a 3D printer that takes this kind of plastic"],
            ["material_supplier", "recycled filament to feed it"]],
      cue: "Two material suppliers come back, both matching on recycled feedstock with no mismatches — one Berlin filament maker and one recycler. This is the case where the circularity question does real work.",
      needs: ["fabrication_facility", "material_supplier"],
      crit: { materials: ["rubber_plastics"], processes: ["material_extrusion"], material_tags: ["rpla", "pla"],
              d2: ["design_prototyping"], trl: 5, d4: ["recycle", "reuse"], d6: ["pay_per_use"],
              d8: ["startup", "sme"], d9: ["co_design"] }
    },
    {
      id: "aero", name: "AERO",
      blurb: "An energy-saving air cleaner made from recycled plastic, using a wet filtration method the team has patented. Further along than the other two — close to going on sale.",
      need: "Not a prototype any more: they need real production, recycled material to make it from, and a body that can certify it against the EU electrical safety and interference directives before it can legally be sold.",
      why: [["fabrication_facility", "production, not prototyping"],
            ["material_supplier", "recycled plastic at production volume"],
            ["certification_service", "a body that can sign off the CE directives"]],
      cue: "Scroll to the certification block. Two notified bodies match the directives and the late-stage readiness with nothing wrong. A third, very well-known certifier is ranked last with a mismatch — because that legal entity is notified for medical devices, not for electrical safety. Being able to show that is the point.",
      needs: ["fabrication_facility", "material_supplier", "certification_service"],
      crit: { materials: ["rubber_plastics", "electronics"], processes: ["material_extrusion", "smt_assembly"],
              material_tags: ["rpla"], d2: ["production"], trl: 8, d4: ["recycle"], d6: ["pay_per_use"],
              d8: ["sme", "startup"], d9: ["certification"], certification_scope: ["ce_lvd", "ce_emc"] }
    }
  ];
  let activeDemo = null;

  /* The filled-in requirements, read back out of the live state rather than the preset,
     so the banner can never claim something the search is not actually applying. */
  function statedCriteria() {
    const rows = M.CRITERIA
      .filter(c => (state.crit[c.key] || []).size)
      .map(c => [c.label, [...state.crit[c.key]].map(k => label[k] || k).join(", ")]);
    if (typeof state.crit.trl === "number") {
      const i = rows.findIndex(r => r[0] === "Production stage");
      rows.splice(i < 0 ? rows.length : i + 1, 0, ["Readiness", "TRL " + state.crit.trl]);
    }
    return rows;
  }

  const paintDemoButtons = () => document.querySelectorAll("#f-demo .demobtn")
    .forEach(b => b.classList.toggle("on", b.dataset.demo === activeDemo));

  function applyDemo(d) {
    resetAll();
    activeDemo = d.id;

    // 1. resource types first — they decide which questions exist at all
    d.needs.forEach(n => state.needs.add(n));
    document.querySelectorAll("#f-d0 .facet").forEach(f => f.classList.toggle("on", state.needs.has(f.dataset.k)));

    // 2. rebuild the question list, then fill it in
    renderQuestions();
    Object.entries(d.crit).forEach(([k, v]) => {
      if (k === "trl") { state.crit.trl = v; return; }
      if (state.crit[k] instanceof Set) v.forEach(x => state.crit[k].add(x));
    });
    if (typeof d.crit.trl === "number") {
      const on = el("#f-trl-on"), range = el("#f-trl"), out = el("#f-trl-out");
      if (on) { on.checked = true; range.disabled = false; range.value = d.crit.trl; out.textContent = "TRL " + d.crit.trl; }
    }
    document.querySelectorAll("#f-dims .facet").forEach(f => {
      const set = state.crit[f.dataset.q];
      f.classList.toggle("on", set instanceof Set && set.has(f.dataset.k));
    });
    // open only the questions this case actually answered, so the fill is visible
    document.querySelectorAll("#f-dims .dimblock").forEach(b => {
      const k = b.dataset.dim;
      b.open = k === "trl" ? typeof state.crit.trl === "number" : state.crit[k].size > 0;
    });

    const rows = statedCriteria();
    el("#demonote").innerHTML = `<div class="democase">
      <div class="democase-head">
        <strong>${esc(d.name)}</strong>
        <span>${pl(d.needs.length, "kind")} of provider needed · ${pl(rows.length, "requirement")} stated</span>
        <button class="linkbtn" id="demo-off">clear this case</button>
      </div>

      <div class="democase-body">
        <div class="democase-story">
          <h4>The project</h4>
          <p>${esc(d.blurb)}</p>
          <h4>What they need made</h4>
          <p>${esc(d.need)}</p>
          <h4>So the tool is asked for ${pl(d.needs.length, "kind")} of provider</h4>
          <ul class="democase-why">${d.why.map(([k, w]) =>
            `<li><span class="d0chip ${k}">${esc(label[k])}</span> ${esc(w)}</li>`).join("")}</ul>
        </div>

        <div class="democase-crit">
          <h4>What was filled into the search</h4>
          <table class="critlist">${rows.map(([k, v]) =>
            `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>
          <p class="democase-src">Taken from the project's own published record — not written to suit the tool.</p>
        </div>
      </div>

      <p class="democase-cue"><b>What the results show:</b> ${esc(d.cue)}</p>
    </div>`;
    paintDemoButtons();
    syncCounts(); render();
    if (el("#demonote").scrollIntoView) el("#demonote").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  el("#f-demo").innerHTML = DEMOS.map(d =>
    `<button class="demobtn" data-demo="${d.id}" title="${esc(d.need)}">${esc(d.name)}</button>`).join("");
  el("#f-demo").addEventListener("click", e => {
    const b = e.target.closest("[data-demo]");
    if (!b) return;
    const d = DEMOS.find(x => x.id === b.dataset.demo);
    if (d) (activeDemo === d.id) ? el("#f-clear").click() : applyDemo(d);
  });
  document.addEventListener("click", e => {
    if (e.target && e.target.id === "demo-off") el("#f-clear").click();
  });

  // cross-view links
  document.addEventListener("click", e => {
    const g = e.target.closest && e.target.closest("[data-goto]");
    if (g) {
      const card = document.getElementById("card-" + g.dataset.goto);
      if (card) { map.closePopup();
        if (card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("flash"); setTimeout(() => card.classList.remove("flash"), 1200); }
      return;
    }
    const loc = e.target.closest && e.target.closest("[data-locate]");
    if (loc && markers[loc.dataset.locate]) {
      const m = markers[loc.dataset.locate];
      if (el("#map").scrollIntoView) el("#map").scrollIntoView({ behavior: "smooth", block: "start" });
      map.setView(m.getLatLng(), 14); m.openPopup();
    }
  });

  renderQuestions();
  render();
})();
