/* ══ KI-Assistent ═════════════════════════════════════════════════════ */

/* Kontextabhängige Vorschläge */
function vorschlaegeFuer(){
  const v=aktiveVT();
  const base={
    start:['Wo steht die Datenschutzdokumentation gerade?','Welche VT haben keine Schutzstufe?'],
    organisation:['Welche Prozesse verantwortet diese Einheit?','Fehlen VVT-Einträge zu dieser Einheit?'],
    prozesse:['Ist dieser Prozess im VVT abgebildet?','Welche Datenarten werden hier verarbeitet?'],
    datenspeicher:['Welche VT nutzen diese Datenart?','Ist die Löschfrist rechtlich haltbar?'],
    regelungen:['Welche TOM setzt diese Regelung um?','Ist die Regelung noch aktuell?'],
    vvt:['Ist die Rechtsgrundlage tragfähig?','Fehlen Angaben nach Art. 30 DSGVO?'],
    besonderheiten:['Welche Besonderheiten übersehe ich hier?','Was folgt aus Art. 9 für diese VT?'],
    schwellenwert:['Ist eine DSFA erforderlich?','Was sagt die LfD Niedersachsen dazu?'],
    risiko:['Ist die Schadenshöhe angemessen?','Welche Schäden drohen den Betroffenen?'],
    tom:['Welche TOM fehlen noch?','Welche Bedrohungen sind hier relevant?'],
    dashboard:['Wo ist der größte Rückstand?','Welche VT sollte ich zuerst bearbeiten?'],
    berichte:['Was gehört in den DSFA-Bericht?','Erstelle eine Gliederung für den Tätigkeitsbericht'],
    referenzen:['Was sagt das SDM zur Zweckbindung?','Gibt es Aufsichtsfälle zu Meldedaten?'],
    audit:['Was wurde diese Woche geändert?','Wer hat die Risikobewertung geändert?'],
    admin:['Welche Rolle braucht ein Fachbereich?','Ist die Rechtevergabe datenschutzkonform?'],
  }[S.modul]||[];
  return v?base.map(t=>t):base;
}
function renderVorschlaege(){
  const vs=vorschlaegeFuer();
  $('#vorschlaege').innerHTML = S.verlauf.length?'' :
    vs.map(t=>`<button class="vorschlag" data-frage="${esc(t)}">${esc(t)}</button>`).join('');
}

/* ══ Kontextauflösung ═════════════════════════════════════════════════
   Kern der Anforderung: Mitarbeitende fragen offen — sie kennen weder
   VT-Nummern noch Prozess-IDs. Der Assistent muss den Bezug selbst
   herstellen. Im Betrieb übernimmt das die semantische Suche über den
   Embedding-Index; hier wird sie durch eine gewichtete Token-Suche
   nachgebildet, damit das Verhalten beurteilbar ist.
   ═══════════════════════════════════════════════════════════════════ */

const STOPP = new Set((
 'ich du er sie es wir ihr die der das ein eine einen einem einer und oder aber wenn wie was wer wo wann warum '+
 'welche welcher welches per von vom für fuer mit ohne auf an in im zu zur zum bei nach über ueber unter auch '+
 'noch nur schon nicht kein keine ist sind war waren haben hat hatte werden wird wurde man sich dass da denn als am '+
 /* Modal- und Allerweltsverben: sie sind im Bestand selten und würden dadurch
    als „besonders spezifisch" gelten — sie tragen aber keine Sachaussage. */
 'kann kannst können koennen darf dürfen duerfen muss müssen muessen soll sollen will wollen möchte moechte '+
 'brauche brauchen benötige benoetige benötigen benoetigen dürfte duerfte sollte müsste muesste könnte koennte '+
 'machen mache tun geben gebe bitte eigentlich überhaupt ueberhaupt jemand etwas dafür dafuer damit '+
 /* Deklinierte Artikel und Pronomen: im Bestand selten genug, um als
    spezifisch zu gelten, aber ohne jede Sachaussage. */
 'eines einesteils dieses diese diesem diesen dieser jenes jener seines seiner seinem ihres ihrer ihrem '+
 'unseres unserer deren dessen welchem welchen jeder jede jedes alle allen aller solche solcher mehrere '+
 'legen lege stellen stelle bekommen erhalten erhalte nutzen nutze verwenden verwende weiter weitere'
).split(/\s+/));

/* Wörter, die beschreiben, *was man tun will* — nicht, *worum es geht*.
   Sie bleiben für die Bewertung erhalten, dürfen aber nie den Ausschlag geben:
   „aufbewahren" kommt im Bestand nur zweimal vor und gilt damit als hoch
   spezifisch — es führte die Frage nach Bewerberunterlagen zur „Verwahrung
   sichergestellter Gegenstände". Die Absicht erkennt der Antwortzweig, nicht
   die Entitätssuche. */
const VERFAHRENSVERBEN = new Set((
 'aufbewahr aufbewahren aufbewahrung aufheb aufheben versend versenden verschick verschicken '+
 'übermittl uebermittl übermitteln uebermitteln übermittlung uebermittlung weitergeb weitergeben '+
 'lösch loesch löschen loeschen löschung loeschung vernicht vernichten vernichtung '+
 'speicher speichern speicherung ableg ablegen ablage abheft abheften archivier archivieren '+
 'dokumentier dokumentieren erheb erheben erhebung verarbeit verarbeiten verarbeitung '+
 'einhol einholen anford anfordern weiterleit weiterleiten auskunft'
).split(/\s+/));

