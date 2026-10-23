/* ══ Stammdaten: Startseiten, Datenqualität, Listenfilter ════════════
   PLAN-2026-10-23-nexus-wird-kundenansicht, Stufe 2 (Rest).

   Ist in einem Stammdaten-Modul nichts ausgewählt, zeigt die rechte Seite
   eine Startseite: Kennzahlen, Verteilungen und die Prüfungen zur
   Datenqualität. Ein Klick auf eine Verteilung oder eine Prüfung filtert
   die Liste links; der Filter steht über der Liste und lässt sich dort
   wieder aufheben.

   Die Prüfungen folgen denselben Regeln wie GET /api/config/dashboard
   (index.html, Admin), gerechnet aus dem geladenen Bestand (ROH). Der
   Server gibt je Prüfung nur fünf Beispiele heraus — hier stehen alle.
   Dazu kommt „Verweis ins Leere“: Verweise auf OE, Datenarten oder
   Regelungen, die es im Bestand nicht gibt (gefunden beim Rundlauf in
   Stufe 2, 23.10.2026). */

/* ── Prüfungen ─────────────────────────────────────────────────────── */
let _dq=null, _dqRoh=null;
function dqPruefungen(){
  if(!ROH) return null;
  if(_dq && _dqRoh===ROH) return _dq;
  const leer=v=>v==null||v===''||(Array.isArray(v)&&!v.length);
  const oeIds=new Set(ROH.orga.map(o=>o.id));
  const dsIds=new Set(ROH.daten.map(d=>d.id));
  const regIds=new Set(ROH.regelungen.map(r=>r.id));
  const dsVonP=p=>((p.daten||{}).datenspeicher||[]).map(e=>typeof e==='string'?e:(e&&e.id)).filter(Boolean);
  const genutzt=new Set(ROH.prozesse.flatMap(dsVonP));
  const P=ROH.prozesse, D=ROH.daten, R=ROH.regelungen, V=ROH.vvt;
  const procIds=new Set(P.map(p=>p.id));
  const idsVon=l=>(l||[]).map(e=>typeof e==='string'?e:(e&&e.id)).filter(Boolean);
  _dq={
    prozesse:[
      {key:'p-oe',      titel:'Ohne zuständige OE',    liste:P.filter(p=>leer(p.zustaendigeEinheit))},
      {key:'p-ds',      titel:'Ohne Datenspeicher',    liste:P.filter(p=>!dsVonP(p).length)},
      {key:'p-rg',      titel:'Ohne Rechtsgrundlagen', liste:P.filter(p=>leer(p.regelungen))},
      {key:'p-verweis', titel:'Verweis ins Leere',     hinweis:'Zuständige oder beteiligte OE bzw. Datenart fehlt im Bestand',
       liste:P.filter(p=>(p.zustaendigeEinheit&&!oeIds.has(p.zustaendigeEinheit))
                      || (p.beteiligte||[]).some(b=>b&&b.einheit&&!oeIds.has(b.einheit))
                      || dsVonP(p).some(id=>!dsIds.has(id)))},
    ],
    datenspeicher:[
      {key:'d-prozess', titel:'Ohne Prozesszuordnung',     liste:D.filter(d=>!genutzt.has(d.id))},
      {key:'d-stufe',   titel:'Ohne Schutzstufe',          liste:D.filter(d=>leer(d.schutzstufe))},
      {key:'d-bedarf',  titel:'Ohne Schutzbedarf',         liste:D.filter(d=>leer(d.schutzbedarf))},
      {key:'d-vt',      titel:'Ohne Vertraulichkeit',      liste:D.filter(d=>leer(d.vertraulichkeit))},
      {key:'d-frist',   titel:'Ohne Aufbewahrungsfrist',   liste:D.filter(d=>leer((d.aufbewahrung||{}).frist))},
      /* Am 23.10.2026 bei allen 337 leer; pflegen die Kunden (Entscheidung
         Martin, 23.10.2026). Als Punkt an jedem Eintrag sagte das nichts —
         deshalb nur als Karte; im Detail steht „noch nicht gepflegt“. */
      {key:'d-system',  titel:'Ohne Fachverfahren/System', hinweis:'Pflegen die Kunden über „Bearbeiten“', nurKarte:true, liste:D.filter(d=>leer(d.system))},
      {key:'d-verweis', titel:'Verweis ins Leere',         hinweis:'Zuständige OE fehlt im Bestand',
       liste:D.filter(d=>d.zustaendigeEinheit&&!oeIds.has(d.zustaendigeEinheit))},
    ],
    /* VVT (Stufe 3): Referenzprüfung wie GET /api/vvt/_validierung/alle
       (Prozesse, Datenspeicher), dazu die OE; Vollständigkeit nach Art. 30. */
    vvt:[
      {key:'v-verweis', titel:'Verweis ins Leere', hinweis:'Prozess, Datenspeicher oder OE fehlt im Bestand — der Server lehnt das Speichern ab',
       liste:V.filter(v=>idsVon(v.prozesse).some(id=>!procIds.has(id)) || idsVon(v.datenspeicher).some(id=>!dsIds.has(id))
                      || (v.organisationseinheit&&!oeIds.has(v.organisationseinheit)))},
      {key:'v-prozess', titel:'Ohne Prozess',           liste:V.filter(v=>!idsVon(v.prozesse).length)},
      {key:'v-ds',      titel:'Ohne Datenspeicher',     hinweis:'Keine Schutzstufe ableitbar', liste:V.filter(v=>!idsVon(v.datenspeicher).length)},
      {key:'v-rg',      titel:'Ohne Rechtsgrundlage',   liste:V.filter(v=>leer(v.rechtsgrundlage))},
      {key:'v-frist',   titel:'Ohne Löschfrist',        liste:V.filter(v=>leer(v.loeschfrist))},
      {key:'v-kette',   titel:'Kette unvollständig',    hinweis:'Besonderheiten, Schwellwert, Risiko oder TOM fehlt',
       liste:V.filter(v=>!K.bes[v.id]||!K.schwellwert[v.id]||!K.risiko[v.id]||!K.tom[v.id])},
    ],
    regelungen:[
      {key:'r-verweis', titel:'Verweis ins Leere', hinweis:'Zuständige OE oder Nachfolgeregelung fehlt im Bestand',
       liste:R.filter(r=>(r.zustaendigeEinheit&&!oeIds.has(r.zustaendigeEinheit))||(r.ersetzt&&!regIds.has(r.ersetzt)))},
    ],
    luecken:{},
  };
  for(const gruppe of ['prozesse','datenspeicher','regelungen','vvt'])
    _dq[gruppe].filter(p=>!p.nurKarte).forEach(p=>p.liste.forEach(x=>(_dq.luecken[x.id]=_dq.luecken[x.id]||[]).push(p.titel)));
  _dqRoh=ROH;
  return _dq;
}

