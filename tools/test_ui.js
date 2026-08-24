/* Interface tests for the demonstration presets: NODE_PATH=<jsdom> node tools/test_ui.js
   Drives index.html in a headless DOM (Leaflet stubbed) and checks that each preset
   fills the sidebar, opens only the questions it answered, and produces one result
   block per resource type — with nothing leaking between presets.
   Needs jsdom:  npm install jsdom  (not required to run the demonstrator itself). */
const fs=require("fs"), path=require("path");
const {JSDOM}=require("jsdom");
const dir=path.join(__dirname,"..");
const html=fs.readFileSync(path.join(dir,"index.html"),"utf8");
const dom=new JSDOM(html,{runScripts:"outside-only",pretendToBeVisual:true});
const w=dom.window;
// minimal Leaflet stub
const chain=()=>({addTo:()=>chain(),bindPopup:()=>chain(),setView:()=>chain(),clearLayers:()=>{},
  openPopup:()=>{},getLatLng:()=>({}),fitBounds:()=>{},closePopup:()=>{}});
w.L={map:()=>Object.assign(chain(),{fitBounds(){},setView(){return this},closePopup(){}}),
  tileLayer:()=>chain(),layerGroup:()=>chain(),marker:()=>chain(),divIcon:()=>({}),
  latLngBounds:()=>({pad:()=>({})})};
["data/vocabularies.js","data/providers.js","js/match.js","js/app.js"].forEach(f=>
  w.eval(fs.readFileSync(path.join(dir,f),"utf8")));

const q=s=>w.document.querySelector(s);
const qa=s=>[...w.document.querySelectorAll(s)];
let pass=0,fail=0;
const t=(n,c,x)=>{c?pass++:fail++;console.log((c?"  ok   ":"  FAIL ")+n+(c?"":"  -> "+JSON.stringify(x)));};

console.log("\nDemo buttons exist");
const btns=qa("#f-demo .demobtn");
t("three preset buttons rendered", btns.length===3, btns.map(b=>b.textContent));

btns.forEach(b=>{
  const name=b.textContent;
  console.log(`\n${name}`);
  b.click();
  const on=qa("#f-d0 .facet.on").map(f=>f.dataset.k);
  const chosen=qa("#f-dims .facet.on").length;
  const blocks=qa("#f-dims .dimblock").length;
  const openBlocks=qa("#f-dims .dimblock[open]").length;
  const cards=qa("#results .rescard").length;
  const heads=qa("#results .resblock h2").map(h=>h.textContent);
  const note=q("#demonote .democase-head span");
  t("resource types selected", on.length>=2, on);
  t("criteria chips painted on", chosen>0, chosen);
  t("only answered questions are opened", openBlocks>0 && openBlocks<=blocks, [openBlocks,blocks]);
  t("one result block per need", heads.length===on.length, heads);
  t("results rendered", cards>0, cards);
  t("case banner shown", !!note, note && note.textContent);
  t("button marked active", b.classList.contains("on"));
  // first card should carry a verdict
  const v=q("#results .rescard .verdict");
  t("top result shows a verdict line", !!v, v && v.textContent);

  // the banner must describe exactly what the search is really applying
  const critRows=qa("#demonote .critlist tr");
  const stated=Number((note.textContent.match(/(\d+) requirement/)||[])[1]);
  t("banner lists every stated requirement", critRows.length===stated, [critRows.length,stated]);
  const answered=qa("#f-dims .dimblock").filter(b=>Number(b.querySelector("summary .count").textContent)>0).length;
  t("banner count equals the questions actually answered in the sidebar",
    critRows.length===answered, [critRows.length, answered]);
  t("every requirement row has a value", critRows.every(r=>r.querySelector("td").textContent.trim().length>0));
  t("one explanation per resource type asked for", qa("#demonote .democase-why li").length===on.length,
    qa("#demonote .democase-why li").length);
  t("presenter cue present", !!q("#demonote .democase-cue"));
  console.log("   banner:", note.textContent.trim());
  console.log("   top:", q("#results .rescard h3").textContent.trim(), "|", v.textContent.trim());
});

console.log("\nToggling off");
btns[0].click(); btns[0].click();
t("clicking the active preset clears it", qa("#f-d0 .facet.on").length===0 && !q("#demonote .democase"));
t("clear leaves the full dataset listed", qa("#results .rescard").length>0, qa("#results .rescard").length);

console.log("\nSwitching between presets");
btns[0].click(); const a=qa("#f-dims .facet.on").length;
btns[2].click(); const b2=qa("#f-dims .facet.on").length;
t("no criteria leak between presets", a>0 && b2>0 && qa("#f-d0 .facet.on").length===3, [a,b2]);
t("clear button resets everything", (q("#f-clear").click(), qa("#f-d0 .facet.on").length===0 && qa("#f-dims .facet.on").length===0));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
