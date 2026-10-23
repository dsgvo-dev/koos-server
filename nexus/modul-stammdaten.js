/* ══ Modul-Renderer ═══════════════════════════════════════════════════ */
function renderModul(){
  const el=$('#work');
  const f=({
    start:mStart, organisation:mOrganisation, prozesse:mProzesse,
    datenspeicher:mDatenspeicher, regelungen:mRegelungen, vvt:mVVT,
    besonderheiten:mBesonderheiten, schwellenwert:mSchwellenwert,
    risiko:mRisiko, tom:mTOM, dsfa:mDSFA, dashboard:mDashboard, berichte:mBerichte,
    referenzen:mReferenzen, audit:mAudit, admin:mAdmin, verknuepfungen:mVerknuepfungen
  })[S.modul] || (()=>'<div class="leer-hinweis">Modul nicht gefunden</div>');
  el.innerHTML=`<div class="modul active">${f()}</div>`;

  /* Zeigt das Modul eine Verarbeitungstätigkeit im Einzelnen, wird ihr
     vollständiger Kettensatz nachgeholt und einmal neu gezeichnet. */
  if(typeof ketteVervollstaendigen==='function') ketteVervollstaendigen();

  /* Die Listenspalte kostet bei schmalen Fenstern den halben Platz. Der
     Knopf wird nachträglich angehängt, damit er nicht in jeden der neun
     Modul-Renderer einzeln geschrieben werden muss. */
  const kopf=el.querySelector('.liste-kopf, .kette-kopf');
  if(kopf){
    const b=document.createElement('button');
    b.className='spalten-btn'; b.id='spalte-zu-btn';
    b.title='Spalte einklappen'; b.setAttribute('aria-label','Listenspalte einklappen');
    b.textContent='⟨';
    kopf.appendChild(b);
    const strip=document.createElement('div');
    strip.className='spalte-auf'; strip.id='spalte-auf-btn';
    strip.title='Spalte ausklappen'; strip.setAttribute('role','button');
    strip.setAttribute('aria-label','Listenspalte ausklappen');
    strip.innerHTML='<span>⟩ '+esc(spaltenName())+'</span>';
    el.querySelector('.modul').insertBefore(strip, el.querySelector('.modul').firstChild);
  } else {
    document.body.classList.remove('spalte-zu');
  }
  griffeAnlegen();
}
function spaltenName(){
  return ({organisation:'Einheiten', prozesse:'Prozesse', datenspeicher:'Datenspeicher',
           regelungen:'Regelungen', vvt:'VVT'})[S.modul] || 'Kette';
}

/* ── Start ─────────────────────────────────────────────────────────── */
/* Alle Kennzahlen der Oberfläche werden hier gemessen — aus dem geladenen
   Bestand, ohne Schätzung. Was sich nicht messen lässt, taucht als Kachel
   „keine Datenquelle" auf, nicht als Zahl. */
function herkunftHinweis(){
  const el=document.getElementById('datenstand'); const art=el?el.className:'';
  const stil='text-transform:none;letter-spacing:0;font-weight:400;color:var(--fg-ghost)';
  if(art==='live') return `<span style="${stil}">— aus den Quelldateien in diesem Moment gezählt</span>`;
  if(art==='snapshot') return `<span style="${stil}">— aus der Momentaufnahme ${esc((DATENSTAND_META&&DATENSTAND_META.erzeugt)||'')}; ⟳ liest die Quelldateien</span>`;
  return `<span style="${stil}">— aus Notdaten, nicht belastbar</span>`;
}
function kennzahlen(){
  const aktiv = VVT.filter(v=>String(v.status||'').toLowerCase()==='aktiv');
  const ohneProzess = VVT.filter(v=>!(v.prozesse||[]).length);
  const ohneDS      = VVT.filter(v=>!(v.dstores||[]).length);
  /* Die TOM-Zuordnung ist seit der 9-Schritte-Vorgehensweise nicht mehr das
     Frontmatter-Feld `tom`, sondern die Datei tom-[vvt-id].json. Das alte Feld
     ist überall leer und wäre als Kennzahl irreführend. */
  const ohneTOM     = VVT.filter(v=>!K.tom[v.id]);
  const ohneKette   = VVT.filter(v=>!K.bes[v.id]||!K.risiko[v.id]||!K.schwellwert[v.id]||!K.tom[v.id]);
  const ohneLeika   = VVT.filter(v=>!v.leika);
  const procOhneVVT = PROZESSE.filter(p=>!VVT.some(v=>(v.prozesse||[]).includes(p.id)));
  const dsOhneVVT   = DSTORES.filter(d=>!VVT.some(v=>(v.dstores||[]).includes(d.id)));
  const dsfaPflicht=Object.values(K.schwellwert).filter(w=>w.dsfa_pflicht_gesamt).length;
  const risikoHoch =Object.values(K.risiko).filter(r=>['hoch','sehr hoch'].includes(((r.basis_risiko||{}).schutzbedarf||'').toLowerCase())).length;
  const tomIstGepflegt=Object.values(K.tom).filter(t=>(t.ist||[]).length).length;
  const dsfaOffen  =Object.values(K.dsfa).filter(d=>((d.ergebnis||{}).bewertung||'offen')==='offen').length;
  return {aktiv, ohneProzess, ohneDS, ohneTOM, ohneKette, ohneLeika, procOhneVVT, dsOhneVVT,
          dsfaPflicht, risikoHoch, tomIstGepflegt, dsfaOffen};
}

