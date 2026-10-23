/* ── Audit ─────────────────────────────────────────────────────────── */
function mAudit(){
  return `<div class="start-inner">
    <h2 style="font-size:21px;font-weight:600">Audit-Trail</h2>
    <p style="color:var(--fg-mute);margin:6px 0 22px;font-size:13.5px">
      Jede Änderung an Stammdaten und VVT erzeugt einen Git-Commit — Rechenschaftspflicht nach Art. 5 Abs. 2 DSGVO.</p>
    <div class="hinweis warn"><b>Keine Historie geladen.</b> Der Audit-Trail kommt aus
      <code>GET /api/audit</code> des Nexus-Servers. Im Betrieb ohne Server (Momentaufnahme oder
      Ordnerzugriff) gibt es hier nichts anzuzeigen — eine Beispielhistorie stünde sonst
      neben echten Daten und wäre von ihnen nicht zu unterscheiden.</div>
    <div class="sektion" style="margin-top:22px"><div class="sektion-label">Vorgesehene Endpunkte</div>
      <table class="tab" style="max-width:760px"><tbody>
        <tr><td><code>GET /api/audit?n=50</code></td><td style="color:var(--fg-mute)">letzte Commits</td></tr>
        <tr><td><code>GET /api/audit/{hash}/diff</code></td><td style="color:var(--fg-mute)">Änderung im Detail</td></tr>
        <tr><td><code>POST /api/audit/{hash}/revert</code></td><td style="color:var(--fg-mute)">rückgängig als neuer Commit</td></tr>
      </tbody></table></div>
  </div>`;
}
/* ── Admin ─────────────────────────────────────────────────────────── */
function mAdmin(){
  const rollen=[
    ['Leser','lesen','lesen','lesen','–'],
    ['Fachbereich','lesen','eigene OE bearbeiten','lesen','–'],
    ['DSB','lesen','alles bearbeiten','alles','Audit'],
    ['Organisation','bearbeiten','lesen','lesen','Audit'],
    ['Admin','bearbeiten','bearbeiten','alles','alles'],
  ];
  const q={live:'REST-API des Nexus-Servers', snapshot:'Momentaufnahme nexus-daten.json',
           ordner:'gewählter Datenordner', fallback:'Notdaten im Quelltext', laedt:'wird geladen'};
  const el=document.getElementById('datenstand');
  const art=el?el.className:'fallback';
  return `<div class="start-inner">
    <h2 style="font-size:21px;font-weight:600">Administration</h2>
    <p style="color:var(--fg-mute);margin:6px 0 22px;font-size:13.5px">Datenquelle, Modellanbindung, Rollenmodell.</p>

    <div class="sektion-label" style="max-width:940px">Tatsächlicher Zustand</div>
    <table class="tab" style="max-width:760px"><tbody>
      <tr><td>Datenquelle</td><td><b>${esc(q[art]||art)}</b></td></tr>
      <tr><td>Geladen</td><td>${OE.length} Einheiten · ${PROZESSE.length} Prozesse · ${DSTORES.length} Datenspeicher · ${VVT.length} VVT · ${REGELUNGEN.length} Regelungen</td></tr>
      <tr><td>TOM-Katalog</td><td>${TOMS.length} Maßnahmen · ${BEDROHUNGEN.length} Bedrohungen</td></tr>
      <tr><td>Sprachmodell</td><td>${MODELL.art?`<span class="pill ok">${esc({nexus:'Nexus-Server',gateway:'Hermes-Gateway',ollama:'Ollama lokal'}[MODELL.art])}</span> ${MODELL.modelle.map(esc).join(', ')}`:'<span class="pill warn">keines erreichbar</span>'}</td></tr>
      <tr><td>DSMS-Datenbank</td><td><span class="pill unbekannt">nicht angebunden</span> — Besonderheiten, Schwellenwert, Risiko, TOM-Umsetzungsstand</td></tr>
      <tr><td>Nutzerverwaltung</td><td><span class="pill unbekannt">nicht angebunden</span> — Tabelle <code>users</code> der DSMS-Anwendung</td></tr>
      <tr><td>Git-Audit</td><td><span class="pill unbekannt">nicht angebunden</span> — <code>/api/audit</code></td></tr>
    </tbody></table>

    <div class="sektion-label" style="margin-top:30px;max-width:940px">Vorgesehenes Rollenmodell (Entwurf, nicht implementiert)</div>
    <table class="tab">
      <thead><tr><th>Rolle</th><th>Stammdaten</th><th>Datenschutz</th><th>Auswertung</th><th>System</th></tr></thead>
      <tbody>${rollen.map(r=>`<tr>${r.map((c,i)=>i===0?`<td><b>${c}</b></td>`:`<td style="color:var(--fg-mute)">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <div class="hinweis" style="margin-top:18px">Der Assistent muss dieselbe Rechtegrenze bei den
      Werkzeugaufrufen einhalten — serverseitig erzwungen, nicht im Prompt. Ein Prompt ist keine
      Zugriffskontrolle.</div>
  </div>`;
}