/* Ampel wie im Admin-Dashboard von index.html: 0 % grün, unter 10 % gelb */
function dqAmpel(n, gesamt){
  const pct=gesamt?100*n/gesamt:0;
  return pct===0?'ok':pct<10?'warn':'err';
}
function dqPunkt(id){
  const l=(dqPruefungen()||{luecken:{}}).luecken[id];
  return l ? `<span class="dq-punkt" title="${esc(l.join(' · '))}" aria-label="Datenqualität: ${esc(l.join(', '))}"></span>` : '';
}
function dqHinweis(id){
  const l=(dqPruefungen()||{luecken:{}}).luecken[id];
  return l ? `<div class="hinweis warn"><b>Datenqualität:</b> ${l.map(esc).join(' · ')}</div>` : '';
}

/* ── Listenfilter ──────────────────────────────────────────────────── */
/* S.lfilter[modul] = {label, ids:Set} (Prüfung) oder {label, feld, wert} (Verteilung) */
function lfAnwenden(modul, arr){
  const f=S.lfilter[modul]; if(!f) return arr;
  return f.ids ? arr.filter(x=>f.ids.has(x.id)) : arr.filter(x=>(x[f.feld]??'—')===f.wert);
}
function lfBalken(modul){
  const f=S.lfilter[modul]; if(!f) return '';
  return `<div class="lf-balken"><span>Filter: <b>${esc(f.label)}</b></span>
    <button class="lf-weg" data-lf-weg="${modul}" aria-label="Filter aufheben" title="Filter aufheben">✕</button></div>`;
}
function lfAktiv(modul, art, wert){
  const f=S.lfilter[modul];
  return !!f && (art==='dq' ? f.key===wert : f.feld===art && f.wert===wert);
}
function uebersichtKnopf(modul){
  return S.auswahl[modul] ? `<button class="btn klein" data-start="${modul}" title="Zur Übersicht">Übersicht</button>` : '';
}

