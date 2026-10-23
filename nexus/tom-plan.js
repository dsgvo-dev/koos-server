/* ══ TOM: Maßnahmenplan ════════════════════════════════════════════════
   PLAN-2026-10-23-nexus-wird-kundenansicht, Stufe 4 (TOM zuerst).

   Die Planung aus DS-TOM (Schritt 3 „Maßnahmenplan“), angeschlossen an die
   Dateien der Kette statt an den Browser-Speicher:
     je VVT       → tom/tom-<vvt>.json, Feld `umsetzung`
                    (Soll-Maßnahmen und die zusätzlich empfohlenen aus der
                    ergänzenden Analyse, Schritt 7)
     organisation → tom/baseline-organisation.json, Feld `umsetzung`
   Je Maßnahme ein Status (offen, in Bearbeitung, umgesetzt, nicht
   anwendbar) und eine Notiz. ist, delta und status rechnet der Server
   daraus (PUT /api/kette/…/umsetzung); die Generatoren übernehmen den Stand
   (dsms-knowledge/scripts/kette_schutz.py).

   Änderungen sammeln sich als Entwurf und gehen erst mit „Speichern“ — mit
   Begründung — als ein Commit an den Server. */

const TP_STATUS = [
  ['offen','offen',''], ['in_bearbeitung','in Bearbeitung','warn'],
  ['umgesetzt','umgesetzt','ok'], ['nicht_anwendbar','nicht anwendbar','unbekannt'],
];
const TP_LABEL = Object.fromEntries(TP_STATUS.map(([k,l])=>[k,l]));
const TP_CLS = Object.fromEntries(TP_STATUS.map(([k,,c])=>[k,c]));
const TP_ORDNUNG = {offen:0, in_bearbeitung:1, umgesetzt:2, nicht_anwendbar:3};

/* Entwurf je Plan: schluessel ('vvt:<id>' | 'baseline') → {id: {status, notiz}} */
const TP = {entwurf:{}, filter:'', herkunft:'', sort:'id'};

const tpIds = l => (l||[]).map(x=>typeof x==='string'?x:(x&&x.id)).filter(Boolean);
const tpKatalog = id => TOMS.find(x=>x.id===id) || {id, name:'(nicht im Katalog)', kat:'—'};

/* Aktueller Stand einer Maßnahme: Entwurf vor Datei */
function tpStand(schluessel, datei, id){
  const e=(TP.entwurf[schluessel]||{})[id];
  if(e) return e;
  const u=((datei&&datei.umsetzung)||{})[id];
  return {status:(u&&u.status)||'offen', notiz:(u&&u.notiz)||''};
}
function tpGeaendert(schluessel){ return Object.keys(TP.entwurf[schluessel]||{}).length; }

/* Statistik wie in DS-TOM (renderStats) */
function tpStatistik(schluessel, datei, ids, herkunft={}){
  const n={offen:0,in_bearbeitung:0,umgesetzt:0,nicht_anwendbar:0};
  ids.forEach(id=>n[tpStand(schluessel,datei,id).status]++);
  const relevant=ids.length-n.nicht_anwendbar;
  const quote=relevant?Math.round(100*n.umgesetzt/relevant):0;
  return `<div class="tp-statistik">
    <div class="tp-quote"><b>${quote} %</b> umgesetzt <span>(${n.umgesetzt} von ${relevant} anwendbaren)</span>
      <div class="balken"><i class="ok" style="width:${quote}%"></i></div></div>
    <div class="pill-reihe">${TP_STATUS.map(([k,l,c])=>`<span class="pill ${c}${TP.filter===k?' tp-aktiv':''}" data-tpfilter="${k}" role="button" tabindex="0">${l}: ${n[k]}</span>`).join('')}
      ${TP.filter?'<span class="pill link" data-tpfilter="">alle zeigen</span>':''}</div>
    ${Object.keys(herkunft).length?`<div class="pill-reihe" title="Herkunft im Soll (Entscheidung 23.10.2026): Klassifikation, ergänzt um Empfehlungen der anwendbaren Bedrohungen">
      ${[['klassifikation','Klassifikation'],['bedrohung','aus Bedrohungen']].map(([k,l])=>`<span class="pill${TP.herkunft===k?' tp-aktiv':''}" data-tpherkunft="${k}" role="button" tabindex="0">${l}: ${ids.filter(id=>herkunft[id]===k).length}</span>`).join('')}</div>`:''}
  </div>`;
}

