/* ══ Ereignisse ═══════════════════════════════════════════════════════ */
document.addEventListener('click', e=>{
  const t=e.target;
  const closest=s=>t.closest(s);

  /* Rail / Startkacheln */
  const rail=closest('[data-modul]');
  if(rail){ geheZu(rail.dataset.modul); return; }

  /* Navigation über Pills und Buttons: data-go="modul:id" */
  const go=closest('[data-go]');
  if(go){
    const [modul,id]=go.dataset.go.split(':');
    const o={};
    if(id){
      if(modul==='vvt') o.vt=id;
      if(modul==='prozesse') o.prozess=id;
      if(modul==='datenspeicher') o.dstore=id;
      if(modul==='regelungen') o.regelung=id;
      if(modul==='organisation') o.oe=id;
    }
    geheZu(modul,o); return;
  }

  /* Listenauswahl */
  const oe=closest('[data-oe]');
  if(oe){ S.auswahl.organisation=oe.dataset.oe; renderModul(); return; }
  const pr=closest('[data-prozess]');
  if(pr){ S.auswahl.prozesse=pr.dataset.prozess; renderModul(); return; }
  const dst=closest('[data-dstore]');
  if(dst){ S.auswahl.datenspeicher=dst.dataset.dstore; renderModul(); return; }
  const rg=closest('[data-regelung]');
  if(rg){ S.auswahl.regelungen=rg.dataset.regelung; renderModul(); return; }
  const vt=closest('[data-vt]');
  if(vt){ S.auswahl.vvt=vt.dataset.vt; setzeKontext('vt',vt.dataset.vt); renderModul(); renderVorschlaege(); return; }

  /* Kontext setzen / lösen */
  const sk=closest('[data-setkontext]');
  if(sk){ const [typ,id]=sk.dataset.setkontext.split(':'); setzeKontext(typ,id); toast('Kontext gesetzt'); return; }
  if(closest('#kchip-x')){ loeseKontext(); toast('Kontext gelöst'); return; }

  /* Kontextbausteine an/aus */
  const kk=closest('[data-kk]');
  if(kk){ const k=kk.dataset.kk; S.kkAus.has(k)?S.kkAus.delete(k):S.kkAus.add(k); renderAssistKontext(); return; }

  /* TOM-Tabs */
  const tk=closest('[data-tomkat]');
  if(tk){ S.tomKat=tk.dataset.tomkat; renderModul(); return; }
  const tt=closest('[data-tomtab]');
  if(tt){ S.tomTab=tt.dataset.tomtab; renderModul(); return; }
  const gk=closest('[data-gkat]');
  if(gk){ S.graphKat=gk.dataset.gkat; S.graphSel=null; renderModul(); return; }
  const gs=closest('[data-gsort]');
  if(gs){ S.graphSort=gs.dataset.gsort; renderModul(); return; }
  const gsel=closest('[data-gsel]');
  if(gsel){ S.graphNurSel=gsel.dataset.gsel==='1'; renderModul(); return; }
  const vs2=closest('[data-vsicht]');
  if(vs2){ S.vSicht=vs2.dataset.vsicht; S.graphSel=null; renderModul(); return; }
  const gn=closest('#dep-graph .gn');
  if(gn){ graphMarkieren(gn.dataset.id); return; }
  if(closest('#dep-graph')){ graphMarkieren(null); return; }

  /* Spalte ein-/ausklappen */
  if(closest('#spalte-zu-btn')){ S.spalteZu=true; document.body.classList.add('spalte-zu'); return; }
  if(closest('#spalte-auf-btn')){ S.spalteZu=false; document.body.classList.remove('spalte-zu'); return; }

  /* Liste erweitern */
  const mehr=closest('[data-mehr]');
  if(mehr){ const m=mehr.dataset.mehr; S.limit[m]=(S.limit[m]||120)+200; renderModul(); return; }

  /* Speichern (simuliert) */
  const sp=closest('[data-speichern]');
  if(sp){ toast(sp.dataset.speichern+' gespeichert · Commit im Audit-Trail'); return; }

  /* Bericht */
  const be=closest('[data-bericht]');
  if(be){ toast('„'+be.dataset.bericht+'" wird erzeugt …'); return; }

  /* Audit */
  const df=closest('[data-diff]');
  if(df){ toast('Diff für '+df.dataset.diff+' (im Prototyp nicht hinterlegt)'); return; }
  const rv=closest('[data-revert]');
  if(rv){ toast('Rückgängig erzeugt einen neuen Commit — Historie bleibt erhalten'); return; }

  /* Fragen an den Assistenten */
  const fr=closest('[data-frage]');
  if(fr){
    if(!$('#vollchat').classList.contains('offen')) document.body.classList.remove('assist-zu');
    frage(fr.dataset.frage); return;
  }

  /* Quellen-Pill aus einer Antwort */
  const q=closest('[data-quelle]');
  if(q){
    const id=q.dataset.quelle;
    if(vtById(id)){ vollchatZu(); geheZu('vvt',{vt:id}); }
    else if(procById(id)){ vollchatZu(); geheZu('prozesse',{prozess:id}); }
    else if(dsById(id)){ vollchatZu(); geheZu('datenspeicher',{dstore:id}); }
    else if(regById(id)){ vollchatZu(); geheZu('regelungen',{regelung:id}); }
    else if(OE.some(o=>o.id===id)){ vollchatZu(); geheZu('organisation',{oe:id}); }
    else if(TOMS.some(x=>x.id===id)){ vollchatZu(); geheZu('tom'); }
    else toast('Externe Quelle: '+id);
    return;
  }

  /* Aktionsvorschlag */
  const ak=closest('[data-aktion]');
  if(ak){
    const [n,i]=ak.dataset.aktion.split(':').map(Number);
    const m=S.verlauf.find(x=>x.nr===n);
    const a=m&&m.aktionen&&m.aktionen[i];
    if(!a) return;
    ak.classList.add('getan'); ak.textContent='✓ '+a.t;
    if(a.speichern){ toast(a.speichern+' — Vorschlag übernommen, Bestätigung im Modul erforderlich'); }
    if(a.kontext){ setzeKontext('vt', a.kontext); toast('Kontext übernommen'); }
    if(a.go){
      const o={};
      if(a.vt) o.vt=a.vt;
      if(a.ziel){
        if(a.go==='prozesse') o.prozess=a.ziel;
        else if(a.go==='datenspeicher') o.dstore=a.ziel;
        else if(a.go==='organisation') o.oe=a.ziel;
        else if(a.go==='regelungen') o.regelung=a.ziel;
        else if(a.go==='vvt') o.vt=a.ziel;
      }
      setTimeout(()=>{ vollchatZu(); geheZu(a.go,o); },320);
    }
    return;
  }

  /* Suche schließen */
  if(!closest('#search-wrap')) $('#search-results').classList.remove('open');
});