/* ── Bausteine ─────────────────────────────────────────────────────── */
function stKachel(zahl,label,fuss){
  return `<div class="karte"><div class="karte-zahl">${zahl}</div><div class="karte-label">${label}</div>${fuss?`<div class="karte-fuss">${fuss}</div>`:''}</div>`;
}
/* Verteilung als Balken; mit modul und feld wird jede Zeile zum Filter */
function stVerteilung(titel, eintraege, opt={}){
  if(!eintraege.length) return '';
  const max=Math.max(...eintraege.map(e=>e[1]),1);
  const zeile=([wert,n])=>{
    const label=opt.label?opt.label(wert):wert;
    const klick=opt.modul ? ` role="button" tabindex="0" data-lf-feld="${esc(opt.modul)}|${esc(opt.feld)}|${esc(wert)}|${esc(titel.replace(/\s*\(.*\)$/,'')+': '+label)}"` : '';
    return `<div class="st-zeile${opt.modul?' klickbar':''}${opt.modul&&lfAktiv(opt.modul,opt.feld,wert)?' aktiv':''}"${klick}>
      <span class="st-label" title="${esc(label)}">${esc(label)}</span>
      <div class="balken"><i class="${opt.cls?opt.cls(wert):''}" style="width:${Math.round(100*n/max)}%"></i></div>
      <span class="st-n">${n}</span></div>`;
  };
  return `<div class="st-vert"><div class="sektion-label">${esc(titel)}</div>${eintraege.map(zeile).join('')}${opt.rest||''}</div>`;
}
function stZaehlen(arr, f){
  const m={}; arr.forEach(x=>{ const k=f(x)??'—'; m[k]=(m[k]||0)+1; });
  return Object.entries(m);
}
/* Prüfkarten mit Ampel; „Liste filtern“ setzt den Filter links */
function stPruefungen(modul, pruefungen, gesamt, nameF){
  if(!pruefungen) return `<div class="hinweis">Datenqualität nur mit Server: die Prüfungen rechnen auf den Datensätzen der API.</div>`;
  return `<div class="sektion-label" style="margin-top:28px">Datenqualität</div>
  <div class="dq-karten">${pruefungen.map(p=>{
    const amp=dqAmpel(p.liste.length,gesamt);
    const pct=gesamt?Math.round(1000*p.liste.length/gesamt)/10:0;
    return `<div class="dq-karte ${amp}${lfAktiv(modul,'dq',p.key)?' aktiv':''}">
      <div class="dq-kopf"><span class="dq-ampel ${amp}" aria-hidden="true"></span>
        <span class="dq-titel">${esc(p.titel)}</span>
        <span class="dq-zahl">${p.liste.length}<small> (${String(pct).replace('.',',')} %)</small></span></div>
      ${p.hinweis?`<div class="dq-hinweis">${esc(p.hinweis)}</div>`:''}
      ${p.liste.length ? `<ul class="dq-liste">${p.liste.slice(0,6).map(x=>`<li><span class="link" data-go="${modul}:${esc(x.id)}">${esc(nameF(x))}</span></li>`).join('')}</ul>
        <button class="btn klein" data-lf="${modul}|${p.key}">Alle ${p.liste.length} in der Liste zeigen</button>`
        : '<div class="dq-gut">✓ vollständig</div>'}
    </div>`;}).join('')}</div>`;
}
function stHero(ico, titel, text){
  return `<div class="st-hero"><h2>${ico} ${esc(titel)}</h2><p>${text}</p></div>`;
}