function mStart(){
  const k=kennzahlen();
  const kachel=(zahl,label,fuss,cls)=>`<div class="karte"><div class="karte-zahl${cls?' '+cls:''}">${zahl}</div>
    <div class="karte-label">${label}</div>${fuss?`<div class="karte-fuss">${fuss}</div>`:''}</div>`;
  return `<div class="start-inner">
    <div class="start-hero">
      <h1>${esc(SITZUNG.organisation||'Kommunalverwaltung')}</h1>
      <p>Gemeinsame Oberfläche für Organisationsdaten (KOOS) und Datenschutzdokumentation (DSMS/TOM).
         Der Vorgangskontext bleibt über alle Module hinweg erhalten; der Assistent löst ihn sonst
         aus der Frage auf.</p>
    </div>

    <div class="sektion-label" style="margin:26px 0 10px;max-width:1000px">Bestand</div>
    <div class="karten">
      ${kachel(OE.length,'Organisationseinheiten')}
      ${kachel(PROZESSE.length,'Prozesse')}
      ${kachel(DSTORES.length,'Datenspeicher')}
      ${kachel(VVT.length,'Verarbeitungstätigkeiten',`davon ${k.aktiv.length} aktiv`)}
      ${kachel(REGELUNGEN.length,'Regelungen')}
    </div>

    <div class="sektion-label" style="margin:30px 0 10px;max-width:1000px">Schutzstufen der Datenspeicher ${herkunftHinweis()}</div>
    <div style="max-width:940px">
      ${(()=>{
        const st={A:0,B:0,C:0,D:0,E:0}; let ohne=0;
        DSTORES.forEach(d=>{ if(st[d.schutz]!=null) st[d.schutz]++; else ohne++; });
        const max=Math.max(...Object.values(st),ohne,1);
        const zeile=(label,n,cls)=>`<div style="display:flex;align-items:center;gap:10px;margin:5px 0">
          <span class="pill ${cls}" style="width:78px;text-align:center">${label}</span>
          <div class="balken" style="flex:1;margin:0"><i style="width:${Math.round(n/max*100)}%"></i></div>
          <span class="num" style="width:46px;text-align:right;font-variant-numeric:tabular-nums">${n}</span></div>`;
        return Object.entries(st).map(([se,n])=>zeile('Stufe '+se,n,se==='E'||se==='D'?'err':se==='C'?'warn':'')).join('')
             + zeile('nicht ableitbar',ohne,'err');
      })()}
      <div style="margin-top:12px"><button class="btn klein" data-go="dashboard:">Volle Auswertung im Dashboard \u2192</button></div>
    </div>

    <div class="sektion-label" style="margin:30px 0 10px;max-width:1000px">Gemessene Lücken ${herkunftHinweis()}</div>
    <div class="karten">
      ${kachel(k.ohneDS.length,'VT ohne Datenspeicher','<span class="pill err">keine Schutzstufe ableitbar</span>')}
      ${kachel(k.ohneProzess.length,'VT ohne Prozessbezug',
               `<span class="pill warn">${k.aktiv.filter(v=>!(v.prozesse||[]).length).length} davon aktiv</span>`)}
      ${kachel(k.ohneKette.length,'VT ohne vollständige Kette',
               `<span class="pill ${k.ohneKette.length?'warn':'ok'}">Schritte 3–5 je Datei</span>`)}
      ${kachel(k.ohneLeika.length,'VT ohne LeiKa-ID')}
      ${kachel(k.procOhneVVT.length,'Prozesse ohne VVT-Eintrag','<span class="pill warn">Art. 30 DSGVO</span>')}
    </div>

    <div class="sektion-label" style="margin:30px 0 10px;max-width:1000px">Datenschutzkette ${herkunftHinweis()}</div>
    <div class="karten">
      ${kachel(Object.keys(K.bes).length+' / '+VVT.length,'Besonderheiten')}
      ${kachel(Object.keys(K.schwellwert).length+' / '+VVT.length,'Schwellwertanalyse',
               `<span class="pill ${k.dsfaPflicht?'warn':''}">${k.dsfaPflicht} mit DSFA-Pflicht</span>`)}
      ${kachel(Object.keys(K.risiko).length+' / '+VVT.length,'Risikoanalyse',
               `<span class="pill warn">${k.risikoHoch} mit hohem Schutzbedarf</span>`)}
      ${kachel(Object.keys(K.tom).length+' / '+VVT.length,'TOM-Zuordnung',
               `<span class="pill ${k.tomIstGepflegt?'':'err'}">${k.tomIstGepflegt} mit IST-Status</span>`)}
      ${kachel(Object.keys(K.dsfa).length+' / '+VVT.length,'DSFA',
               `<span class="pill ${k.dsfaOffen?'warn':'ok'}">${k.dsfaOffen} Bewertung offen</span>`)}
    </div>
    <div class="hinweis" style="margin-top:16px">
      Schritt 8 der Vorgehensweise — der <b>IST-Status der Maßnahmen</b> — liegt bei den Fachämtern
      und ist in ${VVT.length-k.tomIstGepflegt} von ${VVT.length} Zuordnungen noch leer. Ohne ihn bleibt das
      Delta rechnerisch gleich dem SOLL, und das Restrisiko in der ergänzenden Analyse steht auf „offen".
    </div>



    <div class="sektion-label" style="margin-top:30px;max-width:1000px">Bereiche</div>
    <div class="nav-grid">
      ${GRUPPEN.slice(1).flatMap(g=>g.module).map(m=>`
        <div class="nav-karte" data-modul="${m.id}">
          <div class="nav-ico">${m.ico}</div>
          <div class="nav-titel">${esc(m.name)}</div>
          <div class="nav-desc">${esc(MODUL_DESC[m.id]||'')}</div>
        </div>`).join('')}
    </div>
  </div>`;
}
const MODUL_DESC={
  organisation:'Ämterbaum, Rollen und Sonderfunktionen nach NKomVG',
  prozesse:'Verwaltungsprozesse mit Zuständigkeit, LeiKa-Bezug und Datenarten',
  datenspeicher:'Datenarten, Schutzstufen und Aufbewahrungsfristen',
  regelungen:'Satzungen, Dienstanweisungen und Dienstvereinbarungen',
  vvt:'Verzeichnis von Verarbeitungstätigkeiten nach Art. 30 DSGVO',
  besonderheiten:'Bewertungsbogen: besondere Datenkategorien, Cloud, KI, MS365',
  schwellenwert:'DSFA-Pflichtprüfung nach LfD Niedersachsen und Art. 35 DSGVO',
  risiko:'Schadenshöhe × Eintrittswahrscheinlichkeit je Verarbeitungstätigkeit',
  tom:'Bedrohungen und technisch-organisatorische Maßnahmen mit Umsetzungsstand',
  dsfa:'Datenschutz-Folgenabschätzung nach Art. 35 DSGVO',
  dashboard:'Verteilungen, Lücken und Bearbeitungsfortschritt',
  verknuepfungen:'Prozesse, Verarbeitungstätigkeiten und Datenspeicher als Graph',
  berichte:'VT-Bericht, VVT-Export und DSFA-Dokument erzeugen',
  referenzen:'LeiKa/OZG, BSI-Grundschutz und Aufsichtsbehörden-Hinweise',
  audit:'Git-Historie mit Diff und Rückgängig-Funktion',
  admin:'Nutzer, Rollen, Import/Export und Systemstatus',
};