/* Listenfilter */
document.addEventListener('change', e=>{
  const a=e.target.closest('[data-vamt]');
  if(a){ S.vAmt=a.value; S.graphSel=null; renderModul(); }
});
document.addEventListener('input', e=>{
  const f=e.target.closest('[data-filter]');
  if(!f) return;
  const m=f.dataset.filter;
  S.filter[m]=f.value;
  S.limit[m]=120;
  const pos=f.selectionStart;
  renderModul();
  const neu=document.querySelector(`[data-filter="${m}"]`);
  if(neu){ neu.focus(); try{ neu.setSelectionRange(pos,pos); }catch(_){} }
});

/* Topbar-Schalter */
$('#btn-dark').onclick=()=>{ document.body.classList.toggle('dark');
  $('#btn-dark').textContent=document.body.classList.contains('dark')?'☀':'🌙'; };
$('#btn-assist').onclick=()=>document.body.classList.toggle('assist-zu');
$('#assist-zu').onclick=()=>document.body.classList.add('assist-zu');
$('#assist-leeren').onclick=assistLeeren;
$('#rail-toggle').onclick=()=>document.body.classList.toggle('rail-slim');

/* Eingabe Seitenpanel */
function autoHoehe(el,max){ el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,max)+'px'; }
$('#eingabe').addEventListener('input',e=>autoHoehe(e.target,120));
$('#eingabe').addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); frage(e.target.value); e.target.value=''; autoHoehe(e.target,120); }
});
$('#senden').onclick=()=>{ const i=$('#eingabe'); frage(i.value); i.value=''; autoHoehe(i,120); };