/* ── Startseiten ───────────────────────────────────────────────────── */
function startseite(modul){
  const f={organisation:startOrganisation, prozesse:startProzesse,
           datenspeicher:startDatenspeicher, regelungen:startRegelungen, vvt:startVVT}[modul];
  return `<div class="st">${f?f():''}</div>`;
}

function startOrganisation(){
  const o=SITZUNG.org;
  const wurzeln=OE.filter(x=>!x.parent);
  const ebenen=OE.reduce((m,x)=>Math.max(m,tiefe(x)+1),0);
  const jeOE=stZaehlen(PROZESSE,p=>p.oe).filter(([k])=>k!=='—').sort((a,b)=>b[1]-a[1]).slice(0,10);
  const zeile=(l,w)=>`<tr><td style="width:190px;color:var(--fg-mute)">${l}</td><td>${w?esc(w):'<span style="color:var(--fg-ghost)">—</span>'}</td></tr>`;
  const darf=typeof darfPflegen==='function'&&darfPflegen();
  return `${stHero('🏛','Organisation',`${esc(SITZUNG.organisation||'')} · Verwaltungseinheiten und Zuständigkeiten. Einheit im Baum links wählen für Details.`)}
    <div class="karten">${stKachel(OE.length,'Einheiten')}${stKachel(wurzeln.length,'Wurzelebene')}${stKachel(ebenen,'Ebenen')}</div>
    <div class="sektion-label" style="margin-top:28px">Organisationsangaben
      ${o?`<span class="st-knoepfe">
        <button class="btn klein" data-org="bearbeiten"${darf?'':' disabled title="Nur nach Anmeldung"'}>✏ Bearbeiten</button>
        <button class="btn klein" data-org="verlauf">🕘 Verlauf</button></span>`:''}</div>
    ${o?`<table class="tab" style="max-width:720px"><tbody>
      ${zeile('Name',o.name)}${zeile('Kurzname',o.kurzname)}${zeile('Rechtsform',o.rechtsform)}
      ${zeile('Rechtsgrundlage',o.rechtsgrundlage)}${zeile('Gemeindeschlüssel (AGS)',o.gemeindeschluessel)}
      ${zeile('Bundesland',o.bundesland)}${zeile('Kreis',o.kreis)}
      ${zeile('Ansprechpartner',(o.ansprechpartner||{}).name)}${zeile('E-Mail',(o.ansprechpartner||{}).email)}
    </tbody></table>`:'<div class="hinweis">Ohne Server keine Organisationsangaben (koos.yaml).</div>'}
    ${stVerteilung('Prozesse je Einheit (Top 10)', jeOE, {label:oeName})}`;
}

function startProzesse(){
  const dq=dqPruefungen();
  const bereich=stZaehlen(PROZESSE,p=>p.bereich).sort((a,b)=>b[1]-a[1]);
  const status=stZaehlen(PROZESSE,p=>p.status).sort((a,b)=>b[1]-a[1]);
  const jeOE=stZaehlen(PROZESSE,p=>p.oe).sort((a,b)=>b[1]-a[1]);
  const rest=jeOE.slice(10).reduce((s,[,n])=>s+n,0);
  return `${stHero('⚙','Prozesse','Verwaltungsprozesse mit Zuständigkeit, Datenarten und Rechtsgrundlagen. Zeilen anklicken filtert die Liste links.')}
    <div class="karten">${stKachel(PROZESSE.length,'Prozesse')}
      ${stKachel(PROZESSE.filter(p=>(p.status||'aktiv')==='aktiv').length,'aktiv')}
      ${stKachel(PROZESSE.filter(p=>!VVT.some(v=>(v.prozesse||[]).includes(p.id))).length,'ohne VVT-Eintrag')}</div>
    <div class="st-raster">
      ${stVerteilung('Status', status, {modul:'prozesse', feld:'status'})}
      ${stVerteilung('Bereich', bereich, {modul:'prozesse', feld:'bereich'})}
      ${stVerteilung('Zuständige Einheit (Top 10)', jeOE.slice(0,10), {modul:'prozesse', feld:'oe', label:oeName,
         rest:rest?`<div class="st-rest">+ ${rest} weitere in ${jeOE.length-10} Einheiten</div>`:''})}
    </div>
    ${stPruefungen('prozesse', dq&&dq.prozesse, PROZESSE.length, x=>x.titel||x.name||x.id)}`;
}