/* ── Organisation ──────────────────────────────────────────────────── */
function mOrganisation(){
  const sel=S.auswahl.organisation;
  const kinder=p=>OE.filter(o=>o.parent===p);
  const baum=p=>`<ul${p===null?' class="baum" role="tree"':' role="group"'}>${kinder(p).map(o=>`
      <li role="treeitem" aria-selected="${o.id===sel}">
        <div class="baum-row${o.id===sel?' active':''}" data-oe="${o.id}" style="padding-left:${(tiefe(o)*14)+10}px">
          <span class="baum-arrow">${kinder(o.id).length?'▾':''}</span>
          <span class="baum-name">${esc(o.name)}</span>
        </div>${kinder(o.id).length?baum(o.id):''}
      </li>`).join('')}</ul>`;
  const o=OE.find(x=>x.id===sel);
  const procs=PROZESSE.filter(p=>p.oe===sel);
  const vts=VVT.filter(v=>v.oe===sel);
  return `
  <div class="liste">
    <div class="liste-kopf"><div><p>Organisationseinheiten</p><span>${esc(SITZUNG.organisation||'')}</span></div>
      <span class="kopf-knoepfe">${uebersichtKnopf('organisation')}${pflegeNeuKnopf('oe')}</span></div>
    <div class="liste-scroll">${baum(null)}</div>
  </div>
  <div class="detail">
    ${!o?startseite('organisation'):`
    <h2>${esc(o.name)}</h2>
    <div class="detail-id">${o.id}${o.parent?' · übergeordnet: '+esc(oeName(o.parent)):' · Wurzel'}</div>
    <div class="aktionsleiste" style="margin:0 0 22px;padding:0;border:none">
      <button class="btn klein" data-setkontext="oe:${o.id}">Als Kontext setzen</button>
      <button class="btn klein" data-frage="Welche Verarbeitungstätigkeiten verantwortet ${o.name.replace(/"/g,'')}?">Assistent fragen</button>
      ${pflegeKnoepfe('oe',o.id)}
    </div>
    ${o.hinweis?`<div class="hinweis">${esc(o.hinweis)}</div>`:''}
    <div class="sektion"><div class="sektion-label">Rollen</div>
      <div class="pill-reihe">${(o.rollen||[]).map(r=>`<span class="pill">${esc(r)}</span>`).join('')||'<span style="color:var(--fg-ghost);font-size:13px">keine</span>'}</div></div>
    ${(o.sonder||[]).length?`<div class="sektion"><div class="sektion-label">Sonderfunktionen</div>
      <div class="pill-reihe">${o.sonder.map(r=>`<span class="pill info">${esc(r)}</span>`).join('')}</div></div>`:''}
    <div class="sektion"><div class="sektion-label">Verknüpft — Prozesse (${procs.length})</div>
      <div class="pill-reihe">${procs.slice(0,60).map(p=>`<span class="pill link" data-go="prozesse:${p.id}">${esc(p.name)}</span>`).join('')||'<span style="color:var(--fg-ghost);font-size:13px">keine</span>'}
      ${procs.length>60?`<span class="pill">… ${procs.length-60} weitere</span>`:''}</div></div>
    <div class="sektion"><div class="sektion-label">Verknüpft — Verarbeitungstätigkeiten (${vts.length})</div>
      <div class="pill-reihe">${vts.slice(0,40).map(v=>`<span class="pill link" data-go="vvt:${v.id}">${esc(v.uid)} ${esc((v.titel||'').slice(0,44))}</span>`).join('')||'<span style="color:var(--fg-ghost);font-size:13px">keine</span>'}
      ${vts.length>40?`<span class="pill">… ${vts.length-40} weitere</span>`:''}</div></div>
    <div class="sektion"><div class="sektion-label">Verknüpft — Datenspeicher in Zuständigkeit</div>
      <div class="pill-reihe">${DSTORES.filter(x=>x.oe===sel).slice(0,40).map(x=>`<span class="pill link" data-go="datenspeicher:${x.id}">${esc(x.name)} · ${x.schutz}</span>`).join('')||'<span style="color:var(--fg-ghost);font-size:13px">keine</span>'}</div></div>
    <div class="sektion"><div class="sektion-label">Untereinheiten</div>
      <div class="pill-reihe">${kinder(o.id).map(k=>`<span class="pill link" data-oe="${k.id}">${esc(k.name)}</span>`).join('')||'<span style="color:var(--fg-ghost);font-size:13px">keine</span>'}</div></div>
    `}
  </div>`;
}
function tiefe(o){ let t=0,c=o; while(c&&c.parent){ c=OE.find(x=>x.id===c.parent); t++; } return t; }

