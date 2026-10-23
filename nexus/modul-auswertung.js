/* ══ Gemeinsamer Renderer für zweispaltige Graphen ════════════════════
   Wird von TOM & Gefahren und vom Modul Verknüpfungen benutzt. Knoten
   links, Knoten rechts, Kanten dazwischen; Klick hebt hervor.           */
function graphSvg(links, rechts, kanten, titelL, titelR){
  const H=22, oben=30, breite=980, xL=270, xR=breite-270;
  const yL={}, yR={};
  links.forEach((n,i)=>yL[n.id]=oben+i*H);
  rechts.forEach((n,i)=>yR[n.id]=oben+i*H);
  const hoehe=Math.max(links.length,rechts.length)*H+oben+20;
  const kSvg=kanten.map(([a,b])=>{
    const y1=yL[a], y2=yR[b];
    if(y1==null||y2==null) return '';
    return `<path class="gk" data-t="${esc(a)}" data-m="${esc(b)}"
      d="M${xL} ${y1} C${xL+95} ${y1}, ${xR-95} ${y2}, ${xR} ${y2}"/>`;
  }).join('');
  const knoten=(liste,x,y,seite)=>liste.map(n=>`<g class="gn gn-${seite}${n.cls?' '+n.cls:''}" data-id="${esc(n.id)}">
      <circle cx="${x}" cy="${y[n.id]}" r="4"/>
      <text x="${seite==='t'?x-10:x+10}" y="${y[n.id]+4}"${seite==='t'?' text-anchor="end"':''}>${esc(String(n.label).slice(0,52))}</text>
      <text class="gd" x="${seite==='t'?x+9:x-9}" y="${y[n.id]+4}"${seite==='m'?' text-anchor="end"':''}>${n.grad??''}</text></g>`).join('');
  return `<div id="graph-info">Knoten anklicken, um seine Verknüpfungen hervorzuheben</div>
  <div id="graph-wrap"><svg id="dep-graph" viewBox="0 0 ${breite} ${hoehe}" style="height:${hoehe}px">
      <text class="gh" x="${xL}" y="16" text-anchor="end">${esc(titelL)}</text>
      <text class="gh" x="${xR}" y="16">${esc(titelR)}</text>
      <g class="gkanten">${kSvg}</g>${knoten(links,xL,yL,'t')}${knoten(rechts,xR,yR,'m')}
    </svg></div>`;
}

/* ══ Modul Verknüpfungen ══════════════════════════════════════════════
   Prozesse ↔ VVT ist die Sicht, an der sich Lücken nach Art. 30 DSGVO
   ablesen lassen: ein Prozess ohne Kante ist nicht dokumentiert, ein
   VVT-Eintrag ohne Kante hat keinen Prozessbezug.                       */
