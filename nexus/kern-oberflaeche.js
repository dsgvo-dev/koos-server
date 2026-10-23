/* ── Modulregister ─────────────────────────────────────────────────── */
const GRUPPEN = [
  {label:null, module:[
    {id:'start', ico:'⌂', name:'Start'},
  ]},
  {label:'Stammdaten', module:[
    {id:'organisation', ico:'🏛', name:'Organisation', zahl:()=>OE.length},
    {id:'prozesse',     ico:'⚙', name:'Prozesse',     zahl:()=>PROZESSE.length},
    {id:'datenspeicher',ico:'🗄', name:'Datenspeicher',zahl:()=>DSTORES.length},
    {id:'regelungen',   ico:'📋', name:'Regelungen',   zahl:()=>REGELUNGEN.length},
  ]},
  {label:'Datenschutz', module:[
    {id:'vvt',            ico:'📑', name:'VVT', zahl:()=>VVT.length},
    {id:'besonderheiten', ico:'◐', name:'Besonderheiten', kette:true},
    {id:'schwellenwert',  ico:'⚖', name:'Schwellenwert',  kette:true},
    {id:'risiko',         ico:'⚠', name:'Risikoanalyse',  kette:true},
    {id:'tom',            ico:'🔒', name:'TOM & Gefahren', kette:true},
    {id:'dsfa',           ico:'⚖️', name:'DSFA', kette:true, zahl:()=>Object.keys(K.dsfa).length},
  ]},
  {label:'Auswertung', module:[
    {id:'dashboard',      ico:'📊', name:'Dashboard'},
    {id:'verknuepfungen', ico:'🕸', name:'Verknüpfungen'},
    {id:'berichte',   ico:'📄', name:'Berichte'},
    {id:'referenzen', ico:'📚', name:'Referenzen'},
  ]},
  {label:'System', module:[
    {id:'audit', ico:'🕘', name:'Audit'},
    {id:'admin', ico:'⚙️', name:'Admin'},
  ]},
];
const MODUL_NAME = {};
GRUPPEN.forEach(g=>g.module.forEach(m=>MODUL_NAME[m.id]=m.name));

/* ── Zustand ───────────────────────────────────────────────────────── */
const S = {
  modul:'start',
  kontext:{typ:null, id:null, text:null},   // typ: 'vt' | 'prozess' | 'oe'
  auswahl:{organisation:null, prozesse:null, datenspeicher:null, regelungen:null, vvt:null},
  tomKat:'ORG',
  tomTab:'toms',
  graphKat:'', graphSort:'refs', graphNurSel:true, graphSel:null,
  vSicht:'proc-vvt', vAmt:'',
  filter:{prozesse:'', datenspeicher:'', vvt:'', regelungen:'', organisation:''},
  lfilter:{prozesse:null, datenspeicher:null, regelungen:null, vvt:null},   // Listenfilter aus den Startseiten (stammdaten-start.js)
  limit:{prozesse:120, datenspeicher:120, vvt:120, tomListe:60},
  verlauf:[],
  threads:[],
  thread:null,
  kkAus:new Set(),   // abgewählte Kontextbausteine
  letzterBezug:null, // was die letzte Frage aufgelöst hat
  spalteZu:false,    // Listenspalte eingeklappt
};

/* ── Helfer ────────────────────────────────────────────────────────── */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const oeName = id => (OE.find(o=>o.id===id)||{}).name || id;
const vtById = id => VVT.find(v=>v.id===id);
const procById = id => PROZESSE.find(p=>p.id===id);
const dsById = id => DSTORES.find(d=>d.id===id);
const regById = id => REGELUNGEN.find(r=>r.id===id);

function toast(text){
  const t=$('#toast'); t.textContent=text; t.classList.add('an');
  clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('an'),2400);
}

/* Schutzstufe einer VT: Maximum über verknüpfte Datenspeicher (reg-klassifizierung-001, 4.2) */
function schutzstufe(vt){
  const stufen=(vt.dstores||[]).map(id=>(dsById(id)||{}).schutz).filter(Boolean);
  if(!stufen.length) return null;
  return stufen.sort().reverse()[0];
}
function hatArt9(vt){ return (vt.dstores||[]).some(id=>(dsById(id)||{}).art9); }

/* Bereich einer VVT aus ihren Prozessen ableiten (P3-Logik, 06.10.2026) */
function vvtBereich(vt){
  const b=new Set((vt.prozesse||[]).map(id=>(procById(id)||{}).bereich).filter(Boolean));
  return b.size===0?null : b.size===1?[...b][0] : 'gemischt';
}

