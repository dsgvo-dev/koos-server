/* ══════════════════════════════════════════════════════════════════════
   NEXUS WEBUI — PROTOTYP
   Daten werden zur LAUFZEIT geladen (ADR-002/ADR-004: Dateien sind die
   Quelle der Wahrheit, der Server liefert sie über die REST-API).
   Ladereihenfolge wie im KOOS-Server:
     1. REST-API des Servers        → "✓ Live"
     2. beigelegte Momentaufnahme   → "◷ Momentaufnahme"   (nexus-daten.json)
     3. Ordner öffnen (File System Access API, liest _daten/ direkt)
     4. eingebettete Notdaten       → "⚠ Fallback-Daten"
   Nur Punkt 4 ist im Quelltext hinterlegt — und zwar bewusst minimal.
   ══════════════════════════════════════════════════════════════════════ */

let OE=[], PROZESSE=[], SCHRITTE=[], DSTORES=[], REGELUNGEN=[], VVT=[],
    TOMS=[], BEDROHUNGEN=[], TOM_KATEGORIEN=[], KETTE={}, TOM_STAND={};
/* Die Datenschutzkette liegt seit 2026-08-07 als JSON je Verarbeitungstätigkeit
   im Datenverzeichnis (Generatoren aus der 9-Schritte-Vorgehensweise).
   Damit entfällt die frühere Kennzeichnung „keine Datenquelle". */
let K={bes:{}, risiko:{}, schwellwert:{}, tom:{}, bedrohungen:{}, ergaenzend:{}, dsfa:{}, baseline:null};

/* ── Notdaten: nur damit die Oberfläche ohne jede Quelle bedienbar bleibt ── */
const FALLBACK = {
  OE:[{id:'oe-hvb',name:'Bürgermeister/in (HVB)',parent:null,rollen:['Bürgermeister/in (HVB)'],sonder:[]},
      {id:'oe-amt-1-4',name:'1.4 – Datenschutz',parent:'oe-hvb',rollen:['Datenschutzbeauftragte/r'],sonder:['DSB (organisationsweit)']},
      {id:'oe-amt-33',name:'33 – Bürgerservice',parent:'oe-hvb',rollen:['Sachbearbeitung Meldewesen'],sonder:[]}],
  PROZESSE:[{id:'proc-meldebescheinigung-erteilen',name:'Meldebescheinigung erteilen',oe:'oe-amt-33',
      leika:'99050017',ozg:null,dstores:['dstore-melderegisterdaten'],regelungen:['§ 18 BMG'],beteiligte:[],sch:[0,1]}],
  SCHRITTE:['Antrag aufnehmen','Bescheinigung ausstellen'],
  DSTORES:[{id:'dstore-melderegisterdaten',name:'Melderegisterdaten',schutz:'C',bedarf:'hoch',
      vertraul:'intern',kategorie:'Wohnen & Melderecht',oe:'oe-amt-33',frist:'nach BMG-Fristen',
      rg:[{}].slice(0,0),art9:false,tags:['Melderecht']}],
  REGELUNGEN:[], VVT:[], TOMS:[], BEDROHUNGEN:[], TOM_KATEGORIEN:['ORG'],
};

/* ── Bearbeitungsstände der Datenschutzkette ──────────────────────────
   Es wird ausschließlich gemessen, was im Bestand steht.
     tom  → aus dem Feld `tom` des VVT-Eintrags
     besonderheiten / schwellenwert / risiko
          → liegen in der SQLite-Datenbank der DSMS-Anwendung. Dafür gibt es
            keine Schnittstelle, also gibt es hier auch keinen Wert. „unbekannt"
            heißt unbekannt und wird nicht durch eine plausible Zahl ersetzt.  */
/* Die Übersicht aus /api/kette trägt je Verarbeitungstätigkeit nur die
   Felder, die Listen, Stände und Kennzahlen brauchen — in derselben
   Verschachtelung wie die Quelldateien. Jeder Teilsatz wird als solcher
   gekennzeichnet; die Detailmodule holen den vollen Satz bei Bedarf nach. */
const KETTE_ZWEIGE=['bes','risiko','schwellwert','tom','bedrohungen','ergaenzend','dsfa'];

