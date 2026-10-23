/* ── VVT ───────────────────────────────────────────────────────────── */
function mVVT(){
  const sel=S.auswahl.vvt, v=vtById(sel);
  const stufeCls={A:'',B:'',C:'warn',D:'err',E:'err'};
  return `
  <div class="liste">
    <div class="liste-kopf"><div><p>Verarbeitungstätigkeiten</p><span>${filtern('vvt',lfAnwenden('vvt',VVT),x=>x.titel+' '+x.uid+' '+oeName(x.oe)).treffer.length} von ${VVT.length} · Art. 30 DSGVO</span></div>
      <span class="kopf-knoepfe">${uebersichtKnopf('vvt')}${pflegeNeuKnopf('vvt')}</span></div>
    <div class="liste-suche"><input type="search" placeholder="VVT durchsuchen …" data-filter="vvt" value="${esc(S.filter.vvt)}"></div>
    ${lfBalken('vvt')}
    <div class="liste-scroll">${(()=>{const g=filtern('vvt',lfAnwenden('vvt',VVT),x=>x.titel+' '+x.uid+' '+oeName(x.oe));return g.sichtbar.map(x=>{
      const k=KETTE[x.id]||{}, fertig=Object.values(k).filter(s=>s==='done').length;
      const st=schutzstufe(x);
      return `<div class="li${x.id===sel?' active':''}" data-vt="${x.id}">
        <div class="li-txt"><div class="li-name">${esc(x.titel)}</div>
        <div class="li-sub">${dqPunkt(x.id)}<code style="font-size:10.5px">${x.uid}</code>
          <span>${esc(oeName(x.oe))}</span>
          ${st?`<span class="pill ${stufeCls[st]||''}">${st}</span>`:'<span class="pill err">ohne Stufe</span>'}
          <span class="pill ${fertig===4?'ok':fertig?'warn':''}">${fertig}/4</span></div></div>
      </div>`;}).join('')+mehrBtn('vvt',g);})()||'<div class="leer-hinweis" style="padding:26px">Keine Treffer</div>'}</div>
  </div>
  <div class="detail">
    ${!v?startseite('vvt'):`
    <h2>${esc(v.titel)}</h2>
    <div class="detail-id">${v.id} · UID ${esc(v.uid)} · ${esc(oeName(v.oe))} · Status ${esc(v.status||'—')} · Bereich ${vvtBereich(v)||'—'}${v.stand?' · Stand '+esc(v.stand):''}</div>
    <div class="aktionsleiste" style="margin:0 0 20px;padding:0;border:none">
      <button class="btn klein primary" data-go="besonderheiten:">Kette fortsetzen →</button>
      <button class="btn klein" data-frage="Ist die Rechtsgrundlage für ${v.titel.replace(/"/g,'')} tragfähig?">Rechtsgrundlage prüfen lassen</button>
      <button class="btn klein" data-go="berichte:">Bericht erzeugen</button>
      ${pflegeKnoepfe('vvt',v.id)}
    </div>
    ${(()=>{ const w=vvtVerwaist(v.id); return w.length?`<div class="hinweis warn"><b>Referenzprüfung:</b> ${w.length}
      Verweis${w.length===1?'':'e'} ins Leere — ${w.map(([a,id])=>`${esc(a)} <code>${esc(id)}</code>`).join(', ')}.
      Der Server lehnt das Speichern ab, bis sie entfernt sind oder bewusst trotzdem gespeichert wird.</div>`:''; })()}
    ${dqHinweis(v.id)}
    ${schutzstufe(v)?`<div class="hinweis">Abgeleitete Schutzstufe: <b>${schutzstufe(v)}</b>
       (Maximum über ${(v.dstores||[]).length} verknüpfte Datenspeicher)${hatArt9(v)?' · <b>Art. 9 DSGVO betroffen</b>':''}</div>`
      :`<div class="hinweis warn">Keine Schutzstufe ableitbar — es ist kein Datenspeicher verknüpft.
        Solange das fehlt, ist die Risikobewertung nicht belastbar.</div>`}
    <div class="sektion"><div class="sektion-label">Verarbeitung</div>
      <div class="form-grid">
        <div class="feld voll" style="grid-column:1/-1"><div class="feld-label">Zweck</div><div class="feld-wert">${esc(v.zweck)}</div></div>
        <div class="feld" style="grid-column:1/-1"><div class="feld-label">Rechtsgrundlage</div><div class="feld-wert">${esc(v.rechtsgrundlage)}</div></div>
        <div class="feld"><div class="feld-label">Kategorien betroffener Personen</div><div class="feld-wert">${esc(v.betroffene)}</div></div>
        <div class="feld"><div class="feld-label">Kategorien personenbezogener Daten</div><div class="feld-wert">${esc(v.datenarten)}</div></div>
        <div class="feld"><div class="feld-label">Empfänger</div><div class="feld-wert">${esc(v.empfaenger)}</div></div>
        <div class="feld"><div class="feld-label">Löschfrist</div><div class="feld-wert">${esc(v.frist)}</div></div>
        <div class="feld"><div class="feld-label">Drittlandtransfer</div><div class="feld-wert">${esc(v.drittland)}</div></div>
        <div class="feld"><div class="feld-label">Software / Verarbeitungsmittel</div><div class="feld-wert">${esc(v.software)}</div></div>
      </div></div>
    <div class="sektion"><div class="sektion-label">Verknüpft</div>
      <div class="feld"><div class="feld-label">Prozesse</div><div class="pill-reihe" style="margin-top:4px">
        ${(v.prozesse||[]).map(p=>procById(p)?`<span class="pill link" data-go="prozesse:${p}">${esc(procById(p).name)}</span>`
            :`<span class="pill err" title="Diesen Prozess gibt es im Bestand nicht">${esc(p)} — fehlt</span>`).join('')||'—'}</div></div>
      <div class="feld" style="margin-top:12px"><div class="feld-label">Datenspeicher</div><div class="pill-reihe" style="margin-top:4px">
        ${(v.dstores||[]).map(d=>dsById(d)?`<span class="pill link" data-go="datenspeicher:${d}">${esc(dsById(d).name)} · ${dsById(d).schutz||'?'}</span>`
            :`<span class="pill err" title="Diesen Datenspeicher gibt es im Bestand nicht">${esc(d)} — fehlt</span>`).join('')||'—'}</div></div>
      <div class="feld" style="margin-top:12px"><div class="feld-label">Organisationseinheit</div><div class="pill-reihe" style="margin-top:4px">
        <span class="pill link" data-go="organisation:${v.oe}">${esc(oeName(v.oe))}</span></div></div>
    </div>
    <div class="sektion"><div class="sektion-label">Datenschutzkette</div>
      ${vvtKette(v)}</div>
    `}
  </div>`;
}