function mVerknuepfungen(){
  const sicht=S.vSicht||'proc-vvt';
  const amt=S.vAmt||'';
  const aemter=[...new Set([...PROZESSE.map(p=>p.oe),...VVT.map(v=>v.oe)].filter(Boolean))]
    .sort((a,b)=>oeName(a).localeCompare(oeName(b)));
  const kopf=`
    <h2>Verknüpfungen</h2>
    <div class="detail-id">${sicht==='proc-vvt'?'Prozesse ↔ Verarbeitungstätigkeiten'
      :sicht==='vvt-ds'?'Verarbeitungstätigkeiten ↔ Datenspeicher':'Organisationseinheit ↔ Verarbeitungstätigkeiten'}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:0 0 12px">
      ${[['proc-vvt','Prozesse ↔ VVT'],['vvt-ds','VVT ↔ Datenspeicher'],['oe-vvt','Ämter ↔ VVT']].map(([k,t])=>
        `<button class="btn klein${sicht===k?' primary':''}" data-vsicht="${k}">${t}</button>`).join('')}
      <span style="width:14px"></span>
      <span style="font-size:11px;color:var(--fg-faint);text-transform:uppercase;letter-spacing:.07em">Amt</span>
      <select class="tb-select" data-vamt>
        <option value="">— alle (nur Zähler) —</option>
        ${aemter.map(o=>`<option value="${esc(o)}"${amt===o?' selected':''}>${esc(oeName(o))}</option>`).join('')}
      </select>
    </div>`;

  if(sicht==='oe-vvt'){
    const proOE={}; VVT.forEach(v=>{ (proOE[v.oe]=proOE[v.oe]||[]).push(v); });
    const links=Object.keys(proOE).sort((a,b)=>proOE[b].length-proOE[a].length)
      .map(o=>({id:o,label:oeName(o),grad:proOE[o].length}));
    const rechts=VVT.filter(v=>!amt||v.oe===amt).map(v=>({id:v.id,label:v.uid+' '+v.titel,grad:''}));
    const kanten=rechts.map(r=>[(VVT.find(v=>v.id===r.id)||{}).oe, r.id]).filter(k=>k[0]);
    return `<div class="detail">${kopf}
      <div class="hinweis">${rechts.length} Verarbeitungstätigkeiten über ${links.length} Ämter.</div>
      ${graphSvg(links, rechts, kanten, 'Organisationseinheiten', 'Verarbeitungstätigkeiten')}</div>`;
  }

  if(sicht==='vvt-ds'){
    const vs=VVT.filter(v=>!amt||v.oe===amt);
    const dsIds=[...new Set(vs.flatMap(v=>v.dstores||[]))];
    const grad={}; vs.forEach(v=>(v.dstores||[]).forEach(d=>grad[d]=(grad[d]||0)+1));
    const links=vs.map(v=>({id:v.id,label:v.uid+' '+v.titel,grad:(v.dstores||[]).length,
      cls:(v.dstores||[]).length?'':'leer'}));
    const rechts=dsIds.map(d=>dsById(d)).filter(Boolean)
      .sort((a,b)=>(grad[b.id]||0)-(grad[a.id]||0))
      .map(d=>({id:d.id,label:d.name+' · '+d.schutz,grad:grad[d.id]||0,cls:d.art9?'art9':''}));
    const kanten=vs.flatMap(v=>(v.dstores||[]).map(d=>[v.id,d]));
    const ohne=vs.filter(v=>!(v.dstores||[]).length).length;
    return `<div class="detail">${kopf}
      <div class="karten" style="margin-bottom:14px">
        <div class="karte"><div class="karte-zahl">${vs.length}</div><div class="karte-label">Verarbeitungstätigkeiten</div></div>
        <div class="karte"><div class="karte-zahl">${dsIds.length}</div><div class="karte-label">genutzte Datenspeicher</div></div>
        <div class="karte"><div class="karte-zahl">${kanten.length}</div><div class="karte-label">Verknüpfungen</div></div>
        <div class="karte"><div class="karte-zahl">${ohne}</div><div class="karte-label">VT ohne Datenspeicher</div>
          ${ohne?'<div class="karte-fuss"><span class="pill err">keine Schutzstufe</span></div>':''}</div>
      </div>
      ${graphSvg(links, rechts, kanten, 'Verarbeitungstätigkeiten', 'Datenspeicher')}</div>`;
  }

  /* Prozesse ↔ VVT */
  const ps=PROZESSE.filter(p=>!amt||p.oe===amt);
  const vs=VVT.filter(v=>!amt||v.oe===amt);
  const pIds=new Set(ps.map(p=>p.id));
  const kanten=[];
  vs.forEach(v=>(v.prozesse||[]).forEach(pid=>{ if(pIds.has(pid)) kanten.push([pid,v.id]); }));
  const gradP={}, gradV={};
  kanten.forEach(([a,b])=>{ gradP[a]=(gradP[a]||0)+1; gradV[b]=(gradV[b]||0)+1; });
  const links=ps.sort((a,b)=>(gradP[b.id]||0)-(gradP[a.id]||0)||a.name.localeCompare(b.name))
    .map(p=>({id:p.id,label:p.name,grad:gradP[p.id]||0,cls:gradP[p.id]?'':'leer'}));
  const rechts=vs.sort((a,b)=>(gradV[b.id]||0)-(gradV[a.id]||0)||String(a.uid).localeCompare(String(b.uid)))
    .map(v=>({id:v.id,label:v.uid+' '+v.titel,grad:gradV[v.id]||0,cls:gradV[v.id]?'':'leer'}));
  const pOhne=links.filter(x=>!x.grad).length, vOhne=rechts.filter(x=>!x.grad).length;
  const zuViel=[...links].sort((a,b)=>b.grad-a.grad)[0];
  return `<div class="detail">${kopf}
    <div class="karten" style="margin-bottom:14px">
      <div class="karte"><div class="karte-zahl">${ps.length}</div><div class="karte-label">Prozesse</div></div>
      <div class="karte"><div class="karte-zahl">${vs.length}</div><div class="karte-label">Verarbeitungstätigkeiten</div></div>
      <div class="karte"><div class="karte-zahl">${kanten.length}</div><div class="karte-label">Verknüpfungen</div></div>
      <div class="karte"><div class="karte-zahl">${pOhne}</div><div class="karte-label">Prozesse ohne VVT</div>
        ${pOhne?'<div class="karte-fuss"><span class="pill warn">Art. 30 DSGVO</span></div>':''}</div>
      <div class="karte"><div class="karte-zahl">${vOhne}</div><div class="karte-label">VT ohne Prozessbezug</div></div>
    </div>
    ${zuViel&&zuViel.grad>1?`<div class="hinweis">Am stärksten gebündelt: <b>${esc(zuViel.label)}</b> —
      in ${zuViel.grad} Verarbeitungstätigkeiten referenziert.</div>`:''}
    ${!amt&&ps.length>260?`<div class="hinweis warn">${ps.length} Prozesse und ${vs.length} VT ergeben einen
      unlesbaren Graphen. Für die Darstellung bitte ein Amt wählen — die Zähler oben gelten für den Gesamtbestand.</div>`
      :graphSvg(links, rechts, kanten, 'Prozesse', 'Verarbeitungstätigkeiten')}</div>`;
}