function ketteAusUebersicht(u){
  K={bes:{}, risiko:{}, schwellwert:{}, tom:{}, bedrohungen:{}, ergaenzend:{}, dsfa:{}, baseline:null};
  for(const [vid,e] of Object.entries(u||{}))
    for(const z of KETTE_ZWEIGE)
      if(e&&e[z]) K[z][vid]=Object.assign({_uebersicht:true}, e[z]);
}

let _ketteHolt=null;
async function ketteVervollstaendigen(){
  if(typeof aktiveVT!=='function') return;
  const v=aktiveVT(); if(!v||_ketteHolt===v.id) return;
  const teil=KETTE_ZWEIGE.some(z=>K[z][v.id]&&K[z][v.id]._uebersicht);
  if(!teil) return;
  _ketteHolt=v.id;
  try{
    const r=await fetch(`api/kette/${encodeURIComponent(v.id)}`,{cache:'no-store'});
    if(r.ok){
      const d=await r.json();
      for(const z of KETTE_ZWEIGE) if(d[z]) K[z][v.id]=d[z];
      if(d.baseline) K.baseline=d.baseline;
      kettenstaendeErmitteln();
      renderModul();
    }
  }catch(e){ console.warn('Kette nicht nachladbar:', e); }
  finally{ _ketteHolt=null; }
}

function kettenstaendeErmitteln(){
  KETTE={}; TOM_STAND={};
  const stand=(o)=>{
    if(!o) return 'offen';
    const st=String((o.meta&&o.meta.status)||o.status||'').toLowerCase();
    if(st==='geprueft'||st==='freigegeben'||st==='abgeschlossen') return 'done';
    if(st==='entwurf'||st==='offen'||!st) return 'wip';
    return 'wip';
  };
  VVT.forEach(v=>{
    const t=K.tom[v.id];
    KETTE[v.id]={
      besonderheiten: stand(K.bes[v.id]),
      schwellwert:    stand(K.schwellwert[v.id]),
      risiko:         stand(K.risiko[v.id]),
      tom:            t ? ((t.ist||[]).length ? 'wip' : 'offen') : 'offen',
      dsfa:           stand(K.dsfa[v.id]),
    };
    const st={};
    (t&&t.soll||[]).forEach(id=>{ st[id]=(t.ist||[]).includes(id)?'umgesetzt':'offen'; });
    TOM_STAND[v.id]=st;
  });
}

let DATENSTAND_META=null;
function datenUebernehmen(d){
  DATENSTAND_META=d._meta||null;
  OE=d.OE||[]; PROZESSE=d.PROZESSE||[]; SCHRITTE=d.SCHRITTE||[];
  DSTORES=d.DSTORES||[]; REGELUNGEN=d.REGELUNGEN||[]; VVT=d.VVT||[];
  TOMS=d.TOMS||[]; BEDROHUNGEN=d.BEDROHUNGEN||[];
  TOM_KATEGORIEN=d.TOM_KATEGORIEN||[...new Set(TOMS.map(t=>t.kat).filter(Boolean))].sort();
  kettenstaendeErmitteln();
}

/* ── Statusanzeige (Muster: KOOS #datenstand-info) ─────────────────── */
function datenstand(art, zusatz){
  const el=document.getElementById('datenstand'); if(!el) return;
  const jetzt=new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});
  const map={
    laedt:    ['laedt',   '⏳ Lädt …',                'Daten werden geladen'],
    live:     ['live',    '✓ Live · '+jetzt,          'Live-Daten von der REST-API des Nexus-Servers'],
    quellen:  ['live',    '✓ Quelldateien · '+jetzt,  'Direkt aus koos-knowledge/_daten gelesen — Stand der Dateien in diesem Moment'],
    snapshot: ['snapshot','◷ Momentaufnahme · '+((DATENSTAND_META&&DATENSTAND_META.erzeugt)||'Stand unbekannt'),
               'nexus-daten.json, erzeugt '+((DATENSTAND_META&&DATENSTAND_META.erzeugt)||'?')+
               ' — jüngste Quelldatei '+((DATENSTAND_META&&DATENSTAND_META.juengste_quelldatei)||'?')+
               '. Für tagesaktuelle Zahlen den Datenordner über 📂 einlesen.'],
    ordner:   ['live',    '📂 Ordner · '+jetzt,       'Direkt aus dem gewählten _daten-Verzeichnis gelesen'],
    fallback: ['fallback','⚠ Fallback-Daten',         'Weder API noch Momentaufnahme erreichbar — Notdaten aktiv'],
  };
  const [cls,txt,tip]=map[art]||map.fallback;
  el.className=cls; el.textContent=(art==='laedt'&&zusatz)?('⏳ '+zusatz):txt+(zusatz?' · '+zusatz:''); el.title=tip;
}