/* ── Prozesse ──────────────────────────────────────────────────────── */
function mProzesse(){
  const sel=S.auswahl.prozesse, p=procById(sel);
  const vts=p?VVT.filter(v=>(v.prozesse||[]).includes(p.id)):[];
  const g=filtern('prozesse',lfAnwenden('prozesse',PROZESSE),x=>x.name+' '+oeName(x.oe)+' '+(x.leika||'')+' '+(x.ozg||''));
  return `
  <div class="liste">
    <div class="liste-kopf"><div><p>Prozesse</p><span>${g.treffer.length} von ${PROZESSE.length}</span></div><span class="kopf-knoepfe">${uebersichtKnopf('prozesse')}${pflegeNeuKnopf('prozess')}</span></div>
    <div class="liste-suche"><input type="search" placeholder="Prozesse suchen …" data-filter="prozesse" value="${esc(S.filter.prozesse)}"></div>
    ${lfBalken('prozesse')}
    <div class="liste-scroll">${g.sichtbar.map(x=>`
      <div class="li${x.id===sel?' active':''}" data-prozess="${x.id}">
        <div class="li-txt"><div class="li-name">${esc(x.name)}</div>
        <div class="li-sub">${dqPunkt(x.id)}<span>${esc(oeName(x.oe))}</span>
        ${x.leika?`<span class="pill">LeiKa ${x.leika}</span>`:''}${x.ozg?`<span class="pill">OZG ${x.ozg}</span>`:''}</div></div>
      </div>`).join('')||'<div class="leer-hinweis" style="padding:26px">Keine Treffer</div>'}
      ${mehrBtn('prozesse',g)}</div>
  </div>
  <div class="detail">
    ${!p?startseite('prozesse'):`
    <h2>${esc(p.name)}</h2>
    <div class="detail-id">${p.id}${p.status?' · '+esc(p.status):''}${p.bereich?' · '+esc(p.bereich):''}</div>
    <div class="aktionsleiste" style="margin:0 0 22px;padding:0;border:none">
      <button class="btn klein" data-setkontext="prozess:${p.id}">Als Kontext setzen</button>
      <button class="btn klein" data-frage="Ist der Prozess ${p.name.replace(/"/g,'')} im VVT abgebildet?">Assistent fragen</button>
      ${pflegeKnoepfe('prozess',p.id)}
    </div>
    ${dqHinweis(p.id)}
    <div class="hinweis" style="margin-top:-6px">Die besonderen Kategorien nach Art. 9 DSGVO sind im Bestand
      <b>kein eigenes Feld</b>. Angezeigt wird nur, ob Name, Datenkategorie oder Schlagworte ein einschlägiges
      Wort enthalten. Ein fehlender Treffer heißt nicht, dass keine besonderen Kategorien verarbeitet werden —
      eine Jugendhilfeakte etwa enthält regelmäßig Gesundheits- und Sozialdaten, ohne dass eines dieser
      Wörter im Namen steht.</div>

    <div class="sektion"><div class="sektion-label">Zuordnung</div>
      <div class="form-grid drei">
        <div class="feld"><div class="feld-label">Zuständige Einheit</div>
          <div class="feld-wert"><span class="pill link" data-go="organisation:${p.oe}">${esc(oeName(p.oe))}</span></div></div>
        <div class="feld"><div class="feld-label">LeiKa-ID</div><div class="feld-wert">${p.leika||'—'}</div></div>
        <div class="feld"><div class="feld-label">OZG-ID</div><div class="feld-wert">${p.ozg||'—'}</div></div>
      </div>
      ${(p.beteiligte||[]).length?`<div class="feld" style="margin-top:12px"><div class="feld-label">Beteiligte Einheiten</div>
        <div class="pill-reihe" style="margin-top:4px">${p.beteiligte.map(b=>`<span class="pill link" data-go="organisation:${b}">${esc(oeName(b))}</span>`).join('')}</div></div>`:''}
    </div>
    <div class="sektion"><div class="sektion-label">Verknüpft — Datenspeicher (${(p.dstores||[]).length})</div>
      <div class="pill-reihe">${(p.dstores||[]).map(d=>`<span class="pill link${(dsById(d)||{}).schutz==='D'?' err':(dsById(d)||{}).schutz==='C'?' warn':''}" data-go="datenspeicher:${d}">${esc((dsById(d)||{}).name||d)} · ${((dsById(d)||{}).schutz)||'?'}</span>`).join('')||'—'}</div></div>
    <div class="sektion"><div class="sektion-label">Verknüpft — Verarbeitungstätigkeiten (${vts.length})</div>
      <div class="pill-reihe">${vts.map(v=>`<span class="pill link" data-go="vvt:${v.id}">${v.uid} ${esc(v.titel.slice(0,50))}</span>`).join('')||'<span style="color:var(--fg-ghost);font-size:13px">keine — der Prozess ist im VVT nicht referenziert</span>'}</div></div>
    ${(p.regelungen||[]).length?`<div class="sektion"><div class="sektion-label">Rechtsgrundlagen</div>
      <div class="pill-reihe">${p.regelungen.map(r=>`<span class="pill">${esc(r)}</span>`).join('')}</div></div>`:''}
    ${(p.sch||[]).length?`<div class="sektion"><div class="sektion-label">Prozessschritte</div>
      <ol style="margin-left:18px;font-size:13px;line-height:1.9;color:var(--fg-mute)">
        ${p.sch.map(i=>`<li>${esc((SCHRITTE[i]||'').replace(/^\\d+\\s*/,''))}</li>`).join('')}</ol></div>`:''}
    `}
  </div>`;
}