/* Listenfilter: Suchbegriff + Kappung für lange Listen */
function filtern(modul, arr, textF){
  const q=(S.filter[modul]||'').trim().toLowerCase();
  const treffer = q ? arr.filter(x=>textF(x).toLowerCase().includes(q)) : arr;
  const lim = S.limit[modul] || treffer.length;
  return {treffer, sichtbar:treffer.slice(0,lim), gekappt:Math.max(0,treffer.length-lim)};
}
function mehrBtn(modul,g){
  return g.gekappt ? `<div style="padding:10px 15px"><button class="btn klein" style="width:100%" data-mehr="${modul}">
    Weitere ${Math.min(g.gekappt,200)} von ${g.gekappt} anzeigen</button></div>` : '';
}

const STAND_PILL = {done:['ok','vollständig'], wip:['warn','in Arbeit'], offen:['','offen'],
                    unbekannt:['unbekannt','keine Datenquelle']};
function standPill(st){
  const [cls,txt]=STAND_PILL[st]||STAND_PILL.offen;
  return `<span class="pill ${cls}">${txt}</span>`;
}

/* ── Rail rendern ──────────────────────────────────────────────────── */
function renderRail(){
  $('#rail-scroll').innerHTML = GRUPPEN.map(g=>`
    <div class="rail-group">
      ${g.label?`<div class="rail-label">${g.label}</div>`:''}
      ${g.module.map(m=>`
        <button class="rail-item${S.modul===m.id?' active':''}" data-modul="${m.id}" title="${esc(m.name)}">
          <span class="rail-ico">${m.ico}</span>
          <span class="rail-txt">${esc(m.name)}</span>
          ${m.zahl?`<span class="rail-badge">${m.zahl()}</span>`:''}
        </button>`).join('')}
    </div>`).join('');
}

/* ── Kontext ───────────────────────────────────────────────────────── */
function setzeKontext(typ, id){
  let text='', kurz='';
  if(typ==='vt'){ const v=vtById(id); text=v.uid+' · '+v.titel; kurz='VT'; }
  if(typ==='prozess'){ const p=procById(id); text=p.name; kurz='Prozess'; }
  if(typ==='oe'){ text=oeName(id); kurz='OE'; }
  S.kontext={typ,id,text,kurz};
  renderKontext(); renderAssistKontext();
}
function loeseKontext(){ S.kontext={typ:null,id:null,text:null}; renderKontext(); renderAssistKontext(); }

function renderKontext(){
  const leer=$('#kontext-leer'), chip=$('#kontext-chip');
  if(!S.kontext.typ){ leer.hidden=false; chip.hidden=true; return; }
  leer.hidden=true; chip.hidden=false;
  $('#kchip-typ').textContent=S.kontext.kurz;
  $('#kchip-text').textContent=S.kontext.text;
}