/* ── Ladekette ─────────────────────────────────────────────────────── */
async function datenLaden(){
  datenstand('laedt');
  const OPT={cache:'no-store'};
  const ok=r=>{ if(!r.ok) throw new Error(r.status); return r.json(); };

  /* 1) REST-API des Nexus-Servers */
  try{
    const [orga,proz,daten,reg,vvt,tom,thr,kette]=await Promise.all([
      fetch('api/orga',OPT).then(ok),
      fetch('api/prozesse',OPT).then(ok),
      fetch('api/daten',OPT).then(ok),
      fetch('api/regelungen',OPT).then(ok),
      fetch('api/vvt',OPT).then(ok),
      fetch('api/tom/definitionen',OPT).then(ok).catch(()=>[]),
      fetch('api/tom/bedrohungen',OPT).then(ok).catch(()=>[]),
      /* Die Datenschutzkette in einem Abruf statt in 1.615 Einzeldateien.
         Fehlt der Endpunkt, bleibt die Kette leer und die Stammdaten stehen
         trotzdem — die Oberfläche zeigt dann „keine Datei vorhanden“. */
      fetch('api/kette',OPT).then(ok).catch(()=>null),
    ]);
    ketteAusUebersicht(kette);
    datenUebernehmen(ausApi({orga,proz,daten,reg,vvt,tom,thr}));
    datenstand('live'); alleAnsichtenNeu(); return;
  }catch(e){ /* kein Server – weiter */ }

  /* 2) Quelldateien direkt über HTTP — der Datenordner liegt unter der
        ausgelieferten Wurzel, also lassen sich orga.yaml und die
        Markdown-Verzeichnisse unmittelbar lesen. Damit sind die Zahlen bei
        jedem Laden und jedem ⟳ auf dem Stand der Dateien, nicht auf dem
        Stand einer Kopie. */
  try{
    const roh=await quelldateienLesen();
    if(roh){ datenUebernehmen(ausApi(roh)); datenstand('quellen'); alleAnsichtenNeu(); return; }
  }catch(e){ console.warn('Quelldateien nicht lesbar:',e); }

  /* 3) Beigelegte Momentaufnahme */
  try{
    const r=await fetch('nexus-daten.json',OPT);
    if(r.ok){ datenUebernehmen(await r.json()); datenstand('snapshot'); alleAnsichtenNeu(); return; }
  }catch(e){ /* file:// blockiert fetch – weiter */ }

  /* 4) Notdaten */
  datenUebernehmen(FALLBACK); datenstand('fallback'); alleAnsichtenNeu();
  fallbackHinweis();
}

/* Warum keine Daten da sind — und was dagegen hilft */
function fallbackHinweis(){
  const alt=document.getElementById('start-hinweis'); if(alt) alt.remove();
  const ziel=document.querySelector('.start-inner'); if(!ziel) return;
  const ausDatei = location.protocol === 'file:';
  const el=document.createElement('div');
  el.id='start-hinweis'; el.className='hinweis warn';
  el.style.margin='0 0 22px'; el.style.maxWidth='1000px';
  el.innerHTML = ausDatei
    ? `<b>⚠ Es sind nur Notdaten geladen (3 Einheiten, 1 Prozess).</b><br>
       Die Seite läuft über <code>file://</code>. Browser verbieten dort aus Sicherheitsgründen
       jeden <code>fetch</code> — der Prototyp kann <code>nexus-daten.json</code> also nicht lesen.
       Das ist kein Fehler der Oberfläche, sondern genau der Grund, warum die Daten
       <i>zur Laufzeit</i> geladen werden und nicht im Quelltext stehen.<br><br>
       <b>So kommt der echte Bestand rein</b> (50 Einheiten · 672 Prozesse · 255 Datenspeicher · 213 VT):
       <div style="margin:9px 0 4px"><code style="display:block;padding:9px 12px;background:var(--bg-sunk);border-radius:6px;font-size:12px">cd ~/Documents/Nexus &amp;&amp; ./start-prototyp.sh</code></div>
       Danach öffnet sich <code>http://localhost:8099/nexus-webui-prototyp.html</code> — der Chip oben rechts
       zeigt dann <b>◷ Momentaufnahme</b>. Erst dort ist auch ein lokales Sprachmodell erreichbar.`
    : `<b>⚠ Es sind nur Notdaten geladen.</b><br>
       Weder die REST-API des Nexus-Servers noch <code>nexus-daten.json</code> waren erreichbar.
       Prüfe, ob die Datei neben dieser HTML-Datei liegt — oder lies den KOOS-Datenordner
       direkt über <b>📂</b> oben rechts ein.`;
  ziel.insertBefore(el, ziel.firstChild.nextSibling);
}