/* ── Datenspeicher ─────────────────────────────────────────────────── */
const BSI_RANG={'normal':1,'hoch':2,'sehr hoch':3};
function bsiCls(w){ return ({1:'',2:'warn',3:'err'})[BSI_RANG[w]||0]||''; }
const STUFE_RANG={A:1,B:2,C:3,D:4,E:5};

/* Auffälligkeiten zwischen den beiden Sichten. Sie sind kein Fehler — die
   Skalen messen Verschiedenes —, aber sie sind der Ansatzpunkt für die
   fachliche Durchsicht. */
function divergenz(d){
  const st=STUFE_RANG[d.schutz]||0, i=BSI_RANG[d.bsiI]||0, a=BSI_RANG[d.bsiA]||0, v=BSI_RANG[d.bsiV]||0;
  const out=[];
  if(st>=4 && i<=1) out.push('Datenschutz-Stufe '+d.schutz+', aber BSI-Integrität normal — eine unbemerkte Verfälschung träfe hier unmittelbar Entscheidungen über Menschen.');
  if(st>=4 && a<=1) out.push('Datenschutz-Stufe '+d.schutz+', aber BSI-Verfügbarkeit normal — trägt die Aufgabenerfüllung einen Ausfall wirklich?');
  if(st<=2 && i>=2) out.push('Niedrige Datenschutz-Stufe bei erhöhter Integritätsanforderung — plausibel bei amtlichen Veröffentlichungen, sonst zu begründen.');
  if(st>=4 && v<=1) out.push('Datenschutz-Stufe '+d.schutz+', aber BSI-Vertraulichkeit normal — für die Institution folgenlos, für die Betroffenen nicht.');
  return out;
}