function graphMarkieren(id){
  const svg=document.getElementById('dep-graph'); if(!svg) return;
  S.graphSel = (S.graphSel===id) ? null : id;
  const sel=S.graphSel;
  const info=document.getElementById('graph-info');
  svg.classList.toggle('markiert', !!sel);
  const nachbarn=new Set();
  svg.querySelectorAll('.gk').forEach(k=>{
    const an = !sel || k.dataset.t===sel || k.dataset.m===sel;
    k.classList.toggle('hell', !!sel && an);
    k.classList.toggle('blass', !!sel && !an);
    if(sel && an){ nachbarn.add(k.dataset.t); nachbarn.add(k.dataset.m); }
  });
  svg.querySelectorAll('.gn').forEach(n=>{
    const an = !sel || n.dataset.id===sel || nachbarn.has(n.dataset.id);
    n.classList.toggle('blass', !!sel && !an);
    n.classList.toggle('aktiv', n.dataset.id===sel);
  });
  if(info){
    if(!sel){ info.textContent='Gefährdung oder Maßnahme anklicken, um ihre Verknüpfungen hervorzuheben'; return; }
    const t=BEDROHUNGEN.find(x=>x.id===sel), m=TOMS.find(x=>x.id===sel);
    const n=[...nachbarn].filter(x=>x!==sel).length;
    info.innerHTML = t
      ? `<b>${esc(t.id)}</b> ${esc(t.name||'')} — ${n} Maßnahme${n===1?'':'n'} · ${esc((t.ziele||[]).join(', '))}
         <div style="margin-top:5px;color:var(--fg-faint)">${esc(String(t.beschreibung||'').slice(0,320))}</div>`
      : m ? `<b>${esc(m.id)}</b> ${esc(m.name||'')} — deckt ${n} Gefährdung${n===1?'':'en'} · ${esc(m.typ||'')} · Wirkung ${m.wirkung??'—'}
         <div style="margin-top:5px;color:var(--fg-faint)">${esc(String(m.beschreibung||'').slice(0,320))}</div>`
      : esc(sel);
  }
}