let _schrittIdx=[];
/* Verzeichnislisting des einfachen HTTP-Servers auswerten und alle
   Markdown-Dateien einlesen. Mehr als tausend Einzelabrufe — deshalb
   gebündelt und mit Fortschrittsanzeige. */
/* Die Ausweichwege (Quelldateien, Kataloge) und die Modellsuche auf
   127.0.0.1/localhost gibt es nur lokal. Online (hinter /koos/<kunde>/)
   liefert der Server diese Pfade nicht aus, und ein https-Browser blockiert
   Abrufe an localhost ohnehin. (07.10.2026) */
const NEXUS_LOKAL = location.protocol==='file:' ||
  ['localhost','127.0.0.1','::1','[::1]'].includes(location.hostname);
const DATEN_BASIS='/koos-knowledge/_daten';
async function verzeichnis(pfad){
  const r=await fetch(pfad+'/',{cache:'no-store'});
  if(!r.ok) throw new Error(pfad+' → '+r.status);
  const html=await r.text();
  return [...html.matchAll(/href="([^"?]+\.md)"/g)].map(m=>decodeURIComponent(m[1]))
    .map(n=>n.split('/').pop());
}
function frontmatter(text){
  const t=text.split('---');
  if(t.length<3) return null;
  try{ return window.jsyaml ? window.jsyaml.load(t[1]) : null; }catch(e){ return null; }
}
/* Nebenläufigkeit bewusst niedrig: python3 -m http.server bedient nur einen
   Request zugleich. Mehr gleichzeitige Abrufe machen es messbar langsamer. */
async function gebuendelt(liste, fn, breite, melde){
  const out=new Array(liste.length); let i=0, fertig=0;
  await Promise.all(Array.from({length:Math.min(breite,liste.length)},async()=>{
    for(;;){ const k=i++; if(k>=liste.length) return;
      out[k]=await fn(liste[k]);
      if((++fertig&63)===0 && melde) melde(fertig,liste.length);
    }}));
  return out.filter(Boolean);
}
/* Ein Katalog, gepflegt in dsms-knowledge/toms/ — dort lesen ihn auch die
   vier Generatoren (tom_, bedrohungen_, baseline_, ergaenzend_generator.py),
   die _daten/tom/ erzeugen. Am 29.08.2026 von der aelteren Kopie unter
   _input/vorgehensweise/assets/ hierher umgestellt: die trug 127 Massnahmen
   und kannte TOM-VIDEO-006 nicht, das in _daten/tom/ verwendet wird.
   Ueber die REST-API kommen dieselben Daten aus /api/tom/*. */
const KATALOG_BASIS='/dsms-knowledge/toms';
async function kataloge(art){
  if(!NEXUS_LOKAL) return [];
  const ordner = art==='tom' ? 'massnahmen' : 'gefaehrdungen';
  let namen;
  try{
    const r=await fetch(`${KATALOG_BASIS}/${ordner}/`,{cache:'no-store'});
    if(!r.ok) return [];
    const html=await r.text();
    namen=[...html.matchAll(/href="([^"?]+\.json)"/g)].map(m=>decodeURIComponent(m[1]).split('/').pop());
  }catch(e){ return []; }
  return gebuendelt(namen, async n=>{
    try{ const r=await fetch(`${KATALOG_BASIS}/${ordner}/${encodeURIComponent(n)}`,{cache:'no-store'});
         return r.ok?await r.json():null; }catch(e){ return null; }
  }, 12, (f,g)=>datenstand('laedt', `Katalog ${f}/${g}`));
}
/* Die sieben Dateisorten der Kette, je Verarbeitungstätigkeit.
   Der Dateiname trägt die VVT-ID, danach wird zugeordnet. */