function mDatenspeicher(){
  const sel=S.auswahl.datenspeicher, d=dsById(sel);
  const vts=d?VVT.filter(v=>(v.dstores||[]).includes(d.id)):[];
  const procs=d?PROZESSE.filter(p=>(p.dstores||[]).includes(d.id)):[];
  const stufeCls={A:'',B:'',C:'warn',D:'err',E:'err'};
  const g=filtern('datenspeicher',lfAnwenden('datenspeicher',DSTORES),x=>x.name+' '+(x.tags||[]).join(' '));
  return `
  <div class="liste">
    <div class="liste-kopf"><div><p>Datenspeicher</p><span>${g.treffer.length} von ${DSTORES.length}</span></div><span class="kopf-knoepfe">${uebersichtKnopf('datenspeicher')}${pflegeNeuKnopf('daten')}</span></div>
    <div class="liste-suche"><input type="search" placeholder="Datenarten suchen …" data-filter="datenspeicher" value="${esc(S.filter.datenspeicher)}"></div>
    ${lfBalken('datenspeicher')}
    <div class="liste-scroll">${g.sichtbar.map(x=>`
      <div class="li${x.id===sel?' active':''}" data-dstore="${x.id}">
        <div class="li-txt"><div class="li-name">${esc(x.name)}</div>
        <div class="li-sub">${dqPunkt(x.id)}<span class="pill ${stufeCls[x.schutz]||''}">Stufe ${esc(x.schutz||'?')}</span>
        <span class="pill ${bsiCls(x.bsiBedarf)}">BSI ${esc(x.bsiBedarf||'?')}</span>
        ${x.art9?'<span class="pill err">Art. 9</span>':''}
        ${divergenz(x).length?'<span class="pill warn" title="Datenschutz und BSI laufen auseinander">⚠</span>':''}</div></div>
      </div>`).join('')||'<div class="leer-hinweis" style="padding:26px">Keine Treffer</div>'}
      ${mehrBtn('datenspeicher',g)}</div>
  </div>
  <div class="detail">
    ${!d?startseite('datenspeicher'):`
    <h2>${esc(d.name)}</h2>
    <div class="detail-id">${d.id}${d.bereich?' · '+esc(d.bereich):''}</div>
    <div class="aktionsleiste" style="margin:0 0 22px;padding:0;border:none">${pflegeKnoepfe('daten',d.id)}</div>
    ${dqHinweis(d.id)}
    <div class="hinweis">Die Schutzstufe wird gemäß <b>Richtlinie zur Datenklassifizierung</b> (Punkt 4.2)
      ausschließlich hier am Datenspeicher geführt. Verarbeitungstätigkeiten leiten sie nach dem
      Maximumprinzip ab.</div>
    <div class="sektion"><div class="sektion-label">Datenschutz — Schaden für die betroffene Person</div>
      <div class="form-grid drei">
        <div class="feld"><div class="feld-label">Schutzstufe (LfD)</div><div class="feld-wert"><span class="pill ${stufeCls[d.schutz]||''}">Stufe ${esc(d.schutz||'—')}</span></div></div>
        <div class="feld"><div class="feld-label">Schutzbedarf (SDM)</div><div class="feld-wert">${esc(d.bedarf||'—')}</div></div>
        <div class="feld"><div class="feld-label">Vertraulichkeitsklasse</div><div class="feld-wert">${esc(d.vertraul||'—')}</div></div>
      </div></div>

    <div class="sektion"><div class="sektion-label">Informationssicherheit — Schaden für die Institution (BSI)</div>
      <div class="form-grid" style="grid-template-columns:repeat(4,1fr)">
        ${[['Vertraulichkeit',d.bsiV],['Integrität',d.bsiI],['Verfügbarkeit',d.bsiA],['Schutzbedarf (Maximum)',d.bsiBedarf]]
          .map(([n,w])=>`<div class="feld"><div class="feld-label">${n}</div>
            <div class="feld-wert"><span class="pill ${bsiCls(w)}">${esc(w||'—')}</span></div></div>`).join('')}
      </div>
      ${divergenz(d).length?`<div class="hinweis warn" style="margin-top:14px">
        <b>Zu prüfen:</b> ${divergenz(d).map(esc).join('<br>')}</div>`:''}
    </div>

    <div class="sektion"><div class="sektion-label">Zuordnung</div>
      <div class="form-grid drei">
        <div class="feld"><div class="feld-label">Zuständige Einheit</div><div class="feld-wert"><span class="pill link" data-go="organisation:${d.oe}">${esc(oeName(d.oe))}</span></div></div>
        <div class="feld"><div class="feld-label">Hinweis auf Art. 9 DSGVO</div><div class="feld-wert">${
          d.art9wort?`<span class="pill err">Schlagwort „${esc(d.art9wort)}"</span>`
                    :'<span class="pill unbekannt">kein Schlagworttreffer — nicht geprüft</span>'}</div></div>
      </div></div>
    ${(d.rg||[]).length?`<div class="sektion"><div class="sektion-label">Rechtsgrundlagen</div>
      <div class="pill-reihe">${d.rg.map(r=>`<span class="pill">${esc(r)}</span>`).join('')}</div></div>`:''}
    <div class="sektion"><div class="sektion-label">Aufbewahrung</div><div class="feld-wert">${esc(d.frist)}</div></div>
    ${(d.tags||[]).length?`<div class="sektion"><div class="sektion-label">Schlagworte</div>
      <div class="pill-reihe">${d.tags.map(t=>`<span class="pill">${esc(t)}</span>`).join('')}</div></div>`:''}
    <div class="sektion"><div class="sektion-label">Verknüpft — Prozesse</div>
      <div class="pill-reihe">${procs.map(p=>`<span class="pill link" data-go="prozesse:${p.id}">${esc(p.name)}</span>`).join('')||'—'}</div></div>
    <div class="sektion"><div class="sektion-label">Verknüpft — Verarbeitungstätigkeiten</div>
      <div class="pill-reihe">${vts.map(v=>`<span class="pill link" data-go="vvt:${v.id}">${v.uid} ${esc(v.titel.slice(0,44))}</span>`).join('')||'—'}</div></div>
    `}
  </div>`;
}