/* Einheitliche Schreibweise für Frage und Bestand. Ohne das trifft „Email"
   nicht auf „E-Mail" — und die einschlägige Dienstanweisung bleibt ungefunden. */
function norm(s){
  return String(s||'').toLowerCase()
    .replace(/e[-\s]?mails?/g,' mail ')
    .replace(/[^a-zäöüß0-9\s-]/g,' ')
    .replace(/-/g,' ');
}
function tokens(s){
  return norm(s).split(/\s+/).filter(w=>w.length>3 && !STOPP.has(w));
}

/* Stammbildung: ein einziger Abschneidedurchgang ist zu unzuverlässig —
   „Führungszeugnis" wird zu „führungszeugni", „Führungszeugnisse" zu
   „führungszeugniss". Zwei Stämme, die einander nicht treffen. Deshalb werden
   mehrere Kandidaten gebildet und der längste genommen, der im Bestand
   tatsächlich vorkommt. */
const SUFFIXE=['erinnen','innen','ungen','enen','ende','ern','en','er','es','em','se','n','s','e'];
function stammKandidaten(w){
  const out=[w];
  let c=w;
  for(let i=0;i<3;i++){
    const s=SUFFIXE.find(s=>c.endsWith(s) && c.length-s.length>=5);
    if(!s) break;
    c=c.slice(0,-s.length); out.push(c);
  }
  for(let k=1;k<=3;k++) if(w.length-k>=6) out.push(w.slice(0,w.length-k));
  return [...new Set(out)].sort((a,b)=>b.length-a.length);
}
function stamm(w){
  /* Nicht der längste Kandidat gewinnt, sondern der mit der größten Reichweite:
     „Führungszeugnisse" darf nicht am Plural kleben bleiben, sonst trifft es den
     Eintrag nicht, der den Singular führt. Die Wortgrenze verhindert dabei, dass
     ein kurzer Stamm auf fremde Wortfamilien überspringt. */
  const k=stammKandidaten(w)
    .filter(c=>c.length>=6 || c===w)
    .map(c=>({c, df:idf(c).df}))
    .filter(t=>t.df>0);
  if(!k.length) return w;
  k.sort((a,b)=> (b.df-a.df) || (b.c.length-a.c.length));
  return k[0].c;
}

/* Spezifität eines Begriffs (IDF): „Meldebescheinigung" trennt scharf,
   „Mail" oder „Daten" kommen überall vor und dürfen nicht den Ausschlag geben.
   Der Korpus muss dieselben Felder umfassen, die auch durchsucht werden. */