function startDatenspeicher(){
  const dq=dqPruefungen();
  const ordnung=(liste)=>(a,b)=>{ const i=liste.indexOf(a[0]), j=liste.indexOf(b[0]); return (i<0?99:i)-(j<0?99:j); };
  const stufe=stZaehlen(DSTORES,d=>d.schutz).sort(ordnung(['A','B','C','D','E','—']));
  const bedarf=stZaehlen(DSTORES,d=>d.bedarf).sort(ordnung(['normal','hoch','sehr hoch','—']));
  const vt=stZaehlen(DSTORES,d=>d.vertraul).sort(ordnung(['öffentlich','intern','vertraulich','streng vertraulich','—']));
  const jeOE=stZaehlen(DSTORES,d=>d.oe).sort((a,b)=>b[1]-a[1]);
  const rest=jeOE.slice(10).reduce((s,[,n])=>s+n,0);
  const stufeCls=w=>({C:'warn',D:'err',E:'err','—':'err'})[w]||'';
  const rangCls=w=>({'hoch':'warn','sehr hoch':'err','vertraulich':'warn','streng vertraulich':'err','—':'err'})[w]||'';
  return `${stHero('🗄','Datenspeicher','Datenarten mit Schutzstufe, Schutzbedarf und Aufbewahrung. Zeilen anklicken filtert die Liste links.')}
    <div class="karten">${stKachel(DSTORES.length,'Datenspeicher')}
      ${stKachel(DSTORES.filter(d=>d.schutz).length,'mit Schutzstufe')}
      ${stKachel(DSTORES.filter(d=>d.art9).length,'Schlagwort Art. 9')}</div>
    <div class="st-raster">
      ${stVerteilung('Schutzstufe (Datenschutz A–E)', stufe, {modul:'datenspeicher', feld:'schutz', cls:stufeCls})}
      ${stVerteilung('Schutzbedarf', bedarf, {modul:'datenspeicher', feld:'bedarf', cls:rangCls})}
      ${stVerteilung('Vertraulichkeit', vt, {modul:'datenspeicher', feld:'vertraul', cls:rangCls})}
      ${stVerteilung('Zuständige Einheit (Top 10)', jeOE.slice(0,10), {modul:'datenspeicher', feld:'oe', label:oeName,
         rest:rest?`<div class="st-rest">+ ${rest} weitere in ${jeOE.length-10} Einheiten</div>`:''})}
    </div>
    ${stPruefungen('datenspeicher', dq&&dq.datenspeicher, DSTORES.length, x=>x.name||x.id)}`;
}

function startRegelungen(){
  const dq=dqPruefungen();
  const typ=stZaehlen(REGELUNGEN,r=>r.typ).sort((a,b)=>b[1]-a[1]);
  const status=stZaehlen(REGELUNGEN,r=>r.status).sort((a,b)=>b[1]-a[1]);
  return `${stHero('📋','Regelungen','Satzungen, Dienstanweisungen und Dienstvereinbarungen. Regelung links wählen für den Volltext.')}
    <div class="karten">${stKachel(REGELUNGEN.length,'Regelungen')}${stKachel(typ.length,'Typen')}</div>
    <div class="st-raster">${stVerteilung('Typ', typ)}${stVerteilung('Status', status)}</div>
    ${stPruefungen('regelungen', dq&&dq.regelungen, REGELUNGEN.length, x=>x.name||x.id)}`;
}