const KETTE_ORDNER=[
  ['besonderheiten','bes-',        'bes'],
  ['risikoanalyse', 'risiko-',     'risiko'],
  ['schwellwert',   'schwellwert-','schwellwert'],
  ['tom',           'tom-',        'tom'],
  ['tom',           'bedrohungen-','bedrohungen'],
  ['tom',           'ergaenzend-', 'ergaenzend'],
  ['dsfa',          'dsfa-',       'dsfa'],
];
async function jsonListe(ordner){
  try{
    const r=await fetch(`${DATEN_BASIS}/${ordner}/`,{cache:'no-store'});
    if(!r.ok) return [];
    const html=await r.text();
    return [...html.matchAll(/href="([^"?]+\.json)"/g)].map(m=>decodeURIComponent(m[1]).split('/').pop());
  }catch(e){ return []; }
}
async function ketteLesen(){
  K={bes:{}, risiko:{}, schwellwert:{}, tom:{}, bedrohungen:{}, ergaenzend:{}, dsfa:{}, baseline:null};
  const ordner=[...new Set(KETTE_ORDNER.map(x=>x[0]))];
  const listen={};
  await Promise.all(ordner.map(async o=>{ listen[o]=await jsonListe(o); }));

  await Promise.all(KETTE_ORDNER.map(async ([ordn,praefix,ziel])=>{
    const namen=(listen[ordn]||[]).filter(n=>n.startsWith(praefix));
    await gebuendelt(namen, async n=>{
      try{
        const r=await fetch(`${DATEN_BASIS}/${ordn}/${encodeURIComponent(n)}`,{cache:'no-store'});
        if(!r.ok) return null;
        const d=await r.json();
        const id=(d.vvt_referenz&&d.vvt_referenz.vvt_id) || n.slice(praefix.length,-5);
        K[ziel][id]=d; return 1;
      }catch(e){ return null; }
    }, 8, (f,g)=>datenstand('laedt', `Kette ${ziel} ${f}/${g}`));
  }));
  try{
    const r=await fetch(`${DATEN_BASIS}/tom/baseline-organisation.json`,{cache:'no-store'});
    if(r.ok) K.baseline=await r.json();
  }catch(e){}
}

async function quelldateienLesen(){
  if(!NEXUS_LOKAL) return null;
  if(!window.jsyaml) return null;
  const y=await fetch(DATEN_BASIS+'/orga.yaml',{cache:'no-store'});
  if(!y.ok) return null;                       // Datenordner nicht ausgeliefert
  const orga=window.jsyaml.load(await y.text());

  const lies=async(ordner,mitBody)=>{
    let namen; try{ namen=await verzeichnis(DATEN_BASIS+'/'+ordner); }catch(e){ return []; }
    return gebuendelt(namen, async n=>{
      const r=await fetch(`${DATEN_BASIS}/${ordner}/${encodeURIComponent(n)}`,{cache:'no-store'});
      if(!r.ok) return null;
      const txt=await r.text(); const d=frontmatter(txt);
      if(!d) return null;
      if(mitBody) d.body=txt.split('---').slice(2).join('---').trim();
      return d;
    }, 24, (f,g)=>datenstand('laedt', `${ordner} ${f}/${g}`));
  };

  const [proz,daten,reg,vvt,tom,thr]=await Promise.all([
    lies('prozesse',true), lies('daten',false), lies('regelungen',true), lies('vvt',false),
    kataloge('tom'), kataloge('thr'),
  ]);
  if(!vvt.length && !proz.length) return null;
  await ketteLesen();
  return {orga:orga.einheiten||[], proz, daten, reg, vvt, tom, thr};
}