/* Datenschutzkette einer VVT (Stufe 3): alle sieben Dateien je VVT mit
   Stand. Die Kette erzeugen die Generatoren aus VVT, Datenspeichern und
   Prozessen (deploy/kette_neu.sh); nach Änderungen daran ist sie neu zu
   erzeugen — die Maske tut das nicht. */
function vvtKette(v){
  const glieder=[
    ['bes','Besonderheiten','besonderheiten','besonderheiten'],
    ['schwellwert','Schwellwertanalyse','schwellenwert','schwellwert'],
    ['risiko','Risikoanalyse','risiko','risiko'],
    ['bedrohungen','Bedrohungen','tom',null],
    ['tom','TOM (Soll/Ist)','tom','tom'],
    ['ergaenzend','Ergänzende Analyse','tom',null],
    ['dsfa','DSFA','dsfa','dsfa'],
  ];
  const k=KETTE[v.id]||{};
  const zeilen=glieder.map(([z,name,modul,stand])=>{
    const da=!!(K[z]&&K[z][v.id]);
    const st=stand?k[stand]:null;
    /* DSFA nur bei DSFA-Pflicht (Schwellwert), ergänzende Analyse nur bei
       Schutzbedarf über normal (Risiko) — Regel wie in kette_neu.sh */
    const noetig = z==='dsfa' ? !!((K.schwellwert[v.id]||{}).dsfa_pflicht_gesamt)
                 : z==='ergaenzend' ? String(((K.risiko[v.id]||{}).basis_risiko||{}).schutzbedarf||'normal').toLowerCase()!=='normal'
                 : true;
    const pill=!da ? (noetig ? '<span class="pill err">fehlt</span>' : '<span class="pill">nicht erforderlich</span>')
      : st ? `<span class="pill ${st==='done'?'ok':st==='wip'?'warn':''}">${STAND_PILL[st][1]}</span>` : '<span class="pill ok">vorhanden</span>';
    return `<tr><td><span class="link" data-go="${modul}:">${esc(name)}</span></td><td>${pill}</td></tr>`;
  }).join('');
  return `<table class="tab" style="max-width:560px"><tbody>${zeilen}</tbody></table>
    <div class="pf-hinweis" style="margin-top:8px">Die Kette wird aus VVT, Datenspeichern und Prozessen erzeugt
      (<code>kette_neu.sh</code>). Nach Änderungen an Datenspeichern oder Prozessen dieser VVT ist sie neu zu erzeugen.
      DSFA und ergänzende Analyse entstehen nur bei Bedarf (DSFA-Pflicht bzw. Schutzbedarf über normal).</div>`;
}