/* Der Plan als Tabelle. ids: geplante Maßnahmen; zusatz: Teilmenge aus Schritt 7 */
function tpTabelle(schluessel, datei, ids, zusatz=[], herkunft={}){
  const darf=typeof darfPflegen==='function' && darfPflegen();
  if(datei && datei._uebersicht) return '<p class="pf-text">Plan wird geladen …</p>';
  let zeilen=ids.map(id=>({id, k:tpKatalog(id), s:tpStand(schluessel,datei,id), zusatz:zusatz.includes(id), herkunft:herkunft[id]}));
  if(TP.filter) zeilen=zeilen.filter(z=>z.s.status===TP.filter);
  if(TP.herkunft) zeilen=zeilen.filter(z=>z.herkunft===TP.herkunft);
  zeilen.sort((a,b)=> TP.sort==='status' ? (TP_ORDNUNG[a.s.status]-TP_ORDNUNG[b.s.status])||a.id.localeCompare(b.id)
                  : TP.sort==='wirkung' ? ((+b.k.wirkung||0)-(+a.k.wirkung||0))||a.id.localeCompare(b.id)
                  : a.id.localeCompare(b.id));
  const geaendert=tpGeaendert(schluessel);
  const b=datei&&datei.bearbeitet;
  return `${tpStatistik(schluessel, datei, ids, herkunft)}
  <div class="tp-leiste">
    <label>Sortierung <select class="tb-select" data-tpsort>
      ${[['id','Kennung'],['status','Status'],['wirkung','Wirkung ↓']].map(([k,l])=>`<option value="${k}"${TP.sort===k?' selected':''}>${l}</option>`).join('')}</select></label>
    ${darf?`<button class="btn klein" data-tpalle="${schluessel}" title="Setzt alle offenen Maßnahmen auf „umgesetzt“ (Entwurf)">Alle offenen als umgesetzt</button>`:''}
    <span class="tp-rechts">
      ${b?`<span class="pf-hinweis">zuletzt bearbeitet ${esc(b.am||'')} · ${esc(b.durch||'')}</span>`:''}
      <button class="btn klein" data-tpverlauf="${schluessel}">🕘 Verlauf</button>
      ${darf?`<button class="btn klein" data-tpverwerfen="${schluessel}"${geaendert?'':' disabled'}>Verwerfen</button>
        <button class="btn klein primary" data-tpspeichern="${schluessel}"${geaendert?'':' disabled'}>Speichern (${geaendert})</button>`:''}
    </span>
  </div>
  <table class="tab tp-tabelle">
    <thead><tr><th style="width:118px">Kennung</th><th>Maßnahme</th><th style="width:58px">Kat.</th>
      <th style="width:62px" title="Wirkungspunktzahl aus dem Katalog">Wirkung</th><th style="width:150px">Status</th><th style="width:30%">Notiz</th></tr></thead>
    <tbody>${zeilen.map(z=>{
      const ent=!!(TP.entwurf[schluessel]||{})[z.id];
      return `<tr class="${ent?'tp-entwurf':''}">
        <td><code style="font-size:11px">${esc(z.id)}</code>${z.herkunft==='bedrohung'?'<div><span class="pill" title="Empfohlen von einer anwendbaren Bedrohung — Ergänzung zur Klassifikation. Passt sie nicht, auf „nicht anwendbar“ setzen.">Bedrohung</span></div>':''}${z.zusatz?'<div><span class="pill info" title="Zusätzlich empfohlen aus der ergänzenden Analyse (Schritt 7)">zusätzlich</span></div>':''}</td>
        <td><b>${esc(z.k.name)}</b>${z.k.beschreibung?`<div class="tp-beschreibung">${esc(String(z.k.beschreibung).slice(0,220))}</div>`:''}</td>
        <td>${esc(z.k.kat||'—')}</td>
        <td class="num">${esc(z.k.wirkung??'—')}</td>
        <td>${darf?`<select class="pf-input tp-status ${TP_CLS[z.s.status]}" data-tpstatus="${schluessel}|${esc(z.id)}" aria-label="Status ${esc(z.id)}">
            ${TP_STATUS.map(([k,l])=>`<option value="${k}"${z.s.status===k?' selected':''}>${l}</option>`).join('')}</select>`
          :`<span class="pill ${TP_CLS[z.s.status]}">${TP_LABEL[z.s.status]}</span>`}</td>
        <td>${darf?`<input type="text" class="pf-input" maxlength="2000" data-tpnotiz="${schluessel}|${esc(z.id)}" value="${esc(z.s.notiz)}" placeholder="Wer, bis wann, Nachweis …" aria-label="Notiz ${esc(z.id)}">`
          :esc(z.s.notiz||'')}</td></tr>`;}).join('')
      ||'<tr><td colspan="6" class="pf-text">Keine Maßnahme mit diesem Status.</td></tr>'}</tbody></table>`;
}