/* Vollbild-Chat */
function vollchatAuf(){
  $('#vollchat').classList.add('offen');
  $('#vc-modell').innerHTML=$('#modell-select').innerHTML;
  renderVerlauf(); renderAssistKontext();
  setTimeout(()=>$('#vc-eingabe').focus(),40);
}
function vollchatZu(){ $('#vollchat').classList.remove('offen'); }
$('#btn-chat').onclick=vollchatAuf;
$('#assist-voll').onclick=vollchatAuf;
$('#vc-zu').onclick=vollchatZu;
$('#vc-neu').onclick=()=>{ assistLeeren(); toast('Neues Gespräch'); };
$('#vc-eingabe').addEventListener('input',e=>autoHoehe(e.target,180));
$('#vc-eingabe').addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); frage(e.target.value); e.target.value=''; autoHoehe(e.target,180); }
});
$('#vc-senden').onclick=()=>{ const i=$('#vc-eingabe'); frage(i.value); i.value=''; autoHoehe(i,180); };

document.addEventListener('keydown',e=>{
  /* [ klappt die Listenspalte um — nicht während einer Texteingabe */
  if(e.key==='[' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)){
    if(document.querySelector('.spalte-auf')){
      S.spalteZu=!S.spalteZu; document.body.classList.toggle('spalte-zu', S.spalteZu);
    }
    return;
  }
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){ e.preventDefault();
    $('#vollchat').classList.contains('offen')?vollchatZu():vollchatAuf(); }
  if(e.key==='Escape'){ vollchatZu(); $('#search-results').classList.remove('open'); }
});

/* Threads */
function renderThreads(){
  $('#vc-thread-liste').innerHTML=S.threads.length?S.threads.map(t=>`
    <div class="thread${t.id===S.thread?' active':''}" data-thread="${t.id}">
      <div class="thread-titel">${esc(t.titel)}</div><div class="thread-zeit">${t.zeit}</div></div>`).join('')
    : '<div style="padding:18px 15px;font-size:12px;color:var(--fg-ghost);line-height:1.6">Noch keine Gespräche. Verläufe werden im Prototyp nicht gespeichert.</div>';
}
document.addEventListener('click',e=>{
  const th=e.target.closest('[data-thread]');
  if(th){ S.thread=th.dataset.thread; renderThreads(); }
});

/* Globale Suche */
$('#search').addEventListener('input',e=>{
  const q=e.target.value.trim().toLowerCase();
  const box=$('#search-results');
  if(q.length<2){ box.classList.remove('open'); return; }
  const tref=(arr,typ,nameF,subF)=>arr.filter(x=>nameF(x).toLowerCase().includes(q))
    .slice(0,4).map(x=>({typ,id:x.id,name:nameF(x),sub:subF(x)}));
  const g=[
    ['Organisationseinheiten', tref(OE,'organisation',o=>o.name,o=>o.id)],
    ['Prozesse',               tref(PROZESSE,'prozesse',p=>p.name,p=>oeName(p.oe))],
    ['Datenspeicher',          tref(DSTORES,'datenspeicher',d=>d.name,d=>'Schutzstufe '+d.schutz)],
    ['Regelungen',             tref(REGELUNGEN,'regelungen',r=>r.name,r=>r.typ)],
    ['Verarbeitungstätigkeiten',tref(VVT,'vvt',v=>v.uid+' '+v.titel,v=>oeName(v.oe))],
    ['Maßnahmen (TOM)',        tref(TOMS,'tom',t=>t.id+' '+t.name,t=>t.kat+' · '+t.typ)],
  ].filter(([,l])=>l.length);
  box.innerHTML = g.length
    ? g.map(([label,list])=>`<div class="sr-group">${label}</div>`+
        list.map(x=>`<div class="sr-item" data-go="${x.typ}:${x.id}"><div>${esc(x.name)}</div><div class="sr-sub">${esc(x.sub)}</div></div>`).join('')).join('')
    : `<div class="sr-empty">Nichts gefunden zu „${esc(e.target.value)}"</div>`;
  box.classList.add('open');
});
$('#search').addEventListener('keydown',e=>{ if(e.key==='Escape'){ e.target.value=''; $('#search-results').classList.remove('open'); }});
document.addEventListener('click',e=>{ if(e.target.closest('.sr-item')){ $('#search-results').classList.remove('open'); $('#search').value=''; }});

/* ══ Spaltenbreiten mit der Maus ══════════════════════════════════════
   Die Breiten liegen als CSS-Variablen am :root, nicht am Element — deshalb
   überleben sie das Neuzeichnen eines Moduls. Doppelklick setzt zurück. */