function mDSFA(){
  const v=aktiveVT();
  if(!v) return ketteSidebar()+keineVT('Für die DSFA wird eine Verarbeitungstätigkeit benötigt.');
  const d=K.dsfa[v.id];
  if(!d) return ketteSidebar()+`<div class="detail"><h2>Datenschutz-Folgenabschätzung</h2>
    <div class="detail-id">${esc(v.uid)} · ${esc(v.titel)}</div>
    <div class="hinweis">Für diese Verarbeitungstätigkeit liegt keine DSFA vor —
      erzeugt wurden ${Object.keys(K.dsfa).length} von ${VVT.length}.</div></div>`;
  const R=d.risiko_referenz||{}, N=d.notwendigkeit||{}, V=d.verhaeltnismassigkeit||{},
        M=d.massnahmen||{}, E=d.ergebnis||{}, sys=d.systembeschreibung||{};
  const txt=o=>o?esc(o.bewertung||o.text||o.hinweis||o.begruendung||
                    Object.values(o).filter(x=>typeof x==='string')[0]||'—'):'—';
  return ketteSidebar()+`<div class="detail">
    <h2>Datenschutz-Folgenabschätzung</h2>
    <div class="detail-id">${esc(d.id)} · Stand ${esc((d.meta||{}).erstellt_am||'—')} · Status ${esc((d.meta||{}).status||'—')} · DSB beteiligt: ${(d.meta||{}).dsb_beteiligt?'ja':'nein'}</div>
    <div class="karten" style="margin-bottom:20px">
      <div class="karte"><div class="karte-zahl">${R.risikowert??'—'}</div><div class="karte-label">Risikowert</div>
        <div class="karte-fuss"><span class="pill ${R.schutzbedarf==='sehr hoch'?'err':'warn'}">${esc(R.schutzbedarf||'—')}</span></div></div>
      <div class="karte"><div class="karte-zahl" style="font-size:17px">${esc(N.aufgabentyp||'—')}</div><div class="karte-label">Aufgabentyp</div></div>
      <div class="karte"><div class="karte-zahl">${M.baseline_anzahl??'—'}</div><div class="karte-label">Baseline-Maßnahmen</div></div>
      <div class="karte"><div class="karte-zahl">${M.ergaenzend_anzahl??'—'}</div><div class="karte-label">ergänzende Maßnahmen</div></div>
    </div>
    <div class="sektion"><div class="sektion-label">Auslöser der Pflicht</div>
      <div class="pill-reihe">
        ${R.dsfa_grund_risiko?'<span class="pill err">Risikowert</span>':''}
        ${R.dsfa_grund_schwelle?'<span class="pill err">Schwellwertanalyse</span>':''}
        ${!R.dsfa_grund_risiko&&!R.dsfa_grund_schwelle?'<span class="pill">freiwillig</span>':''}</div></div>
    <div class="sektion"><div class="sektion-label">Systembeschreibung</div>
      <table class="tab" style="max-width:900px"><tbody>
        <tr><td style="width:190px">Zweck</td><td>${esc(sys.zweck||'—')}</td></tr>
        <tr><td>Rechtsgrundlage</td><td>${esc(sys.rechtsgrundlage||'—')}</td></tr>
        <tr><td>Betroffene</td><td>${esc(String(sys.betroffene??'—'))}</td></tr>
        <tr><td>Speicherdauer</td><td>${esc(String(sys.speicherdauer??'—'))}</td></tr>
        <tr><td>Software</td><td>${esc((sys.software||[]).join(', ')||'—')}</td></tr>
      </tbody></table></div>
    <div class="sektion"><div class="sektion-label">${esc(N.ueberschrift||'Prüfung der Notwendigkeit')}</div>
      <div class="feld-wert" style="margin-bottom:10px">${esc(N.gesetzlicher_auftrag||'')}</div>
      ${N.pflicht_hinweis?`<div class="hinweis">${esc(N.pflicht_hinweis)}</div>`:''}
      ${N.pruefung_offen?`<div class="feld" style="margin-top:10px"><div class="feld-label">Offen</div>
        <div class="feld-wert">${esc(N.pruefung_offen)}</div></div>`:''}</div>
    <div class="sektion"><div class="sektion-label">${esc(V.ueberschrift||'Prüfung der Verhältnismäßigkeit')}</div>
      <table class="tab" style="max-width:900px"><tbody>
        <tr><td style="width:190px">Geeignetheit</td><td>${txt(V.geeignetheit)}</td></tr>
        <tr><td>Erforderlichkeit</td><td>${txt(V.erforderlichkeit)}</td></tr>
        <tr><td>Angemessenheit</td><td>${txt(V.angemessenheit)}</td></tr>
      </tbody></table></div>
    <div class="sektion"><div class="sektion-label">Ergebnis</div>
      <div class="feld-wert"><span class="pill ${E.bewertung==='offen'?'unbekannt':'ok'}">${esc(E.bewertung||'—')}</span>
        <div style="font-size:12px;color:var(--fg-faint);margin-top:6px">${esc(E.begruendung||'')}</div>
        ${E.konsultation_art36?'<div style="margin-top:8px"><span class="pill err">Konsultation nach Art. 36 DSGVO erforderlich</span></div>':''}
      </div></div>
  </div>`;
}