/* ── Planquellen ───────────────────────────────────────────────────── */
function tpPlanVVT(v){
  const t=K.tom[v.id], erg=K.ergaenzend[v.id];
  const soll=tpIds(t&&t.soll), zusatz=tpIds(erg&&erg.zusatz_toms).filter(id=>!soll.includes(id));
  const herkunft=Object.fromEntries(((t&&t.soll)||[]).filter(x=>x&&typeof x==='object'&&x.herkunft).map(x=>[x.id,x.herkunft]));
  return {schluessel:'vvt:'+v.id, datei:t, ids:[...soll,...zusatz], zusatz, herkunft,
          url:`api/kette/${encodeURIComponent(v.id)}/tom/umsetzung`, pfad:`tom/tom-${v.id}.json`,
          titel:`Maßnahmenplan ${v.uid} ${v.titel}`};
}
function tpPlanBaseline(){
  const b=K.baseline;
  return {schluessel:'baseline', datei:b, ids:tpIds(b&&b.toms), zusatz:[],
          url:'api/kette/_baseline/umsetzung', pfad:'tom/baseline-organisation.json',
          titel:'Organisationsweite Maßnahmen'};
}
function tpPlan(schluessel){
  if(schluessel==='baseline') return tpPlanBaseline();
  const v=VVT.find(x=>'vvt:'+x.id===schluessel); return v?tpPlanVVT(v):null;
}

/* ── Entwurf ändern ────────────────────────────────────────────────── */
function tpSetzen(schluessel, id, feld, wert){
  const plan=tpPlan(schluessel); if(!plan) return;
  const datei=plan.datei;
  const u=((datei&&datei.umsetzung)||{})[id]||{};
  const alt={status:u.status||'offen', notiz:u.notiz||''};
  const neu={...tpStand(schluessel,datei,id), [feld]:wert};
  const e=TP.entwurf[schluessel]=TP.entwurf[schluessel]||{};
  if(neu.status===alt.status && (neu.notiz||'')===alt.notiz) delete e[id]; else e[id]=neu;
}

async function tpSpeichern(schluessel){
  const plan=tpPlan(schluessel); const e=TP.entwurf[schluessel]; if(!plan||!e) return;
  const n=Object.keys(e).length;
  pfDialog('Maßnahmenplan speichern',
    `<p class="pf-text">${n} Änderung${n===1?'':'en'} an „${esc(plan.titel)}“ werden als ein Commit gespeichert.</p>
     <div class="pf-gruppe pf-begruendung"><label class="pf-label" for="pf-begruendung">Begründung</label>
       <textarea id="pf-begruendung" class="pf-input" rows="2" placeholder="z. B. Rückmeldung Amt 33 vom …"></textarea></div>`,
    `<button class="btn" data-pf="schliessen">Abbrechen</button><button class="btn primary" data-tpok="${esc(schluessel)}">Speichern</button>`);
  document.getElementById('pf-begruendung').focus();
}
async function tpSpeichernOk(schluessel){
  const plan=tpPlan(schluessel); const e=TP.entwurf[schluessel]; if(!plan||!e) return;
  const knopf=document.querySelector(`#pf-dialog [data-tpok]`);
  knopf.disabled=true; knopf.textContent='Speichert …';
  const begr=(document.getElementById('pf-begruendung').value||'').trim();
  try{
    const r=await fetch(plan.url,{method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({massnahmen:e, ...(begr?{_begruendung:begr}:{})})});
    if(!r.ok) throw new Error(await pfFehlertext(r));
    const a=await r.json();
    if(schluessel==='baseline') K.baseline=a.datei;
    else K.tom[schluessel.slice(4)]=a.datei;
    delete TP.entwurf[schluessel];
    kettenstaendeErmitteln();
    pfSchliessen(); renderModul();
    toast(a.gespeichert?'Maßnahmenplan gespeichert':'Keine Änderung — nichts gespeichert');
  }catch(err){
    knopf.disabled=false; knopf.textContent='Speichern';
    pfMeldung('Nicht gespeichert: '+err.message);
  }
}