/* ── Ketten-Sidebar (für Besonderheiten/Schwellenwert/Risiko/TOM) ──── */
function ketteSidebar(){
  const id=S.kontext.typ==='vt'?S.kontext.id:S.auswahl.vvt;
  const v=id?vtById(id):null;
  const k=v?(KETTE[v.id]||{}):{};
  const schritte=[
    {id:'vvt', name:'VVT-Eintrag', st:'done'},
    {id:'besonderheiten', name:'Besonderheiten', st:k.besonderheiten||'offen'},
    {id:'schwellenwert', name:'Schwellenwert', st:k.schwellenwert||'offen'},
    {id:'risiko', name:'Risikoanalyse', st:k.risiko||'offen'},
    {id:'tom', name:'TOM & Gefahren', st:k.tom||'offen'},
    {id:'dsfa', name:'DSFA', st:k.dsfa||'offen'},
  ];
  return `<div class="kette">
    <div class="kette-kopf"><p>Datenschutzkette</p>
      <div class="kette-vt">${v?`<b>${v.uid}</b><br>${esc(v.titel)}`:'<span style="color:var(--fg-ghost)">Keine Verarbeitungstätigkeit gewählt</span>'}</div></div>
    <div class="kette-liste">${schritte.map((s,i)=>`
      <div class="kette-schritt${S.modul===s.id?' active':''}" data-go="${s.id}:">
        <div class="kette-dot ${s.st==='done'?'done':s.st==='wip'?'wip':s.st==='unbekannt'?'unbekannt':''}">${s.st==='done'?'✓':s.st==='unbekannt'?'?':i+1}</div>
        <div class="kette-txt"><div class="kette-name">${s.name}</div>
          <div class="kette-stand">${STAND_PILL[s.st][1]}</div></div>
      </div>`).join('')}</div>
    <div style="padding:12px 15px;border-top:1px solid var(--line)">
      <button class="btn klein" style="width:100%" data-go="vvt:">Andere VT wählen</button></div>
  </div>`;
}
function keineVT(text){
  return `<div class="detail"><div class="leer-hinweis">${text}<br><br>
    <button class="btn klein" data-go="vvt:">Zum VVT</button></div></div>`;
}
function aktiveVT(){ const id=S.kontext.typ==='vt'?S.kontext.id:S.auswahl.vvt; return id?vtById(id):null; }