/* Klassische 4×4-Matrix. `zaehler` blendet statt der Produktzahl die Anzahl
   der Verarbeitungstätigkeiten in jedem Feld ein. */
function risikoMatrix(schaden, wahrsch, zaehler){
  const cls=n=>n>=12?'err':n>=8?'warn':n>=4?'warn':'ok';
  const kopf=[1,2,3,4].map(w=>`<th class="num">${w}</th>`).join('');
  const zeilen=[4,3,2,1].map(sh=>`<tr><th style="text-align:right">${sh}</th>${
    [1,2,3,4].map(w=>{
      const prod=sh*w, hier=(sh===schaden&&w===wahrsch);
      const n=zaehler?(zaehler[sh+'x'+w]||0):null;
      return `<td class="num"${hier?' style="outline:2px solid var(--focus);outline-offset:-2px"':''}>
        <span class="pill ${cls(prod)}"${n!==null?' title="Produkt '+prod+'"':''}>${n!==null?n:prod}</span></td>`;
    }).join('')}</tr>`).join('');
  return `<table class="tab" style="max-width:560px">
    <thead><tr><th style="width:150px">Schaden ↓ / Wahrsch. →</th>${kopf}</tr></thead>
    <tbody>${zeilen}</tbody></table>`;
}

/* Übersicht über alle Verarbeitungstätigkeiten mit Risikoanalyse. */
function risikoUebersicht(){
  const rs=Object.values(K.risiko);
  if(!rs.length) return '<div class="hinweis warn">Keine Risikoanalysen geladen.</div>';
  const zaehler={}, werte={}, bedarf={};
  const dims={dsgvo:0, bsi_vertraulichkeit:0, bsi_integritaet:0, bsi_verfuegbarkeit:0};
  rs.forEach(r=>{
    const B=r.basis_risiko||{};
    const sh=(r.besonderheiten_referenz||{}).schadenshoehe_aus_besonderheiten;
    const ew=B.eintrittswahrscheinlichkeit;
    if(sh&&ew) zaehler[sh+'x'+ew]=(zaehler[sh+'x'+ew]||0)+1;
    if(B.gesamtwert!=null) werte[B.gesamtwert]=(werte[B.gesamtwert]||0)+1;
    const sb=(B.schutzbedarf||'—'); bedarf[sb]=(bedarf[sb]||0)+1;
    Object.keys(dims).forEach(k=>{ if(((B[k]||{}).wert||0)>=6) dims[k]++; });
  });
  const maxW=Math.max(...Object.values(werte),1);
  const dimName={dsgvo:'DSGVO', bsi_vertraulichkeit:'BSI Vertraulichkeit',
                 bsi_integritaet:'BSI Integrität', bsi_verfuegbarkeit:'BSI Verfügbarkeit'};
  return `
    <div class="karten" style="margin-bottom:18px">
      ${Object.entries(bedarf).sort((a,b)=>b[1]-a[1]).map(([k,n])=>
        `<div class="karte"><div class="karte-zahl">${n}</div><div class="karte-label">Schutzbedarf ${esc(k)}</div>
          <div class="karte-fuss">${Math.round(n/rs.length*100)} % von ${rs.length}</div></div>`).join('')}
    </div>

    <div class="sektion-label" style="max-width:940px">Verteilung der Gesamtwerte (Maximum der vier Dimensionen)</div>
    <table class="tab" style="max-width:700px">
      <thead><tr><th style="width:90px">Wert</th><th>Verteilung</th><th class="num" style="width:70px">VT</th></tr></thead>
      <tbody>${Object.keys(werte).map(Number).sort((a,b)=>a-b).map(v=>`<tr>
        <td><span class="pill ${v>=12?'err':v>=6?'warn':'ok'}">${v}</span></td>
        <td><div class="balken" style="margin:0"><i style="width:${Math.round(werte[v]/maxW*100)}%"></i></div></td>
        <td class="num">${werte[v]}</td></tr>`).join('')}</tbody></table>

    <div class="sektion-label" style="margin-top:26px;max-width:940px">Welche Dimension treibt das Risiko (Wert ≥ 6)</div>
    <table class="tab" style="max-width:700px">
      <thead><tr><th>Dimension</th><th>Anteil</th><th class="num" style="width:70px">VT</th></tr></thead>
      <tbody>${Object.entries(dims).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`<tr>
        <td>${dimName[k]}</td>
        <td><div class="balken" style="margin:0"><i style="width:${Math.round(n/rs.length*100)}%"></i></div></td>
        <td class="num">${n}</td></tr>`).join('')}</tbody></table>

    <div class="sektion-label" style="margin-top:26px;max-width:940px">Belegung der Risikomatrix (Anzahl VT je Feld)</div>
    ${risikoMatrix(null,null,zaehler)}`;
}

