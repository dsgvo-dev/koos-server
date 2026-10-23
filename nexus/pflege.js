/* ══ Stammdaten pflegen ═══════════════════════════════════════════════
   PLAN-2026-10-23-nexus-wird-kundenansicht, Stufe 2.

   Bearbeiten, Neu anlegen und Löschen von Organisationseinheiten, Prozessen,
   Datenarten und Regelungen; Verlauf, Diff und Rückgängig aus dem Git-Audit
   des Servers. Jede Änderung ist ein Commit, die Begründung steht im
   Commit-Text.

   Die Masken sind aus der KOOS-Pflegeoberfläche (index.html) übernommen,
   samt ihrer Schutzregeln, denn jede davon geht auf einen gemessenen
   Datenverlust zurück:
     F3  Werteliste nicht geladen     → Feld gesperrt, Speichern abgewiesen
     F4  Wert nicht im Vokabular      → angezeigt, markiert, Speichern abgewiesen
     –   Rechtsgrundlagen in drei Feldern (gesetz, artikel, titel)
     –   beteiligte in beiden Formen ({einheit, aufgabe} / {rolle, phase, aufgabe})
     –   Prozess-Volltext wird nachgeladen; solange er fehlt, wird er nicht gesendet
   Bearbeitet wird immer der Datensatz, wie ihn die API liefert (ROH), nicht
   die für die Anzeige umgeformte Fassung. Der Server mischt die gesendeten
   Felder in die Datei; was die Maske nicht kennt, bleibt stehen. */

/* ── Typen ─────────────────────────────────────────────────────────── */
const PFLEGE = {
  oe: {
    label:'Organisationseinheit', modul:'organisation', idPraefix:'oe-',
    roh:()=>ROH.orga, pfad:()=>'orga.yaml',
    name:r=>r.name,
    felder:[
      {id:'name',             label:'Bezeichnung',           typ:'text',           pflicht:true},
      {id:'parent',           label:'Übergeordnete OE',      typ:'oe-select-null', hinweis:'Leer lassen für die Wurzelebene'},
      {id:'rollen',           label:'OE-spezifische Rollen', typ:'list-text',      hinweis:'Generische Rollen (Leitung, Sachbearbeitung) nicht eintragen'},
      {id:'sonderfunktionen', label:'Sonderfunktionen',      typ:'list-text',      hinweis:'Gesetzlich definierte Querschnittsfunktionen mit Rechtsgrundlage'},
      {id:'hinweis',          label:'Hinweis',               typ:'textarea',       hinweis:'Für Sonderfälle, z. B. Personalrat nach NPersVG'},
    ],
  },
  prozess: {
    label:'Prozess', modul:'prozesse', idPraefix:'proc-', api:'api/prozesse', ordner:'prozesse',
    roh:()=>ROH.prozesse, pfad:id=>`prozesse/${id}.md`,
    name:r=>r.titel||r.name,
    felder:[
      {id:'titel',              label:'Titel',                   typ:'text',            pflicht:true},
      {id:'status',             label:'Status',                  typ:'select',          vokabular:'prozessStatus', pflicht:true},
      {id:'bereich',            label:'Bereich',                 typ:'select',          vokabular:'bereich', pflicht:true, hinweis:'intern = Eigenverwaltung; extern = Verwaltungshandeln gegenüber Bürgern und Unternehmen'},
      {id:'zustaendigeEinheit', label:'Zuständige OE',           typ:'oe-select',       pflicht:true},
      {id:'zustaendigeRolle',   label:'Zuständige Rolle',        typ:'text',            hinweis:'Rolle aus der Rollenliste der OE (optional)'},
      {id:'beteiligte',         label:'Beteiligte Einheiten',    typ:'list-oe-aufgabe', hinweis:'OE und ihr Beitrag. Ist keine OE benannt, trägt der Eintrag eine Rolle und die Phasennummern'},
      {id:'datenInput',         label:'Eingehende Daten',        typ:'list-text',       hinweis:'Was den Prozess auslöst oder hereinkommt'},
      {id:'datenOutput',        label:'Ergebnis',                typ:'list-text',       hinweis:'Was der Prozess hervorbringt'},
      {id:'datenspeicher',      label:'Verarbeitete Datenarten', typ:'multi-daten'},
      {id:'regelungen',         label:'Rechtsgrundlagen',        typ:'list-text',       hinweis:'Je Eintrag eine Grundlage, z. B. DSGVO Art. 6'},
      {id:'body',               label:'Volltext (Zweck, Prozessschritte)', typ:'textarea', hinweis:'Markdown. Die Prozessschritte werden aus diesem Text gelesen'},
    ],
  },
  daten: {
    label:'Datenart', modul:'datenspeicher', idPraefix:'dstore-', api:'api/daten', ordner:'daten',
    roh:()=>ROH.daten, pfad:id=>`daten/${id}.md`,
    name:r=>r.name,
    felder:[
      {id:'name',                label:'Bezeichnung',               typ:'text',   pflicht:true},
      {id:'bereich',             label:'Bereich',                   typ:'select', vokabular:'bereich', pflicht:true, hinweis:'intern = Eigenverwaltung; extern = Verwaltungshandeln gegenüber Bürgern und Unternehmen'},
      {id:'zustaendigeEinheit',  label:'Zuständige OE',             typ:'oe-select', pflicht:true},
      {id:'schutzstufe',         label:'Schutzstufe (Datenschutz)', typ:'select', vokabular:'schutzstufe', pflicht:true},
      {id:'schutzbedarf',        label:'Schutzbedarf (BSI)',        typ:'select', vokabular:'schutzbedarf', pflicht:true},
      {id:'vertraulichkeit',     label:'Vertraulichkeit',           typ:'select', vokabular:'vertraulichkeit', pflicht:true},
      {id:'rechtsgrundlagen',    label:'Rechtsgrundlagen',          typ:'list-rechtsgrundlage', hinweis:'Je Zeile eine Grundlage: Gesetz, Artikel, Titel'},
      {id:'system',              label:'Fachverfahren / System',    typ:'text',   hinweis:'Software oder Fachverfahren, in dem die Daten geführt werden — wird von der Organisation gepflegt'},
      {id:'aufbewahrungFrist',   label:'Aufbewahrungsfrist',        typ:'text',   hinweis:'z. B. 10 Jahre'},
      {id:'aufbewahrungBeginn',  label:'Fristbeginn',               typ:'text',   hinweis:'z. B. nach Ausscheiden'},
      {id:'aufbewahrungHinweis', label:'Hinweis Aufbewahrung',      typ:'text'},
    ],
  },
  regelung: {
    label:'Regelung', modul:'regelungen', idPraefix:'reg-', api:'api/regelungen', ordner:'regelungen',
    roh:()=>ROH.regelungen, pfad:id=>`regelungen/${id}.md`,
    name:r=>r.name,
    felder:[
      {id:'name',                  label:'Bezeichnung',            typ:'text',   pflicht:true},
      {id:'typ',                   label:'Typ',                    typ:'select', vokabular:'regelungTyp', pflicht:true},
      {id:'status',                label:'Status',                 typ:'select', vokabular:'regelungStatus'},
      {id:'ersetzt',               label:'Ersetzt durch',          typ:'reg-select-null', hinweis:'Nachfolgeregelung — nur bei Status „ersetzt“'},
      {id:'datum',                 label:'Datum / Fassung',        typ:'text',   hinweis:'z. B. 2024-01-01'},
      {id:'zustaendigeEinheit',    label:'Zuständige OE',          typ:'oe-select-null'},
      {id:'entscheidendesGremium', label:'Entscheidendes Gremium', typ:'text',   hinweis:'z. B. Rat, Verwaltungsausschuss'},
      {id:'body',                  label:'Volltext / Anmerkungen', typ:'textarea'},
    ],
  },
};
const PFLEGE_AUSWAHL = {oe:'organisation', prozess:'prozesse', daten:'datenspeicher', regelung:'regelungen'};