/* API-Antworten auf das interne Format normalisieren */
function ausApi(x){
  _schrittIdx=[];
  const feld=(o,...n)=>{ for(const k of n) if(o&&o[k]!=null) return o[k]; return null; };
  const idListe=a=>(a||[]).map(v=>typeof v==='string'?v:(v&&v.id)).filter(Boolean);
  return {
    OE:(x.orga||[]).map(o=>({id:o.id,name:o.name,parent:o.parent??null,
        rollen:o.rollen||[],sonder:o.sonderfunktionen||[],hinweis:o.hinweis||null})),
    PROZESSE:(x.proz||[]).map(p=>({id:p.id,name:feld(p,'titel','name'),oe:feld(p,'zustaendigeEinheit','oe'),
        bereich:p.bereich||null,
        beteiligte:(p.beteiligte||[]).map(b=>b&&b.einheit||b).filter(Boolean),
        leika:p.leika_id??null, ozg:p.ozg_id??null, status:p.status||null,
        dstores:idListe((p.daten||{}).datenspeicher), regelungen:p.regelungen||[],
        /* Die API liefert die Schritte fertig (Feld `schritte`, je Schritt
           name und beschreibung). Nur im Ordnerbetrieb muss der Fließtext
           zerlegt werden. */
        sch:(Array.isArray(p.schritte)&&p.schritte.length
              ? p.schritte.map(x=>String((x&&x.name)||x||'').trim())
              : (String(p.body||'').match(/^\*\*(\d+ [^*]+)\*\*/gm)||[])
                  .map(t=>t.replace(/\*\*/g,'').trim())
            ).filter(Boolean).map(s2=>{
          let k=_schrittIdx.indexOf(s2); if(k<0){ k=_schrittIdx.push(s2)-1; } return k; })})),
    SCHRITTE:_schrittIdx,
    /* Seit 2026-08-10 trennt die Klassifizierung zwei Sichten: Datenschutz
       (Schaden für die betroffene Person) und Informationssicherheit (Schaden
       für die Institution). Die alten Feldnamen werden weiter akzeptiert,
       damit ältere Bestände lesbar bleiben. */
    DSTORES:(x.daten||[]).map(d=>{ const kl=d.klassifizierung||{},
        au=kl.aufbewahrung||d.aufbewahrung||{},
        /* Die Quelldateien führen die Klassifizierung im Block, die API gibt
           sie flach heraus. Beides wird gelesen, damit Ordner- und
           Serverbetrieb dieselbe Anzeige ergeben. */
        f=(imBlock,flach)=>kl[imBlock] ?? d[flach ?? imBlock],
        /* Artikel-9-Merkmal ist kein Feld im Bestand (ADR 013 hat
           datenkategorie am 2026-08-15 abgeschafft). Gesucht wird in Name
           und Schlagworten, und es wird als Schlagworttreffer benannt. */
        such=`${d.name} ${(d.tags||[]).join(' ')}`,
        art9re=/gesundheit|biometr|religio|sozialdat|fingerabdruck|strafe?|sexual|gewerkschaft|ethni|genetisch|weltanschau/i;
      return {id:d.id,name:d.name,
        bereich:d.bereich||null,
        schutz:f('schutzstufe'), bedarf:f('schutzbedarf'),
        vertraul:kl.vertraulichkeitsklasse ?? kl.vertraulichkeit ?? d.vertraulichkeit,
        bsiV:f('bsi-vertraulichkeit'), bsiI:f('bsi-integritaet') ?? kl.integritaet,
        bsiA:f('bsi-verfuegbarkeit') ?? kl.verfuegbarkeit,
        bsiBedarf:f('bsi-schutzbedarf'),
        oe:d['zuständige-einheit']||d.zustaendigeEinheit,
        frist:[au.frist,au.beginn&&('ab '+au.beginn)].filter(Boolean).join(', ')||'—',
        rg:((kl.rechtsgrundlagen ?? d.rechtsgrundlagen)||[]).map(r=>r&&r.gesetz).filter(Boolean).slice(0,3),
        art9wort:(such.match(art9re)||[null])[0],
        art9:art9re.test(such),
        tags:(d.tags||[]).slice(0,5)};}),
    REGELUNGEN:(x.reg||[]).map(r=>({id:r.id,name:r.name,typ:r.typ,oe:r.zustaendigeEinheit,
        stand:String(r.datum||''),status:r.status,gremium:r.entscheidendesGremium,
        /* kontext und entscheidung sind mit Commit 90954fa aus dem Parser
           entfernt worden — sie kommen nicht mehr und werden nicht gelesen. */
        body:r.body||''})),
    VVT:(x.vvt||[]).map(v=>({id:v.id,uid:String(v.uid||''),titel:v.titel,oe:v.organisationseinheit,
        status:v.status,zweck:v.zweck,rechtsgrundlage:v.rechtsgrundlage,
        betroffene:v.kategorien_betroffener,datenarten:v.kategorien_daten,empfaenger:v.empfaenger,
        drittland:v.transfer_drittland,frist:v.loeschfrist,software:v.software_verarbeitungsmittel,
        prozesse:v.prozesse||[],dstores:idListe(v.datenspeicher),
        tom:(v.tom||[]).map(x=>typeof x==='string'?x:(x&&x.id)).filter(Boolean),
        leika:v.leika_id??null,ozg:v.ozg_id??null,stand:String(v.letzte_aktualisierung||v['letzte-aktualisierung']||'')})),
    TOMS:(x.tom||[]).map(t=>({id:t.id,kat:t.kategorie,name:t.name,typ:t['maßnahmentyp'],
        wirkung:t.wirkungspunktzahl,niveau:t.risikoniveau,beschreibung:t.beschreibung,
        ziele:((t.anwendbarkeit||{}).schutzziele)||[]})),
    BEDROHUNGEN:(x.thr||[]).map(t=>({id:t.id,kat:t.kategorie,typ:t.bedrohungstyp,
        name:t.name||String(t.id||'').replace(/^THREAT-/,'').replace(/-/g,' '),
        beschreibung:t.beschreibung,ziele:t.schutzziele||[],
        massnahmen:(t.empfohlene_massnahmen||[]).filter(x=>typeof x==='string'&&/^TOM-/.test(x))})),
  };
}