function mDashboard(){
  const k=kennzahlen();
  const stufen={A:0,B:0,C:0,D:0,E:0}; let ohne=0;
  VVT.forEach(v=>{ const st=schutzstufe(v); if(st) stufen[st]=(stufen[st]||0)+1; else ohne++; });
  const max=Math.max(...Object.values(stufen),ohne,1);
  const proOE={}; VVT.forEach(v=>{ (proOE[v.oe]=proOE[v.oe]||[]).push(v); });
  const oeReihen=Object.entries(proOE).sort((a,b)=>b[1].length-a[1].length).slice(0,12);
  const mxOE=oeReihen.length?oeReihen[0][1].length:1;
  return `<div class="start-inner">
    <h2 style="font-size:21px;font-weight:600">Dashboard</h2>
    <p style="color:var(--fg-mute);margin:6px 0 24px;font-size:13.5px">
      Alle Zahlen sind aus dem geladenen Bestand gezählt. Nichts ist geschätzt oder fortgeschrieben.</p>

    <div class="sektion-label" style="max-width:940px">Schutzstufen der Verarbeitungstätigkeiten (abgeleitet über die Datenspeicher)</div>
    <table class="tab">
      <thead><tr><th style="width:150px">Stufe</th><th>Verteilung</th><th class="num" style="width:70px">Anzahl</th></tr></thead>
      <tbody>${Object.entries(stufen).map(([st,n])=>`<tr>
        <td><span class="pill ${st==='E'||st==='D'?'err':st==='C'?'warn':''}">Stufe ${st}</span></td>
        <td><div class="balken" style="margin:0"><i style="width:${Math.round(n/max*100)}%"></i></div></td>
        <td class="num">${n}</td></tr>`).join('')}
        <tr><td><span class="pill err">nicht ableitbar</span></td>
        <td><div class="balken" style="margin:0"><i style="width:${Math.round(ohne/max*100)}%"></i></div></td>
        <td class="num">${ohne}</td></tr></tbody></table>

    <div class="sektion-label" style="margin-top:30px;max-width:940px">Informationssicherheit — BSI-Bewertung der Datenspeicher</div>
    ${(()=>{
      const dim=[['bsiV','Vertraulichkeit'],['bsiI','Integrität'],['bsiA','Verfügbarkeit'],['bsiBedarf','Schutzbedarf (Max.)']];
      const stufen=['normal','hoch','sehr hoch'];
      return `<table class="tab" style="max-width:820px">
        <thead><tr><th>Dimension</th>${stufen.map(x=>`<th class="num" style="width:100px">${x}</th>`).join('')}<th class="num" style="width:80px">ohne</th></tr></thead>
        <tbody>${dim.map(([k,n])=>{
          const z=stufen.map(x=>DSTORES.filter(d=>d[k]===x).length);
          const ohne=DSTORES.filter(d=>!d[k]).length;
          return `<tr><td>${n}</td>${z.map((c,i)=>`<td class="num"><span class="pill ${bsiCls(stufen[i])}">${c}</span></td>`).join('')}
            <td class="num">${ohne||'—'}</td></tr>`;}).join('')}</tbody></table>`;})()}

    <div class="sektion-label" style="margin-top:26px;max-width:940px">Datenschutz und BSI laufen auseinander — Ansatzpunkte für die Durchsicht</div>
    ${(()=>{
      const auf=DSTORES.map(d=>({d,g:divergenz(d)})).filter(x=>x.g.length);
      if(!auf.length) return '<div class="hinweis">Keine Auffälligkeiten.</div>';
      return `<div class="hinweis">${auf.length} von ${DSTORES.length} Datenspeichern zeigen eine Abweichung
        zwischen der Datenschutz-Schutzstufe und den BSI-Vektoren. Das ist kein Fehler — die Skalen messen
        verschiedene Schäden —, aber genau hier lohnt die Einzelprüfung.</div>
      <table class="tab"><thead><tr><th>Datenspeicher</th><th style="width:70px">Stufe</th>
        <th style="width:190px">BSI V / I / A</th><th>Auffälligkeit</th><th style="width:80px"></th></tr></thead>
        <tbody>${auf.slice(0,25).map(({d,g})=>`<tr>
          <td><b>${esc(d.name)}</b></td>
          <td><span class="pill ${d.schutz==='E'||d.schutz==='D'?'err':''}">${esc(d.schutz||'?')}</span></td>
          <td><span class="pill ${bsiCls(d.bsiV)}">${esc(d.bsiV||'?')}</span>
              <span class="pill ${bsiCls(d.bsiI)}">${esc(d.bsiI||'?')}</span>
              <span class="pill ${bsiCls(d.bsiA)}">${esc(d.bsiA||'?')}</span></td>
          <td style="font-size:12px;color:var(--fg-mute)">${esc(g[0])}</td>
          <td><button class="btn klein" data-go="datenspeicher:${d.id}">öffnen</button></td></tr>`).join('')}
        </tbody></table>
        ${auf.length>25?`<div style="font-size:12px;color:var(--fg-faint);margin-top:8px">… und ${auf.length-25} weitere</div>`:''}`;})()}

    <div class="sektion-label" style="margin-top:30px;max-width:940px">Vollständigkeit der VVT-Einträge</div>
    <table class="tab">
      <thead><tr><th>Merkmal</th><th>vorhanden</th><th class="num" style="width:80px">fehlt</th><th class="num" style="width:80px">Anteil</th></tr></thead>
      <tbody>${[
        ['Prozessbezug', k.ohneProzess.length],
        ['Datenspeicher', k.ohneDS.length],
        ['TOM-Zuordnung (Datei)', k.ohneTOM.length],
        ['LeiKa-ID', k.ohneLeika.length],
      ].map(([n,f])=>{const v=VVT.length-f;
        return `<tr><td>${n}</td>
          <td><div class="balken" style="margin:0"><i style="width:${Math.round(v/Math.max(VVT.length,1)*100)}%"></i></div></td>
          <td class="num">${f}</td><td class="num">${Math.round(f/Math.max(VVT.length,1)*100)} %</td></tr>`;}).join('')}
      </tbody></table>

    <div class="hinweis" style="margin-top:18px">
      Besonderheiten, Schwellenwertanalyse und Risikoanalyse liegen in der SQLite-Datenbank der
      DSMS-Anwendung. Ohne Schnittstelle gibt es dazu hier keine Zahl —
      <span class="pill unbekannt">keine Datenquelle</span>.
    </div>

    <div class="sektion-label" style="margin-top:34px;max-width:940px">Risiko über alle Verarbeitungstätigkeiten</div>
    ${risikoUebersicht()}

    <div class="sektion-label" style="margin-top:34px;max-width:940px">Verarbeitungstätigkeiten je Organisationseinheit (Top 12)</div>
    <table class="tab">
      <thead><tr><th>Organisationseinheit</th><th>Verteilung</th><th class="num" style="width:60px">VT</th><th class="num" style="width:110px">ohne Datensp.</th></tr></thead>
      <tbody>${oeReihen.map(([oe,list])=>`<tr>
        <td><span class="pill link" data-go="organisation:${oe}">${esc(oeName(oe))}</span></td>
        <td><div class="balken" style="margin:0"><i style="width:${Math.round(list.length/mxOE*100)}%"></i></div></td>
        <td class="num">${list.length}</td>
        <td class="num">${list.filter(v=>!(v.dstores||[]).length).length}</td></tr>`).join('')}</tbody></table>

    <div class="sektion-label" style="margin-top:30px;max-width:940px">VT ohne Datenspeicher (${k.ohneDS.length}) — die ersten 25</div>
    <table class="tab">
      <thead><tr><th>Verarbeitungstätigkeit</th><th>Organisationseinheit</th><th style="width:90px">Prozesse</th><th style="width:90px"></th></tr></thead>
      <tbody>${k.ohneDS.slice(0,25).map(v=>`<tr>
        <td><b>${esc(v.uid)}</b> ${esc((v.titel||'').slice(0,58))}</td>
        <td style="color:var(--fg-faint)">${esc(oeName(v.oe))}</td>
        <td class="num">${(v.prozesse||[]).length}</td>
        <td><button class="btn klein" data-go="vvt:${v.id}">öffnen</button></td></tr>`).join('')}</tbody></table>
  </div>`;
}