/* Wertelisten. Die drei Datenart-Listen stehen hier wie in index.html; die
   übrigen kommen ausschließlich aus koos.yaml über api/config (E5) — ohne
   Notwerte, damit keine zweite Liste still veraltet. */
function pflegeVokabular(name){
  const fest={
    schutzstufe:['A','B','C','D','E'],
    schutzbedarf:['normal','hoch','sehr hoch'],
    vertraulichkeit:['öffentlich','intern','vertraulich','streng vertraulich'],
    bereich:['intern','extern'],
  };
  if(fest[name]) return fest[name];
  const v=(SITZUNG.vokabular||{})[name];
  return Array.isArray(v) ? v : v ? Object.keys(v) : null;
}

/* ── Rechte ────────────────────────────────────────────────────────── */
function darfPflegen(){
  return !!ROH && (SITZUNG.modus==='aus' || SITZUNG.angemeldet);
}

/* Knöpfe für die Detailansicht eines Eintrags */
function pflegeKnoepfe(typ, id){
  if(!ROH) return '';
  const k=`${typ}:${id}`;
  const darf=darfPflegen();
  const sperre=darf?'':' disabled title="Nur nach Anmeldung"';
  return `<span class="pf-knoepfe">
    <button class="btn klein" data-pf="bearbeiten:${k}"${sperre}>✏ Bearbeiten</button>
    <button class="btn klein" data-pf="verlauf:${k}">🕘 Verlauf</button>
    <button class="btn klein pf-gefahr" data-pf="loeschen:${k}"${sperre}>🗑 Löschen</button>
  </span>`;
}
function pflegeNeuKnopf(typ){
  if(!ROH || !darfPflegen()) return '';
  return `<button class="btn-neu" data-pf="neu:${typ}">+ Neu</button>`;
}

/* ── Dialog ────────────────────────────────────────────────────────── */
function pfDialog(titel, inhalt, fuss){
  let d=document.getElementById('pf-dialog');
  if(!d){
    d=document.createElement('div');
    d.id='pf-dialog'; d.className='pf-overlay'; d.hidden=true;
    d.innerHTML=`<div class="pf-box" role="dialog" aria-modal="true" aria-labelledby="pf-titel">
      <div class="pf-kopf"><h3 id="pf-titel"></h3>
        <button class="icon-btn" data-pf="schliessen" aria-label="Schließen">✕</button></div>
      <div class="pf-inhalt"></div><div class="pf-fuss"></div></div>`;
    document.body.appendChild(d);
    d.addEventListener('mousedown',e=>{ if(e.target===d) pfSchliessen(); });
  }
  d.querySelector('#pf-titel').textContent=titel;
  d.querySelector('.pf-inhalt').innerHTML=inhalt;
  d.querySelector('.pf-fuss').innerHTML=fuss||'';
  d.hidden=false;
  return d;
}
function pfSchliessen(){
  const d=document.getElementById('pf-dialog'); if(d) d.hidden=true;
  PF.zurueck=null;
}
document.addEventListener('keydown',e=>{
  const d=document.getElementById('pf-dialog');
  if(e.key==='Escape' && d && !d.hidden) pfSchliessen();
});