/* ── Ordner öffnen (File System Access API, wie im KOOS-Server) ─────── */
async function ordnerOeffnen(){
  if(!window.showDirectoryPicker){
    toast(location.protocol==='file:'
      ? 'Ordnerzugriff braucht einen sicheren Kontext — bitte über ./start-prototyp.sh starten'
      : 'Dieser Browser unterstützt die File System Access API nicht — Chrome oder Edge verwenden.');
    return;
  }
  if(!window.jsyaml){ toast('YAML-Parser nicht geladen'); return; }
  try{
    datenstand('laedt');
    const dir=await window.showDirectoryPicker({mode:'read'});
    const text=async h=>await (await h.getFile()).text();
    const front=t=>{ const p=t.split('---'); if(p.length<3) return [null,'']; 
      try{ return [window.jsyaml.load(p[1]), p.slice(2).join('---').trim()]; }catch(e){ return [null,'']; } };
    const ordner=async n=>{ try{ return await dir.getDirectoryHandle(n); }catch(e){ return null; } };
    const alle=async (h,fn)=>{ const out=[]; if(!h) return out;
      for await (const [name,e] of h.entries()) if(e.kind==='file'&&name.endsWith('.md')) out.push([name,await fn(e)]);
      return out; };

    const orga=window.jsyaml.load(await text(await dir.getFileHandle('orga.yaml')));
    const proz=(await alle(await ordner('prozesse'), async e=>front(await text(e)))).map(([,[d,b]])=>d&&({...d,_body:b})).filter(Boolean);
    const daten=(await alle(await ordner('daten'),   async e=>front(await text(e)))).map(([,[d]])=>d).filter(Boolean);
    const reg=(await alle(await ordner('regelungen'),async e=>front(await text(e)))).map(([,[d,b]])=>d&&({...d,body:b})).filter(Boolean);
    const vvt=(await alle(await ordner('vvt'),       async e=>front(await text(e)))).map(([,[d]])=>d).filter(Boolean);

    datenUebernehmen(ausApi({orga:orga.einheiten||[],proz,daten,reg,vvt,tom:[],thr:[]}));
    datenstand('ordner', dir.name); alleAnsichtenNeu();
    toast(`${OE.length} Einheiten · ${PROZESSE.length} Prozesse · ${VVT.length} VT gelesen`);
  }catch(e){
    if(e.name!=='AbortError'){ console.error(e); toast('Ordner konnte nicht gelesen werden: '+e.message); }
    datenstand('fallback');
  }
}