/* ── Berichte ──────────────────────────────────────────────────────── */
function mBerichte(){
  const v=aktiveVT();
  return `<div class="start-inner">
    <h2 style="font-size:21px;font-weight:600">Berichte</h2>
    <p style="color:var(--fg-mute);margin:6px 0 24px;font-size:13.5px">
      ${v?`Aktive Verarbeitungstätigkeit: <b>${v.uid}</b> — ${esc(v.titel)}`:'Keine Verarbeitungstätigkeit im Kontext — Berichte über den Gesamtbestand sind trotzdem möglich.'}</p>
    <div class="nav-grid">
      ${[
        ['📄','Bericht zur Verarbeitungstätigkeit','VVT-Eintrag, Besonderheiten, Schwellenwert, Risiko und TOM in einem PDF',!!v],
        ['📊','VVT-Export (Art. 30)','Vollständiges Verzeichnis als XLSX für die Aufsichtsbehörde',true],
        ['⚖','DSFA-Dokument','Datenschutz-Folgenabschätzung nach Art. 35 DSGVO als DOCX-Entwurf',!!v],
        ['🔒','TOM-Nachweis','Umsetzungsstand aller Maßnahmen je Organisationseinheit',true],
        ['📋','Tätigkeitsbericht DSB','Jahresbericht mit Kennzahlen und offenen Punkten',true],
        ['🗂','Löschkonzept','Fristen aus den Datenspeichern, gruppiert nach Rechtsgrundlage',true],
      ].map(([i,t,d,ok])=>`<div class="nav-karte" data-bericht="${esc(t)}" style="${ok?'':'opacity:.45'}">
        <div class="nav-ico">${i}</div><div class="nav-titel">${esc(t)}</div>
        <div class="nav-desc">${esc(d)}</div>
        ${ok?'':'<div style="margin-top:9px"><span class="pill warn">VT-Kontext nötig</span></div>'}</div>`).join('')}
    </div>
  </div>`;
}

