/* Admin — data entry for providers, offerings and vocabulary leaves.

   Principles carried from the project document:
   - The offering form is generated FROM the applicability matrix: choosing a resource
     type decides which dimension fields exist at all, so a workspace can never be given
     a process, and certification scope appears only on testing/certification offerings.
   - Verification confidence and at least one source are required on every provider:
     the depth of verification is data, not a footnote.
   - Certifications held carry claimed|certified status; they are never merged with the
     certification scope an offering can assess against.
   - Nothing is guessed: every field may be left blank, and blank always means
     "not researched yet".
   - Vocabularies are admin-extendable; new leaves are added here, not hard-coded.

   Persistence: this is a static, server-less demonstrator. Edits live in the browser
   (localStorage draft) and are exported as data/providers.json — regenerate the JS
   mirrors afterwards with tools/mirror.py.
*/
(function () {
  const DRAFT_KEY = "lauds_msf_draft_v1";
  const VOCAB_KEY = "lauds_msf_vocab_v1";
  const V = (function () {
    try { const s = localStorage.getItem(VOCAB_KEY); if (s) return JSON.parse(s); } catch (e) {}
    return JSON.parse(JSON.stringify(window.__VOCAB__));
  })();
  function saveVocab() {
    try { localStorage.setItem(VOCAB_KEY, JSON.stringify(V)); } catch (e) {}
    renderStatus();
  }
  let view = "providers";
  const el = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const strip = s => s.replace(/\s*\([^)]*\)\s*$/, "");
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  let data = load();
  let editingId = null;

  function load() {
    try {
      const d = localStorage.getItem(DRAFT_KEY);
      if (d) return JSON.parse(d);
    } catch (e) { /* localStorage unavailable — fall through */ }
    return JSON.parse(JSON.stringify(window.__PROVIDERS__));
  }
  function save() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch (e) {}
    renderStatus();
  }
  const providers = () => data.providers;

  // ---------- vocabulary access ----------
  const matValues = () => V.d1_material_facet.values;
  const procSchemes = () => V.d1_process_facet.schemes;
  const procValues = () => procSchemes().flatMap(s => s.values);
  const certValues = () => V.certifications.categories.flatMap(c => c.values);
  const label = {};
  const put = a => a.forEach(o => label[o.key] = strip(o.label));
  put(V.d0_resource_types); put(matValues()); put(V.materials_tags.values);
  put(V.equipment_leaf.values); put(V.d2_production_stage); put(V.d6_access_model);
  put(V.d7_governance); put(V.d8_target_user); put(V.d9_support_services.values);
  put(V.verification_confidence); put(certValues());
  procSchemes().forEach(s => put(s.values));
  V.d4_circularity.tiers.forEach(t => put(t.values));

  // ---------- generic field helpers ----------
  function chips(name, items, selected, grouped) {
    const sel = new Set(selected || []);
    const one = i => `<span class="facet ${sel.has(i.key) ? "on" : ""}" data-multi="${name}" data-k="${i.key}">${esc(strip(i.label))}</span>`;
    if (!grouped) return `<div class="group">${items.map(one).join("")}</div>`;
    return procSchemes().map(s =>
      `<div class="sublabel">${esc(strip(s.label))}</div><div class="group">${s.values.map(one).join("")}</div>`).join("");
  }
  const field = (lbl, html, hint) =>
    `<div class="afield"><label>${lbl}</label>${html}${hint ? `<p class="ahint">${hint}</p>` : ""}</div>`;
  const text = (name, val, ph) => `<input type="text" data-f="${name}" value="${esc(val)}" placeholder="${esc(ph || "")}">`;

  // ---------- offering form ----------
  function offeringSummary(o) {
    const bits = [];
    const d1 = o.d1 || {};
    const n = (d1.material_facet || []).length + (d1.process_facet || []).length;
    if (n) bits.push(`${n} capability tag${n === 1 ? "" : "s"}`);
    if (o.d3) bits.push(`TRL ${o.d3.min}–${o.d3.max}`);
    if ((o.d6 || []).length) bits.push(`${o.d6.length} access model${o.d6.length === 1 ? "" : "s"}`);
    return bits.join(" · ") || "not described yet";
  }

  function offeringForm(o, idx) {
    const rules = V.applicability_matrix[o.d0] || {};
    const facets = rules.D1_facets || [];
    const on = d => rules[d] && rules[d] !== "none";
    const canScope = o.d0 === "testing_service" || o.d0 === "certification_service";
    const d1 = o.d1 || {};
    const openAttr = (!o.title || o.__open) ? "open" : "";
    return `<details class="offblock" data-oidx="${idx}" ${openAttr}>
      <summary class="offsum">
        <span class="d0chip ${o.d0}">${esc(label[o.d0])}</span>
        <span class="offtitle">${esc(o.title || "Untitled offering")}</span>
        <span class="offmeta">${esc(offeringSummary(o))}</span>
      </summary>
      <div class="offhead">
        ${text("offerings." + idx + ".title", o.title, "Offering title")}
        <button class="danger small" data-del-offering="${idx}">Remove</button>
      </div>
      ${field("Resource type", `<select data-f="offerings.${idx}.d0">${V.d0_resource_types.map(t =>
        `<option value="${t.key}" ${t.key === o.d0 ? "selected" : ""}>${esc(t.label)}</option>`).join("")}</select>`,
        "Changing this changes which fields below exist — the applicability matrix decides.")}

      ${facets.includes("material") ? field("Materials &amp; fields", chips(`offerings.${idx}.d1.material_facet`, matValues(), d1.material_facet)) : ""}
      ${facets.includes("process") ? field("Processes", chips(`offerings.${idx}.d1.process_facet`, procValues(), d1.process_facet, true)) : ""}
      ${facets.length ? field("Equipment", chips(`offerings.${idx}.d1.equipment`, V.equipment_leaf.values, d1.equipment),
        "Add machines to the vocabulary below, then tag them here.") : ""}
      ${facets.length ? field("Specific materials", chips(`offerings.${idx}.d1.materials`, V.materials_tags.values, d1.materials)) : ""}

      ${on("D2") ? field("Production stage", chips(`offerings.${idx}.d2`, V.d2_production_stage, o.d2)) : ""}
      ${on("D3") ? field("Readiness band supported (TRL)",
        `<div class="trlpair">
           <input type="number" min="1" max="9" data-f="offerings.${idx}.d3.min" value="${o.d3 ? o.d3.min : ""}" placeholder="min">
           <span>to</span>
           <input type="number" min="1" max="9" data-f="offerings.${idx}.d3.max" value="${o.d3 ? o.d3.max : ""}" placeholder="max">
         </div>`,
        "The band of client-project maturity this offering supports — not the provider's own maturity. Leave blank if the source doesn't say.") : ""}
      ${on("D4") ? field("Circularity", chips(`offerings.${idx}.d4`, V.d4_circularity.tiers.flatMap(t => t.values), o.d4)) : ""}
      ${on("D5") ? field("Openness (OSTRL 1–9)",
        `<input type="number" min="1" max="9" data-f="offerings.${idx}.d5" value="${o.d5 == null ? "" : o.d5}" placeholder="blank = not assessed">`) : ""}
      ${on("D6") ? field("Access model", chips(`offerings.${idx}.d6`, V.d6_access_model, o.d6)) : ""}
      ${on("D7") ? field("Governance",
        `<select data-f="offerings.${idx}.d7"><option value="">— not recorded —</option>${V.d7_governance.map(g =>
          `<option value="${g.key}" ${g.key === o.d7 ? "selected" : ""}>${esc(g.label)}</option>`).join("")}</select>`) : ""}
      ${on("D8") ? field("Who it serves", chips(`offerings.${idx}.d8`, V.d8_target_user, o.d8)) : ""}
      ${on("D9") ? field("Support services", chips(`offerings.${idx}.d9`, V.d9_support_services.values, (o.d9 || []).map(s => s.type)),
        "Co-creation intensity can be set in the JSON; the picker records the service type.") : ""}
      ${canScope ? field("Can certify / test against", chips(`offerings.${idx}.certification_scope`, certValues(), o.certification_scope),
        "What this offering can assess for a client — never the certificates the provider itself holds.") : ""}

      ${field("Notes", `<textarea data-f="offerings.${idx}.notes" rows="2">${esc(o.notes)}</textarea>`)}
      ${field("Sources", `<textarea data-f="offerings.${idx}.sources" rows="2" placeholder="One URL per line">${esc((o.sources || []).join("\n"))}</textarea>`)}
    </details>`;
  }

  // ---------- provider form ----------
  function providerForm(p) {
    const nOff = (p.offerings || []).length;
    const nSrc = (p.verification.sources || []).length;
    const nHeld = (p.certifications_held || []).length;
    const sect = (n, title, status, body, open) => `
      <details class="sect" ${open ? "open" : ""}>
        <summary><span class="sectno">${n}</span><span class="secttitle">${title}</span>
          <span class="sectstatus">${status}</span></summary>
        <div class="sectbody">${body}</div>
      </details>`;

    return `<div class="acard">
      <div class="acardbar">
        <h2>${p.__new ? "New provider" : esc(p.name)}</h2>
        <div class="baractions">
          <button class="primary" id="a-save">Save</button>
          <button class="ghost" id="a-cancel">Close</button>
          ${p.__new ? "" : `<button class="danger" id="a-delete">Delete</button>`}
        </div>
      </div>
      <div id="a-warn"></div>

      ${sect(1, "Identity", p.name ? esc(p.name) : "required",
        field("Name *", text("name", p.name, "Provider name")) +
        field("ID *", text("id", p.id, "lowercase-slug"), "Stable key used in links and exports.") +
        field("Website", text("website", p.website, "https://…")) +
        field("Contact", text("contact", p.contact, "email or phone")) +
        field("Address", text("address", p.address, "street, postcode, city")) +
        field("Status", `<select data-f="status">${["active", "uncertain", "defunct"].map(s =>
          `<option value="${s}" ${s === (p.status || "active") ? "selected" : ""}>${s}</option>`).join("")}</select>`,
          "Defunct providers stay in the file for the record but are never shown in results."),
        !!p.__new)}

      ${sect(2, "Location", (p.geo.nuts || []).length ? `${p.geo.nuts.join(", ")}${p.geo.lat == null ? " · no coordinates" : ""}` : "required",
        field("Coordinates (WGS84)",
          `<div class="trlpair">
             <input type="number" step="0.0001" data-f="geo.lat" value="${p.geo.lat == null ? "" : p.geo.lat}" placeholder="latitude">
             <input type="number" step="0.0001" data-f="geo.lon" value="${p.geo.lon == null ? "" : p.geo.lon}" placeholder="longitude">
           </div>`,
          "Blank is fine — the provider is then listed as “not yet placed”, never dropped.") +
        field("NUTS region(s) *", chips("geo.nuts", V.geography.nuts3_seed.map(n => ({ key: n.code, label: n.label })), p.geo.nuts),
          "Any NUTS level; codes outside the seed list can be added in the JSON."))}

      ${sect(3, "Verification", nSrc ? `${esc(label[p.verification.level] || p.verification.level)} · ${nSrc} source${nSrc === 1 ? "" : "s"}` : "source required",
        field("Confidence *", `<select data-f="verification.level">${V.verification_confidence.map(v =>
          `<option value="${v.key}" ${v.key === p.verification.level ? "selected" : ""}>${esc(v.label)}</option>`).join("")}</select>`) +
        field("Primary sources *", `<textarea data-f="verification.sources" rows="2" placeholder="One URL per line">${esc((p.verification.sources || []).join("\n"))}</textarea>`) +
        field("Last checked", `<input type="date" data-f="verification.last_checked" value="${esc(p.verification.last_checked)}">`) +
        field("Verification notes", `<textarea data-f="verification.notes" rows="2">${esc(p.verification.notes)}</textarea>`,
          "Record discrepancies here rather than silently resolving them."))}

      ${sect(4, "Certifications held", nHeld ? `${nHeld} recorded` : "none",
        `<p class="ahint">What this provider itself holds — distinct from what an offering can certify for others.</p>
         <div id="a-held">${(p.certifications_held || []).map((c, i) => `
           <div class="heldrow" data-hidx="${i}">
             <select data-f="certifications_held.${i}.cert">${certValues().map(v =>
               `<option value="${v.key}" ${v.key === c.cert ? "selected" : ""}>${esc(v.label)}</option>`).join("")}</select>
             <select data-f="certifications_held.${i}.status">${V.certification_status.map(s =>
               `<option value="${s.key}" ${s.key === c.status ? "selected" : ""}>${esc(s.label)}</option>`).join("")}</select>
             <input type="text" data-f="certifications_held.${i}.source" value="${esc(c.source)}" placeholder="source">
             <button class="danger small" data-del-held="${i}">×</button>
           </div>`).join("")}</div>
         <button class="ghost small" id="a-add-held">+ Add certification held</button>`)}

      ${sect(5, "Offerings", `${nOff} offering${nOff === 1 ? "" : "s"}`,
        `<p class="ahint">One offering per resource type. A provider doing several things has several offerings —
          click one to expand it.</p>
         <div id="a-offerings">${p.offerings.map(offeringForm).join("")}</div>
         <button class="ghost small" id="a-add-offering">+ Add offering</button>`,
        !p.__new)}
    </div>`;
  }

  // ---------- read the form back into the record ----------
  function setPath(obj, path, value) {
    const parts = path.split(".");
    let cur = obj;
    parts.slice(0, -1).forEach(k => {
      const nk = /^\d+$/.test(k) ? Number(k) : k;
      if (cur[nk] == null) cur[nk] = /^\d+$/.test(parts[parts.indexOf(k) + 1] || "") ? [] : {};
      cur = cur[nk];
    });
    cur[parts[parts.length - 1]] = value;
  }
  function collect(p) {
    const root = el("#a-editor");
    root.querySelectorAll("[data-f]").forEach(inp => {
      const path = inp.dataset.f;
      let v = inp.value;
      if (inp.type === "number") v = v === "" ? null : Number(v);
      if (inp.tagName === "TEXTAREA" && (path.endsWith("sources"))) v = v.split("\n").map(s => s.trim()).filter(Boolean);
      setPath(p, path, v);
    });
    root.querySelectorAll("[data-multi]").forEach(chip => {
      const path = chip.dataset.multi;
      if (!chip.__seen) {
        setPath(p, path, []);
        root.querySelectorAll(`[data-multi="${CSS.escape ? CSS.escape(path) : path}"]`).forEach(c => c.__seen = true);
      }
    });
    // rebuild multiselects
    const groups = {};
    root.querySelectorAll("[data-multi]").forEach(c => {
      (groups[c.dataset.multi] = groups[c.dataset.multi] || []).push(c);
    });
    Object.entries(groups).forEach(([path, cs]) => {
      setPath(p, path, cs.filter(c => c.classList.contains("on")).map(c => c.dataset.k));
    });
    // D9 back to objects, preserving intensity where it existed
    (p.offerings || []).forEach((o, i) => {
      if (Array.isArray(o.d9) && o.d9.length && typeof o.d9[0] === "string") {
        const prev = (editingId && (providers().find(x => x.id === editingId) || {}).offerings || [])[i];
        const old = ((prev || {}).d9) || [];
        o.d9 = o.d9.map(type => {
          const match = old.find(s => s.type === type);
          return match || { type, intensity: null };
        });
      }
      if (o.d3 && (o.d3.min == null || o.d3.max == null)) delete o.d3;
      if (o.d5 === "" || o.d5 === undefined) o.d5 = null;
      if (!o.id) o.id = slug(o.title || o.d0) || o.d0;
    });
    return p;
  }

  function warnings(p) {
    const w = [];
    if (!p.name) w.push("Name is required.");
    if (!p.id) w.push("ID is required.");
    if (!(p.geo.nuts || []).length) w.push("At least one NUTS region is required.");
    if (!(p.verification.sources || []).length) w.push("At least one primary source is required — verification depth is data.");
    if (!(p.offerings || []).length) w.push("A provider needs at least one offering.");
    (p.offerings || []).forEach(o => { if (!o.title) w.push(`Offering "${o.id || o.d0}" needs a title.`); });
    if ((p.geo.lat == null) !== (p.geo.lon == null)) w.push("Give both latitude and longitude, or neither.");
    return w;
  }

  // ---------- rendering ----------
  function renderList() {
    el("#a-list").innerHTML = providers().map(p =>
      `<button class="listrow ${p.id === editingId ? "on" : ""}" data-edit="${esc(p.id)}">
         <span>${esc(p.name)}</span>
         <span class="badge ${p.verification.level}">${p.offerings.length}</span>
       </button>`).join("");
  }
  function renderStatus() {
    const nOff = providers().reduce((n, p) => n + p.offerings.length, 0);
    el("#a-status").textContent = `${providers().length} providers · ${nOff} offerings`;
    let draft = false;
    try { draft = !!localStorage.getItem(DRAFT_KEY); } catch (e) {}
    let vdraft = false;
    try { vdraft = !!localStorage.getItem(VOCAB_KEY); } catch (e) {}
    el("#a-draftnote").textContent = (draft || vdraft)
      ? `Local changes stored in this browser${draft && vdraft ? " (providers + taxonomy)" : draft ? " (providers)" : " (taxonomy)"}. Download the JSON, replace the file in data/, then run tools/mirror.py.`
      : "No local changes yet.";
  }
  function renderEditor() {
    const p = editingId ? providers().find(x => x.id === editingId) : null;
    el("#a-editor").innerHTML = p ? providerForm(p) : `<div class="empty">Pick a provider on the left, or create a new one.</div>`;
    renderList();
  }
  // ---------- taxonomy builder ----------
  /* Editing the taxonomy can orphan provider data, so every value shows how many
     offerings use it, and in-use values cannot be deleted. This is the same honesty
     rule as elsewhere: the tool never silently loses information. */
  function usageCounts() {
    const c = {};
    const bump = k => { if (k != null && k !== "") c[k] = (c[k] || 0) + 1; };
    providers().forEach(p => {
      (p.certifications_held || []).forEach(x => bump(x.cert));
      (p.offerings || []).forEach(o => {
        bump(o.d0);
        const d1 = o.d1 || {};
        ["material_facet", "process_facet", "equipment", "materials"].forEach(k => (d1[k] || []).forEach(bump));
        ["d2", "d4", "d6", "d8", "certification_scope"].forEach(k => (o[k] || []).forEach(bump));
        bump(o.d7);
        (o.d9 || []).forEach(s => bump(s.type));
      });
    });
    return c;
  }

  const DIMS = [
    { key: "d2_production_stage", title: "Production stage", get: () => V.d2_production_stage },
    { key: "d6_access_model",     title: "Access model",     get: () => V.d6_access_model },
    { key: "d7_governance",       title: "Governance",       get: () => V.d7_governance },
    { key: "d8_target_user",      title: "Who it serves",    get: () => V.d8_target_user },
    { key: "d9_support",          title: "Support services", get: () => V.d9_support_services.values },
    { key: "material_facet",      title: "Materials & fields", get: () => V.d1_material_facet.values },
    { key: "equipment_leaf",      title: "Equipment",        get: () => V.equipment_leaf.values },
    { key: "materials_tags",      title: "Specific materials", get: () => V.materials_tags.values }
  ];

  function valueRow(listKey, item, used) {
    const locked = used > 0;
    return `<div class="vrow">
      <input type="text" class="vlabel" data-vedit="${listKey}" data-k="${esc(item.key)}" value="${esc(item.label)}">
      <span class="vuse ${locked ? "locked" : ""}">${used ? used + " in use" : "unused"}</span>
      <button class="danger small" data-vdel="${listKey}" data-k="${esc(item.key)}"
        ${locked ? "disabled title='Used by " + used + " offering(s) — retag them first'" : ""}>×</button>
    </div>`;
  }

  function listBlock(listKey, title, items, use, note) {
    return `<details class="sect">
      <summary><span class="sectno">·</span><span class="secttitle">${esc(title)}</span>
        <span class="sectstatus">${items.length} value${items.length === 1 ? "" : "s"}</span></summary>
      <div class="sectbody">
        ${note ? `<p class="ahint">${note}</p>` : ""}
        ${items.map(i => valueRow(listKey, i, use[i.key] || 0)).join("")}
        <div class="addrow">
          <input type="text" data-vnew="${listKey}" placeholder="New value label">
          <button class="ghost small" data-vadd="${listKey}">Add</button>
        </div>
      </div>
    </details>`;
  }

  function renderTaxonomy() {
    const use = usageCounts();
    const dimIds = ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9"];
    const dimNames = { D1: "Domain", D2: "Stage", D3: "TRL", D4: "Circular", D5: "Open", D6: "Access", D7: "Gov", D8: "Serves", D9: "Support" };

    el("#a-editor").innerHTML = `<div class="acard">
      <div class="acardbar"><h2>Taxonomy</h2>
        <div class="baractions"><button class="ghost" id="t-revert">Reset to shipped taxonomy</button></div>
      </div>

      ${(function () {
        const items = V.d0_resource_types;
        return `<details class="sect" open>
          <summary><span class="sectno">1</span><span class="secttitle">Resource types</span>
            <span class="sectstatus">${items.length} types · the gate</span></summary>
          <div class="sectbody">
            <p class="ahint">The first question asked of every offering. Each type decides which
              dimensions apply below.</p>
            ${items.map(t => `
              <div class="vrow tall">
                <div class="vmain">
                  <input type="text" class="vlabel" data-vedit="d0" data-k="${esc(t.key)}" value="${esc(t.label)}">
                  <textarea class="vdef" data-vdef="${esc(t.key)}" rows="2" placeholder="Definition shown as a tooltip">${esc(t.definition)}</textarea>
                </div>
                <span class="vuse ${use[t.key] ? "locked" : ""}">${use[t.key] ? use[t.key] + " in use" : "unused"}</span>
                <button class="danger small" data-vdel="d0" data-k="${esc(t.key)}"
                  ${use[t.key] ? "disabled title='Used by " + use[t.key] + " offering(s)'" : ""}>×</button>
              </div>`).join("")}
            <div class="addrow">
              <input type="text" data-vnew="d0" placeholder="New resource type label">
              <button class="ghost small" data-vadd="d0">Add</button>
            </div>
          </div>
        </details>`;
      })()}

      <details class="sect">
        <summary><span class="sectno">2</span><span class="secttitle">Applicability</span>
          <span class="sectstatus">which dimensions apply to which type</span></summary>
        <div class="sectbody">
          <p class="ahint">This drives both the data-entry form and the search questions. “—” means the
            dimension does not exist for that type at all.</p>
          <div class="matwrap"><table class="matrix">
            <thead><tr><th>Resource type</th>${dimIds.map(d => `<th>${dimNames[d]}</th>`).join("")}<th>D1 facets</th></tr></thead>
            <tbody>${V.d0_resource_types.map(t => {
              const r = V.applicability_matrix[t.key] || {};
              return `<tr><th>${esc(t.label)}</th>${dimIds.map(d => `
                <td><select data-mat="${esc(t.key)}" data-dim="${d}">
                  ${["full", "partial", "none"].map(v =>
                    `<option value="${v}" ${(r[d] || "none") === v ? "selected" : ""}>${v === "full" ? "✓" : v === "partial" ? "(✓)" : "—"}</option>`).join("")}
                </select></td>`).join("")}
                <td class="facetcell">
                  <label><input type="checkbox" data-facet="${esc(t.key)}" value="material"
                    ${(r.D1_facets || []).includes("material") ? "checked" : ""}> material</label>
                  <label><input type="checkbox" data-facet="${esc(t.key)}" value="process"
                    ${(r.D1_facets || []).includes("process") ? "checked" : ""}> process</label>
                </td></tr>`;
            }).join("")}</tbody>
          </table></div>
        </div>
      </details>

      <details class="sect">
        <summary><span class="sectno">3</span><span class="secttitle">Processes</span>
          <span class="sectstatus">${V.d1_process_facet.schemes.length} schemes</span></summary>
        <div class="sectbody">
          <p class="ahint">Grouped by the standard each scheme follows. Add a scheme for a domain the
            current standards don't cover.</p>
          ${V.d1_process_facet.schemes.map((s, si) => `
            <div class="scheme">
              <div class="vrow">
                <input type="text" class="vlabel strong" data-scheme="${si}" value="${esc(s.label)}">
                <span class="vuse">${s.values.length} value${s.values.length === 1 ? "" : "s"}</span>
                <button class="danger small" data-schemedel="${si}"
                  ${s.values.some(v => use[v.key]) ? "disabled title='Contains values in use'" : ""}>×</button>
              </div>
              <div class="schemevals">
                ${s.values.map(v => valueRow("scheme:" + si, v, use[v.key] || 0)).join("")}
                <div class="addrow">
                  <input type="text" data-vnew="scheme:${si}" placeholder="New process label">
                  <button class="ghost small" data-vadd="scheme:${si}">Add</button>
                </div>
              </div>
            </div>`).join("")}
          <div class="addrow">
            <input type="text" data-vnew="scheme-new" placeholder="New process scheme (e.g. Ceramics)">
            <button class="ghost small" data-vadd="scheme-new">Add scheme</button>
          </div>
        </div>
      </details>

      <details class="sect">
        <summary><span class="sectno">4</span><span class="secttitle">Circularity (10R)</span>
          <span class="sectstatus">${V.d4_circularity.tiers.length} tiers</span></summary>
        <div class="sectbody">
          <p class="ahint">The 10R ladder, grouped in tiers. Kept at full granularity on purpose —
            the ISO 59020 short set would collapse the mid-life strategies.</p>
          ${V.d4_circularity.tiers.map((t, ti) => `
            <div class="scheme">
              <div class="vrow"><input type="text" class="vlabel strong" data-tier="${ti}" value="${esc(t.label)}"></div>
              <div class="schemevals">${t.values.map(v => valueRow("tier:" + ti, v, use[v.key] || 0)).join("")}
                <div class="addrow">
                  <input type="text" data-vnew="tier:${ti}" placeholder="New R-strategy label">
                  <button class="ghost small" data-vadd="tier:${ti}">Add</button>
                </div>
              </div>
            </div>`).join("")}
        </div>
      </details>

      <details class="sect">
        <summary><span class="sectno">5</span><span class="secttitle">Certifications</span>
          <span class="sectstatus">${V.certifications.categories.length} categories</span></summary>
        <div class="sectbody">
          <p class="ahint">One shared list, used both for what a provider holds and for what a
            testing or certification offering can assess.</p>
          ${V.certifications.categories.map((c, ci) => `
            <div class="scheme">
              <div class="vrow"><input type="text" class="vlabel strong" data-certcat="${ci}" value="${esc(c.label)}"></div>
              <div class="schemevals">${c.values.map(v => valueRow("cert:" + ci, v, use[v.key] || 0)).join("")}
                <div class="addrow">
                  <input type="text" data-vnew="cert:${ci}" placeholder="New standard or directive">
                  <button class="ghost small" data-vadd="cert:${ci}">Add</button>
                </div>
              </div>
            </div>`).join("")}
          <div class="addrow">
            <input type="text" data-vnew="certcat-new" placeholder="New certification category">
            <button class="ghost small" data-vadd="certcat-new">Add category</button>
          </div>
        </div>
      </details>

      <details class="sect">
        <summary><span class="sectno">6</span><span class="secttitle">Other dimensions</span>
          <span class="sectstatus">value lists</span></summary>
        <div class="sectbody">
          ${DIMS.map(d => listBlock(d.key, d.title, d.get(), use)).join("")}
        </div>
      </details>
    </div>`;
    el("#a-vocab").innerHTML = "";
  }

  function listByKey(k) {
    if (k === "d0") return V.d0_resource_types;
    if (k.startsWith("scheme:")) return V.d1_process_facet.schemes[Number(k.split(":")[1])].values;
    if (k.startsWith("tier:")) return V.d4_circularity.tiers[Number(k.split(":")[1])].values;
    if (k.startsWith("cert:")) return V.certifications.categories[Number(k.split(":")[1])].values;
    const d = DIMS.find(x => x.key === k);
    return d ? d.get() : null;
  }

  // ---------- events ----------
  document.addEventListener("click", e => {
    const t = e.target;

    const edit = t.closest && t.closest("[data-edit]");
    if (edit) { editingId = edit.dataset.edit; renderEditor(); return; }

    if (t.dataset && t.dataset.multi) { t.classList.toggle("on"); return; }

    if (t.id === "a-new") {
      const p = { __new: true, id: "", name: "", website: "", contact: "", address: "",
                  geo: { lat: null, lon: null, nuts: [] },
                  certifications_held: [],
                  verification: { level: "unverified", sources: [], last_checked: "", notes: "" },
                  offerings: [{ id: "", d0: "fabrication_facility", title: "", d1: {}, d6: [], d8: [], notes: "", sources: [] }],
                  status: "active" };
      providers().push(p); editingId = null;
      el("#a-editor").innerHTML = providerForm(p);
      return;
    }

    if (t.id === "a-add-offering") {
      const p = currentRecord(); if (!p) return;
      p.offerings.push({ id: "", d0: "fabrication_facility", title: "", d1: {}, d6: [], d8: [], notes: "", sources: [] });
      rerenderForm(p); return;
    }
    if (t.dataset && t.dataset.delOffering != null) {
      const p = currentRecord(); if (!p) return;
      p.offerings.splice(Number(t.dataset.delOffering), 1);
      rerenderForm(p); return;
    }
    if (t.id === "a-add-held") {
      const p = currentRecord(); if (!p) return;
      (p.certifications_held = p.certifications_held || []).push({ cert: certValues()[0].key, status: "claimed", source: "" });
      rerenderForm(p); return;
    }
    if (t.dataset && t.dataset.delHeld != null) {
      const p = currentRecord(); if (!p) return;
      p.certifications_held.splice(Number(t.dataset.delHeld), 1);
      rerenderForm(p); return;
    }

    if (t.id === "a-save") {
      const p = currentRecord(); if (!p) return;
      const w = warnings(p);
      el("#a-warn").innerHTML = w.length
        ? `<div class="warnbox"><strong>Not saved:</strong><ul>${w.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`
        : "";
      if (w.length) return;
      delete p.__new;
      if (!providers().includes(p)) providers().push(p);
      editingId = p.id; save(); renderEditor();
      el("#a-warn").innerHTML = `<div class="okbox">Saved to the local draft. Download providers.json to keep it.</div>`;
      return;
    }
    if (t.id === "a-cancel") { data = load(); editingId = null; renderEditor(); return; }
    if (t.id === "a-delete") {
      const i = providers().findIndex(x => x.id === editingId);
      if (i >= 0 && window.confirm("Delete this provider from the local draft?")) {
        providers().splice(i, 1); editingId = null; save(); renderEditor();
      }
      return;
    }

    // ---- taxonomy: view switching ----
    if (t.dataset && t.dataset.view) {
      view = t.dataset.view;
      document.querySelectorAll(".vtab").forEach(b => b.classList.toggle("active", b.dataset.view === view));
      el("#side-providers").hidden = view !== "providers";
      el("#side-taxonomy").hidden = view !== "taxonomy";
      if (view === "taxonomy") renderTaxonomy(); else renderEditor();
      return;
    }

    // ---- taxonomy: add a value ----
    if (t.dataset && t.dataset.vadd) {
      const k = t.dataset.vadd;
      const input = document.querySelector(`[data-vnew="${k}"]`);
      const lbl = (input.value || "").trim();
      if (!lbl) return;
      if (k === "scheme-new") {
        V.d1_process_facet.schemes.push({ key: slug(lbl), label: lbl, values: [] });
      } else if (k === "certcat-new") {
        V.certifications.categories.push({ key: slug(lbl), label: lbl, values: [] });
      } else {
        const list = listByKey(k);
        if (!list) return;
        const entry = { key: slug(lbl), label: lbl };
        if (k === "d0") {
          entry.definition = "";
          V.applicability_matrix[entry.key] = { D1: "none", D2: "none", D3: "none", D4: "none",
            D5: "none", D6: "full", D7: "full", D8: "full", D9: "full", D1_facets: [] };
        }
        list.push(entry);
        label[entry.key] = lbl;
      }
      saveVocab(); renderTaxonomy();
      return;
    }

    // ---- taxonomy: delete a value (blocked while in use) ----
    if (t.dataset && t.dataset.vdel) {
      if (t.disabled) return;
      const list = listByKey(t.dataset.vdel);
      if (!list) return;
      const i = list.findIndex(x => x.key === t.dataset.k);
      if (i >= 0) {
        list.splice(i, 1);
        if (t.dataset.vdel === "d0") delete V.applicability_matrix[t.dataset.k];
        saveVocab(); renderTaxonomy();
      }
      return;
    }
    if (t.dataset && t.dataset.schemedel != null) {
      if (t.disabled) return;
      V.d1_process_facet.schemes.splice(Number(t.dataset.schemedel), 1);
      saveVocab(); renderTaxonomy();
      return;
    }

    if (t.id === "t-revert") {
      if (!window.confirm("Discard taxonomy changes and return to the shipped taxonomy?")) return;
      try { localStorage.removeItem(VOCAB_KEY); } catch (e) {}
      window.location.reload();
      return;
    }

    if (t.id === "a-export") download("providers.json", JSON.stringify(data, null, 2));
    if (t.id === "a-export-vocab") download("vocabularies.json", JSON.stringify(V, null, 2));
    if (t.id === "a-reset") {
      try { localStorage.removeItem(DRAFT_KEY); } catch (e) {}
      data = JSON.parse(JSON.stringify(window.__PROVIDERS__)); editingId = null;
      renderEditor(); renderStatus();
    }
  });

  document.addEventListener("change", e => {
    const t = e.target;
    // switching an offering's resource type regenerates its applicable fields
    if (t.dataset && /offerings\.\d+\.d0$/.test(t.dataset.f || "")) {
      const p = currentRecord(); if (!p) return;
      rerenderForm(p);
      return;
    }
    // applicability matrix cell
    if (t.dataset && t.dataset.mat) {
      const r = V.applicability_matrix[t.dataset.mat] = V.applicability_matrix[t.dataset.mat] || {};
      r[t.dataset.dim] = t.value;
      saveVocab();
      return;
    }
    // D1 facet checkbox
    if (t.dataset && t.dataset.facet) {
      const r = V.applicability_matrix[t.dataset.facet] = V.applicability_matrix[t.dataset.facet] || {};
      const set = new Set(r.D1_facets || []);
      t.checked ? set.add(t.value) : set.delete(t.value);
      r.D1_facets = [...set];
      saveVocab();
    }
  });

  // renaming taxonomy labels (labels are display text; keys stay stable)
  document.addEventListener("input", e => {
    const t = e.target;
    if (t.dataset && t.dataset.vedit) {
      const list = t.dataset.vedit === "d0" ? V.d0_resource_types : listByKey(t.dataset.vedit);
      const item = list && list.find(x => x.key === t.dataset.k);
      if (item) { item.label = t.value; label[item.key] = t.value; saveVocab(); }
      return;
    }
    if (t.dataset && t.dataset.vdef != null) {
      const item = V.d0_resource_types.find(x => x.key === t.dataset.vdef);
      if (item) { item.definition = t.value; saveVocab(); }
      return;
    }
    if (t.dataset && t.dataset.scheme != null) {
      V.d1_process_facet.schemes[Number(t.dataset.scheme)].label = t.value; saveVocab(); return;
    }
    if (t.dataset && t.dataset.tier != null) {
      V.d4_circularity.tiers[Number(t.dataset.tier)].label = t.value; saveVocab(); return;
    }
    if (t.dataset && t.dataset.certcat != null) {
      V.certifications.categories[Number(t.dataset.certcat)].label = t.value; saveVocab(); return;
    }
  });

  function currentRecord() {
    const card = el("#a-editor").querySelector(".acard");
    if (!card) return null;
    const base = editingId ? providers().find(x => x.id === editingId)
                           : providers().find(x => x.__new);
    return base ? collect(base) : null;
  }
  function rerenderForm(p) {
    if (!p) return;
    el("#a-editor").innerHTML = providerForm(p);
  }

  function download(name, content) {
    const blob = new Blob([content], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const imp = el("#a-import");
  if (imp) imp.addEventListener("change", e => {
    const file = e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        if (!parsed.providers) throw new Error("no providers array");
        data = parsed; editingId = null; save(); renderEditor();
      } catch (err) { window.alert("Could not read that file: " + err.message); }
    };
    r.readAsText(file);
  });

  renderEditor(); renderStatus();
})();