function startVVT(){
  const dq=dqPruefungen();
  const status=stZaehlen(VVT,v=>v.status).sort((a,b)=>b[1]-a[1]);
  const jeOE=stZaehlen(VVT,v=>v.oe).sort((a,b)=>b[1]-a[1]);
  const rest=jeOE.slice(10).reduce((s,[,n])=>s+n,0);
  const stufe=stZaehlen(VVT,v=>schutzstufe(v)).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  const komplett=VVT.filter(v=>K.bes[v.id]&&K.schwellwert[v.id]&&K.risiko[v.id]&&K.tom[v.id]).length;
  return `${stHero('📑','Verzeichnis von Verarbeitungstätigkeiten','Art. 30 DSGVO. Eine VVT links wählen — die Auswahl gilt anschließend in allen Datenschutzmodulen. Zeilen anklicken filtert die Liste.')}
    <div class="karten">${stKachel(VVT.length,'Verarbeitungstätigkeiten')}
      ${stKachel(VVT.filter(v=>(v.status||'')==='aktiv').length,'aktiv')}
      ${stKachel(komplett+' / '+VVT.length,'Kette vollständig','Besonderheiten bis TOM')}</div>
    <div class="st-raster">
      ${stVerteilung('Status', status, {modul:'vvt', feld:'status'})}
      ${stVerteilung('Abgeleitete Schutzstufe', stufe, {cls:w=>({C:'warn',D:'err',E:'err','—':'err'})[w]||''})}
      ${stVerteilung('Verantwortliche OE (Top 10)', jeOE.slice(0,10), {modul:'vvt', feld:'oe', label:oeName,
         rest:rest?`<div class="st-rest">+ ${rest} weitere in ${jeOE.length-10} Einheiten</div>`:''})}
    </div>
    ${stPruefungen('vvt', dq&&dq.vvt, VVT.length, x=>`${x.uid} ${x.titel}`)}`;
}

/* Referenzprüfung einer VVT: was im Bestand fehlt, namentlich */
function vvtVerwaist(id){
  if(!ROH) return [];
  const v=ROH.vvt.find(x=>x.id===id); if(!v) return [];
  const p=new Set(ROH.prozesse.map(x=>x.id)), d=new Set(ROH.daten.map(x=>x.id)), o=new Set(ROH.orga.map(x=>x.id));
  const ids=l=>(l||[]).map(e=>typeof e==='string'?e:(e&&e.id)).filter(Boolean);
  return [
    ...ids(v.prozesse).filter(x=>!p.has(x)).map(x=>['Prozess',x]),
    ...ids(v.datenspeicher).filter(x=>!d.has(x)).map(x=>['Datenspeicher',x]),
    ...(v.organisationseinheit&&!o.has(v.organisationseinheit)?[['OE',v.organisationseinheit]]:[]),
  ];
}

/* ── Organisationsangaben pflegen (koos.yaml, PUT api/config/organisation) ── */
PFLEGE.konfig = {label:'Organisationsangaben', roh:()=>[], pfad:()=>'koos.yaml', name:()=>'Organisationsangaben'};