/* ── Besonderheiten ────────────────────────────────────────────────── */
function keineQuelle(titel, was, quelle){
  return `<div class="detail">
    <h2>${titel}</h2>
    <div class="detail-id">keine Datenquelle angebunden</div>
    <div class="hinweis warn">
      <b>Hier steht bewusst nichts.</b><br>
      ${was} liegen in <code>${quelle}</code>. Dafür gibt es im Prototyp keine Schnittstelle.
      Erfundene Werte an dieser Stelle wären schlimmer als eine leere Maske: Sie sähen aus wie
      ein Bearbeitungsstand und würden gegen den echten Bestand geprüft werden.
      <br><br>Erforderlich: <code>GET/PUT /api/besonderheiten|schwellenwert|risiko/{vvt_id}</code>
      (Stufe 6 des Migrationspfads).
    </div>
  </div>`;
}
function mBesonderheiten(){
  const v=aktiveVT();
  if(!v) return ketteSidebar()+keineVT('Für die Besonderheiten wird eine Verarbeitungstätigkeit benötigt.');
  const b=K.bes[v.id];
  if(!b) return ketteSidebar()+`<div class="detail"><h2>Besonderheiten</h2>
    <div class="detail-id">${esc(v.uid)} · ${esc(v.titel)}</div>
    <div class="hinweis warn">Für diese Verarbeitungstätigkeit liegt keine Datei
      <code>bes-${esc(v.id)}.json</code> vor. Von ${VVT.length} VVT-Einträgen sind
      ${Object.keys(K.bes).length} erfasst.</div></div>`;
  const A=b.art||{}, U=b.umfang||{}, M=b.umstaende||{}, G=b.gesamt||{};
  const ja=x=>x?'<span class="pill err">ja</span>':'<span class="pill">nein</span>';
  const sens=A.sensitive_daten||{};
  const zeile=(k,w)=>`<tr><td>${k}</td><td>${w}</td></tr>`;
  return ketteSidebar()+`<div class="detail">
    <h2>Besonderheiten</h2>
    <div class="detail-id">${esc(b.id)} · Stand ${esc((b.meta||{}).erstellt_am||'—')} · Status ${esc((b.meta||{}).status||'—')}</div>

    <div class="karten" style="margin-bottom:20px">
      <div class="karte"><div class="karte-zahl">${G.schadenshoehe??'—'}</div><div class="karte-label">Schadenshöhe</div>
        <div class="karte-fuss">Maximum der drei Achsen</div></div>
      <div class="karte"><div class="karte-zahl">${G.risiko_art??'—'}</div><div class="karte-label">Art der Daten</div></div>
      <div class="karte"><div class="karte-zahl">${G.risiko_umfang??'—'}</div><div class="karte-label">Umfang</div></div>
      <div class="karte"><div class="karte-zahl">${G.risiko_umstaende??'—'}</div><div class="karte-label">Umstände</div></div>
    </div>

    <div class="sektion"><div class="sektion-label">Art der Daten</div>
      <table class="tab" style="max-width:760px"><tbody>
        ${zeile('Schutzstufe', esc(String((A.schutzstufe||{}).wert ?? (A.schutzstufe||{}).stufe ?? '—')))}
        ${zeile('Art. 9 DSGVO — besondere Kategorien', ja(sens.art9))}
        ${zeile('Art. 10 DSGVO — Straftaten', ja(sens.art10))}
        ${zeile('Ordnungswidrigkeiten', ja(sens.owi))}
        ${zeile('Beschäftigtendaten', ja(sens.beschaeftigte))}
        ${zeile('Sozialdaten (§ 67 Abs. 2 SGB X)', ja(sens.sozialdaten))}
      </tbody></table></div>

    <div class="sektion"><div class="sektion-label">Umfang</div>
      <table class="tab" style="max-width:760px"><tbody>
        ${zeile('Anzahl Betroffener', esc(String((U.anzahl_betroffene||{}).kategorie ?? (U.anzahl_betroffene||{}).wert ?? '—')))}
        ${zeile('Datenmenge', esc(String((U.datenmenge||{}).kategorie ?? (U.datenmenge||{}).wert ?? '—')))}
        ${zeile('Speicherdauer', esc(String((U.speicherdauer||{}).kategorie ?? (U.speicherdauer||{}).wert ?? '—')))}
        ${zeile('Geografische Reichweite', esc(String((U.geografische_reichweite||{}).kategorie ?? (U.geografische_reichweite||{}).wert ?? '—')))}
      </tbody></table></div>

    <div class="sektion"><div class="sektion-label">Umstände</div>
      <table class="tab" style="max-width:760px"><tbody>
        ${Object.entries(M).filter(([k,x])=>typeof x==='object'&&x).map(([k,x])=>
          zeile(esc(k.replace(/_/g,' ')), esc(Object.entries(x).map(([a2,b2])=>`${a2}: ${b2}`).join(' · ').slice(0,140)))).join('')}
      </tbody></table></div>

    <div class="aktionsleiste"><button class="btn" data-go="schwellenwert:">Weiter zur Schwellwertanalyse →</button></div>
  </div>`;
}function ableitbar(v){
  const o={};
  if(hatArt9(v)) o.art9=true;
  if(/MS365|Microsoft/i.test(v.software||'')) o.microsoft365=true;
  if(/SaaS|Cloud|Rechenzentrum/i.test(v.software||'')) o.cloud=true;
  if(/Auftragsverarbeiter/i.test(v.empfaenger||'')) o.auftragsverarbeitung=true;
  if(/Beschäftigte|Beamt/i.test(v.betroffene||'')) o.beschaeftigtendaten=true;
  if(/Sozialdaten|SGB/i.test((v.datenarten||'')+(v.rechtsgrundlage||''))) o.sozialdaten=true;
  if(/Straftat|Vorstrafe|Führungszeugnis|Ordnungswidrigkeit/i.test(v.datenarten||'')) o.art10=true;
  if(/Video/i.test((v.datenarten||'')+(v.software||''))) o.videoueberwachung=true;
  return o;
}
function ableitungsgrund(v,k){
  return ({
    art9:'mindestens ein verknüpfter Datenspeicher ist als Art.-9-Kategorie klassifiziert',
    microsoft365:'im Feld Verarbeitungsmittel genannt',
    cloud:'im Feld Verarbeitungsmittel genannt',
    auftragsverarbeitung:'im Feld Empfänger als Auftragsverarbeiter genannt',
    beschaeftigtendaten:'im Feld Kategorien betroffener Personen genannt',
    sozialdaten:'in Datenkategorien oder Rechtsgrundlage genannt',
    art10:'in den Datenkategorien genannt',
    videoueberwachung:'in Datenkategorien oder Verarbeitungsmitteln genannt',
  })[k]||'aus dem VVT-Eintrag abgeleitet';
}
/* ── Schwellenwertanalyse ──────────────────────────────────────────── */
function mSchwellenwert(){
  const v=aktiveVT();
  if(!v) return ketteSidebar()+keineVT('Für die Schwellwertanalyse wird eine Verarbeitungstätigkeit benötigt.');
  const w=K.schwellwert[v.id];
  if(!w) return ketteSidebar()+`<div class="detail"><h2>Schwellwertanalyse</h2>
    <div class="detail-id">${esc(v.uid)} · ${esc(v.titel)}</div>
    <div class="hinweis warn">Keine Datei <code>schwellwert-${esc(v.id)}.json</code> vorhanden.</div></div>`;
  const pflicht=w.dsfa_pflicht_gesamt;
  const block=(titel,obj)=>`<table class="tab" style="max-width:940px"><tbody>${
    Object.entries(obj||{}).map(([k,x])=>`<tr>
      <td style="width:56%">${esc(k.replace(/^\d+_/,'').replace(/_/g,' '))}</td>
      <td style="width:90px">${x&&x.erfuellt?'<span class="pill err">erfüllt</span>':x&&x.erfuellt===null?'<span class="pill unbekannt">offen</span>':'<span class="pill">nein</span>'}</td>
      <td style="color:var(--fg-faint);font-size:12px">${esc((x&&x.begruendung)||'')}</td></tr>`).join('')}</tbody></table>`;
  return ketteSidebar()+`<div class="detail">
    <h2>Schwellwertanalyse</h2>
    <div class="detail-id">${esc(w.id)} · Stand ${esc(w.erstellt_am||'—')} · Status ${esc(w.status||'—')}</div>
    <div class="hinweis ${pflicht?'warn':''}">
      <b>Ergebnis: ${pflicht?'DSFA erforderlich':'keine DSFA-Pflicht'}.</b>
      ${w.dsfa_pflicht_begruendung?` Auslöser: ${esc(w.dsfa_pflicht_begruendung)}.`:''}
      ${w.art35_erfuellt?' Art. 35 Abs. 3 DSGVO erfüllt.':''}
      ${w.wp248_erfuellt?` WP 248: ${w.wp248_anzahl} Kriterien erfüllt.`:` WP 248: ${w.wp248_anzahl??0} Kriterien.`}
    </div>
    <div class="sektion"><div class="sektion-label">Art. 35 Abs. 3 DSGVO</div>${block('',w.art35_abs3)}</div>
    <div class="sektion"><div class="sektion-label">WP 248 rev.01 (${w.wp248_anzahl??0} von 9)</div>${block('',w.wp248)}</div>
    <div class="sektion"><div class="sektion-label">Muss-Liste LfD Niedersachsen</div>
      <div class="feld-wert">${(w.mussliste_lfd||{}).erfuellt===null?'<span class="pill unbekannt">manuell zu prüfen</span>':((w.mussliste_lfd||{}).erfuellt?'<span class="pill err">erfüllt</span>':'<span class="pill">nicht erfüllt</span>')}
      <div style="color:var(--fg-faint);font-size:12px;margin-top:5px">${esc((w.mussliste_lfd||{}).begruendung||'')}</div></div></div>
    <div class="aktionsleiste"><button class="btn" data-go="risiko:">Weiter zur Risikoanalyse →</button>
      ${pflicht?'<button class="btn primary" data-go="dsfa:">Zur DSFA →</button>':''}</div>
  </div>`;
}/* ── Risikoanalyse ─────────────────────────────────────────────────── */
function mRisiko(){
  const v=aktiveVT();
  if(!v) return ketteSidebar()+`<div class="detail">
    <h2>Risikoanalyse — Übersicht</h2>
    <div class="detail-id">${Object.keys(K.risiko).length} Analysen · für Einzelheiten eine Verarbeitungstätigkeit wählen</div>
    ${risikoUebersicht()}</div>`;
  const r=K.risiko[v.id];
  if(!r) return ketteSidebar()+`<div class="detail"><h2>Risikoanalyse</h2>
    <div class="detail-id">${esc(v.uid)} · ${esc(v.titel)}</div>
    <div class="hinweis warn">Keine Datei <code>risiko-${esc(v.id)}.json</code> vorhanden.</div></div>`;
  const B=r.basis_risiko||{};
  const dim=[['DSGVO',B.dsgvo],['BSI Vertraulichkeit',B.bsi_vertraulichkeit],
             ['BSI Integrität',B.bsi_integritaet],['BSI Verfügbarkeit',B.bsi_verfuegbarkeit]];
  const cls=n=>n>=9?'err':n>=6?'warn':'ok';
  return ketteSidebar()+`<div class="detail">
    <h2>Risikoanalyse</h2>
    <div class="detail-id">${esc(r.id)} · Stand ${esc((r.meta||{}).erstellt_am||'—')} · ${esc((r.meta||{}).durchgefuehrt_von||'')}</div>

    <div class="karten" style="margin-bottom:20px">
      <div class="karte"><div class="karte-zahl">${B.gesamtwert??'—'}</div><div class="karte-label">Gesamtrisiko (Maximum)</div>
        <div class="karte-fuss"><span class="pill ${cls(B.gesamtwert||0)}">${esc(B.schutzbedarf||'—')}</span></div></div>
      <div class="karte"><div class="karte-zahl">${(r.besonderheiten_referenz||{}).schadenshoehe_aus_besonderheiten??'—'}</div>
        <div class="karte-label">Schadenshöhe</div><div class="karte-fuss">aus den Besonderheiten</div></div>
      <div class="karte"><div class="karte-zahl">${B.eintrittswahrscheinlichkeit??'—'}</div><div class="karte-label">Eintrittswahrscheinlichkeit</div>
        <div class="karte-fuss">${esc(B.eintrittswahrscheinlichkeit_begruendung||'')}</div></div>
      <div class="karte"><div class="karte-zahl">${B.dsfa_pflicht?'ja':'nein'}</div><div class="karte-label">DSFA-Pflicht aus Risiko</div>
        <div class="karte-fuss">${esc(B.dsfa_hinweis||'')}</div></div>
    </div>

    <div class="sektion"><div class="sektion-label">Vier Dimensionen — Maximalprinzip</div>
      <table class="tab" style="max-width:820px">
        <thead><tr><th>Dimension</th><th class="num" style="width:80px">Wert</th><th>Begründung</th></tr></thead>
        <tbody>${dim.map(([n,d])=>`<tr><td>${n}</td>
          <td class="num"><span class="pill ${cls((d||{}).wert||0)}">${(d||{}).wert??'—'}</span></td>
          <td style="color:var(--fg-mute);font-size:12px">${esc((d||{}).begruendung||'')}</td></tr>`).join('')}
        </tbody></table></div>

    <div class="sektion"><div class="sektion-label">Risikomatrix — Schadenshöhe × Eintrittswahrscheinlichkeit</div>
      ${risikoMatrix((r.besonderheiten_referenz||{}).schadenshoehe_aus_besonderheiten, B.eintrittswahrscheinlichkeit)}
      <div style="font-size:12px;color:var(--fg-faint);margin-top:8px;max-width:940px">
        Umrandet steht die Position dieser Verarbeitungstätigkeit. Der Gesamtwert ${B.gesamtwert??'—'}
        stammt aus dem Maximum der vier Dimensionen und kann über dem Produkt der Basisachsen liegen.</div></div>

    <div class="hinweis">Das Gesamtrisiko ist das Maximum der vier Dimensionen, nicht ihr Mittel:
      Ein hoher Wert lässt sich nicht durch niedrige Werte in anderen Schutzzielen ausgleichen.</div>
    <div class="aktionsleiste"><button class="btn" data-go="tom:">Weiter zu TOM &amp; Gefahren →</button></div>
  </div>`;
}/* ── Dashboard ─────────────────────────────────────────────────────── */
function mTOM(){
  const v=aktiveVT();
  if(!v) return ketteSidebar()+keineVT('Für TOM und Gefahren wird eine Verarbeitungstätigkeit benötigt.');
  const t=K.tom[v.id], bed=K.bedrohungen[v.id], erg=K.ergaenzend[v.id];
  if(!t) return ketteSidebar()+`<div class="detail"><h2>TOM &amp; Gefahren</h2>
    <div class="detail-id">${esc(v.uid)} · ${esc(v.titel)}</div>
    <div class="hinweis warn">Keine Datei <code>tom-${esc(v.id)}.json</code> vorhanden.
      Erfasst sind ${Object.keys(K.tom).length} von ${VVT.length} Verarbeitungstätigkeiten.</div></div>`;
  /* soll/ist führen je nach Generator Kennungen oder {id, name} */
  const soll=tpIds(t.soll), ist=tpIds(t.ist), tab=S.tomTab, lim=S.limit.tomListe||60;
  const plan=tpPlanVVT(v), basis=tpPlanBaseline();
  const quote=soll.length?Math.round(ist.length/soll.length*100):0;
  const tomById=id=>TOMS.find(x=>x.id===id)||{id,name:'(nicht im Katalog)',kat:'—',typ:'—'};
  return ketteSidebar()+`<div class="detail">
    <h2>TOM &amp; Gefahren</h2>
    <div class="detail-id">${esc(t.id)} · Stand ${esc(t.erstellt_am||'—')} · Status ${esc(t.status||'—')}</div>
    ${t.bearbeitet&&t.bearbeitet.vvt_stand&&v.stand&&t.bearbeitet.vvt_stand!==v.stand?`<div class="hinweis warn">Die VVT wurde nach der letzten Bearbeitung des Plans geändert (Stand ${esc(v.stand)}, Plan auf Stand ${esc(t.bearbeitet.vvt_stand)}). Soll-Maßnahmen prüfen; neu abgeleitet werden sie beim nächsten Lauf von <code>kette_neu.sh</code>, der Umsetzungsstand bleibt dabei erhalten.</div>`:''}
    <div class="karten" style="margin-bottom:18px">
      <div class="karte"><div class="karte-zahl">${soll.length}</div><div class="karte-label">SOLL-Maßnahmen</div>
        <div class="karte-fuss">${esc(t.soll_herkunft||'')}</div></div>
      <div class="karte"><div class="karte-zahl">${ist.length}</div><div class="karte-label">als umgesetzt gemeldet</div>
        <div class="balken"><i style="width:${quote}%"></i></div></div>
      <div class="karte"><div class="karte-zahl">${t.delta ?? (soll.length-ist.length)}</div><div class="karte-label">Delta</div>
        <div class="karte-fuss">${ist.length?'':'<span class="pill warn">IST liegt bei den Fachämtern</span>'}</div></div>
      <div class="karte"><div class="karte-zahl">${bed?(bed.threats||[]).length:'—'}</div><div class="karte-label">anwendbare Bedrohungen</div>
        <div class="karte-fuss">${bed?`${bed.gb_immer||0} Grund · ${bed.vb_bedingt||0} verfahrensspez.`:''}</div></div>
    </div>
    ${erg?`<div class="sektion"><div class="sektion-label">Ergänzende Risikoanalyse (Schritt 7)</div>
      <div class="form-grid drei">
        <div class="feld"><div class="feld-label">Risiko aktuell</div><div class="feld-wert">
          ${Object.entries(erg.risiko_aktuell||{}).map(([k,w])=>`<span class="pill ${w>=9?'err':w>=6?'warn':''}">${esc(k.toUpperCase())} ${w}</span>`).join(' ')}</div></div>
        <div class="feld"><div class="feld-label">Zusätzliche Maßnahmen</div><div class="feld-wert">${erg.anzahl_zusatz??0}
          <span style="color:var(--fg-faint);font-size:11px"> · Baseline angerechnet: ${erg.baseline_angerechnet??'—'}</span></div></div>
        <div class="feld"><div class="feld-label">Restrisiko</div><div class="feld-wert">
          <span class="pill ${(erg.restrisiko||{}).bewertung==='offen'?'unbekannt':''}">${esc((erg.restrisiko||{}).bewertung||'—')}</span>
          <div style="font-size:11px;color:var(--fg-faint);margin-top:3px">${esc((erg.restrisiko||{}).begruendung||'')}</div></div></div>
      </div>
      ${(erg.zusatz_toms||[]).length?`<div class="feld" style="margin-top:12px"><div class="feld-label">Zusätzlich empfohlen</div>
        <div class="pill-reihe" style="margin-top:4px">${erg.zusatz_toms.map(x=>`<span class="pill info">${esc(x.id)} ${esc(x.name||'')}</span>`).join('')}</div></div>`:''}
      ${(erg.schutzziele_hoch||[]).length?`<div class="feld" style="margin-top:12px"><div class="feld-label">Schutzziele mit hohem Bedarf</div>
        <div class="pill-reihe" style="margin-top:4px">${erg.schutzziele_hoch.map(z=>`<span class="pill warn">${esc(z)}</span>`).join('')}</div></div>`:''}
    </div>`:''}
    <div class="sektion">
      <div style="display:flex;gap:6px;margin-bottom:12px">
        <button class="btn klein${tab==='toms'?' primary':''}" data-tomtab="toms">⚙ Maßnahmenplan (${plan.ids.length})</button>
        <button class="btn klein${tab==='baseline'?' primary':''}" data-tomtab="baseline">🏢 Organisationsweit (${basis.ids.length})</button>
        <button class="btn klein${tab==='threats'?' primary':''}" data-tomtab="threats">🛡 Bedrohungen (${bed?(bed.threats||[]).length:0})</button>
        <button class="btn klein${tab==='graph'?' primary':''}" data-tomtab="graph">🕸 Graph</button>
      </div>
      ${tab==='graph'?tomGraph(bed?(bed.threats||[]):[], soll, ist):''}
      ${tab==='toms'?tpTabelle(plan.schluessel, plan.datei, plan.ids, plan.zusatz):''}
      ${tab==='baseline'?`<div class="hinweis" style="margin-bottom:12px">Organisationsweite Grundmaßnahmen — einmal für die
        ganze Organisation umgesetzt und an alle VVT vererbt. Stand gilt für alle Verarbeitungstätigkeiten.</div>
        ${basis.datei?tpTabelle(basis.schluessel, basis.datei, basis.ids):'<p class="pf-text">Keine baseline-organisation.json geladen.</p>'}`:''}
      ${tab==='graph'||tab==='toms'||tab==='baseline'?'':`
      <table class="tab">
        <thead><tr><th style="width:150px">ID</th><th>Bedrohung</th><th style="width:120px">Typ</th></tr></thead>
        <tbody>${bed?(bed.threats||[]).slice(0,lim).map(x=>`<tr>
          <td><code style="font-size:11px">${esc(x.id||'')}</code></td>
          <td>${esc(String(x.beschreibung||x.name||'').slice(0,240))}</td>
          <td><span class="pill">${esc(x.typ||x.bedrohungstyp||'')}</span></td></tr>`).join(''):''}
        </tbody></table>`}
    </div>
    <div class="aktionsleiste"><button class="btn" data-go="dsfa:">Zur DSFA →</button></div>
  </div>`;
}