let _idf=null;
function idf(w){
  if(!_idf){
    const korpus=[
      ...VVT.map(v=>[v.titel,v.zweck,v.datenarten,v.betroffene,v.software,v.empfaenger].join(' ')),
      ...PROZESSE.map(p=>p.name||''),
      ...DSTORES.map(d=>[d.name,(d.tags||[]).join(' ')].join(' ')),
    ].map(norm);
    _idf={korpus, N:Math.max(korpus.length,1), cache:{}};
  }
  if(_idf.cache[w]==null){
    /* Dieselbe Wortgrenze wie in der Suche — sonst gilt ein Begriff als
       vorhanden, den die Suche anschließend nirgends findet. */
    const df=_idf.korpus.reduce((n,t)=>n+(passt(' '+t+' ',w)?1:0),0);
    _idf.cache[w]={df, g:Math.max(0, Math.log(_idf.N/(1+df))/Math.log(_idf.N))};
  }
  return _idf.cache[w];
}
function suchbegriffe(frage){
  /* Seltenheit allein reicht nicht: In diesem Bestand kommt „Mail" zufällig
     seltener vor als „Führungszeugnis" — trotzdem ist das Kompositum der
     Gegenstand der Frage und „per Mail" nur die Art und Weise. Im Deutschen
     korreliert Wortlänge stark mit Spezifität; das fließt hier ein. */
  const laenge=w=>0.6+0.4*Math.min(w.length/14,1);
  return [...new Set(tokens(frage).map(stamm))].filter(w=>w.length>3)
    .map(w=>{ const i=idf(w); return {w, df:i.df, roh:i.g, g:i.g*laenge(w), verb:VERFAHRENSVERBEN.has(w)}; })
    .filter(t=>t.df>0 && t.g>0.25)
    .sort((a,b)=>b.g-a.g);
}
/* Anzeige der Werkzeugargumente: die tatsächlich verwendeten Begriffe */
function anfrageBegriffe(frage){ return suchbegriffe(frage).map(t=>t.w).slice(0,4).join(' '); }
/* Wortanfang-genau: „Meldebescheinigungen" trifft, „Anmeldebescheinigung" nicht. */
const _reCache={};
function passt(txt, w){
  const re=_reCache[w] || (_reCache[w]=new RegExp('(^|[^a-zäöüß])'+w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  return re.test(txt);
}
function treffer(frage, arr, felder, gewicht, traegerPflicht=true){
  const qs=suchbegriffe(frage);
  if(!qs.length) return [];
  /* Trägerbegriffe: die spezifischsten *Sachbegriffe* der Frage — gemessen am
     Spitzenwert unter ihnen, nicht an einer festen Schwelle. Verfahrensverben
     sind ausgenommen; nur wenn die Frage aus nichts anderem besteht, dürfen sie
     ersatzweise tragen. */
  const sach = qs.filter(t=>!t.verb);
  const basis = sach.length?sach:qs;
  const spitze = basis[0].g;
  const traeger = traegerPflicht ? basis.filter(t=>t.g>=spitze-0.15).map(t=>t.w) : [];
  return arr.map(x=>{
    let score=0, wo=[];
    felder.forEach(([f,g])=>{
      const txt=' '+norm(typeof f==='function'?f(x):x[f])+' ';
      /* Spezifität kubisch gewichten: ein Treffer auf den seltenen Fachbegriff
         soll ein Dutzend Treffer auf Allerweltswörter überwiegen. */
      qs.forEach(q=>{ if(passt(txt,q.w)){ score+=g*q.g*q.g*q.g; wo.push(q.w); } });
    });
    wo=[...new Set(wo)];
    /* Wer mehrere Trägerbegriffe zugleich trifft, meint mit hoher
       Wahrscheinlichkeit dasselbe wie die Frage. */
    const n=traeger.filter(w=>wo.includes(w)).length;
    return {x, score:score*gewicht*(1+0.6*Math.max(0,n-1)), wo, traegerTreffer:n};
  }).filter(t=>t.score>0.15 && (!traeger.length || t.traegerTreffer>0))
    .sort((a,b)=>b.score-a.score);
}

/* Nachbildung der MCP-Werkzeugaufrufe. Im Betrieb ruft das Modell diese Tools
   über die beiden MCP-Server auf (koos-knowledge = mandantenspezifisch,
   dsms-knowledge = mandantenneutral); hier lokal simuliert und protokolliert,
   damit sichtbar bleibt, woher eine Aussage stammt. */
function bezugFinden(frage){
  /* Achtung: Das hier sind KEINE MCP-Aufrufe. Es ist eine lokale Suche über den
     geladenen Bestand. Die Namen entsprechen den Werkzeugen, die im Betrieb
     dieselbe Aufgabe übernehmen — das Protokoll ist als „lokal" gekennzeichnet,
     damit niemand die Herkunft verwechselt. */
  const W=[];
  const ruf=(server,tool,args,erg)=>{ W.push({server,tool,args,n:erg.length}); return erg; };
  const q=anfrageBegriffe(frage)||frage.slice(0,40);

  const vt   = ruf('lokal','koos_search_vvt',     {query:q}, treffer(frage, VVT,      [['titel',6],['zweck',2],['datenarten',1],['betroffene',1],['software',1]], 1.0));
  const proc = ruf('lokal','koos_search_prozess', {query:q}, treffer(frage, PROZESSE, [['name',6]], 0.95));
  const ds   = ruf('lokal','koos_search_daten',   {query:q}, treffer(frage, DSTORES,  [['name',5],[x=>(x.tags||[]).join(' '),1]], 0.7));
  const reg  = ruf('lokal','koos_search_regelung',{query:q}, treffer(frage, REGELUNGEN,[['name',5],['kontext',1],['entscheidung',1]], 0.6, false));
  const tom  = ruf('lokal','tom_katalog_suche',  {query:q}, treffer(frage, TOMS,     [['name',4],['beschreibung',1]], 0.5, false));
  /* search_knowledge wird nicht nachgebildet — ohne Index gäbe es nichts zu zählen. */

  /* Prozesstreffer auf die VT hochziehen, die ihn referenziert —
     die VT ist die datenschutzrechtlich maßgebliche Einheit. */
  proc.slice(0,3).forEach(p=>{
    VVT.filter(v=>(v.prozesse||[]).includes(p.x.id)).forEach(v=>{
      const vorh=vt.find(t=>t.x.id===v.id);
      if(vorh) vorh.score+=p.score*0.8;
      else vt.push({x:v, score:p.score*0.8, wo:p.wo, via:p.x});
    });
  });
  vt.sort((a,b)=>b.score-a.score);

  /* Der Bezug ergibt sich aus der Trefferstärke, nicht aus einer festen
     Rangfolge der Typen. „Darf ich Sozialdaten per Mail versenden?" meint die
     Datenart — es wäre falsch, dafür irgendeinen der 16 VVT-Einträge zu
     greifen, die sie beiläufig erwähnen. */
  const kandidaten=[
    vt[0]   && {art:'vt',       t:vt[0]},
    proc[0] && {art:'prozess',  t:proc[0]},
    ds[0]   && {art:'dstore',   t:ds[0]},
    reg[0]  && {art:'regelung', t:reg[0]},
  ].filter(Boolean).sort((a,b)=>b.t.score-a.t.score);
  const kopf=kandidaten[0]||null;
  const best=kopf?kopf.t:null;
  const art=kopf?kopf.art:null;
  /* Schwacher Spitzentreffer: lieber offen sagen, dass der Bezug unklar ist,
     als eine Auskunft auf einen Zufallstreffer zu stützen. */
  const schwach = !best || best.score < 0.35;

  const zweit=kandidaten[1];
  return {vt, proc, ds, reg, tom, best, art, schwach, werkzeuge:W,
          sicher: best && !schwach ? (zweit ? best.score >= zweit.t.score*1.4 : true) : false};
}

/* Bezugsblock, der jeder Antwort vorangestellt wird */
function bezugBlock(b){
  if(!b.best) return '';
  if(b.schwach){
    const k=[...b.vt.slice(0,2).map(t=>`VT ${t.x.uid} ${t.x.titel}`),
             ...b.proc.slice(0,2).map(t=>`Prozess: ${t.x.name}`),
             ...b.ds.slice(0,2).map(t=>`Datenart: ${t.x.name}`)];
    return `_Kein eindeutiger Bezug im Bestand._ Die Frage passt auf keinen Eintrag klar genug, `+
           `um eine Auskunft darauf zu stützen.\n\n`+
           (k.length?`Am nächsten kommen:\n${k.map(x=>'- '+x).join('\n')}\n\n`:'')+
           `---\n\n`;
  }
  const z=[];
  const {v, procs, ds, reg, oe} = bezugTeile(b);
  if(v) z.push(`**Verarbeitungstätigkeit:** ${v.uid} — ${v.titel}`);
  if(procs.length) z.push(`**Prozess${procs.length>1?'e':''}:** ${procs.slice(0,3).map(p=>p.name).join('; ')}${procs.length>3?` (+${procs.length-3})`:''}`);
  if(ds.length) z.push(`**Datenspeicher:** ${ds.slice(0,4).map(d=>`${d.name} (Stufe ${d.schutz})`).join(', ')}${ds.length>4?` (+${ds.length-4})`:''}`);
  if(oe) z.push(`**Zuständig:** ${oeName(oe)}`);
  if(reg) z.push(`**Regelung:** ${reg.name}`);

  let hinweis='';
  if(b.art==='dstore'){
    const nutzer=VVT.filter(x=>(x.dstores||[]).includes(b.ds[0].x.id));
    hinweis=`\n\nDie Frage betrifft eine **Datenart**, nicht eine einzelne Verarbeitung. `+
      (nutzer.length?`Im VVT nutzen sie ${nutzer.length} Einträge — die Antwort gilt für alle.`
                   :`Kein VVT-Eintrag verknüpft diese Datenart — das ist ein Befund.`);
  } else if(!v && procs.length){
    hinweis=`\n\n⚠ **Zu diesem Prozess gibt es keinen VVT-Eintrag.** Die Antwort stützt sich auf `+
      `den Prozess und dessen Datenspeicher — eine Lücke nach Art. 30 DSGVO.`;
  }
  const unsicher = !b.sicher && b.vt.length>1 && b.art==='vt'
    ? `\n\nNicht eindeutig — infrage kommt auch **${b.vt[1].x.uid} ${b.vt[1].x.titel}**.` : '';
  return `_Zuordnung über die lokale Suche im Bestand:_\n\n${z.join('  \n')}${unsicher}${hinweis}\n\n---\n\n`;
}
/* Die Bestandteile des Bezugs — einmal berechnet, überall verwendet:
   Bezugsblock, System-Prompt, Kontext-Chips, Quellenangaben und Aktionen.
   Vorher stand diese Ableitung an vier Stellen und lief auseinander: Die
   Antwort handelte vom Bewerbungsverfahren, „Prozess öffnen" führte zur
   Bestattung. Prozesse und Datenspeicher werden am gefundenen VVT-Eintrag
   abgelesen; die freie Stichwortsuche greift nur, wenn es keinen gibt. */
function bezugTeile(b){
  if(!b || !b.best || b.schwach) return {v:null, procs:[], dsIds:[], ds:[], reg:null, oe:null};
  const v = b.art==='vt' ? b.vt[0].x : null;
  const procs = v ? (v.prozesse||[]).map(procById).filter(Boolean)
                  : (b.art==='prozess' ? b.proc.slice(0,3).map(t=>t.x) : []);
  const dsIds = v ? (v.dstores||[])
                  : (b.art==='dstore' ? [b.ds[0].x.id]
                  : [...new Set(procs.flatMap(x=>x.dstores||[]))]);
  const ds = dsIds.map(dsById).filter(Boolean);
  const reg = b.reg[0] ? b.reg[0].x : null;
  const oe = v ? v.oe : (procs[0] ? procs[0].oe : (b.art==='dstore' ? b.ds[0].x.oe : null));
  return {v, procs, dsIds, ds, reg, oe, datenart: b.art==='dstore' ? b.ds[0].x : null};
}

/* Schutzstufe über eine beliebige Liste von Datenspeichern (Maximumprinzip) */
function stufeAus(ids){
  const st=(ids||[]).map(i=>(dsById(i)||{}).schutz).filter(Boolean);
  return st.length?st.sort().reverse()[0]:null;
}

/* ══ Ohne Sprachmodell wird nicht geantwortet ═════════════════════════
   Frühere Fassungen hatten feste Antworttexte je Themenzweig. Die lasen sich
   wie Auskünfte, waren aber vorformuliert — und damit im Datenschutzkontext
   unbrauchbar. Was bleibt, ist die Auflösung des Bezugs: Sie stammt aus dem
   echten Bestand und ist überprüfbar. Die Bewertung macht das Modell.        */
let LETZTE_WERKZEUGE=[];
function antwortFuer(fr){
  const b=bezugFinden(fr);
  LETZTE_WERKZEUGE=b.werkzeuge;
  const T=bezugTeile(b);
  const kopf = b.best ? bezugBlock(b) : '';
  return {
    md: kopf+
      `**Kein Sprachmodell angebunden — deshalb keine Antwort.**\n\n`+
      (b.best
        ? `Der Bezug oben ist echt: aus dem geladenen Bestand gesucht, nicht erfunden. `+
          `Die Bewertung der Frage darauf ist Aufgabe des Modells; ein vorformulierter Text `+
          `an dieser Stelle sähe aus wie eine Auskunft, wäre aber keine.\n\n`
        : `Zur Frage ließ sich im Bestand kein Bezug herstellen.\n\n`)+
      `**Modell anbinden:**\n\n`+
      `- \`ollama serve\` starten und ein Modell laden, oder\n`+
      `- \`hermes gateway start\` — dann mit Tool-Calling über die MCP-Server \`koos-knowledge\` und \`dsms-knowledge\`\n\n`+
      `Der Assistent erkennt das beim Start; der Schalter unten zeigt den aktiven Pfad.`,
    werkzeuge: b.werkzeuge,
    quellen:[...(T.v?[T.v.id]:[]), ...T.procs.slice(0,2).map(x=>x.id),
             ...T.dsIds.slice(0,2), ...(T.reg?[T.reg.id]:[])],
    aktionen:[...(T.v?[{t:`VVT-Eintrag öffnen: ${T.v.uid}`,go:'vvt',vt:T.v.id}]:[]),
              ...(T.procs[0]?[{t:`Prozess öffnen: ${T.procs[0].name.slice(0,32)}`,go:'prozesse',ziel:T.procs[0].id}]:[]),
              ...(T.datenart?[{t:`Datenart öffnen: ${T.datenart.name.slice(0,28)}`,go:'datenspeicher',ziel:T.datenart.id}]:[]),
              ...(T.reg?[{t:`${T.reg.name.slice(0,32)} öffnen`,go:'regelungen',ziel:T.reg.id}]:[])]};
}

function msgHtml(m){
  if(m.rolle==='user') return `<div class="msg msg-user">${esc(m.text)}</div>`;
  const md=window.marked?marked.parse(m.md):esc(m.md);
  const w=(m.werkzeuge||[]).length?`<details class="werkzeuge"><summary>${m.werkzeuge.length} Suchläufe im geladenen Bestand (lokal, kein MCP)</summary>${
    m.werkzeuge.map(t=>`<div class="wz"><span class="wz-srv wz-${t.server}">${t.server}</span>
      <code>${esc(t.tool)}(${esc(Object.entries(t.args||{}).map(([k,v2])=>k+': "'+String(v2).slice(0,34)+'"').join(', '))})</code>
      <span class="wz-n">${t.n} Treffer</span></div>`).join('')}</details>`:'';
  const q=(m.quellen||[]).length?`<div class="msg-quellen"><span class="q-label">Quellen</span>${
    m.quellen.map(x=>`<span class="pill link" data-quelle="${esc(x)}">${esc(x)}</span>`).join('')}</div>`:'';
  const a=(m.aktionen||[]).length?`<div class="msg-aktionen">${
    m.aktionen.map((x,i)=>`<button class="akt-btn" data-aktion="${m.nr}:${i}">${esc(x.t)}</button>`).join('')}</div>`:'';
  return `<div class="msg msg-ai">${w}${md}${q}${a}</div>`;
}
function renderVerlauf(){
  const leer=`<span class="msg-hint">Der Assistent kennt Organisation, Prozesse, Datenspeicher,<br>VVT, Risiko und TOM — plus den DSMS-Methodikindex.</span>`;
  const html=S.verlauf.length?S.verlauf.map(msgHtml).join(''):leer;
  $('#verlauf').innerHTML=html;
  $('#verlauf').scrollTop=$('#verlauf').scrollHeight;

  const vcStart=`<div id="vc-start"><h3>Womit fangen wir an?</h3>
    <p>Der Chatmodus arbeitet auf demselben Verlauf wie das Seitenpanel — nur mit mehr Platz für Tabellen, Begründungen und Belege.</p>
    <div class="vc-kacheln">
      ${[['Wo steht die Datenschutzdokumentation gerade?','Fortschritt über alle Verarbeitungstätigkeiten'],
         ['Welche VT haben keine Schutzstufe?','Lücken, die die Risikobewertung blockieren'],
         ['Ist für die aktive VT eine DSFA erforderlich?','Prüfung nach LfD-Liste und Art. 35 DSGVO'],
         ['Welche TOM fehlen noch?','Abgleich mit den aktivierten Kategorien']]
        .map(([t,d])=>`<div class="vc-kachel" data-frage="${esc(t)}"><b>${esc(t)}</b><span>${esc(d)}</span></div>`).join('')}
    </div></div>`;
  $('#vc-verlauf').innerHTML=S.verlauf.length?S.verlauf.map(msgHtml).join(''):vcStart;
  $('#vc-verlauf').scrollTop=$('#vc-verlauf').scrollHeight;
  renderVorschlaege();
}

/* ══ Modellanbindung ══════════════════════════════════════════════════
   Der Prototyp spricht mit einem echten lokalen Modell, sobald eines
   erreichbar ist. Die MCP-Werkzeugaufrufe (bezugFinden) laufen vorher und
   liefern den geerdeten Kontext als System-Prompt — genau die Reihenfolge
   aus Abschnitt 3.3 des Konzepts: erst der Mandantenbestand, dann das Modell.
   ═══════════════════════════════════════════════════════════════════ */
const MODELL = {art:null, url:null, name:null, modelle:[]};

async function modellSuchen(){
  const j=async(u,o)=>{ const c=new AbortController(); const t=setTimeout(()=>c.abort(),1500);
    try{ const r=await fetch(u,{...o,signal:c.signal}); clearTimeout(t); return r.ok?await r.json():null; }
    catch(e){ clearTimeout(t); return null; } };

  /* 1) Nexus-/KOOS-Server mit eigenem Chat-Endpunkt */
  const st=await j('api/chat/status');
  if(st && (st.verfuegbar ?? st.ok ?? true)){
    MODELL.art='nexus'; MODELL.url='api/chat/stream';
    MODELL.modelle=(st.modelle||st.models||[]).map(m=>m.name||m);
    return modellBarNeu();
  }
  if(!NEXUS_LOKAL){ MODELL.art=null; return modellBarNeu(); }
  /* 2) Hermes-Gateway (OpenAI-kompatibel, Tool-Calling über MCP) */
  const gw=await j('http://127.0.0.1:8080/v1/models');
  if(gw && gw.data){
    MODELL.art='gateway'; MODELL.url='http://127.0.0.1:8080/v1/chat/completions';
    MODELL.modelle=gw.data.map(m=>m.id);
    return modellBarNeu();
  }
  /* 3) Ollama direkt */
  const ol=await j('http://localhost:11434/api/tags');
  if(ol && ol.models){
    MODELL.art='ollama'; MODELL.url='http://localhost:11434/api/chat';
    MODELL.modelle=ol.models.map(m=>m.name);
    return modellBarNeu();
  }
  MODELL.art=null; modellBarNeu();
}

function modellBarNeu(){
  const sel=document.getElementById('modell-select'); if(!sel) return;
  const label={nexus:'Nexus-Server', gateway:'Hermes-Gateway · MCP', ollama:'Ollama lokal'}[MODELL.art];
  sel.innerHTML =
    (MODELL.art
      ? `<optgroup label="${label}">${MODELL.modelle.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('')}</optgroup>`
      : '')+
    `<optgroup label="ohne Modell"><option value="__sim">simulierte Antworten</option></optgroup>`;
  if(MODELL.art && MODELL.modelle.length) sel.value=MODELL.modelle[0];
  else sel.value='__sim';
  MODELL.name=sel.value;
  const dot=document.getElementById('assist-dot');
  if(dot) dot.style.background = MODELL.art ? 'var(--ok)' : 'var(--warn)';
  const kopf=document.getElementById('assist-titel');
  if(kopf) kopf.textContent = MODELL.art ? 'KI-Assistent' : 'KI-Assistent · simuliert';
  const vc=document.getElementById('vc-modell'); if(vc) vc.innerHTML=sel.innerHTML, vc.value=sel.value;
}

/* System-Prompt aus dem aufgelösten Bezug — das ist der eigentliche Wert:
   das Modell bekommt geprüfte Verwaltungsdaten statt Allgemeinwissen. */
function systemPrompt(b){
  const t=[];
  t.push(
`Du bist der Assistent von Nexus, dem gemeinsamen System für Organisationsdaten und
Datenschutzdokumentation einer niedersächsischen Kommunalverwaltung.

Regeln:
- Antworte auf die gestellte Frage. Referiere nicht den Datensatz.
- Beginne mit der Antwort in einem Satz, dann die Begründung.
- Stütze dich ausschließlich auf den Bestand unten. Was dort nicht steht, kennzeichne als Annahme.
- Was diese Verwaltung bereits erlassen oder geprüft hat, geht der allgemeinen Abwägung vor.
- Fehlende Angaben sind ein Befund und gehören benannt.
- Nenne Prozesse und Datenspeicher bei ihrem Namen, keine technischen IDs.
- Du bist kein Rechtsbeistand: strukturierte Vorprüfung, keine rechtsverbindliche Bewertung.
- Deutsch, sachlich, ohne Floskeln. Höchstens 250 Wörter.`);

  if(b.schwach){
    t.push(`== Bestand ==
Zur Frage ließ sich kein eindeutiger Bezug herstellen. Sage das offen und nenne, wonach
du gesucht hast. Rate nicht. Nächstliegende Kandidaten:
${[...b.vt.slice(0,3).map(x=>`- VVT ${x.x.uid}: ${x.x.titel}`),
   ...b.proc.slice(0,3).map(x=>`- Prozess: ${x.x.name} (${oeName(x.x.oe)})`),
   ...b.ds.slice(0,3).map(x=>`- Datenart: ${x.x.name}, Stufe ${x.x.schutz}`)].join('\n')||'- keine'}`);
    return t.join('\n\n');
  }

  const {v, procs, ds, datenart} = bezugTeile(b);
  if(v){
    t.push(`== Verarbeitungstätigkeit ${v.uid} ==
Titel: ${v.titel}
Zuständig: ${oeName(v.oe)}   Status: ${v.status||'—'}
Zweck: ${v.zweck||'—'}
Rechtsgrundlage: ${v.rechtsgrundlage||'—'}
Betroffene: ${v.betroffene||'—'}
Datenkategorien: ${v.datenarten||'—'}
Empfänger: ${v.empfaenger||'—'}
Löschfrist: ${v.frist||'—'}
Drittland: ${v.drittland||'—'}
Verarbeitungsmittel: ${v.software||'—'}
Abgeleitete Schutzstufe: ${schutzstufe(v)||'nicht ableitbar — kein Datenspeicher verknüpft'}
TOM-Zuordnung (aus tom-${v.id}.json): ${((K.tom[v.id]||{}).soll||[]).length?((K.tom[v.id]||{}).soll||[]).join(', '):'keine Datei vorhanden'}
Besonderheiten / Schwellenwert / Risiko: nicht abrufbar (DSMS-Datenbank nicht angebunden) — nicht schätzen`);
  }

  /* Datenart als Bezug: dann gilt die Antwort für alle Verarbeitungen, die sie nutzen. */
  if(datenart){
    const d=datenart;
    const nutzer=VVT.filter(x=>(x.dstores||[]).includes(d.id));
    t.push(`== Datenart ${d.name} ==
Schutzstufe: ${d.schutz}${d.art9?' (besondere Kategorien nach Art. 9 DSGVO)':''}
Schutzbedarf: ${d.bedarf||'—'}   Vertraulichkeit: ${d.vertraul||'—'}
Zuständig: ${oeName(d.oe)}
Rechtsgrundlagen: ${(d.rg||[]).join('; ')||'—'}
Aufbewahrung: ${d.frist||'—'}
Im VVT genutzt von ${nutzer.length} Verarbeitungstätigkeiten${nutzer.length?': '+nutzer.slice(0,8).map(x=>x.uid+' '+x.titel).join('; '):' — keine Verknüpfung, das ist ein Befund'}
Hinweis: Die Frage betrifft die Datenart als solche. Antworte allgemein für sie, nicht für einen Einzelfall.`);
  }

  if(procs.length) t.push(`== Prozesse ==\n`+procs.slice(0,6)
    .map(p=>`- ${p.name} (${oeName(p.oe)})${p.leika?', LeiKa '+p.leika:''}`).join('\n')+
    (v?'':'\nHinweis: Zu diesen Prozessen existiert KEIN VVT-Eintrag — Lücke nach Art. 30 DSGVO.'));

  if(ds.length) t.push(`== Datenspeicher (Schutzstufe wird nur hier geführt, Maximumprinzip) ==\n`+
    ds.slice(0,8).map(d=>`- ${d.name}: Stufe ${d.schutz}${d.art9?', besondere Kategorien Art. 9':''}, Aufbewahrung ${d.frist}`).join('\n'));

  if(b.reg.length) t.push(`== Einschlägige interne Regelungen (verbindlich) ==\n`+
    b.reg.slice(0,3).map(r=>`- ${r.x.name} (${r.x.typ}, Stand ${r.x.stand})\n  ${(r.x.entscheidung||r.x.kontext||'').slice(0,400)}`).join('\n'));

  if(b.tom.length) t.push(`== Passende Maßnahmen aus dem TOM-Katalog ==\n`+
    b.tom.slice(0,5).map(x=>`- ${x.x.id} ${x.x.name} (${x.x.typ}): ${x.x.beschreibung.slice(0,180)}`).join('\n'));

  return t.join('\n\n');
}

/* Streaming — drei Protokolle, ein Aufrufer */
async function modellStreamen(text, b, aufToken){
  const system=systemPrompt(b);
  const verlauf=S.verlauf.filter(m=>m.rolle==='user'||m.md).slice(-6)
    .map(m=>({role:m.rolle==='user'?'user':'assistant', content:m.rolle==='user'?m.text:m.md}));
  const modell=document.getElementById('modell-select').value;

  let url=MODELL.url, body, sse=true;
  if(MODELL.art==='ollama'){
    sse=false;
    body={model:modell, stream:true, messages:[{role:'system',content:system},...verlauf,{role:'user',content:text}]};
  } else if(MODELL.art==='gateway'){
    body={model:modell, stream:true, messages:[{role:'system',content:system},...verlauf,{role:'user',content:text}]};
  } else {
    body={frage:text, verlauf, modell, kontext:{
      modul:S.modul, vvt_id:b.vt[0]?b.vt[0].x.id:null,
      oe_id:b.vt[0]?b.vt[0].x.oe:(b.proc[0]?b.proc[0].x.oe:null),
      prozess_id:b.proc[0]?b.proc[0].x.id:null, system}};
  }

  const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok||!r.body) throw new Error('HTTP '+r.status);
  const leser=r.body.getReader(), dec=new TextDecoder();
  let rest='';
  for(;;){
    const {done,value}=await leser.read(); if(done) break;
    rest+=dec.decode(value,{stream:true});
    const zeilen=rest.split('\n'); rest=zeilen.pop();
    for(let z of zeilen){
      z=z.trim(); if(!z) continue;
      if(sse){ if(!z.startsWith('data:')) continue; z=z.slice(5).trim(); if(z==='[DONE]') continue; }
      try{
        const o=JSON.parse(z);
        const tok = o.message?.content                       // Ollama
                 ?? o.choices?.[0]?.delta?.content           // OpenAI-kompatibel
                 ?? o.token ?? o.antwort ?? o.content ?? ''; // Nexus-Server
        if(tok) aufToken(tok);
      }catch(e){ /* Teilzeile */ }
    }
  }
}

let nr=0;
async function frage(text){
  text=(text||'').trim(); if(!text) return;
  S.verlauf.push({rolle:'user', text});
  renderVerlauf();

  /* Schritt 1 — MCP-Werkzeuge: Bezug auflösen. Passiert immer, auch mit echtem
     Modell: Das Modell bekommt geprüfte Verwaltungsdaten statt Allgemeinwissen. */
  const b=bezugFinden(text);
  /* Die Chips müssen denselben Bezug zeigen, den auch der System-Prompt nutzt —
     nicht den jeweils stärksten Treffer je Typ. */
  const T=bezugTeile(b);
  S.letzterBezug = (T.v||T.procs.length||T.datenart) ? {
    vt: T.v?T.v.uid:null, proc: T.procs[0]?T.procs[0].name:null,
    datenart: T.datenart?T.datenart.name:null,
    stufe: stufeAus(T.dsIds), reg: T.reg?T.reg.name:null,
  } : null;
  renderAssistKontext();

  const platzhalter=()=>{
    const els=[];
    [$('#verlauf'),$('#vc-verlauf')].forEach(z=>{
      const d=document.createElement('div'); d.className='msg msg-ai';
      d.innerHTML='<span class="tippen"><i></i><i></i><i></i></span>';
      z.appendChild(d); z.scrollTop=z.scrollHeight; els.push(d);
    });
    return els;
  };

  const sel=document.getElementById('modell-select');
  const simuliert = !MODELL.art || !sel || sel.value==='__sim';

  if(simuliert){
    platzhalter();
    setTimeout(()=>{
      const a=antwortFuer(text); a.rolle='ai'; a.nr=++nr;
      S.verlauf.push(a); renderVerlauf();
    }, 500);
    return;
  }

  /* Schritt 2 — echtes Modell, geerdet auf den aufgelösten Bezug */
  const els=platzhalter();
  const kopfHtml=`<details class="werkzeuge"><summary>${b.werkzeuge.length} Suchläufe im geladenen Bestand (lokal, kein MCP)</summary>${
    b.werkzeuge.map(t=>`<div class="wz"><span class="wz-srv wz-${t.server}">${t.server}</span>
      <code>${esc(t.tool)}(${esc(Object.entries(t.args||{}).map(([k,v])=>k+': "'+String(v).slice(0,34)+'"').join(', '))})</code>
      <span class="wz-n">${t.n} Treffer</span></div>`).join('')}</details>`;
  let txt='';
  const zeichnen=()=>{
    const html=kopfHtml+(window.marked?marked.parse(txt):esc(txt));
    els.forEach(d=>{ d.innerHTML=html; const z=d.parentNode; if(z) z.scrollTop=z.scrollHeight; });
  };
  try{
    await modellStreamen(text, b, tok=>{ txt+=tok; zeichnen(); });
    const a={rolle:'ai', md:txt.trim()||'_(leere Antwort)_', nr:++nr, werkzeuge:b.werkzeuge,
      quellen:[...(T.v?[T.v.id]:[]), ...T.procs.slice(0,2).map(x=>x.id),
               ...T.dsIds.slice(0,2), ...(T.reg?[T.reg.id]:[])],
      aktionen:[...(T.v&&S.kontext.id!==T.v.id?[{t:`Kontext auf ${T.v.uid} setzen`,kontext:T.v.id}]:[]),
                ...(T.v?[{t:'VVT-Eintrag öffnen',go:'vvt',vt:T.v.id}]:[]),
                ...(T.procs[0]?[{t:`Prozess öffnen: ${T.procs[0].name.slice(0,34)}`,go:'prozesse',ziel:T.procs[0].id}]:[]),
                ...(T.datenart?[{t:`Datenart öffnen: ${T.datenart.name.slice(0,30)}`,go:'datenspeicher',ziel:T.datenart.id}]:[]),
                ...(T.reg?[{t:`${T.reg.name.slice(0,34)} öffnen`,go:'regelungen',ziel:T.reg.id}]:[])]};
    S.verlauf.push(a); renderVerlauf();
  }catch(err){
    els.forEach(d=>d.remove());
    const a=antwortFuer(text); a.rolle='ai'; a.nr=++nr;
    a.md=`_Modell nicht erreichbar (${err.message}) — simulierte Antwort:_\n\n`+a.md;
    S.verlauf.push(a); renderVerlauf();
    modellSuchen();
  }
}

function assistLeeren(){ S.verlauf=[]; renderVerlauf(); }