/* ── Referenzen ────────────────────────────────────────────────────── */
function mReferenzen(){
  return `<div class="start-inner">
    <h2 style="font-size:21px;font-weight:600">Referenzen</h2>
    <p style="color:var(--fg-mute);margin:6px 0 22px;font-size:13.5px">
      Nachschlagewerke, die der Assistent im Betrieb über den MCP-Server <code>dsms-knowledge</code> mitliest.</p>
    <div class="hinweis warn"><b>Nicht angebunden.</b> Umfang und Stand dieser Bestände kennt nur der
      MCP-Server (ChromaDB, <code>bge-m3</code>). Sie hier mit Zahlen aufzuführen hieße, sie zu erfinden.
      Über <code>list_collections</code> ließen sie sich abfragen.</div>
    <div class="sektion" style="margin-top:22px"><div class="sektion-label">Vorgesehene Bestände</div>
      <table class="tab"><thead><tr><th style="width:200px">Quelle</th><th>Inhalt</th></tr></thead><tbody>
        <tr><td><b>LeiKa / OZG</b></td><td>Leistungskatalog, Zuordnung zu Prozessen</td></tr>
        <tr><td><b>BSI IT-Grundschutz</b></td><td>Bausteine und Anforderungen, Mapping auf den TOM-Katalog</td></tr>
        <tr><td><b>SDM</b></td><td>Standard-Datenschutzmodell, Gewährleistungsziele</td></tr>
        <tr><td><b>Aufsichtsbehörden</b></td><td>Tätigkeitsberichte, Orientierungshilfen, Handreichungen</td></tr>
        <tr><td><b>Rechtsprechung</b></td><td>Urteile und Aufsichtsfälle mit Kommunalbezug</td></tr>
      </tbody></table></div>
    <div class="sektion"><div class="sektion-label">Im Bestand vorhanden</div>
      <table class="tab" style="max-width:620px"><tbody>
        <tr><td>TOM-Katalog</td><td class="num"><b>${TOMS.length}</b> Maßnahmen</td></tr>
        <tr><td>Bedrohungskatalog</td><td class="num"><b>${BEDROHUNGEN.length}</b> Bedrohungen</td></tr>
        <tr><td>Kategorien</td><td>${TOM_KATEGORIEN.map(esc).join(' · ')}</td></tr>
      </tbody></table></div>
  </div>`;
}