/* ── Regelungen ────────────────────────────────────────────────────── */
function mRegelungen(){
  const sel=S.auswahl.regelungen, r=regById(sel);
  const liste=lfAnwenden('regelungen',REGELUNGEN);
  return `
  <div class="liste">
    <div class="liste-kopf"><div><p>Regelungen</p><span>${liste.length===REGELUNGEN.length?REGELUNGEN.length+' Dokumente':liste.length+' von '+REGELUNGEN.length}</span></div><span class="kopf-knoepfe">${uebersichtKnopf('regelungen')}${pflegeNeuKnopf('regelung')}</span></div>
    ${lfBalken('regelungen')}
    <div class="liste-scroll">${liste.map(x=>`
      <div class="li${x.id===sel?' active':''}" data-regelung="${x.id}">
        <div class="li-txt"><div class="li-name">${esc(x.name)}</div>
        <div class="li-sub">${dqPunkt(x.id)}<span class="pill">${esc(x.typ||'')}</span><span>${esc(x.stand||'')}</span></div></div>
      </div>`).join('')}</div>
  </div>
  <div class="detail">
    ${!r?startseite('regelungen'):`
    <h2>${esc(r.name)}</h2>
    <div class="detail-id">${r.id} · ${esc(r.typ||'')} · Stand ${esc(r.stand||'')} · federführend ${esc(oeName(r.oe))}${r.status?' · '+esc(r.status):''}</div>
    <div class="aktionsleiste" style="margin:0 0 22px;padding:0;border:none">${pflegeKnoepfe('regelung',r.id)}</div>
    ${dqHinweis(r.id)}
    ${r.gremium?`<div class="sektion"><div class="sektion-label">Entscheidendes Gremium</div>
      <div class="feld-wert">${esc(r.gremium)}</div></div>`:''}
    ${r.kontext?`<div class="sektion"><div class="sektion-label">Kontext</div>
      <div class="feld-wert">${esc(r.kontext)}</div></div>`:''}
    ${r.entscheidung?`<div class="sektion"><div class="sektion-label">Entscheidung</div>
      <div class="feld-wert">${esc(r.entscheidung)}</div></div>`:''}
    <div class="sektion"><div class="sektion-label">Volltext (Auszug)</div>
      <div class="feld-wert" style="line-height:1.7">${window.marked?marked.parse(r.body||''):esc(r.body)}</div></div>
    `}
  </div>`;
}