const BREITEN={
  rail:  {var:'--b-rail',   min:150, max:420, standard:224},
  liste: {var:'--b-liste',  min:190, max:640, standard:290},
  kette: {var:'--b-kette',  min:170, max:520, standard:230},
  assist:{var:'--b-assist', min:250, max:700, standard:330},
};
function breiteSetzen(art, px){
  const b=BREITEN[art]; if(!b) return;
  const w=Math.max(b.min, Math.min(b.max, Math.round(px)));
  document.documentElement.style.setProperty(b.var, w+'px');
  S.breiten=S.breiten||{}; S.breiten[art]=w;
}
function griffAnlegen(el, art, seite){
  if(!el || el.querySelector(':scope > .griff')) return;
  const g=document.createElement('div');
  g.className='griff griff-'+(seite==='rechts'?'rechts':'links');
  g.dataset.griff=art;
  g.title='Ziehen zum Verbreitern · Doppelklick setzt zurück';
  g.setAttribute('role','separator');
  g.setAttribute('aria-orientation','vertical');
  el.appendChild(g);
}
function griffeAnlegen(){
  griffAnlegen(document.getElementById('rail'),   'rail',   'rechts');
  griffAnlegen(document.getElementById('assist'), 'assist', 'links');
  griffAnlegen(document.querySelector('.liste'),  'liste',  'rechts');
  griffAnlegen(document.querySelector('.kette'),  'kette',  'rechts');
}
(function(){
  let art=null, startX=0, startW=0, seite='rechts';
  document.addEventListener('mousedown', e=>{
    const g=e.target.closest('.griff'); if(!g) return;
    art=g.dataset.griff; seite=g.classList.contains('griff-links')?'links':'rechts';
    startX=e.clientX;
    startW=g.parentElement.getBoundingClientRect().width;
    g.classList.add('zieht'); document.body.classList.add('zieht');
    e.preventDefault();
  });
  document.addEventListener('mousemove', e=>{
    if(!art) return;
    const d=e.clientX-startX;
    breiteSetzen(art, seite==='links' ? startW-d : startW+d);
  });
  document.addEventListener('mouseup', ()=>{
    if(!art) return;
    document.querySelectorAll('.griff.zieht').forEach(x=>x.classList.remove('zieht'));
    document.body.classList.remove('zieht');
    art=null;
  });
  document.addEventListener('dblclick', e=>{
    const g=e.target.closest('.griff'); if(!g) return;
    const b=BREITEN[g.dataset.griff]; if(!b) return;
    breiteSetzen(g.dataset.griff, b.standard);
    toast('Spaltenbreite zurückgesetzt');
  });
})();

/* Datenquelle */
$('#btn-reload').onclick=()=>datenLaden();
$('#btn-ordner').onclick=()=>ordnerOeffnen();

/* Admin-Buttons — Cache leeren + Index neu bauen */
$('#btn-cache-refresh').onclick=async()=>{
  const btn=$('#btn-cache-refresh');
  btn.classList.add('admin-spin'); btn.disabled=true;
  try{
    const r=await fetch('api/admin/cache/refresh',{method:'POST'});
    const d=await r.json();
    if(d.ok) toast('✅ Cache geleert — Daten werden beim nächsten Laden frisch vom Dateisystem gelesen');
    else toast('❌ Cache-Refresh fehlgeschlagen: '+d.fehler);
  }catch(e){ toast('❌ Server nicht erreichbar'); }
  btn.classList.remove('admin-spin'); btn.disabled=false;
};
$('#btn-reindex').onclick=async()=>{
  const btn=$('#btn-reindex');
  if(!confirm('Index neu bauen? Dauert etwa 2 Minuten auf dem Server. Fortfahren?')) return;
  btn.classList.add('admin-spin'); btn.disabled=true; toast('🏗️ Index wird neu gebaut …');
  try{
    const r=await fetch('api/admin/reindex',{method:'POST'});
    const d=await r.json();
    if(d.ok) toast('✅ Index neu gebaut ('+d.output_tail.join('; ')+')');
    else toast('❌ Reindex fehlgeschlagen: '+(d.fehler||'Exit '+d.exit_code));
  }catch(e){ toast('❌ Server nicht erreichbar'); }
  btn.classList.remove('admin-spin'); btn.disabled=false;
};

/* ── Start ─────────────────────────────────────────────────────────── */
renderRail();
renderModul();
renderKontext();
renderAssistKontext();
renderVerlauf();
renderThreads();
griffeAnlegen();
datenLaden();
modellSuchen();