const ORG_FELDER=[
  ['name','Name',true], ['kurzname','Kurzname'], ['rechtsform','Rechtsform','','z. B. Gemeinde, Samtgemeinde, Stadt'],
  ['rechtsgrundlage','Rechtsgrundlage','','z. B. NKomVG § 10'],
  ['gemeindeschluessel','Gemeindeschlüssel (AGS)','','genau 8 Ziffern'], ['bundesland','Bundesland'], ['kreis','Kreis'],
  ['ap_name','Ansprechpartner'], ['ap_email','E-Mail Ansprechpartner'],
];
function orgMaske(){
  const o=SITZUNG.org||{}, ap=o.ansprechpartner||{};
  const wert=k=>k==='ap_name'?ap.name:k==='ap_email'?ap.email:o[k];
  pfDialog('Organisationsangaben bearbeiten',
    `<form class="pf-form" onsubmit="return false">${ORG_FELDER.map(([k,l,p,h])=>`<div class="pf-gruppe">
      <label class="pf-label" for="org-${k}">${esc(l)}${p?'<span class="pf-pflicht"> *</span>':''}</label>
      <input type="${k==='ap_email'?'email':'text'}" id="org-${k}" class="pf-input" value="${esc(wert(k)||'')}"${k==='gemeindeschluessel'?' inputmode="numeric" maxlength="8"':''}>
      ${h?`<div class="pf-hinweis">${esc(h)}</div>`:''}</div>`).join('')}
      <div class="pf-gruppe pf-begruendung"><label class="pf-label" for="pf-begruendung">Begründung der Änderung</label>
        <textarea id="pf-begruendung" class="pf-input" rows="2" placeholder="Steht im Änderungsprotokoll."></textarea></div></form>`,
    `<button class="btn" data-pf="schliessen">Abbrechen</button><button class="btn primary" data-org="speichern">Speichern</button>`);
  document.getElementById('org-name').focus();
}
async function orgSpeichern(){
  const v=k=>document.getElementById('org-'+k).value.trim();
  const meld=[];
  if(!v('name')) meld.push('„Name“ fehlt');
  if(v('gemeindeschluessel') && !/^\d{8}$/.test(v('gemeindeschluessel'))) meld.push('Gemeindeschlüssel: genau 8 Ziffern');
  if(v('ap_email') && !v('ap_email').includes('@')) meld.push('E-Mail-Adresse ungültig');
  if(meld.length){ pfMeldung(meld.join(' · ')); return; }
  const body={};
  ['name','kurzname','rechtsform','rechtsgrundlage','gemeindeschluessel','bundesland','kreis'].forEach(k=>body[k]=v(k));
  body.ansprechpartner={name:v('ap_name'), email:v('ap_email')};
  const begr=(document.getElementById('pf-begruendung').value||'').trim();
  if(begr) body._begruendung=begr;
  const knopf=document.querySelector('#pf-dialog [data-org="speichern"]');
  knopf.disabled=true; knopf.textContent='Speichert …';
  try{
    const r=await fetch('api/config/organisation',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok) throw new Error(await pfFehlertext(r));
    const a=await r.json();
    pfSchliessen();
    await sitzungLaden();
    renderModul();
    toast(a.gespeichert===false?'Keine Änderung — nichts gespeichert':'Organisationsangaben gespeichert');
  }catch(e){
    knopf.disabled=false; knopf.textContent='Speichern';
    pfMeldung('Nicht gespeichert: '+e.message);
  }
}

/* ── Ereignisse ────────────────────────────────────────────────────── */
function lfSetzen(modul, filter){
  const alt=S.lfilter[modul];
  const gleich=alt && filter && alt.label===filter.label;
  S.lfilter[modul]=gleich?null:filter;
  S.limit[modul]=120;
  renderModul();
  document.querySelector('.liste-scroll')?.scrollTo(0,0);
}
document.addEventListener('click', e=>{
  const t=e.target;
  const lf=t.closest('[data-lf]');
  if(lf){
    const [modul,key]=lf.dataset.lf.split('|');
    const p=(dqPruefungen()||{})[modul]?.find(x=>x.key===key); if(!p) return;
    lfSetzen(modul,{label:p.titel, key, ids:new Set(p.liste.map(x=>x.id))});
    return;
  }
  const lff=t.closest('[data-lf-feld]');
  if(lff){
    const [modul,feld,wert,label]=lff.dataset.lfFeld.split('|');
    lfSetzen(modul,{label, feld, wert});
    return;
  }
  const weg=t.closest('[data-lf-weg]');
  if(weg){ lfSetzen(weg.dataset.lfWeg,null); return; }
  const st=t.closest('[data-start]');
  if(st){ S.auswahl[st.dataset.start]=null; renderModul(); return; }
  const org=t.closest('[data-org]');
  if(org && !org.disabled){
    ({bearbeiten:()=>darfPflegen()&&orgMaske(), speichern:orgSpeichern,
      verlauf:()=>pfVerlauf('konfig','Organisationsangaben')}[org.dataset.org]||(()=>{}))();
  }
});
document.addEventListener('keydown', e=>{
  if((e.key==='Enter'||e.key===' ') && e.target.matches && e.target.matches('[data-lf-feld]')){ e.preventDefault(); e.target.click(); }
});