/* Kontextbausteine für den Assistenten */
function kontextBausteine(){
  /* Zwei Gruppen. Die Quellen zeigen, welche Bestände überhaupt angebunden sind —
     das war vorher nicht ablesbar und ließ KOOS fehlen wirken, obwohl fünf von
     sieben Werkzeugaufrufen dorthin gehen. Der Bezug zeigt, worauf sich die
     nächste Antwort stützt: gesetzt oder aus der Frage aufgelöst. */
  const q=[
    {k:'koos-orga',  gr:'quelle', label:`KOOS · ${OE.length} Einheiten`,        leer:!OE.length},
    {k:'koos-proc',  gr:'quelle', label:`KOOS · ${PROZESSE.length} Prozesse`,    leer:!PROZESSE.length},
    {k:'koos-daten', gr:'quelle', label:`KOOS · ${DSTORES.length} Datenspeicher · Schutzstufen`, leer:!DSTORES.length},
    {k:'koos-vvt',   gr:'quelle', label:`KOOS · ${VVT.length} VVT`,              leer:!VVT.length},
    {k:'koos-reg',   gr:'quelle', label:`KOOS · ${REGELUNGEN.length} Regelungen`,leer:!REGELUNGEN.length},
    {k:'tom',        gr:'quelle', label:`TOM-Katalog · ${TOMS.length}/${BEDROHUNGEN.length}`, leer:!TOMS.length},
    {k:'methodik',   gr:'quelle', label:'DSMS-Methodik'},
  ];
  const b=[{k:'modul', gr:'bezug', label:'Modul: '+MODUL_NAME[S.modul]}];
  if(S.kontext.typ==='vt'){
    const v=vtById(S.kontext.id);
    if(v){
      b.push({k:'vt', gr:'bezug', label:'VT '+v.uid+' (gesetzt)'});
      b.push({k:'oe', gr:'bezug', label:oeName(v.oe)});
      const st=schutzstufe(v); if(st) b.push({k:'schutz', gr:'bezug', label:'Schutzstufe '+st});
      b.push({k:'kette', gr:'bezug', label:'Kettenstand'});
    }
  } else if(S.kontext.typ==='prozess'){
    const pr=procById(S.kontext.id);
    if(pr){ b.push({k:'proc', gr:'bezug', label:'Prozess: '+pr.name.slice(0,26)});
            b.push({k:'oe', gr:'bezug', label:oeName(pr.oe)}); }
  } else if(S.kontext.typ==='oe'){
    b.push({k:'oe', gr:'bezug', label:oeName(S.kontext.id)});
  } else if(S.letzterBezug){
    /* kein gesetzter Kontext — dann zeigen, was die letzte Frage aufgelöst hat */
    const lb=S.letzterBezug;
    if(lb.vt)       b.push({k:'vt',   gr:'bezug', label:'VT '+lb.vt+' (erkannt)', fluechtig:true});
    if(lb.datenart) b.push({k:'ds',   gr:'bezug', label:'Datenart: '+lb.datenart.slice(0,24), fluechtig:true});
    if(lb.proc)     b.push({k:'proc', gr:'bezug', label:'Prozess: '+lb.proc.slice(0,26), fluechtig:true});
    if(lb.stufe) b.push({k:'schutz',gr:'bezug',label:'Schutzstufe '+lb.stufe, fluechtig:true});
    if(lb.reg)   b.push({k:'reg',  gr:'bezug', label:lb.reg.slice(0,30), fluechtig:true});
  } else {
    b.push({k:'auto', gr:'bezug', label:'wird aus der Frage aufgelöst', passiv:true});
  }
  return q.concat(b);
}

function chipHtml(x){
  if(x.passiv) return `<span class="kk passiv">${esc(x.label)}</span>`;
  const an=!S.kkAus.has(x.k) && !x.leer;
  const cls=x.leer?' leer':(an?' an':'');
  const titel=x.leer?'nicht geladen':(an?'einbezogen — klicken zum Abwählen':'ausgeschlossen — klicken zum Einbeziehen');
  return `<span class="kk${cls}${x.fluechtig?' fluechtig':''}" title="${titel}"><span>${esc(x.label)}</span>`+
         (x.leer?'<span style="opacity:.6">–</span>':`<button data-kk="${x.k}">${an?'✓':'○'}</button>`)+`</span>`;
}
function renderAssistKontext(){
  const bs=kontextBausteine();
  const quellen=bs.filter(x=>x.gr==='quelle'), bezug=bs.filter(x=>x.gr==='bezug');
  const block=(titel,liste)=>`<div class="kk-label">${titel}</div>`+liste.map(chipHtml).join('');
  const html=block('Angebundene Bestände', quellen)+block('Bezug der nächsten Antwort', bezug);
  const el=$('#assist-kontext'); if(el) el.innerHTML=html;
  const vc=$('#vc-kontext');
  if(vc) vc.innerHTML=`<span class="kk-label" style="width:auto;margin:0 6px 0 0">Bestände</span>`+
    quellen.map(chipHtml).join('')+
    `<span class="kk-label" style="width:auto;margin:0 6px 0 12px">Bezug</span>`+
    bezug.map(chipHtml).join('');
}

/* ── Modulwechsel ──────────────────────────────────────────────────── */
function geheZu(modul, opts={}){
  S.modul=modul;
  if(opts.vt){ setzeKontext('vt', opts.vt); S.auswahl.vvt=opts.vt; }
  if(opts.prozess){ S.auswahl.prozesse=opts.prozess; }
  if(opts.dstore){ S.auswahl.datenspeicher=opts.dstore; }
  if(opts.regelung){ S.auswahl.regelungen=opts.regelung; }
  if(opts.oe){ S.auswahl.organisation=opts.oe; }
  renderRail(); renderModul(); renderAssistKontext(); renderVorschlaege();
  document.body.classList.toggle('spalte-zu', S.spalteZu && !!document.querySelector('.spalte-auf'));
  $('#work').scrollTop=0;
}