const PF = {typ:null, edit:null, bodyOffen:false, zurueck:null};

/* ── Formularfelder ────────────────────────────────────────────────── */
function pfFeldHtml(feld){
  const fid=`pf-${feld.id}`;
  let input='';
  const oeOpts=()=>ROH.orga.map(u=>`<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('');
  switch(feld.typ){
    case 'text':
      input=`<input type="text" id="${fid}" class="pf-input"${feld.pflicht?' required':''}>`; break;
    case 'textarea':
      input=`<textarea id="${fid}" class="pf-input pf-textarea" rows="${feld.id==='body'?10:3}"></textarea>`; break;
    case 'select': {
      const werte=pflegeVokabular(feld.vokabular);
      const fehlt=!Array.isArray(werte)||!werte.length;
      input=`<select id="${fid}" class="pf-input${fehlt?' pf-fehler':''}"${fehlt?` disabled data-vokabular-fehlt="${esc(feld.vokabular)}"`:''}>
        <option value="">${fehlt?'— Werteliste nicht geladen —':'— bitte wählen —'}</option>
        ${(werte||[]).map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select>`;
      break;
    }
    case 'reg-select-null': {
      const regs=ROH.regelungen.filter(r=>!PF.edit||r.id!==PF.edit.id);
      input=`<select id="${fid}" class="pf-input"><option value="">— keine —</option>
        ${regs.map(r=>`<option value="${esc(r.id)}">${esc(r.name||r.id)}</option>`).join('')}</select>`;
      break;
    }
    case 'oe-select': case 'oe-select-null':
      input=`<select id="${fid}" class="pf-input"><option value="">${feld.typ==='oe-select-null'?'— keine —':'— bitte wählen —'}</option>${oeOpts()}</select>`;
      break;
    case 'list-text': case 'list-oe-aufgabe': case 'list-rechtsgrundlage': {
      const art={'list-text':'text','list-oe-aufgabe':'oe','list-rechtsgrundlage':'rg'}[feld.typ];
      const knopf={'text':'+ Eintrag','oe':'+ Beteiligte','rg':'+ Rechtsgrundlage'}[art];
      input=`<div class="pf-liste" id="${fid}" data-art="${art}"><div class="pf-liste-zeilen"></div>
        <button type="button" class="btn klein" data-pf-zeile="${fid}">${knopf}</button></div>`;
      break;
    }
    case 'multi-daten':
      input=`<div class="pf-checks-wrap">
        <input type="search" class="pf-input pf-checks-filter" placeholder="Datenarten filtern …" data-pf-filter="${fid}">
        <div class="pf-checks" id="${fid}">${ROH.daten.map(d=>`<label class="pf-check" data-name="${esc((d.name||'').toLowerCase())}">
          <input type="checkbox" value="${esc(d.id)}"> ${esc(d.name||d.id)}</label>`).join('')}</div></div>`;
      break;
  }
  return `<div class="pf-gruppe">
    <label class="pf-label" for="${fid}">${esc(feld.label)}${feld.pflicht?'<span class="pf-pflicht"> *</span>':''}</label>
    ${input}${feld.hinweis?`<div class="pf-hinweis">${esc(feld.hinweis)}</div>`:''}</div>`;
}

function pfZeile(liste, werte={}){
  const art=liste.dataset.art;
  const z=document.createElement('div'); z.className='pf-zeile';
  if(art==='text'){
    z.innerHTML=`<input type="text" class="pf-input pf-z-text">`;
    z.querySelector('input').value=werte.text||'';
  }else if(art==='rg'){
    z.innerHTML=`<input type="text" class="pf-input pf-z-gesetz" placeholder="Gesetz">
      <input type="text" class="pf-input pf-z-artikel" placeholder="Artikel">
      <input type="text" class="pf-input pf-z-titel" placeholder="Titel">`;
    z.querySelector('.pf-z-gesetz').value=werte.gesetz||'';
    z.querySelector('.pf-z-artikel').value=werte.artikel||'';
    z.querySelector('.pf-z-titel').value=werte.titel||'';
  }else{
    z.innerHTML=`<select class="pf-input pf-z-oe"><option value="">— OE —</option>
        ${ROH.orga.map(u=>`<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('')}</select>
      <input type="text" class="pf-input pf-z-rolle" placeholder="Rolle" title="Rolle — falls keine OE benannt ist">
      <input type="text" class="pf-input pf-z-phase" placeholder="Phase" title="Phasennummern, z. B. 1,2,3">
      <input type="text" class="pf-input pf-z-aufgabe" placeholder="Aufgabe / Beitrag">`;
    const sel=z.querySelector('.pf-z-oe');
    sel.value=werte.einheit||'';
    /* Verweis auf eine OE, die es nicht (mehr) gibt: bleibt erhalten und
       wird markiert. Sonst fiele die ganze Zeile beim Speichern weg
       (proc-loeschung-antrag → oe-archiv, 23.10.2026). */
    if(werte.einheit && sel.value!==werte.einheit){
      const o=document.createElement('option');
      o.value=werte.einheit; o.textContent=`${werte.einheit} — nicht im Bestand`;
      sel.insertBefore(o, sel.options[1]||null);
      sel.value=werte.einheit; sel.classList.add('pf-fehler'); sel.title='Diese OE gibt es im Bestand nicht';
    }
    z.querySelector('.pf-z-rolle').value=werte.rolle||'';
    z.querySelector('.pf-z-phase').value=werte.phase==null?'':String(werte.phase);
    z.querySelector('.pf-z-aufgabe').value=werte.aufgabe||'';
  }
  const x=document.createElement('button');
  x.type='button'; x.className='pf-weg'; x.textContent='×'; x.setAttribute('aria-label','Zeile entfernen');
  x.addEventListener('click',()=>z.remove());
  z.appendChild(x);
  liste.querySelector('.pf-liste-zeilen').appendChild(z);
  return z;
}

/* Datensatz der API → flache Formularfelder */
function pfNormalisieren(typ, ds){
  const flach={...ds};
  if(typ==='prozess'){
    const d=ds.daten||{};
    flach.datenInput=d.input||[];
    flach.datenOutput=d.output||[];
    flach.datenspeicher=(d.datenspeicher||[]).map(x=>typeof x==='string'?x:(x&&x.id)||'');
  }
  if(typ==='daten'){
    const a=ds.aufbewahrung||{};
    flach.aufbewahrungFrist=a.frist??'';
    flach.aufbewahrungBeginn=a.beginn??'';
    flach.aufbewahrungHinweis=a.hinweis??'';
    if(Array.isArray(ds.rechtsgrundlagen))
      flach.rechtsgrundlagen=ds.rechtsgrundlagen.map(r=>typeof r==='string'
        ? {gesetz:r} : {gesetz:r?.gesetz||'', artikel:r?.artikel||'', titel:r?.titel||''})
        .filter(r=>r.gesetz||r.artikel||r.titel);
  }
  return flach;
}

function pfBefuellen(ds, felder, wurzel){
  felder.forEach(feld=>{
    const el=wurzel.querySelector(`#pf-${feld.id}`); if(!el) return;
    const val=ds[feld.id];
    if(val===undefined||val===null||val==='') return;
    switch(feld.typ){
      case 'select': case 'reg-select-null': case 'oe-select': case 'oe-select-null':
        el.value=val;
        if(el.value!==String(val)){
          const o=document.createElement('option');
          o.value=String(val); o.textContent=`${val} — nicht im Vokabular`;
          el.insertBefore(o, el.options[1]||null);
          el.value=String(val);
          el.dataset.wertUnbekannt=String(val);
          el.classList.add('pf-fehler');
        }
        break;
      case 'text': case 'textarea': el.value=val; break;
      case 'list-text':
        if(!Array.isArray(val)) break;
        /* YAML liest „Art. 12 Abs. 5 DSGVO – …, Ausnahme: exzessive Anträge"
           als Zuordnung, nicht als Text (proc-auskunft-antrag, 23.10.2026).
           Im Textfeld stünde dann „[object Object]" und ginge so in die Datei.
           Solche Listen werden angezeigt, aber gesperrt und nicht gesendet —
           der Server lässt das Feld dann unverändert. */
        if(val.some(t=>typeof t!=='string')){
          el.dataset.unveraendert='1';
          el.querySelector('[data-pf-zeile]').hidden=true;
          el.querySelector('.pf-liste-zeilen').innerHTML=val.map(t=>`<div class="pf-zeile"><input class="pf-input" disabled value="${esc(typeof t==='string'?t:Object.entries(t||{}).map(([k,v])=>`${k}: ${v}`).join('; '))}"></div>`).join('')
            +`<div class="pf-hinweis pf-warn">Mindestens ein Eintrag ist in der Datei kein reiner Text (z. B. wegen „: “). Das Feld ist hier gesperrt und bleibt beim Speichern unverändert; ändern nur direkt in der Datei.</div>`;
          break;
        }
        val.forEach(t=>pfZeile(el,{text:t}));
        break;
      case 'list-rechtsgrundlage': case 'list-oe-aufgabe': if(Array.isArray(val)) val.forEach(v=>pfZeile(el,v)); break;
      case 'multi-daten':
        if(!Array.isArray(val)) break;
        val.forEach(id=>{
          let cb=[...el.querySelectorAll('input')].find(i=>i.value===id);
          /* Verweis auf eine Datenart, die es nicht gibt: als markierte,
             angehakte Zeile vorn einfügen — sonst ginge er beim Speichern
             still verloren (proc-beschaeftigungsduldung-beantragen). */
          if(!cb){
            const l=document.createElement('label');
            l.className='pf-check pf-fehler-text'; l.dataset.name=id;
            l.innerHTML=`<input type="checkbox" value="${esc(id)}"> ${esc(id)} — nicht im Bestand`;
            el.prepend(l); cb=l.querySelector('input');
          }
          cb.checked=true;
        });
        break;
    }
  });
}

function pfBeanstandungen(wurzel){
  const m=[];
  wurzel.querySelectorAll('[data-vokabular-fehlt]').forEach(el=>m.push(`Werteliste „${el.dataset.vokabularFehlt}“ nicht geladen`));
  wurzel.querySelectorAll('[data-wert-unbekannt]').forEach(el=>m.push(`Wert „${el.dataset.wertUnbekannt}“ steht nicht im Vokabular`));
  return m;
}

function pfLesen(wurzel){
  const def=PFLEGE[PF.typ];
  const daten={id:PF.edit?PF.edit.id:def.idPraefix+wurzel.querySelector('#pf-id').value.trim()};
  def.felder.forEach(feld=>{
    const el=wurzel.querySelector(`#pf-${feld.id}`); if(!el || el.dataset.unveraendert) return;
    switch(feld.typ){
      case 'text': case 'textarea': case 'select': case 'oe-select': case 'oe-select-null': case 'reg-select-null':
        daten[feld.id]=el.value.trim(); break;
      case 'list-text':
        daten[feld.id]=[...el.querySelectorAll('.pf-z-text')].map(i=>i.value.trim()).filter(Boolean); break;
      case 'list-rechtsgrundlage':
        daten[feld.id]=[...el.querySelectorAll('.pf-zeile')].map(z=>{
          const e={gesetz:z.querySelector('.pf-z-gesetz').value.trim(),
                   artikel:z.querySelector('.pf-z-artikel').value.trim(),
                   titel:z.querySelector('.pf-z-titel').value.trim()};
          Object.keys(e).forEach(k=>{ if(!e[k]) delete e[k]; });
          return e;
        }).filter(e=>e.gesetz||e.titel);
        break;
      case 'list-oe-aufgabe':
        daten[feld.id]=[...el.querySelectorAll('.pf-zeile')].map(z=>{
          const e={einheit:z.querySelector('.pf-z-oe').value,
                   rolle:z.querySelector('.pf-z-rolle').value.trim(),
                   phase:z.querySelector('.pf-z-phase').value.trim(),
                   aufgabe:z.querySelector('.pf-z-aufgabe').value.trim()};
          Object.keys(e).forEach(k=>{ if(!e[k]) delete e[k]; });
          return e;
        }).filter(b=>b.einheit||b.rolle);
        break;
      case 'multi-daten':
        daten[feld.id]=[...el.querySelectorAll('input:checked')].map(i=>i.value); break;
    }
  });
  if(PF.typ==='prozess'){
    daten.daten={input:daten.datenInput||[], output:daten.datenOutput||[],
                 datenspeicher:(daten.datenspeicher||[]).map(id=>({id}))};
    delete daten.datenInput; delete daten.datenOutput; delete daten.datenspeicher;
    if(PF.bodyOffen) delete daten.body;
  }
  /* Datenart: aufbewahrungFrist/-Beginn/-Hinweis gehen flach an den Server
     (daten_to_md_merge). Nur so lässt sich ein Feld auch leeren. */
  return daten;
}

async function pfBodyNachladen(el, id){
  PF.bodyOffen=true;
  try{
    const r=await fetch(`api/prozesse/${encodeURIComponent(id)}?section=body`,{cache:'no-store'});
    if(!r.ok) throw new Error(r.status);
    el.value=await r.text();
    PF.bodyOffen=false;
  }catch(e){
    el.placeholder='Volltext konnte nicht geladen werden — er bleibt beim Speichern unverändert.';
  }
}

function pfSlug(t){
  return String(t||'').toLowerCase()
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100);
}

/* ── Bearbeiten und Neu ────────────────────────────────────────────── */
function pfMaske(typ, id){
  const def=PFLEGE[typ];
  const roh=id ? def.roh().find(r=>r.id===id) : null;
  if(id && !roh){ toast('Eintrag nicht gefunden'); return; }
  PF.typ=typ; PF.edit=roh ? pfNormalisieren(typ, roh) : null; PF.bodyOffen=false;
  const idFeld=`<div class="pf-gruppe"><label class="pf-label" for="pf-id">Kennung${roh?'':'<span class="pf-pflicht"> *</span>'}</label>
    <div class="pf-id"><span>${esc(def.idPraefix)}</span>
      <input type="text" id="pf-id" class="pf-input"${roh?` value="${esc(roh.id.slice(def.idPraefix.length))}" disabled`:' placeholder="kurzname-mit-bindestrichen" autocomplete="off"'}></div>
    <div class="pf-hinweis">${roh?'Die Kennung bleibt fest — andere Einträge verweisen darauf.':'Wird aus der Bezeichnung vorgeschlagen. Nach dem Anlegen nicht mehr änderbar.'}</div></div>`;
  const begr=`<div class="pf-gruppe pf-begruendung"><label class="pf-label" for="pf-begruendung">Begründung der Änderung</label>
    <textarea id="pf-begruendung" class="pf-input" rows="2" placeholder="Warum wird das geändert? Steht im Änderungsprotokoll."></textarea></div>`;
  const d=pfDialog(roh?`${def.label} bearbeiten`:`${def.label} anlegen`,
    `<form class="pf-form" onsubmit="return false">${idFeld}${def.felder.map(pfFeldHtml).join('')}${begr}</form>`,
    `<button class="btn" data-pf="schliessen">Abbrechen</button>
     <button class="btn primary" data-pf="speichern">Speichern</button>`);
  const form=d.querySelector('.pf-form');
  if(PF.edit) pfBefuellen(PF.edit, def.felder, form);
  if(roh && typ==='prozess') pfBodyNachladen(form.querySelector('#pf-body'), roh.id);
  if(!roh){
    const quelle=form.querySelector(typ==='prozess'?'#pf-titel':'#pf-name');
    const idEl=form.querySelector('#pf-id'); let manuell=false;
    idEl.addEventListener('input',()=>{ manuell=true; });
    quelle.addEventListener('input',()=>{ if(!manuell) idEl.value=pfSlug(quelle.value); });
    quelle.focus();
  }else{
    form.querySelector('.pf-input:not([disabled])')?.focus();
  }
}

async function pfSpeichern(){
  const def=PFLEGE[PF.typ];
  const form=document.querySelector('#pf-dialog .pf-form');
  const meld=pfBeanstandungen(form);
  const daten=pfLesen(form);
  const neu=!PF.edit;
  if(neu){
    const rest=daten.id.slice(def.idPraefix.length);
    if(!/^[a-z0-9][a-z0-9-]{0,120}$/.test(rest)) meld.push('Kennung: nur Kleinbuchstaben, Ziffern und Bindestriche');
    else if(def.roh().some(r=>r.id===daten.id)) meld.push(`Kennung ${daten.id} ist schon vergeben`);
  }
  def.felder.filter(f=>f.pflicht).forEach(f=>{
    const w=daten[f.id];
    if(w===undefined||w==='') meld.push(`„${f.label}“ fehlt`);
  });
  if(meld.length){ pfMeldung(meld.join(' · ')); return; }

  const begruendung=(form.querySelector('#pf-begruendung').value||'').trim();
  const knopf=document.querySelector('#pf-dialog [data-pf="speichern"]');
  knopf.disabled=true; knopf.textContent='Speichert …';
  try{
    let antwort;
    if(PF.typ==='oe'){
      antwort=await pfOrgaSpeichern(liste=>{
        const obj=pfOeObjekt(daten);
        const i=liste.findIndex(e=>e.id===daten.id);
        if(i>=0) liste[i]=obj; else liste.push(obj);
        return liste;
      }, begruendung);
    }else{
      const r=await fetch(`${def.api}/${encodeURIComponent(daten.id)}`,{
        method:'PUT', headers:{'Content-Type':'application/json'},
        body:JSON.stringify(begruendung?{...daten,_begruendung:begruendung}:daten)});
      if(!r.ok) throw new Error(await pfFehlertext(r));
      antwort=await r.json();
    }
    pfSchliessen();
    S.auswahl[PFLEGE_AUSWAHL[PF.typ]]=daten.id;
    await datenLaden();
    toast(antwort&&antwort.gespeichert===false ? 'Keine Änderung — nichts gespeichert'
          : neu ? `${def.label} angelegt` : 'Gespeichert');
  }catch(e){
    knopf.disabled=false; knopf.textContent='Speichern';
    pfMeldung('Nicht gespeichert: '+e.message);
  }
}

function pfMeldung(text){
  const f=document.querySelector('#pf-dialog .pf-fuss'); if(!f) return;
  let m=f.querySelector('.pf-meldung');
  if(!m){ m=document.createElement('div'); m.className='pf-meldung'; f.prepend(m); }
  m.textContent=text;
}
async function pfFehlertext(r){
  try{ const d=await r.json(); return d.detail ? `${r.status} ${typeof d.detail==='string'?d.detail:JSON.stringify(d.detail)}` : String(r.status); }
  catch(e){ return String(r.status); }
}

/* Die Organisation liegt in einer einzigen Datei (orga.yaml) und wird nur
   als Ganzes geschrieben. Grundlage ist der zuletzt geladene Stand. */
function pfOeObjekt(u){
  return {id:u.id, name:u.name||'', parent:u.parent||null,
    ...(u.rollen?.length?{rollen:u.rollen}:{}),
    ...(u.sonderfunktionen?.length?{sonderfunktionen:u.sonderfunktionen}:{}),
    ...(u.hinweis?{hinweis:u.hinweis}:{})};
}
async function pfOrgaSpeichern(aendern, begruendung){
  const liste=aendern(ROH.orga.map(pfOeObjekt));
  const r=await fetch('api/orga',{method:'PUT', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({einheiten:liste, _begruendung:begruendung||undefined})});
  if(!r.ok) throw new Error(await pfFehlertext(r));
  return r.json();
}

/* ── Löschen ───────────────────────────────────────────────────────── */
/* Wer verweist auf diese Kennung? Gesucht wird in allen geladenen
   Stammdaten und im VVT, in jedem Feld und jeder Verschachtelung, nach
   genau diesem Wert. Ein Treffer sperrt das Löschen: sonst entstünde ein
   toter Verweis. */
function pfVerweise(id){
  const quellen=[['Organisation',ROH.orga,'oe'],['Prozess',ROH.prozesse,'prozess'],
                 ['Datenart',ROH.daten,'daten'],['Regelung',ROH.regelungen,'regelung'],['VVT',ROH.vvt,null]];
  const enthaelt=w=>{
    if(w===id) return true;
    if(Array.isArray(w)) return w.some(enthaelt);
    if(w&&typeof w==='object') return Object.entries(w).some(([k,v])=>k!=='id'&&enthaelt(v));
    return false;
  };
  const treffer=[];
  quellen.forEach(([art,liste])=>(liste||[]).forEach(r=>{
    if(r.id!==id && enthaelt(r)) treffer.push({art, id:r.id, name:r.titel||r.name||r.id});
  }));
  return treffer;
}

function pfLoeschenFragen(typ, id){
  const def=PFLEGE[typ];
  const roh=def.roh().find(r=>r.id===id); if(!roh) return;
  const verweise=pfVerweise(id);
  if(verweise.length){
    pfDialog(`${def.label} löschen`,
      `<p class="pf-text"><b>${esc(def.name(roh))}</b> kann nicht gelöscht werden: ${verweise.length}
        ${verweise.length===1?'Eintrag verweist':'Einträge verweisen'} noch darauf. Erst diese Verweise lösen.</p>
       <ul class="pf-verweise">${verweise.slice(0,60).map(v=>`<li><span class="pill">${esc(v.art)}</span> ${esc(v.name)} <code>${esc(v.id)}</code></li>`).join('')}
       ${verweise.length>60?`<li>… ${verweise.length-60} weitere</li>`:''}</ul>`,
      `<button class="btn" data-pf="schliessen">Schließen</button>`);
    return;
  }
  PF.typ=typ; PF.edit={id};
  pfDialog(`${def.label} löschen`,
    `<p class="pf-text"><b>${esc(def.name(roh))}</b> <code>${esc(id)}</code> wird gelöscht.
       Kein anderer Eintrag verweist darauf. Die Löschung ist ein eigener Commit und lässt sich über
       <i>Verlauf → Rückgängig</i> wiederherstellen.</p>
     <div class="pf-gruppe pf-begruendung"><label class="pf-label" for="pf-begruendung">Begründung</label>
       <textarea id="pf-begruendung" class="pf-input" rows="2" placeholder="Warum wird der Eintrag gelöscht?"></textarea></div>`,
    `<button class="btn" data-pf="schliessen">Abbrechen</button>
     <button class="btn primary pf-gefahr-voll" data-pf="loeschen-ok">Endgültig löschen</button>`);
}

async function pfLoeschen(){
  const typ=PF.typ, id=PF.edit.id, def=PFLEGE[typ];
  const begruendung=(document.getElementById('pf-begruendung').value||'').trim();
  const knopf=document.querySelector('#pf-dialog [data-pf="loeschen-ok"]');
  knopf.disabled=true; knopf.textContent='Löscht …';
  try{
    if(typ==='oe'){
      await pfOrgaSpeichern(liste=>liste.filter(e=>e.id!==id), begruendung);
    }else{
      const r=await fetch(`${def.api}/${encodeURIComponent(id)}`,{method:'DELETE',
        headers:{'Content-Type':'application/json'}, body:JSON.stringify({_begruendung:begruendung||undefined})});
      if(!r.ok) throw new Error(await pfFehlertext(r));
    }
    pfSchliessen();
    S.auswahl[PFLEGE_AUSWAHL[typ]]=null;
    await datenLaden();
    toast(`${def.label} gelöscht`);
  }catch(e){
    knopf.disabled=false; knopf.textContent='Endgültig löschen';
    pfMeldung('Nicht gelöscht: '+e.message);
  }
}

/* ── Verlauf, Diff, Rückgängig ─────────────────────────────────────── */
function pfDatum(s){
  if(!s) return '—';
  /* git %ai: "2026-10-23 21:30:00 +0200" */
  const d=new Date(String(s).replace(/^(\S+) (\S+) ([+-]\d\d)(\d\d)$/,'$1T$2$3:$4'));
  return isNaN(d) ? s : d.toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'});
}
function pfNachricht(e){ return String(e.nachricht||'').replace(/^koos:\s*/i,''); }

/* Tabelle der Commits — für den Verlauf eines Eintrags und für das Modul Audit */
function pfCommitTabelle(liste){
  if(!liste.length) return '<p class="pf-text">Keine Änderungen gefunden.</p>';
  const darf=darfPflegen();
  return `<table class="tab pf-commits"><thead><tr><th>Datum</th><th>Autor</th><th>Änderung</th><th>Begründung</th><th></th></tr></thead>
    <tbody>${liste.map(e=>{
      const msg=pfNachricht(e);
      const istRueck=msg.startsWith('Rückgängig:');
      return `<tr>
        <td style="white-space:nowrap">${esc(pfDatum(e.datum))}</td>
        <td>${esc(e.autor||'—')}</td>
        <td${istRueck?' class="pf-rueck"':''}>${esc(msg)} <code>${esc((e.hash||'').slice(0,7))}</code></td>
        <td>${e.begruendung?esc(e.begruendung):'<span style="color:var(--fg-ghost)">—</span>'}</td>
        <td style="white-space:nowrap">
          <button class="btn klein" data-pf="diff:${esc(e.hash)}">Diff</button>
          ${darf&&!istRueck?`<button class="btn klein" data-pf="revert:${esc(e.hash)}">↩ Rückgängig</button>`:''}
        </td></tr>`;}).join('')}</tbody></table>`;
}

const PF_COMMITS = {};   // hash → Eintrag, für Titel und Rückfrage

async function pfVerlauf(typ, id){
  const def=PFLEGE[typ];
  const roh=def.roh().find(r=>r.id===id);
  const titel=`Verlauf: ${roh?def.name(roh):id}`;
  PF.zurueck=()=>pfVerlauf(typ,id);
  pfDialog(titel,'<p class="pf-text">Lädt …</p>',`<button class="btn" data-pf="schliessen">Schließen</button>`);
  try{
    const r=await fetch(`api/audit?n=100&pfad=${encodeURIComponent(def.pfad(id))}`,{cache:'no-store'});
    if(!r.ok) throw new Error(await pfFehlertext(r));
    const liste=await r.json();
    liste.forEach(e=>PF_COMMITS[e.hash]=e);
    pfDialog(titel,
      (typ==='oe'?`<div class="hinweis" style="margin-bottom:12px">Alle Organisationseinheiten stehen in einer Datei
        (<code>orga.yaml</code>). Der Verlauf zeigt deshalb jede Änderung an der Organisation, nicht nur an dieser Einheit.</div>`:'')
      +`<p class="pf-text">Datei <code>${esc(def.pfad(id))}</code> · ${liste.length} Änderung${liste.length===1?'':'en'}</p>`
      +pfCommitTabelle(liste),
      `<button class="btn" data-pf="schliessen">Schließen</button>`);
  }catch(e){
    pfDialog(titel,`<p class="pf-text">Verlauf nicht ladbar: ${esc(e.message)}</p>`,`<button class="btn" data-pf="schliessen">Schließen</button>`);
  }
}

function pfDiffZeile(z){
  const cls = z.startsWith('+')&&!z.startsWith('+++') ? 'pf-add'
            : z.startsWith('-')&&!z.startsWith('---') ? 'pf-del'
            : z.startsWith('@@') ? 'pf-hunk'
            : /^(diff |index |--- |\+\+\+ |commit |Author:|Date:)/.test(z) ? 'pf-meta' : '';
  return cls ? `<span class="${cls}">${esc(z)}</span>` : esc(z);
}

async function pfDiff(hash){
  const e=PF_COMMITS[hash];
  const zurueck=PF.zurueck;
  const fuss=`${zurueck?'<button class="btn" data-pf="zurueck">← Zurück</button>':''}<button class="btn" data-pf="schliessen">Schließen</button>`;
  const titel=`Diff ${hash.slice(0,7)}${e?' · '+pfNachricht(e):''}`;
  pfDialog(titel,'<p class="pf-text">Lädt …</p>',fuss);
  try{
    const r=await fetch(`api/audit/${encodeURIComponent(hash)}/diff`,{cache:'no-store'});
    if(!r.ok) throw new Error(await pfFehlertext(r));
    const d=await r.json();
    pfDialog(titel,`<pre class="pf-diff">${(d.diff||'(kein Diff verfügbar)').split('\n').map(pfDiffZeile).join('\n')}</pre>`,fuss);
  }catch(err){
    pfDialog(titel,`<p class="pf-text">Diff nicht ladbar: ${esc(err.message)}</p>`,fuss);
  }
}

function pfRevertFragen(hash){
  const e=PF_COMMITS[hash];
  const zurueck=PF.zurueck;
  PF.revert=hash;
  pfDialog('Änderung rückgängig machen',
    `<p class="pf-text">„${esc(e?pfNachricht(e):hash)}“ <code>${esc(hash.slice(0,7))}</code></p>
     <p class="pf-text">Die betroffenen Dateien werden auf den Stand <b>vor</b> dieser Änderung gesetzt; das ist ein neuer
       Commit, die Historie bleibt erhalten. Spätere Änderungen an denselben Dateien gehen dabei ebenfalls verloren —
       im Zweifel vorher den Diff ansehen.</p>`,
    `${zurueck?'<button class="btn" data-pf="zurueck">← Zurück</button>':'<button class="btn" data-pf="schliessen">Abbrechen</button>'}
     <button class="btn primary" data-pf="revert-ok">Rückgängig machen</button>`);
}

async function pfRevert(){
  const hash=PF.revert;
  const knopf=document.querySelector('#pf-dialog [data-pf="revert-ok"]');
  knopf.disabled=true; knopf.textContent='Läuft …';
  try{
    const r=await fetch(`api/audit/${encodeURIComponent(hash)}/revert`,{method:'POST'});
    if(!r.ok) throw new Error(await pfFehlertext(r));
    const zurueck=PF.zurueck;
    await datenLaden();
    toast('Änderung rückgängig gemacht');
    if(zurueck) zurueck(); else pfSchliessen();
    if(S.modul==='audit') auditLaden();
  }catch(e){
    knopf.disabled=false; knopf.textContent='Rückgängig machen';
    pfMeldung('Nicht rückgängig gemacht: '+e.message);
  }
}

/* ── Modul Audit: Änderungen aus dem Git des Servers ───────────────── */
async function auditLaden(){
  const el=document.getElementById('audit-liste'); if(!el) return;
  PF.zurueck=null;
  try{
    const r=await fetch('api/audit?n=100',{cache:'no-store'});
    if(!r.ok) throw new Error(await pfFehlertext(r));
    const liste=await r.json();
    liste.forEach(e=>PF_COMMITS[e.hash]=e);
    el.innerHTML=`<p class="pf-text">Die letzten ${liste.length} Commits des Datenbestands.</p>`+pfCommitTabelle(liste);
  }catch(e){
    el.innerHTML=`<div class="hinweis warn"><b>Keine Historie geladen.</b> <code>GET /api/audit</code> war nicht erreichbar
      (${esc(e.message)}). Ohne Server gibt es hier nichts anzuzeigen.</div>`;
  }
}

/* ── Ereignisse ────────────────────────────────────────────────────── */
document.addEventListener('click', e=>{
  const zeile=e.target.closest('[data-pf-zeile]');
  if(zeile){ pfZeile(document.getElementById(zeile.dataset.pfZeile)).querySelector('input,select').focus(); return; }
  const k=e.target.closest('[data-pf]'); if(!k || k.disabled) return;
  const [aktion,a,b]=k.dataset.pf.split(':');
  ({
    'schliessen': ()=>pfSchliessen(),
    'zurueck':    ()=>{ const z=PF.zurueck; if(z) z(); },
    'neu':        ()=>darfPflegen() && pfMaske(a),
    'bearbeiten': ()=>darfPflegen() && pfMaske(a,b),
    'speichern':  ()=>pfSpeichern(),
    'loeschen':   ()=>darfPflegen() && pfLoeschenFragen(a,b),
    'loeschen-ok':()=>pfLoeschen(),
    'verlauf':    ()=>pfVerlauf(a,b),
    'diff':       ()=>pfDiff(a),
    'revert':     ()=>darfPflegen() && pfRevertFragen(a),
    'revert-ok':  ()=>pfRevert(),
  }[aktion]||(()=>{}))();
});
document.addEventListener('input', e=>{
  const f=e.target.closest('[data-pf-filter]'); if(!f) return;
  const q=f.value.trim().toLowerCase();
  document.getElementById(f.dataset.pfFilter).querySelectorAll('.pf-check').forEach(l=>{
    l.hidden = !!q && !l.dataset.name.includes(q) && !l.querySelector('input').checked;
  });
});
