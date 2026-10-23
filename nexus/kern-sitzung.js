/* ══ Sitzung: Mandant und Anmeldung ═══════════════════════════════════
   PLAN-2026-10-23-nexus-wird-kundenansicht, Stufe 1.

   Mandant: ergibt sich aus der Adresse. nginx leitet /koos/<kunde>/ an den
   KOOS-Server genau dieses Kunden weiter; eine Auswahl im Browser gibt es
   deshalb nicht. Angezeigt wird der Organisationsname aus api/config, die
   Kennung aus der Adresse steht im Tooltip. Lokal ohne nginx gibt es keinen
   Kundenpfad.

   Anmeldung: übernimmt nginx (Basic Auth) und setzt X-Forwarded-User;
   api/ich meldet, wer angemeldet ist. Bis zu den Rollen (Stufe 6) ist jeder
   Angemeldete Superadmin (ADR-017). Ohne Anmeldung lehnt der Server jeden
   schreibenden Aufruf ab. Abmelden kennt Basic Auth nicht — dafür gibt es
   hier bewusst keinen Knopf. */

const SITZUNG={mandant:null, organisation:'', angemeldet:false, benutzer:'', rolle:null, modus:null};

function mandantAusAdresse(pfad){
  const m=/\/koos\/([^/]+)\//.exec(pfad);
  return m ? decodeURIComponent(m[1]) : null;
}

function initialen(name){
  const teile=String(name||'').split(/[\s._@-]+/).filter(Boolean);
  if(!teile.length) return '?';
  return (teile[0][0]+(teile[1]?teile[1][0]:'')).toUpperCase();
}

function mandantZeigen(){
  const el=document.getElementById('mandant'); if(!el) return;
  el.textContent=SITZUNG.organisation||SITZUNG.mandant||'Ohne Server';
  el.title=SITZUNG.mandant ? `Mandant: ${SITZUNG.mandant}` : 'Lokaler Betrieb ohne Kundenpfad';
}

function nutzerZeigen(){
  const chip=document.getElementById('user-chip'); if(!chip) return;
  let name, rolle, tip;
  if(SITZUNG.modus==='aus'){
    name='lokal'; rolle='Superadmin';
    tip='Lokaler Betrieb ohne Anmeldung (KOOS_AUTH=aus)';
  }else if(SITZUNG.angemeldet){
    name=SITZUNG.benutzer; rolle=SITZUNG.rolle==='superadmin'?'Superadmin':(SITZUNG.rolle||'');
    tip=`Angemeldet als ${SITZUNG.benutzer}`;
  }else{
    name='Nicht angemeldet'; rolle='nur lesen';
    tip=SITZUNG.modus ? 'Keine Anmeldung übermittelt — Speichern ist gesperrt' : 'Server nicht erreichbar';
  }
  document.getElementById('user-avatar').textContent=SITZUNG.angemeldet?initialen(name):'–';
  document.getElementById('user-name').textContent=name;
  document.getElementById('user-rolle').textContent=rolle;
  chip.title=tip;
}

async function sitzungLaden(){
  SITZUNG.mandant=mandantAusAdresse(location.pathname);
  const json=u=>fetch(u,{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
  const [konf,ich]=await Promise.all([json('api/config'), json('api/ich')]);
  const org=(konf&&konf.organisation)||{};
  SITZUNG.organisation=org.name||org.kurzname||'';
  if(ich){
    SITZUNG.angemeldet=!!ich.angemeldet;
    SITZUNG.benutzer=ich.benutzer||'';
    SITZUNG.rolle=ich.rolle||null;
    SITZUNG.modus=ich.modus||null;
  }
  mandantZeigen();
  nutzerZeigen();
}

sitzungLaden();