/* ══ Abhängigkeitsgraph Gefährdungen ↔ Maßnahmen ══════════════════════
   Nachbau der Übersicht aus DS-TOM: zwei Spalten, Kanten aus dem Feld
   `empfohlene_massnahmen` der Gefährdungen. Klick auf einen Knoten hebt
   seine Verbindungen hervor. Der Graph beantwortet die Frage, die eine
   Tabelle nicht beantwortet: Welche Maßnahme trägt wie viele Gefährdungen —
   und welche Gefährdung steht ohne Maßnahme da.                         */
function tomGraph(threats, sollIds, ist){
  const kat=S.graphKat||'', nurSel=S.graphNurSel!==false;
  const tById=id=>BEDROHUNGEN.find(x=>x.id===id)||{};
  const mById=id=>TOMS.find(x=>x.id===id)||{id,name:'(nicht im Katalog)',kat:'—'};

  let G=threats.map(t=>({...tById(t.id), ...t})).filter(t=>t.id);
  if(kat) G=G.filter(t=>t.kat===kat||t.kategorie===kat);

  const kanten=[];
  G.forEach(t=>((t.massnahmen)||[]).forEach(m=>{
    if(nurSel && sollIds.length && !sollIds.includes(m)) return;
    kanten.push([t.id,m]);
  }));
  const mIds=[...new Set(kanten.map(k=>k[1]))].sort();
  const grad={}; kanten.forEach(([,m])=>grad[m]=(grad[m]||0)+1);
  const tGrad={}; kanten.forEach(([t])=>tGrad[t]=(tGrad[t]||0)+1);
  const sort=S.graphSort||'refs';
  const mSort=[...mIds].sort((a,b)=> sort==='refs' ? (grad[b]-grad[a])||a.localeCompare(b)
    : sort==='wirkung' ? ((mById(b).wirkung||0)-(mById(a).wirkung||0))||a.localeCompare(b)
    : a.localeCompare(b));
  const tSort=[...G].sort((a,b)=>(tGrad[b.id]||0)-(tGrad[a.id]||0)||a.id.localeCompare(b.id));

  const H=22, oben=30, breite=940, xL=250, xR=breite-250;
  const hoehe=Math.max(tSort.length,mSort.length)*H+oben+20;
  const yT={}, yM={};
  tSort.forEach((t,i)=>yT[t.id]=oben+i*H);
  mSort.forEach((m,i)=>yM[m]=oben+i*H);
  const ohne=tSort.filter(t=>!(tGrad[t.id]||0));
  const hub=mSort[0];

  const kantenSvg=kanten.map(([t,m])=>{
    const y1=yT[t], y2=yM[m];
    if(y1==null||y2==null) return '';
    return `<path class="gk" data-t="${esc(t)}" data-m="${esc(m)}"
      d="M${xL} ${y1} C${xL+90} ${y1}, ${xR-90} ${y2}, ${xR} ${y2}"/>`;
  }).join('');

  const knotenT=tSort.map(t=>`<g class="gn gn-t" data-id="${esc(t.id)}">
      <circle cx="${xL}" cy="${yT[t.id]}" r="4"/>
      <text x="${xL-10}" y="${yT[t.id]+4}" text-anchor="end">${esc(t.id)} · ${esc(String(t.name||t.beschreibung||'').slice(0,42))}</text>
      <text class="gd" x="${xL+9}" y="${yT[t.id]+4}">${tGrad[t.id]||0}</text></g>`).join('');
  const knotenM=mSort.map(m=>{const o=mById(m); const um=ist.includes(m);
    return `<g class="gn gn-m${um?' um':''}" data-id="${esc(m)}">
      <circle cx="${xR}" cy="${yM[m]}" r="4"/>
      <text x="${xR+10}" y="${yM[m]+4}">${esc(m)} · ${esc(String(o.name||'').slice(0,44))}</text>
      <text class="gd" x="${xR-9}" y="${yM[m]+4}" text-anchor="end">${grad[m]||0}</text></g>`;}).join('');

  const kats=[...new Set(BEDROHUNGEN.map(x=>x.kat).filter(Boolean))].sort();
  const linksN=tSort.map(t=>({id:t.id,label:`${t.id} · ${String(t.name||t.beschreibung||'')}`,grad:tGrad[t.id]||0}));
  const rechtsN=mSort.map(m=>({id:m,label:`${m} · ${String(mById(m).name||'')}`,grad:grad[m]||0,
                               cls:ist.includes(m)?'um':''}));
  return `
  <div class="karten" style="margin-bottom:14px">
    <div class="karte"><div class="karte-zahl">${tSort.length}</div><div class="karte-label">Gefährdungen</div></div>
    <div class="karte"><div class="karte-zahl">${mSort.length}</div><div class="karte-label">verknüpfte Maßnahmen</div></div>
    <div class="karte"><div class="karte-zahl">${kanten.length}</div><div class="karte-label">Verknüpfungen</div></div>
    <div class="karte"><div class="karte-zahl" style="font-size:15px">${hub?esc(hub):'—'}</div>
      <div class="karte-label">zentralste Maßnahme</div>
      <div class="karte-fuss">${hub?`deckt ${grad[hub]} Gefährdungen · ${esc(String(mById(hub).name||'').slice(0,40))}`:''}</div></div>
    <div class="karte"><div class="karte-zahl ${ohne.length?'':''}">${ohne.length}</div>
      <div class="karte-label">ohne Maßnahme</div>
      ${ohne.length?`<div class="karte-fuss"><span class="pill warn">Lücke</span></div>`:''}</div>
  </div>

  <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
    <span style="font-size:11px;color:var(--fg-faint);text-transform:uppercase;letter-spacing:.07em">Kategorie</span>
    <button class="btn klein${kat?'':' primary'}" data-gkat="">alle</button>
    ${kats.map(k=>`<button class="btn klein${kat===k?' primary':''}" data-gkat="${esc(k)}">${esc(k)}</button>`).join('')}
    <span style="width:14px"></span>
    <span style="font-size:11px;color:var(--fg-faint);text-transform:uppercase;letter-spacing:.07em">Sortierung</span>
    ${[['refs','Häufigkeit'],['wirkung','Wirkung'],['id','ID']].map(([k,t])=>
      `<button class="btn klein${sort===k?' primary':''}" data-gsort="${k}">${t}</button>`).join('')}
    <span style="width:14px"></span>
    <button class="btn klein${nurSel?' primary':''}" data-gsel="${nurSel?'0':'1'}">${nurSel?'nur SOLL-Maßnahmen':'alle empfohlenen'}</button>
  </div>

  ${graphSvg(linksN, rechtsN, kanten, 'Gefährdungen', 'Maßnahmen')}`;
}