function alleAnsichtenNeu(){
  if(typeof renderRail==='function'){ renderRail(); renderModul(); renderAssistKontext(); renderVorschlaege(); }
}

const AUDIT = [];   // wird aus GET /api/audit geladen — keine Beispielhistorie

const BESONDERHEITEN_FELDER = [
  {k:'art9',                 t:'Besondere Kategorien nach Art. 9 DSGVO',           h:'Gesundheit, Religion, Biometrie, Gewerkschaft, Sexualleben'},
  {k:'art10',                t:'Straftaten und Ordnungswidrigkeiten (Art. 10)',    h:'Verurteilungen, laufende Verfahren'},
  {k:'sozialdaten',          t:'Sozialdaten (§ 35 SGB I, §§ 67 ff. SGB X)',        h:'Anzeigepflicht nach § 80 SGB X beachten'},
  {k:'beschaeftigtendaten',  t:'Beschäftigtendaten (§ 12 NDSG)',                   h:'Beteiligung des Personalrats prüfen'},
  {k:'hohe_anzahl',          t:'Hohe Anzahl betroffener Personen',                 h:'ab ca. 5.000 Personen oder gesamte Einwohnerschaft'},
  {k:'lange_speicherung',    t:'Lange Speicherdauer',                              h:'über 10 Jahre'},
  {k:'cloud',                t:'Cloud-Verarbeitung',                               h:'TOM-Kategorie CL wird aktiviert'},
  {k:'microsoft365',         t:'Einsatz von Microsoft 365',                        h:'TOM-Kategorie MS365, Dienstvereinbarung erforderlich'},
  {k:'ki',                   t:'Einsatz von KI-Systemen',                          h:'TOM-Kategorie KI, Dienstanweisung erforderlich'},
  {k:'videoueberwachung',    t:'Videoüberwachung',                                 h:'§ 4 BDSG, Hinweisbeschilderung'},
  {k:'auftragsverarbeitung', t:'Auftragsverarbeitung (Art. 28)',                   h:'TOM-Kategorie AV, AV-Vertrag erforderlich'},
  {k:'fernwartung',          t:'Fernwartung durch Dritte',                         h:'Protokollierung, Vier-Augen-Prinzip'},
  {k:'homeoffice',           t:'Verarbeitung im Homeoffice',                       h:'Dienstvereinbarung Homeoffice'},
  {k:'digital',              t:'Vollständig digitale Verarbeitung',                h:''},
];
const SCHWELLENWERT_LFD = [
  {k:'kinder_jugendhilfe', t:'Kinder- und Jugendhilfe'},
  {k:'jobcenter',          t:'Jobcenter / Leistungen nach SGB II'},
  {k:'melderegister',      t:'Melderegister'},
  {k:'personenstandsregister', t:'Personenstandsregister'},
  {k:'personalausweisregister', t:'Personalausweisregister'},
  {k:'sozialhilfe',        t:'Sozialhilfe nach SGB XII'},
  {k:'amtliche_statistik', t:'Amtliche Statistik'},
  {k:'schuelerdaten',      t:'Schülerdaten'},
];
const SCHWELLENWERT_ART35 = [
  {k:'systematische_bewertung', t:'Systematische und umfassende Bewertung persönlicher Aspekte'},
  {k:'besondere_daten',    t:'Umfangreiche Verarbeitung besonderer Datenkategorien'},
  {k:'ueberwachung',       t:'Systematische weiträumige Überwachung öffentlich zugänglicher Bereiche'},
  {k:'bewerten',           t:'Bewerten oder Einstufen (Scoring, Profiling)'},
  {k:'entscheidungsfindung', t:'Automatisierte Entscheidungsfindung mit Rechtswirkung'},
  {k:'vertrauliche_daten', t:'Vertrauliche oder höchst persönliche Daten'},
  {k:'grosser_umfang',     t:'Verarbeitung in großem Umfang'},
  {k:'datensaetze_abgleichen', t:'Abgleichen oder Zusammenführen von Datensätzen'},
  {k:'schutzbeduerftige',  t:'Daten schutzbedürftiger Betroffener (Kinder, Beschäftigte)'},
  {k:'innovative_nutzung', t:'Innovative Nutzung neuer Technologien (auch KI)'},
  {k:'hindernis',          t:'Betroffene werden an der Rechtsausübung gehindert'},
];