/* ── Ereignisse ────────────────────────────────────────────────────── */
document.addEventListener('change', e=>{
  const st=e.target.closest('[data-tpstatus]');
  if(st){ const [s,id]=st.dataset.tpstatus.split('|'); tpSetzen(s,id,'status',st.value); renderModul(); return; }
  const so=e.target.closest('[data-tpsort]');
  if(so){ TP.sort=so.value; renderModul(); }
});
document.addEventListener('input', e=>{
  const no=e.target.closest('[data-tpnotiz]'); if(!no) return;
  const [s,id]=no.dataset.tpnotiz.split('|'); tpSetzen(s,id,'notiz',no.value);
  /* Ohne Neuzeichnen, sonst verlöre das Feld den Fokus — nur Zähler und Markierung nachziehen */
  no.closest('tr').classList.toggle('tp-entwurf', !!(TP.entwurf[s]||{})[id]);
  const n=tpGeaendert(s);
  const knopf=document.querySelector(`[data-tpspeichern="${CSS.escape(s)}"]`);
  if(knopf){ knopf.textContent=`Speichern (${n})`; knopf.disabled=!n; }
  const weg=document.querySelector(`[data-tpverwerfen="${CSS.escape(s)}"]`);
  if(weg) weg.disabled=!n;
});
document.addEventListener('click', e=>{
  const t=e.target;
  const f=t.closest('[data-tpfilter]'); if(f){ TP.filter=TP.filter===f.dataset.tpfilter?'':f.dataset.tpfilter; renderModul(); return; }
  const hk=t.closest('[data-tpherkunft]'); if(hk){ TP.herkunft=TP.herkunft===hk.dataset.tpherkunft?'':hk.dataset.tpherkunft; renderModul(); return; }
  const a=t.closest('[data-tpalle]');
  if(a){ const s=a.dataset.tpalle, plan=tpPlan(s); if(!plan) return;
    plan.ids.forEach(id=>{ if(tpStand(s,plan.datei,id).status==='offen') tpSetzen(s,id,'status','umgesetzt'); });
    renderModul(); toast('Alle offenen auf „umgesetzt“ gesetzt — noch nicht gespeichert'); return; }
  const sp=t.closest('[data-tpspeichern]'); if(sp&&!sp.disabled){ tpSpeichern(sp.dataset.tpspeichern); return; }
  const ok=t.closest('[data-tpok]'); if(ok){ tpSpeichernOk(ok.dataset.tpok); return; }
  const vw=t.closest('[data-tpverwerfen]'); if(vw){ delete TP.entwurf[vw.dataset.tpverwerfen]; renderModul(); return; }
  const vl=t.closest('[data-tpverlauf]');
  if(vl){ const plan=tpPlan(vl.dataset.tpverlauf); if(!plan) return;
    PFLEGE['tp:'+plan.schluessel]={label:'Maßnahmenplan', roh:()=>[], pfad:()=>plan.pfad, name:()=>plan.titel};
    pfVerlauf('tp:'+plan.schluessel, plan.titel); }
});
document.addEventListener('keydown', e=>{
  if((e.key==='Enter'||e.key===' ') && e.target.matches && e.target.matches('[data-tpfilter],[data-tpherkunft]')){ e.preventDefault(); e.target.click(); }
});
/* Ungespeicherten Entwurf nicht still verlieren */
window.addEventListener('beforeunload', e=>{
  if(Object.values(TP.entwurf).some(x=>Object.keys(x).length)){ e.preventDefault(); e.returnValue=''; }
});
