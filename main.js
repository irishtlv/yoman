
(function(){
  var TZ="Asia/Jerusalem", SERVER="Google Calendar", TOOL="list_events";
  var HUES=7, SHOW=14, MAXWEEKS=8;
  var state={back:7, off:0, loadedFrom:null, events:null, sel:null, tab:"today", err:null, storedAt:null, week:0, loadedTo:null};
  function $(id){return document.getElementById(id);}
  function keyOf(d){return new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).format(d);}
  function minsOf(d){var p=new Intl.DateTimeFormat("en-GB",{timeZone:TZ,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(d),h=0,m=0;p.forEach(function(x){if(x.type==="hour")h=+x.value;if(x.type==="minute")m=+x.value;});return h*60+m;}
  function addDays(k,n){var a=k.split("-").map(Number);return new Date(Date.UTC(a[0],a[1]-1,a[2]+n)).toISOString().slice(0,10);}
  function utc(k){var a=k.split("-").map(Number);return new Date(Date.UTC(a[0],a[1]-1,a[2],12));}
  function fmt(k,o){o.timeZone="UTC";return new Intl.DateTimeFormat("he-IL",o).format(utc(k));}
  function hhmm(m){return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");}
  function esc(s){var d=document.createElement("div");d.textContent=s==null?"":String(s);return d.innerHTML;}
  function hsh(s){var h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return Math.abs(h);}
  function hue(i){i=((i%HUES)+HUES)%HUES+1;return "--cbg:var(--h"+i+"-bg);--cfg:var(--h"+i+"-fg)";}
  var GC={"1":0,"2":2,"3":6,"4":1,"5":4,"6":4,"7":5,"8":5,"9":5,"10":3,"11":1};
  function evHue(e){return hue(catById(e.cat).hue);}
  function dayHue(k){var a=k.split("-").map(Number);return hue(Math.floor(Date.UTC(a[0],a[1]-1,a[2])/864e5));}

  var CATS=[
    {id:"all",name:"הכול",hue:null},
    {id:"health",name:"בריאות ותזונה",hue:2},
    {id:"alma",name:"אלמה",hue:0},
    {id:"mom",name:"אמא",hue:1},
    {id:"work",name:"עבודה ועסק",hue:5},
    {id:"home",name:"בית ומשימות",hue:3},
    {id:"events",name:"פגישות ואירועים",hue:4}
  ];
  var RULES=[
    ["events",/יום הולדת|פגישה|מפגש|נשק וסע/],
    ["alma",/אלמה/],
    ["mom",/אמא/],
    ["health",/צום|ארוח|שייק|תה |מגנזיום|יוגה|ספורט|לחץ דם|חבל|הליכה|שחייה|פילאטיס|רופא/],
    ["work",/עבודה|עסק|סוכני AI|מיינדפולנס|לקוח/],
    ["home",/קניות|משימות|בית|סידורים|מרקרים|זמן לעצמי|לקבוע/]
  ];
  function catOf(e){if(e.alma&&!/יום הולדת/.test(e.title))return "alma";for(var i=0;i<RULES.length;i++)if(RULES[i][1].test(e.title))return RULES[i][0];return e.allDay?"home":"events";}
  function catById(id){for(var i=0;i<CATS.length;i++)if(CATS[i].id===id)return CATS[i];return CATS[0];}
  state.cat="all";
  try{var cc=localStorage.getItem("yoman-cat");if(cc&&catById(cc).id===cc)state.cat=cc;}catch(e){}
  var today=keyOf(new Date()); state.sel=today;
  try{var t=localStorage.getItem("yoman-tab3");if(t==="cal"||t==="today"||t==="shop"||t==="alma"||t==="rec")state.tab=t;}catch(e){}

  function norm(list){
    var out=[];
    (list||[]).forEach(function(ev){
      if(!ev||ev.status==="cancelled")return;
      var b={cat:null,alma:ev.__cal==="alma",id:ev.id,series:ev.recurringEventId||ev.id,title:ev.summary||"(ללא כותרת)",desc:ev.description||"",link:ev.htmlLink||"",colorId:ev.colorId,location:ev.location||""};
      if(ev.start&&ev.start.date){
        var s=ev.start.date.slice(0,10),e=ev.end&&ev.end.date?ev.end.date.slice(0,10):addDays(s,1);
        var r=(ev.overrideReminders||[]).filter(function(x){return x.method==="popup"&&x.minutes<0;})[0];
        for(var k=s,g=0;k<e&&g<40;k=addDays(k,1),g++) out.push(Object.assign({},b,{day:k,allDay:true,mins:r?-r.minutes:null,endMins:null}));
      }else if(ev.start&&ev.start.dateTime){
        var sd=new Date(ev.start.dateTime),ed=ev.end&&ev.end.dateTime?new Date(ev.end.dateTime):sd;
        out.push(Object.assign({},b,{day:keyOf(sd),allDay:false,mins:minsOf(sd),endMins:keyOf(ed)===keyOf(sd)?minsOf(ed):1440,endAt:ed.getTime()}));
      }
    });
    out.forEach(function(e){e.cat=catOf(e);});
    var seen={};out=out.filter(function(e){var k=e.id+"|"+e.day;if(seen[k])return false;seen[k]=1;return true;});
    out.sort(function(a,b){var am=a.mins==null?-1:a.mins,bm=b.mins==null?-1:b.mins;return a.day<b.day?-1:a.day>b.day?1:am-bm;});
    return out;
  }
  function onDayAll(k){return (state.events||[]).filter(function(e){return e.day===k;});}
  function onDay(k){return onDayAll(k).filter(function(e){return state.cat==="all"||e.cat===state.cat;});}

  /* ---------- calendar view ---------- */
  function renderCal(){
    var start=addDays(today,state.week*7), end=addDays(start,SHOW-1);
    var mo=function(k,o){return fmt(k,{month:o});};
    var midMonth=addDays(start,3);
    var a=midMonth.split("-").map(Number);
    var pm=new Date(Date.UTC(a[0],a[1]-2,15)).toISOString().slice(0,10), nm=new Date(Date.UTC(a[0],a[1],15)).toISOString().slice(0,10);
    $("mo-prev").textContent=mo(pm,"short"); $("mo-cur").textContent=mo(midMonth,"long"); $("mo-next").textContent=mo(nm,"short");
    $("wk-prev").disabled=state.week<=-MAXWEEKS; $("wk-next").disabled=state.week>=MAXWEEKS;
    $("range").textContent=fmt(start,{day:"numeric",month:"long"})+" – "+fmt(end,{day:"numeric",month:"long"});
    var ready=state.events&&state.loadedTo&&state.loadedTo>end&&state.loadedFrom<=start;
    if(!ready){$("days").innerHTML='<div class="empty">'+(state.err&&!state.events?"היומן לא זמין כרגע":"טוען את היומן…")+'</div>';return;}
    var h="";
    for(var i=0;i<SHOW;i++){
      var k=addDays(start,i), ev=onDay(k).filter(function(e){return !/^אלמה אצל /.test(e.title);}), wl=whoLabel(k);
      var wd=k===today?"היום":k===addDays(today,1)?"מחר":fmt(k,{weekday:"long"});
      var dh=state.cat==="all"?dayHue(k):hue(catById(state.cat).hue);
      h+='<div class="day" style="'+dh+'"><div><div class="w">'+esc(wd)+'</div><div class="n">'+(+k.slice(8))+'</div><div class="m">'+esc(fmt(k,{month:"short"}).replace(/[׳']/g,""))+'</div>'+(wl?'<span class="al">אלמה '+esc(wl.t)+'</span>':'')+'</div>';
      if(!ev.length){h+='<div class="free">יום פנוי</div></div>';continue;}
      var slots={},order=[];
      ev.forEach(function(e){var s=e.mins==null?-1:Math.floor(e.mins/60);if(!slots[s]){slots[s]=[];order.push(s);}slots[s].push(e);});
      order.sort(function(x,y){return x-y;});
      h+='<div class="cols">'+order.map(function(s){
        return '<div class="col"><span class="h">'+(s<0?"כל היום":hhmm(s*60))+'</span>'+slots[s].map(function(e){return '<button class="gl" data-k="'+k+'" data-id="'+esc(e.id)+'">'+esc(e.title)+(endOf(e)?'<small class="till"> עד '+endOf(e)+'</small>':'')+'</button>';}).join("")+'</div>';
      }).join("")+'</div></div>';
    }
    $("days").innerHTML=h;
    var nowCol=$("days").querySelector(".cols"); if(nowCol&&state.week===0){var hr=Math.floor(minsOf(new Date())/60);var cols=nowCol.querySelectorAll(".col");for(var c=0;c<cols.length;c++){var t=cols[c].querySelector(".h").textContent;if(t!=="כל היום"&&parseInt(t,10)>=hr){cols[c].scrollIntoView({block:"nearest",inline:"start"});window.scrollTo(0,0);break;}}}
  }

  /* ---------- today view ---------- */
  function endOf(e){return (!e.allDay&&e.endMins!=null&&e.endMins!==e.mins&&e.endMins<1440)?hhmm(e.endMins):"";}
  function timeLabel(e){
    if(e.mins==null)return{top:"כל היום",right:""};
    if(e.allDay)return{top:"תזכורת",right:hhmm(e.mins)};
    return{top:e.endMins!==e.mins&&e.endMins<1440?"עד "+hhmm(e.endMins):"",right:hhmm(e.mins)};
  }
  function renderToday(){
    $("m-wd").textContent=fmt(today,{weekday:"long"});
    var a=today.split("-");
    $("m-date").innerHTML=esc(+a[2]+"."+(+a[1]))+"<small>"+esc(fmt(today,{month:"long"}))+"</small>";
    var h="";for(var i=0;i<7;i++){var k=addDays(addDays(today,state.off),i);var wl=whoLabel(k);h+='<button data-k="'+k+'" aria-pressed="'+(k===state.sel)+'"><span class="d1">'+esc(fmt(k,{weekday:"short"}))+'</span><span class="d2">'+(+k.slice(8))+'</span><span class="who'+(wl&&wl.me?" me":"")+'">'+esc(wl?wl.t:"\u00a0")+'</span></button>';}
    $("strip").innerHTML=h;
    var k=state.sel,label=k===today?"היום":k===addDays(today,1)?"מחר":fmt(k,{weekday:"long"});
    $("day-h").innerHTML=esc(label)+'<span>'+esc(fmt(k,{day:"numeric",month:"long"}))+'</span>';
    if(!state.events){$("m-count").textContent="–";$("m-next").textContent="–";$("deck").innerHTML='<div class="empty">'+(state.err?"היומן לא זמין כרגע":"טוען את היומן…")+'</div>';return;}
    var td=onDayAll(today),now=minsOf(new Date()),nx=td.filter(function(e){return e.mins!=null&&e.mins>=now;})[0];
    $("m-count").textContent=td.length;$("m-count-l").textContent=td.length===1?"אירוע היום":"אירועים היום";
    $("m-next").textContent=nx?hhmm(nx.mins):"—";$("m-next-l").textContent=nx?nx.title:"אין עוד היום";
    var ev=onDay(k);
    if(!ev.length){$("deck").innerHTML='<div class="empty">יום פנוי. אין אירועים ביומן.</div>';return;}
    var nowMs=Date.now(),nextId=k===today&&nx?nx.id:null;
    $("deck").innerHTML=ev.map(function(e){
      var tl=timeLabel(e),past=k===today&&!e.allDay&&e.endAt&&e.endAt<nowMs;
      return '<div class="card'+(past?" past":"")+'" tabindex="0" data-id="'+esc(e.id)+'" style="'+evHue(e)+'">'+
        '<div class="row1">'+(e.id===nextId?'<span class="tag">הבא</span>':'<span>'+esc(tl.top)+'</span>')+'<span>'+esc(e.location)+'</span></div>'+
        '<div class="row2"><div class="t">'+esc(e.title)+'</div><div class="tm">'+esc(tl.right)+'</div></div>'+
        '<div class="more">'+esc(e.desc||"אין פרטים נוספים.")+(e.link?'<br><a href="'+esc(e.link)+'" target="_blank" rel="noopener">פתיחה ב-Google ↗</a>':'')+'</div></div>';
    }).join("");
  }

  function renderTabs(){
    $("tab-today").setAttribute("aria-selected",state.tab==="today");$("tab-cal").setAttribute("aria-selected",state.tab==="cal");$("tab-shop").setAttribute("aria-selected",state.tab==="shop");$("view-shop").hidden=state.tab!=="shop";$("tab-alma").setAttribute("aria-selected",state.tab==="alma");$("view-alma").hidden=state.tab!=="alma";$("cats").hidden=state.tab==="shop"||state.tab==="alma";
    $("view-today").hidden=state.tab!=="today";$("view-cal").hidden=state.tab!=="cal";$("tab-rec").setAttribute("aria-selected",state.tab==="rec");$("view-rec").hidden=state.tab!=="rec";if(state.tab==="rec")$("cats").hidden=true;
  }
  function renderMeta(){
    $("stale").textContent=state.storedAt?"עודכן ב-"+new Intl.DateTimeFormat("he-IL",{timeZone:TZ,hour:"2-digit",minute:"2-digit"}).format(new Date(state.storedAt)):"";
    var e=state.err,el=$("msg");
    if(!e){el.innerHTML="";return;}
    el.innerHTML='<div class="note"><div>'+esc(e.text)+'</div>'+(e.btn?'<button id="msg-btn">'+esc(e.btn)+'</button>':'')+'</div>';
    var b=$("msg-btn");if(b)b.onclick=e.action;
  }
  function renderCats(){
    var counts={};onDayAll(today).forEach(function(e){counts[e.cat]=(counts[e.cat]||0)+1;});
    $("cats").innerHTML=CATS.map(function(c){
      return '<button class="cat" data-cat="'+c.id+'" aria-pressed="'+(state.cat===c.id)+'" style="'+(c.hue==null?"":hue(c.hue))+'">'+esc(c.name)+'</button>';
    }).join("");
  }
  /* ---------- shopping list (edits the Google event's description) ---------- */
  function parseItems(desc){
    var txt=String(desc||"").replace(/<br\s*\/?>/gi,"\n").replace(/<[^>]+>/g,"").replace(/&nbsp;/g," ").replace(/&amp;/g,"&");
    return txt.split("\n").map(function(l){return l.trim();}).filter(Boolean).map(function(l){
      var done=/^(☑|✓|✔|✅|\[x\])/i.test(l);
      return {text:l.replace(/^(☐|☑|✓|✔|✅|\[ ?x?\]|[-•*])\s*/i,"").trim(),done:done};
    }).filter(function(i){return i.text;});
  }
  function serialize(items){return items.map(function(i){return (i.done?"☑ ":"☐ ")+i.text;}).join("\n");}
  /* a checklist stored in one recurring Google event's description */
  function makeList(px,titleRe,missing){
    var L={series:null,items:null,status:"",saving:false,dirty:false,timer:null};
    L.pick=function(){
      if(L.dirty||L.saving||!state.events)return;
      var ev=state.events.filter(function(e){return titleRe.test(e.title);});
      var cur=ev.filter(function(e){return e.day>=today;})[0]||ev[0];
      if(!cur){L.series=null;L.items=null;return;}
      L.series=cur.series;L.items=parseItems(cur.desc);
    };
    L.render=function(){
      var list=$(px+"-list"),items=L.items;
      if(!items){list.innerHTML='<li class="sempty">'+(state.events?missing:"טוען…")+'</li>';$(px+"-count").textContent="–";$(px+"-clear").hidden=true;$(px+"-status").textContent=L.status;return;}
      $(px+"-count").textContent=items.filter(function(i){return !i.done;}).length;
      list.innerHTML=items.length?items.map(function(it,i){
        return '<li class="'+(it.done?"done":"")+'"><button class="tick" data-i="'+i+'" aria-pressed="'+it.done+'"><span class="box">'+(it.done?"✓":"")+'</span><span class="txt">'+esc(it.text)+'</span></button><button class="del" data-i="'+i+'" aria-label="מחיקת '+esc(it.text)+'">×</button></li>';
      }).join(""):'<li class="sempty">הכול בוצע. אפשר להוסיף חדש למעלה.</li>';
      $(px+"-clear").hidden=!items.some(function(i){return i.done;});
      $(px+"-status").textContent=L.status;
    };
    function changed(){L.dirty=true;L.status="שומר…";L.render();clearTimeout(L.timer);L.timer=setTimeout(save,900);}
    function save(){
      if(!mcp||!L.series)return;
      if(L.saving){L.timer=setTimeout(save,500);return;}
      L.saving=true;var sent=serialize(L.items);
      mcp.callTool(SERVER,"update_event",{eventId:L.series,description:sent||" ",notificationLevel:"NONE"}).then(function(){
        L.saving=false;
        if(serialize(L.items)===sent){L.dirty=false;L.status="נשמר ב-Google ✓";
          (state.events||[]).forEach(function(e){if(e.series===L.series)e.desc=sent;});
          if(mcp.invalidate)mcp.invalidate(SERVER,TOOL).catch(function(){});
        }
        L.render();
      },function(err){
        L.saving=false;var c=err&&err.code;
        L.status=c==="needs_reauth"?"החיבור ל-Google פג. סגרי ופתחי את האפליקציה כדי להתחבר שוב.":
          (c==="not_in_manifest"||c==="approval_required"||c==="consent_required")?"צריך לאשר לעמוד לערוך את היומן. נסי שוב את השינוי.":
          c==="tool_error"?"Google לא קיבל את השינוי: "+(err.message||""):
          "לא בטוח שהשינוי נשמר. לחצי על רענון כדי לבדוק.";
        L.dirty=false;L.render();
      });
    }
    $(px+"-add").addEventListener("submit",function(ev){
      ev.preventDefault();var v=$(px+"-input").value.trim();if(!v||!L.items)return;
      L.items.push({text:v,done:false});$(px+"-input").value="";changed();$(px+"-input").focus();
    });
    $(px+"-list").addEventListener("click",function(ev){
      var t=ev.target.closest(".tick"),d=ev.target.closest(".del");
      if(t){var it=L.items[+t.dataset.i];it.done=!it.done;changed();}
      else if(d){L.items.splice(+d.dataset.i,1);changed();}
    });
    $(px+"-clear").onclick=function(){L.items=L.items.filter(function(i){return !i.done;});changed();};
    L.add=function(arr){if(!L.items)return false;arr.forEach(function(t){if(!L.items.some(function(i){return i.text===t&&!i.done;}))L.items.push({text:t,done:false});});changed();return true;};
    return L;
  }
  var shop=makeList("shop",/רשימת קניות/,"לא מצאתי ביומן אירוע בשם \"רשימת קניות\".");
  var rem=makeList("rem",/לא לשכוח/,"לא מצאתי ביומן אירוע בשם \"לא לשכוח\".");
  function pickShop(){shop.pick();rem.pick();}
  function renderShop(){shop.render();rem.render();}
  $("tab-shop").onclick=function(){setTab("shop");};

/* ---------- Alma screen ---------- */
  var ALMA_CAL="cf46d91065b331d5bc1ac8f3b088e704079a9a8e829ff25db7898b12d911cfbf@group.calendar.google.com";
  var alma={sel:today,checks:{},totals:{},db:null,pending:{},writing:{},timers:{}};
  try{var lc=JSON.parse(localStorage.getItem("yoman-alma")||"{}");if(lc&&typeof lc==="object")alma.checks=lc;}catch(e){}
  function splitItems(desc){
    var d=String(desc||"").replace(/<br\s*\/?>/gi,"\n").replace(/<[^>]+>/g,"");
    if(/[☐☑]/.test(d))return parseItems(d).map(function(i){return i.text;});
    var out=[],cur="",depth=0;
    for(var i=0;i<d.length;i++){var ch=d[i];if(ch==="(")depth++;if(ch===")")depth=Math.max(0,depth-1);
      if((ch===","||ch==="\n")&&depth===0){if(cur.trim())out.push(cur.trim());cur="";}else cur+=ch;}
    if(cur.trim())out.push(cur.trim());
    return out.length>=2?out:[];
  }
  function ikey(series,text){return "k"+hsh(series+"|"+text).toString(36);}
  function almaTitle(t){return t.replace(/\s*[-–—]\s*אלמה\s*$/,"").replace(/\s*עם אלמה/,"").replace(/^אלמה\s*[-–—]\s*/,"").trim();}
  function whoOn(k){var c=onDayAll(k).filter(function(e){return /^אלמה אצל /.test(e.title);})[0];return c?c.title.replace(/^אלמה אצל /,"").trim():"";}
  function renderAlma(){
    var k=alma.sel;
    $("a-wd").textContent=(k===today?"היום, ":k===addDays(today,1)?"מחר, ":"")+fmt(k,{weekday:"long",day:"numeric",month:"long"});
    var h="";for(var i=0;i<7;i++){var d=addDays(addDays(today,state.off),i),w=state.events?whoOn(d):"";h+='<button data-ak="'+d+'" aria-pressed="'+(d===k)+'"><span class="d1">'+esc(fmt(d,{weekday:"short"}))+'</span><span class="d2">'+(+d.slice(8))+'</span><span class="who">'+esc(w||" ")+'</span></button>';}
    $("a-strip").innerHTML=h;
    if(!state.events){$("a-where").textContent="";$("a-prog").textContent="";$("a-body").innerHTML='<div class="empty">'+(state.err?"היומן לא זמין כרגע":"טוען את היום של אלמה…")+'</div>';return;}
    var who=whoOn(k);$("a-where").textContent=who?"אצל "+who:"";
    var ev=onDayAll(k).filter(function(e){return e.cat==="alma"&&!/^אלמה אצל /.test(e.title);});
    var groups=[],classes=[],remind=[];
    ev.forEach(function(e){var it=splitItems(e.desc);if(it.length)groups.push({e:e,items:it});else if(!e.allDay)classes.push(e);else remind.push(e);});
    var ch=alma.checks[k]||{},tot=0,dn=0,body="";
    if(classes.length)body+='<div class="alist"><h3>חוגים ואירועים</h3><div class="row">'+classes.map(function(e){var en=endOf(e);return '<span class="gl">'+hhmm(e.mins)+(en?'–'+en:'')+' · '+esc(almaTitle(e.title))+(en?' <small>(מסיימת '+en+')</small>':'')+'</span>';}).join("")+'</div></div>';
    groups.forEach(function(g){
      var n=0;g.items.forEach(function(t){if(ch[ikey(g.e.series,t)])n++;});tot+=g.items.length;dn+=n;
      var all=n===g.items.length;
      body+='<div class="ag'+(all?" done":"")+'"><div class="ag-h"><b>'+esc(almaTitle(g.e.title))+'</b><span>'+(g.e.mins!=null?hhmm(g.e.mins)+" · ":"")+n+"/"+g.items.length+'</span></div><div class="bar"><i style="width:'+Math.round(100*n/g.items.length)+'%"></i></div><ul>'+
        g.items.map(function(t){var key=ikey(g.e.series,t),ok=!!ch[key];return '<li><button class="'+(ok?"ok":"")+'" data-key="'+key+'" aria-pressed="'+ok+'"><span class="bx">'+(ok?"✓":"")+'</span><span class="tx">'+esc(t)+'</span></button></li>';}).join("")+'</ul></div>';
    });
    if(remind.length)body+='<div class="alist"><h3>לזכור</h3><div class="row">'+remind.map(function(e){return '<span class="gl">'+esc(almaTitle(e.title))+'</span>';}).join("")+'</div></div>';
    if(!body)body='<div class="empty">אין לאלמה משימות או חוגים ביום הזה.</div>';
    $("a-body").innerHTML=body;
    $("a-prog").textContent=tot?dn+" מתוך "+tot+" בוצעו":"";
    $("a-note").textContent=state.almaCalFailed?"לא הצלחתי לקרוא את היומן \"אלמה חדש\", ולכן חלק מהחוגים לא מוצגים.":(alma.db?"":"הסימונים נשמרים רק במכשיר הזה.");
  }
  function saveAlma(k){
    try{localStorage.setItem("yoman-alma",JSON.stringify(alma.checks));}catch(e){}
    if(!alma.db)return;
    clearTimeout(alma.timers[k]);
    alma.timers[k]=setTimeout(function write(){
      if(alma.writing[k]){alma.timers[k]=setTimeout(write,400);return;}
      alma.writing[k]=true;var tt=almaTotal(k);if(tt!=null)alma.totals[k]=tt;var body={checks:Object.assign({},alma.checks[k]||{}),updatedAt:Date.now()};if(tt!=null)body.total=tt;
      alma.db.doc("alma/"+k).set(body).then(function(){alma.writing[k]=false;if(JSON.stringify(alma.checks[k]||{})===JSON.stringify(body.checks))alma.pending[k]=false;},function(){alma.writing[k]=false;alma.pending[k]=false;$("a-note").textContent="הסימון לא נשמר. נסי שוב.";});
    },600);
  }
  $("a-strip").addEventListener("click",function(ev){var b=ev.target.closest("button");if(b){alma.sel=b.dataset.ak;renderAlma();}});
  $("a-body").addEventListener("click",function(ev){
    var b=ev.target.closest("button[data-key]");if(!b)return;
    var k=alma.sel,m=Object.assign({},alma.checks[k]||{});
    if(m[b.dataset.key])delete m[b.dataset.key];else m[b.dataset.key]=true;
    alma.checks[k]=m;alma.pending[k]=true;renderAlma();renderRew();saveAlma(k);
  });
  $("tab-alma").onclick=function(){setTab("alma");};
  claude.use("db").then(function(db){
    if(!db)return;alma.db=db;
    db.collection("alma").onSnapshot(function(snap){
      snap.docs.forEach(function(d){var v=d.data();if(v&&typeof v.total==="number")alma.totals[d.id]=v.total;if(v&&v.checks&&!alma.pending[d.id])alma.checks[d.id]=Object.assign({},v.checks);});
      renderAlma();renderRew();
    },function(){alma.db=null;renderAlma();});
    renderAlma();
  },function(){});

/* ---------- my day: blocks + habits (config lives in the page database) ---------- */
  var mine={blocks:null,checks:{},db:null,pending:{},writing:{},timers:{},loaded:false};
  try{var mc=JSON.parse(localStorage.getItem("yoman-mine")||"{}");if(mc&&typeof mc==="object")mine.checks=mc;}catch(e){}
  function whoLabel(k){var w=state.events?whoOn(k):"";if(!w)return null;return /איריס/.test(w)?{t:"אצלי",me:true}:{t:"אצל "+w,me:false};}
  var HABIT_RE=/^(☀️ בוקר|🥗 עבודה ואוכל|🌿 אחר הצהריים|🌙 ערב)$|לא לשכוח|צום|ארוחת|ארוחה אחרונה|מגנזיום|יוגה|לחץ דם|תה טימין|קפיצה על חבל|שגרה יומית|משימות יומיות קבועות|ספורט|לימודי סוכני AI/;
  function dow(k){return utc(k).getUTCDay();}
  function hm(t){if(!t)return null;var a=String(t).split(":");return (+a[0])*60+(+a[1]||0);}
  var openEv={},openGrp={};
  var START_DAY="2026-10-29";
  function isDone(it,ch){return it.target?(+ch[it.id]||0)>=it.target:!!ch[it.id];}
  function dayScore(k){
    if(!mine.blocks)return null;var wd=dow(k),ch=mine.checks[k]||{},t=0,d=0,per=[];
    mine.blocks.forEach(function(b){(b.items||[]).forEach(function(it){if(it.days&&it.days.indexOf(wd)<0)return;t++;var ok=isDone(it,ch);if(ok)d++;per.push({it:it,ok:ok});});});
    return {t:t,d:d,per:per,pct:t?Math.round(100*d/t):0};
  }
  function renderScore(){
    var el=$("score");if(!mine.blocks){el.hidden=true;return;}
    var sc=dayScore(today),bars="",sum=0,cnt=0,miss={};
    for(var i=6;i>=0;i--){var k=addDays(today,-i),on=k>=START_DAY,ds=on?dayScore(k):null;
      if(ds&&k<today){sum+=ds.pct;cnt++;ds.per.forEach(function(p){var m=miss[p.it.id]||(miss[p.it.id]={it:p.it,n:0,d:0});m.n++;if(p.ok)m.d++;});}
      bars+='<div class="sb'+(k===today?" now":"")+'"><i style="height:'+(ds?Math.max(4,ds.pct):0)+'%"></i><span>'+esc(fmt(k,{weekday:"narrow"}))+'</span></div>';}
    var now=minsOf(new Date()),late=now>=20*60,msg;
    if(sc.pct>=80)msg="יופי איריס! "+(late?"היום ":"עד עכשיו ")+"השלמת "+sc.d+" מתוך "+sc.t+".";
    else if(sc.pct>=50)msg=(late?"יום טוב, ":"בדרך הנכונה, ")+sc.d+" מתוך "+sc.t+" הושלמו.";
    else msg=late?"היום השלמת "+sc.d+" מתוך "+sc.t+". מחר יום חדש.":"עד עכשיו "+sc.d+" מתוך "+sc.t+". היום עוד ארוך.";
    var focus=Object.keys(miss).map(function(k){return miss[k];}).filter(function(m){return m.n>=2&&m.d<m.n;}).sort(function(a,b){return a.d/a.n-b.d/b.n;})[0];
    el.hidden=false;
    el.innerHTML='<div class="sc-top"><div><div class="w">הציון של היום</div><div class="pct">'+sc.pct+'<small>%</small></div></div><div class="sbars" aria-label="שבוע אחרון">'+bars+'</div></div>'+
      '<p class="sc-msg">'+esc(msg)+(cnt?' ממוצע השבוע: '+Math.round(sum/cnt)+'%.':'')+'</p>'+
      (focus?'<p class="sc-focus">כדאי לשים לב ל: <b>'+esc(focus.it.text)+'</b> (בוצע '+focus.d+' מתוך '+focus.n+' ימים)</p>':'');
  }
  function renderBlocks(){
    var k=state.sel,deck=$("deck");
    if(!mine.blocks){deck.innerHTML='<div class="empty">'+(mine.loaded?(mine.db?'עוד אין כאן נתונים.<br><br><button class="imp-btn" id="imp-btn">ייבוא הנתונים מהגרסה הקודמת</button><br><small id="imp-msg"></small>':"עוד לא הוגדרו בלוקים ליום."):"טוען את היום שלך…")+'</div>';return;}
    var wd=dow(k),ch=mine.checks[k]||{},ach=alma.checks[k]||{},now=minsOf(new Date()),isToday=k===today,tot=0,dn=0,next=null;
    var evs=state.events?onDayAll(k).filter(function(e){return !HABIT_RE.test(e.title)&&!/^אלמה אצל /.test(e.title)&&!/רשימת קניות/.test(e.title);}):[];
    var allday=evs.filter(function(e){return e.mins==null;});
    var timed=evs.filter(function(e){return e.mins!=null;});
    var catName=function(e){var c=catById(e.cat);return c.id==="all"?"":c.name;};
    var html="";
    var wl=whoLabel(k);
    if(wl||allday.length){
      html+='<div class="today-top">'+(wl?'<span class="alma-pill'+(wl.me?" me":"")+'">אלמה '+esc(wl.t)+'</span>':'')+
        allday.map(function(e){return '<span class="ad-chip">'+esc(e.title)+'</span>';}).join("")+'</div>';
    }
    html+=mine.blocks.map(function(b,bi){
      var from=hm(b.from),to=hm(b.to),rows=[];
      (b.items||[]).forEach(function(it){if(!it.days||it.days.indexOf(wd)>=0)rows.push({t:hm(it.time),kind:"h",it:it});});
      timed.forEach(function(e){
        var m=e.mins;if(!((m>=from&&m<to)||(bi===0&&m<from)))return;
        var items=e.cat==="alma"?splitItems(e.desc):[];
        rows.push({t:m,kind:items.length?"g":"e",e:e,items:items});
      });
      rows.sort(function(x,y){var a=x.t==null?-1:x.t,c=y.t==null?-1:y.t;return a-c;});
      var hab=rows.filter(function(r){return r.kind==="h";}),n=0;
      hab.forEach(function(r){if(isDone(r.it,ch))n++;});tot+=hab.length;dn+=n;
      if(isToday)rows.forEach(function(r){var done=r.kind==="h"&&isDone(r.it,ch);if(r.t!=null&&r.t>=now&&!done&&(!next||r.t<next.t))next={t:r.t,title:r.kind==="h"?r.it.text:almaTitle(r.e.title)};});
      var cur=isToday&&now>=from&&now<to, past=isToday&&now>=to&&n===hab.length;
      var body=rows.map(function(r){
        if(r.kind==="h"&&r.it.target){var cn=+ch[r.it.id]||0,cok=cn>=r.it.target;
          return '<li><div class="hb cnt'+(cok?" ok":"")+'"><span class="bx">'+(cok?"✓":"")+'</span><span class="tx"><b>'+esc(r.it.text)+'</b><span>'+cn+' מתוך '+r.it.target+(r.it.note?' · '+esc(r.it.note):'')+'</span></span><span class="cb"><button data-dec="'+esc(r.it.id)+'" aria-label="פחות">−</button><button data-inc="'+esc(r.it.id)+'" aria-label="עוד אחת">+</button></span></div></li>';}
        if(r.kind==="h"){var ok=!!ch[r.it.id];
          return '<li><button class="hb'+(ok?" ok":"")+'" data-mk="'+esc(r.it.id)+'" aria-pressed="'+ok+'"><span class="bx">'+(ok?"✓":"")+'</span><span class="tx"><b>'+esc(r.it.text)+'</b>'+(r.it.note?'<span>'+esc(r.it.note)+'</span>':'')+'</span>'+(r.it.time?'<span class="tm">'+esc(r.it.time)+'</span>':'')+'</button></li>';}
        var e=r.e,tag=catName(e),tl=timeLabel(e);
        if(r.kind==="g"){
          var gn=0;r.items.forEach(function(t){if(ach[ikey(e.series,t)])gn++;});
          var op=!!openGrp[e.series];
          return '<li class="ev grp alma'+(op?" open":"")+'"><button class="evb" data-grp="'+esc(e.series)+'" aria-expanded="'+op+'"><span class="et">'+hhmm(e.mins)+'</span><span class="eb"><b>'+esc(almaTitle(e.title))+'</b><span class="etag">אלמה · '+gn+'/'+r.items.length+'</span></span><span class="car">'+(op?"▴":"▾")+'</span></button>'+
            (op?'<ul class="gi">'+r.items.map(function(t){var key=ikey(e.series,t),ok=!!ach[key];return '<li><button class="hb'+(ok?" ok":"")+'" data-ak2="'+key+'" aria-pressed="'+ok+'"><span class="bx">'+(ok?"✓":"")+'</span><span class="tx"><b>'+esc(t)+'</b></span></button></li>';}).join("")+'</ul>':'')+'</li>';
        }
        var op2=!!openEv[e.id];
        return '<li class="ev'+(e.cat==="alma"?" alma":"")+(op2?" open":"")+'"><button class="evb" data-ev="'+esc(e.id)+'" aria-expanded="'+op2+'"><span class="et">'+(e.allDay?"⏰ ":"")+hhmm(e.mins)+(endOf(e)?'<small>עד '+endOf(e)+'</small>':'')+'</span><span class="eb"><b>'+esc(e.title)+'</b>'+(tag?'<span class="etag">'+esc(tag)+'</span>':'')+'</span></button>'+
          (op2?'<div class="emore">'+esc(e.desc||"אין פרטים נוספים.")+(e.location?'<br>📍 '+esc(e.location):'')+(e.link?'<br><a href="'+esc(e.link)+'" target="_blank" rel="noopener">פתיחה ב-Google ↗</a>':'')+'</div>':'')+'</li>';
      }).join("");
      return '<div class="blk'+(past?" past":"")+'" style="'+hue(b.hue!=null?b.hue:bi)+'"><div class="blk-h"><div><b>'+esc(b.name)+(cur?'<span class="now">עכשיו</span>':'')+'</b><small>'+esc(b.from)+'–'+esc(b.to)+(b.note?' · '+esc(b.note):'')+'</small></div><span class="pr">'+n+'/'+hab.length+'</span></div>'+
        '<div class="bar"><i style="width:'+(hab.length?Math.round(100*n/hab.length):0)+'%"></i></div><ul class="rows">'+body+'</ul></div>';
    }).join("");
    deck.innerHTML=html;
    if(isToday){
      $("m-count").textContent=dn+"/"+tot;$("m-count-l").textContent="הרגלים בוצעו היום";
      $("m-next").textContent=next?hhmm(next.t):"—";$("m-next-l").textContent=next?next.title:"אין עוד היום";
    }
  }
  document.addEventListener("click",function(ev){
    if(!ev.target.closest("#imp-btn"))return;
    var inp=document.createElement("input");inp.type="file";inp.accept=".json,application/json";
    inp.onchange=function(){
      var f=inp.files[0];if(!f)return;var msg=$("imp-msg");msg.textContent="מייבא…";
      f.text().then(function(t){
        var data=JSON.parse(t),jobs=[];
        Object.keys(data.collections||{}).forEach(function(col){var docs=data.collections[col];Object.keys(docs).forEach(function(id){jobs.push(mine.db.doc(col+"/"+id).set(docs[id]));});});
        return Promise.all(jobs).then(function(){msg.textContent="יובאו "+jobs.length+" רשומות ✓";});
      }).catch(function(){msg.textContent="הקובץ לא נקרא. ודאי שבחרת את קובץ הגיבוי.";});
    };
    inp.click();
  });
  /* write the day's summary into that day's "🌙 ערב" event in Google, so it lives in the calendar too */
  var sumTimers={};
  function pushSummary(k){
    clearTimeout(sumTimers[k]);
    sumTimers[k]=setTimeout(function(){
      if(!mcp||!state.events||!mine.blocks)return;
      var ev=onDayAll(k).filter(function(e){return /^🌙 ערב$/.test(e.title);})[0];if(!ev)return;
      var sc=dayScore(k);if(!sc||!sc.t)return;
      var done=sc.per.filter(function(p){return p.ok;}).map(function(p){return p.it.text;});
      var miss=sc.per.filter(function(p){return !p.ok;}).map(function(p){return p.it.text;});
      var base=String(ev.desc||"").split("\n\n📊")[0].replace(/\s+$/,"");
      var txt=base+"\n\n📊 סיכום היום: "+sc.d+" מתוך "+sc.t+" ("+sc.pct+"%)\n✓ בוצע: "+(done.join(", ")||"—")+"\n✗ לא בוצע: "+(miss.join(", ")||"—");
      if(txt===ev.desc)return;
      mcp.callTool(SERVER,"update_event",{eventId:ev.id,description:txt,notificationLevel:"NONE"}).then(function(){ev.desc=txt;},function(){});
    },8000);
  }
  function saveMine(k){
    pushSummary(k);
    try{localStorage.setItem("yoman-mine",JSON.stringify(mine.checks));}catch(e){}
    if(!mine.db)return;
    clearTimeout(mine.timers[k]);
    mine.timers[k]=setTimeout(function write(){
      if(mine.writing[k]){mine.timers[k]=setTimeout(write,400);return;}
      mine.writing[k]=true;var body={checks:Object.assign({},mine.checks[k]||{}),updatedAt:Date.now()};
      mine.db.doc("days/"+k).set(body).then(function(){mine.writing[k]=false;if(JSON.stringify(mine.checks[k]||{})===JSON.stringify(body.checks))mine.pending[k]=false;},function(){mine.writing[k]=false;mine.pending[k]=false;});
    },600);
  }
  $("deck").addEventListener("click",function(ev){
    var ea=ev.target.closest("button[data-ev]");if(ea){openEv[ea.dataset.ev]=!openEv[ea.dataset.ev];renderBlocks();return;}
    var ga=ev.target.closest("button[data-grp]");if(ga){openGrp[ga.dataset.grp]=!openGrp[ga.dataset.grp];renderBlocks();return;}
    var aa=ev.target.closest("button[data-ak2]");if(aa){var kk=state.sel,am=Object.assign({},alma.checks[kk]||{});if(am[aa.dataset.ak2])delete am[aa.dataset.ak2];else am[aa.dataset.ak2]=true;alma.checks[kk]=am;alma.pending[kk]=true;renderBlocks();renderAlma();renderRew();saveAlma(kk);return;}
    var ci=ev.target.closest("button[data-inc],button[data-dec]");
    if(ci){var kc=state.sel,mc=Object.assign({},mine.checks[kc]||{}),idc=ci.dataset.inc||ci.dataset.dec,v=(+mc[idc]||0)+(ci.dataset.inc?1:-1);if(v<=0)delete mc[idc];else mc[idc]=v;mine.checks[kc]=mc;mine.pending[kc]=true;renderBlocks();renderScore();saveMine(kc);return;}
    var b=ev.target.closest("button[data-mk]");if(!b)return;
    var k=state.sel,m=Object.assign({},mine.checks[k]||{});
    if(m[b.dataset.mk])delete m[b.dataset.mk];else m[b.dataset.mk]=true;
    mine.checks[k]=m;mine.pending[k]=true;renderBlocks();renderScore();saveMine(k);
  });
  claude.use("db").then(function(db){
    if(!db){mine.loaded=true;renderBlocks();return;}
    mine.db=db;
    db.doc("config/blocks").onSnapshot(function(sn){var v=sn.exists?sn.data():null;mine.blocks=v&&Array.isArray(v.blocks)?v.blocks:null;mine.loaded=true;if(state.tab==="today")renderToday();renderBlocks();renderScore();},function(){mine.loaded=true;renderBlocks();});
    db.collection("days").onSnapshot(function(snap){snap.docs.forEach(function(d){var v=d.data();if(v&&v.checks&&!mine.pending[d.id])mine.checks[d.id]=Object.assign({},v.checks);});renderBlocks();renderScore();},function(){});
  },function(){mine.loaded=true;renderBlocks();});

/* ---------- recipe book (recipes live in the page database) ---------- */
  var rec={list:null,open:null,variant:0,sel:{},msg:"",loaded:false};
  function recSections(r){var v=(r.variants||[])[rec.variant-1];return v?v.sections:r.sections;}
  function renderRecipes(){
    var L=$("rec-list"),D=$("rec-detail");
    if(!rec.list){L.innerHTML='<div class="empty">'+(rec.loaded?"ספר המתכונים ריק.":"טוען את ספר המתכונים…")+'</div>'+(rec.db?'<button id="rec-add" class="rec-addbtn">+ מתכון חדש</button>':'');D.hidden=true;L.hidden=false;return;}
    var r=rec.open&&rec.list.filter(function(x){return x.id===rec.open;})[0];
    if(!r){
      D.hidden=true;L.hidden=false;
      L.innerHTML='<div class="rec-head"><div><div class="w">ספר המתכונים</div><div class="n">'+rec.list.length+' מתכונים</div></div><button id="rec-add" class="rec-addbtn">+ מתכון חדש</button></div>'+
        rec.list.map(function(x,i){var cnt=0;(x.sections||[]).forEach(function(s){cnt+=(s.items||[]).length;});
          return '<button class="rec-card" data-rid="'+esc(x.id)+'" style="'+hue(x.hue!=null?x.hue:i+1)+'"><span class="rk">'+esc(x.kind||"")+'</span><b>'+esc(x.title)+'</b><span class="rm">'+esc(x.meta||"")+(x.meta?" · ":"")+cnt+' מצרכים</span></button>';}).join("");
      return;
    }
    L.hidden=true;D.hidden=false;
    var secs=recSections(r)||[],sel=rec.sel,nSel=Object.keys(sel).length;
    var h='<button class="rec-back" id="rec-back">→ כל המתכונים</button>'+
      '<div class="rec-hero" style="'+hue(r.hue!=null?r.hue:1)+'"><span class="rk">'+esc(r.kind||"")+'</span><h2>'+esc(r.title)+'</h2>'+(r.intro?'<p>'+esc(r.intro)+'</p>':'')+(r.meta?'<span class="rm">'+esc(r.meta)+'</span>':'')+'</div>';
    if(r.variants&&r.variants.length){
      h+='<div class="rec-var" role="group">'+[{name:r.mainName||"המתכון המלא"}].concat(r.variants).map(function(v,i){return '<button data-var="'+i+'" aria-pressed="'+(rec.variant===i)+'">'+esc(v.name)+'</button>';}).join("")+'</div>';
    }
    h+='<div class="rec-panel"><div class="rp-h"><b>מצרכים</b><span>הקישי על מצרך כדי לבחור</span></div>'+
      secs.map(function(s,si){return (s.name?'<h3>'+esc(s.name)+'</h3>':'')+'<ul class="ing">'+(s.items||[]).map(function(t,ii){var key=rec.variant+":"+si+":"+ii,on=!!sel[key];return '<li><button data-ing="'+key+'" aria-pressed="'+on+'" class="'+(on?"on":"")+'"><span class="dot">'+(on?"✓":"")+'</span><span>'+esc(t)+'</span></button></li>';}).join("")+'</ul>'+(s.note?'<p class="snote">'+esc(s.note)+'</p>':'');}).join("")+
      '<div class="rec-act"><button id="rec-shop">'+(nSel?"להוסיף "+nSel+" לרשימת הקניות":"להוסיף את כל המצרכים לקניות")+'</button>'+(nSel?'<button id="rec-clear" class="ghost">ניקוי בחירה</button>':'')+'</div>'+
      (rec.msg?'<p class="rec-msg" role="status">'+esc(rec.msg)+'</p>':'')+'</div>';
    var v=(r.variants||[])[rec.variant-1],steps=(v&&v.steps)||r.steps||[];
    if(v&&v.note)h+='<div class="rec-panel"><p class="snote">'+esc(v.note)+'</p></div>';
    if(steps.length)h+='<div class="rec-panel"><div class="rp-h"><b>הכנה</b></div><ol class="steps">'+steps.map(function(t){return '<li>'+esc(t)+'</li>';}).join("")+'</ol></div>';
    if(r.notes&&r.notes.length)h+='<div class="rec-panel tips"><div class="rp-h"><b>טיפים</b></div>'+r.notes.map(function(t){return '<p>'+esc(t)+'</p>';}).join("")+'</div>';
    D.innerHTML=h;
  }
  function ingText(t){return t.replace(/^(לפיזור בסוף|בהמשך):\s*/,"").trim();}
  $("view-rec").addEventListener("click",function(ev){
    var c=ev.target.closest("[data-rid]");if(c){rec.open=c.dataset.rid;rec.variant=0;rec.sel={};rec.msg="";renderRecipes();window.scrollTo(0,0);return;}
    if(ev.target.closest("#rec-back")){rec.open=null;renderRecipes();return;}
    var vb=ev.target.closest("[data-var]");if(vb){rec.variant=+vb.dataset.var;rec.sel={};rec.msg="";renderRecipes();return;}
    var ib=ev.target.closest("[data-ing]");if(ib){var k=ib.dataset.ing;if(rec.sel[k])delete rec.sel[k];else rec.sel[k]=true;rec.msg="";renderRecipes();return;}
    if(ev.target.closest("#rec-clear")){rec.sel={};rec.msg="";renderRecipes();return;}
    if(ev.target.closest("#rec-shop")){
      var r=rec.list.filter(function(x){return x.id===rec.open;})[0],secs=recSections(r)||[],out=[],keys=Object.keys(rec.sel);
      secs.forEach(function(s,si){(s.items||[]).forEach(function(t,ii){if(!keys.length||rec.sel[rec.variant+":"+si+":"+ii])out.push(ingText(t));});});
      if(!keys.length)out=out.filter(function(t){return !/^(מים|כוס מים|חצי כוס מים|.*מים רותחים)$/.test(t);});
      rec.msg=shop.add(out)?out.length+" מצרכים נוספו לרשימת הקניות ✓":"רשימת הקניות עוד נטענת. נסי שוב בעוד רגע.";
      if(keys.length&&shop.items)rec.sel={};
      renderRecipes();
    }
  });
  $("tab-rec").onclick=function(){setTab("rec");};
  var sampleFn=null;
  claude.use("sample").then(function(f){sampleFn=f;if(f&&f.limits)f.limits().then(function(l){if(!l||!l.images){$("rn-photo").hidden=true;$("rn-photo-l").hidden=true;}},function(){$("rn-photo").hidden=true;$("rn-photo-l").hidden=true;});},function(){});
  function openNew(on){$("rec-new").hidden=!on;if(on){$("rn-msg").textContent=sampleFn?"":"סידור אוטומטי עוד לא הופעל. אפשר לשלוח את המתכון ל-Claude בצ'אט.";$("rn-text").focus();}}
  document.addEventListener("click",function(ev){if(ev.target.closest("#rec-add"))openNew(true);});
  $("rn-cancel").onclick=function(){openNew(false);};
  $("rn-go").onclick=function(){
    var txt=$("rn-text").value.trim(),files=$("rn-photo").files;
    if(!txt&&!(files&&files.length)){$("rn-msg").textContent="הדביקי טקסט או בחרי צילום.";return;}
    if(!sampleFn||!rec.db){$("rn-msg").textContent="אי אפשר לסדר מכאן כרגע. שלחי לי את המתכון בצ'אט ואוסיף אותו.";return;}
    var btn=$("rn-go");btn.disabled=true;$("rn-msg").textContent="מסדר את המתכון…";
    var prompt="סדר את המתכון הבא לפורמט JSON בעברית. החזר רק JSON בצורה: {\"title\":string,\"kind\":string (סוג קצר, למשל: אפייה, בשר, מרק, סלט),\"intro\":string (משפט קצר),\"meta\":string (למשל: 6 מנות · 40 דקות · 180°),\"sections\":[{\"name\":string (ריק אם חלק אחד),\"items\":[string],\"note\":string}],\"steps\":[string],\"notes\":[string]}. שמור על הכמויות והניסוח המקוריים, המר פרנהייט לצלזיוס ואונקיות לגרמים, ואל תמציא מצרכים. "+(files&&files.length?"המתכון מופיע בתמונות המצורפות. ":"")+(txt?"\n\nהמתכון:\n"+txt:"");
    var opts={modelTier:"default"};if(files&&files.length)opts.images=files;
    sampleFn.json(prompt,opts).then(function(r){
      if(!r||!r.title||!Array.isArray(r.sections))throw {message:"bad"};
      var id="r"+Date.now().toString(36);
      r.order=Date.now();r.hue=(rec.list?rec.list.length:0)%7;
      return rec.db.doc("recipes/"+id).set(r).then(function(){btn.disabled=false;$("rn-text").value="";$("rn-photo").value="";openNew(false);rec.open=id;rec.variant=0;rec.sel={};rec.msg="המתכון נשמר בספר ✓";renderRecipes();window.scrollTo(0,0);});
    }).catch(function(e){btn.disabled=false;var c=e&&e.code;$("rn-msg").textContent=c==="not_granted"?"צריך לאשר לעמוד להשתמש ב-Claude כדי לסדר מתכונים.":c==="rate_limited"?"הגעת למגבלת השימוש. נסי שוב מאוחר יותר.":"לא הצלחתי לסדר את המתכון. נסי שוב, או שלחי לי אותו בצ'אט.";});
  };
  claude.use("db").then(function(db){
    if(!db){rec.loaded=true;renderRecipes();return;}
    rec.db=db;
    db.collection("recipes").onSnapshot(function(snap){
      rec.loaded=true;
      rec.list=snap.empty?null:snap.docs.map(function(d){var v=Object.assign({id:d.id},d.data());return v;}).sort(function(a,b){return (a.order||0)-(b.order||0);});
      renderRecipes();
    },function(){rec.loaded=true;renderRecipes();});
  },function(){rec.loaded=true;renderRecipes();});

/* ---------- quick add: type or dictate an event ---------- */
  function sheet(on){$("sheet").hidden=!on;$("sheet-bg").hidden=!on;if(on){$("qa-step1").hidden=false;$("qa-step2").hidden=true;$("qa-msg").textContent="";setTimeout(function(){$("qa-text").focus();},50);}}
  $("fab").onclick=function(){sheet(true);};
  $("qa-close").onclick=function(){sheet(false);};
  $("sheet-bg").onclick=function(){sheet(false);};
  $("qa-back").onclick=function(){$("qa-step1").hidden=false;$("qa-step2").hidden=true;};
  function fillForm(v){
    $("qa-title").value=v.title||"";$("qa-date").value=v.date||today;$("qa-start").value=v.start||"";$("qa-end").value=v.end||"";
    $("qa-loc").value=v.location||"";$("qa-alma").checked=!!v.alma;$("qa-step1").hidden=true;$("qa-step2").hidden=false;$("qa-msg").textContent="";
  }
  $("qa-go").onclick=function(){
    var t=$("qa-text").value.trim();if(!t){$("qa-msg").textContent="כתבי או הכתיבי מה להכניס.";return;}
    if(!sampleFn){fillForm({title:t});$("qa-msg").textContent="השלימי תאריך ושעה ולחצי להכניס.";return;}
    $("qa-go").disabled=true;$("qa-msg").textContent="מבין…";
    var wdName=fmt(today,{weekday:"long"});
    var prompt="היום "+wdName+" "+today+" (אזור זמן ישראל). הפוך את הבקשה לאירוע ביומן. החזר רק JSON: {\"title\":string (כותרת קצרה וברורה בעברית),\"date\":\"YYYY-MM-DD\",\"start\":\"HH:MM\" או null אם אין שעה,\"end\":\"HH:MM\" או null,\"location\":string או \"\",\"alma\":boolean (true אם האירוע של אלמה, הבת)}. אם נאמר יום בשבוע בלי תאריך, קח את המופע הקרוב הבא. אם יש שעת התחלה בלי סיום, השאר end null.\nהבקשה: "+t;
    sampleFn.json(prompt,{modelTier:"quick"}).then(function(v){$("qa-go").disabled=false;fillForm(v||{title:t});},function(){$("qa-go").disabled=false;fillForm({title:t});$("qa-msg").textContent="השלימי את הפרטים ידנית ולחצי להכניס.";});
  };
  function addMin(hhmmS,m){var a=hhmmS.split(":");var x=(+a[0])*60+(+a[1])+m;x=Math.min(x,23*60+59);return String(Math.floor(x/60)).padStart(2,"0")+":"+String(x%60).padStart(2,"0");}
  $("qa-save").onclick=function(){
    var title=$("qa-title").value.trim(),d=$("qa-date").value,st=$("qa-start").value,en=$("qa-end").value;
    if(!title||!d){$("qa-msg").textContent="צריך לפחות מה ותאריך.";return;}
    if(!mcp){$("qa-msg").textContent="צריך להתחבר ל-Google.";return;}
    var input={summary:title};
    if(st){input.startTime=d+"T"+st+":00";input.endTime=d+"T"+(en&&en>st?en:addMin(st,60))+":00";}
    else{input.allDay=true;input.startTime=d+"T00:00:00";input.endTime=addDays(d,1)+"T00:00:00";}
    var loc=$("qa-loc").value.trim();if(loc)input.location=loc;
    if($("qa-alma").checked)input.calendarId=ALMA_CAL;
    if($("qa-rem").checked)input.overrideReminders=st?[{method:"popup",minutes:1440},{method:"popup",minutes:60}]:[{method:"popup",minutes:960}];
    var btn=$("qa-save");btn.disabled=true;$("qa-msg").textContent="מכניס ליומן…";
    mcp.callTool(SERVER,"create_event",input).then(function(){
      btn.disabled=false;$("qa-msg").textContent="נכנס ליומן ✓";$("qa-text").value="";
      if(mcp.invalidate)mcp.invalidate(SERVER,TOOL).catch(function(){});
      setTimeout(function(){sheet(false);load(true);},900);
    },function(err){
      btn.disabled=false;var c=err&&err.code;
      $("qa-msg").textContent=(c==="not_in_manifest"||c==="approval_required"||c==="consent_required")?"צריך לאשר לעמוד להוסיף אירועים. לחצי שוב על \"להכניס ליומן\".":c==="needs_reauth"?"החיבור ל-Google פג. סגרי ופתחי את האפליקציה כדי להתחבר שוב.":"לא בטוח שהאירוע נכנס. בדקי בלוח לפני שמנסים שוב.";
    });
  };

/* ---------- Alma: points -> monthly money -> savings goals ---------- */
  var rew={cfg:null,deposits:[],openSet:false,msg:""};
  function monthOf(k){return k.slice(0,7);}
  function almaTotal(k){
    if(!state.events||!state.loadedFrom||k<state.loadedFrom||!state.loadedTo||k>=state.loadedTo)return null;
    var n=0;onDayAll(k).forEach(function(e){if(e.cat==="alma"&&!/^אלמה אצל /.test(e.title)){var it=splitItems(e.desc);if(it.length)n+=it.length;}});return n;
  }
  var rewPer=2;
  function dayEarn(d,daily){var done=Object.keys(alma.checks[d]||{}).length;return Math.min(daily,done*rewPer);}
  function monthMoney(m,cfg){var daily=+cfg.daily||0,cap=+cfg.cap||0,sum=0;
    Object.keys(alma.checks).forEach(function(d){if(monthOf(d)===m)sum+=dayEarn(d,daily);});
    return Math.round((cap?Math.min(cap,sum):sum)*10)/10;}
  function monthPoints(m){var n=0;Object.keys(alma.checks).forEach(function(d){if(monthOf(d)===m)n+=Object.keys(alma.checks[d]||{}).length;});return n;}
  function money(x){return "₪"+(Math.round(x*10)/10).toLocaleString("he-IL");}
  function monthName(m){return fmt(m+"-15",{month:"long"});}
  function renderRew(){
    var el=$("a-rew");
    if(!alma.db){el.innerHTML='';return;}
    var cfg=Object.assign({per:2,daily:10,cap:300,goals:[]},rew.cfg||{}),goals=cfg.goals||[];rewPer=+cfg.per||0;var mm=monthMoney(monthOf(today),cfg);var need=rewPer?Math.ceil((+cfg.daily||0)/rewPer):0,doneT=Object.keys(alma.checks[today]||{}).length;
    var cur=monthOf(today),pts=monthPoints(cur);
    var saved={};rew.deposits.forEach(function(d){saved[d.goalId]=(saved[d.goalId]||0)+(+d.amount||0);});
    var done={};rew.deposits.forEach(function(d){done[d.month]=true;});
    var past=Object.keys(alma.checks).map(monthOf).filter(function(m,i,a){return m<cur&&a.indexOf(m)===i&&!done[m];}).sort();
    var h='<div class="rew-top"><div><div class="w">הנקודות של אלמה ב'+esc(monthName(cur))+'</div><div class="pts">'+pts+' <small>⭐</small></div></div><div class="eq">'+money(mm)+'<small>מתוך '+money(cfg.cap)+' החודש</small></div></div>'+
      '<div class="gbar"><i style="width:'+(cfg.cap?Math.min(100,Math.round(100*mm/cfg.cap)):0)+'%"></i></div>'+
      '<p class="rew-how">היום: <b>'+Math.min(doneT,need)+' מתוך '+need+'</b> משימות · '+money(dayEarn(today,+cfg.daily||0))+' מתוך '+money(cfg.daily)+(doneT>=need&&need?' 🎉':'')+'</p>'+
      '<p class="rew-how">כל משימה שווה '+money(rewPer)+', עד '+need+' משימות ביום ('+money(cfg.daily)+'). בסוף החודש הסכום, עד '+money(cfg.cap)+', נכנס לחיסכון.</p>';
    if(goals.length){
      h+='<div class="goals">'+goals.map(function(g){var sv=saved[g.id]||0,c=+g.cost||0,pc=c?Math.min(100,Math.round(100*sv/c)):0;
        return '<div class="goal"><div class="g-h"><b>'+esc(g.name)+'</b><span>'+money(sv)+' מתוך '+money(c)+'</span></div><div class="gbar"><i style="width:'+pc+'%"></i></div>'+(c>sv?'<span class="g-left">חסר '+money(c-sv)+(cfg.cap?' · במקסימום החודשי, עוד כ-'+Math.ceil((c-sv)/cfg.cap)+' חודשים':'')+'</span>':'<span class="g-left">🎉 היעד הושג!</span>')+'</div>';}).join("")+'</div>';
    } else h+='<p class="rew-how"><b>עוד אין יעד.</b> הוסיפי יעד, למשל פלייסטיישן או נסיעה לחו״ל, ואת המחיר שלו.</p>';
    past.forEach(function(m){var p=monthPoints(m);if(!p)return;
      h+='<div class="dep"><span>'+esc(monthName(m))+': '+p+' נקודות = <b>'+money(monthMoney(m,cfg))+'</b></span>'+(goals.length?'<select id="dep-g-'+m+'" aria-label="לאיזה יעד">'+goals.map(function(g){return '<option value="'+esc(g.id)+'">'+esc(g.name)+'</option>';}).join("")+'</select><button data-dep="'+m+'">הכנסנו לחיסכון</button>':'')+'</div>';});
    h+='<button class="rew-set-t" id="rew-set-t">'+(rew.openSet?"סגירת הגדרות":"הגדרות ויעדים")+'</button>';
    if(rew.openSet){
      h+='<div class="rew-set"><label class="lbl" for="rw-per">₪ למשימה</label><input id="rw-per" type="number" min="0" step="0.5" value="'+rewPer+'"><div class="g-add"><div><label class="lbl" for="rw-daily">מקסימום ליום ₪</label><input id="rw-daily" type="number" min="0" value="'+cfg.daily+'"></div><div><label class="lbl" for="rw-cap">תקרה חודשית ₪</label><input id="rw-cap" type="number" min="0" value="'+cfg.cap+'"></div></div>'+
        (goals.length?'<div class="gl-list">'+goals.map(function(g){return '<div class="gl-row"><span>'+esc(g.name)+' · '+money(+g.cost||0)+'</span><button data-gdel="'+esc(g.id)+'" aria-label="מחיקה">×</button></div>';}).join("")+'</div>':'')+
        '<div class="g-add"><input id="rw-gname" type="text" placeholder="יעד חדש, למשל פלייסטיישן"><input id="rw-gcost" type="number" min="0" placeholder="מחיר ₪"></div>'+
        '<div class="rec-act"><button id="rw-save">שמירה</button></div></div>';
    }
    if(rew.msg)h+='<p class="rec-msg">'+esc(rew.msg)+'</p>';
    el.innerHTML=h;
  }
  function saveCfg(cfg){rew.cfg=cfg;renderRew();return alma.db.doc("config/alma-rewards").set(cfg).then(function(){rew.msg="נשמר ✓";renderRew();},function(){rew.msg="השמירה נכשלה. נסי שוב.";renderRew();});}
  $("a-rew").addEventListener("click",function(ev){
    if(ev.target.closest("#rew-set-t")){rew.openSet=!rew.openSet;rew.msg="";renderRew();return;}
    var cfg=Object.assign({per:2,daily:10,cap:300,goals:[]},rew.cfg||{});cfg.goals=(cfg.goals||[]).slice();
    var gd=ev.target.closest("[data-gdel]");if(gd){cfg.goals=cfg.goals.filter(function(g){return g.id!==gd.dataset.gdel;});saveCfg(cfg);return;}
    if(ev.target.closest("#rw-save")){
      var pv=parseFloat($("rw-per").value);if(!isNaN(pv)&&pv>=0)cfg.per=pv;var dv=parseFloat($("rw-daily").value),cv=parseFloat($("rw-cap").value);if(!isNaN(dv)&&dv>=0)cfg.daily=dv;if(!isNaN(cv)&&cv>=0)cfg.cap=cv;delete cfg.rate;
      var gn=$("rw-gname").value.trim(),gc=parseFloat($("rw-gcost").value);
      if(gn){cfg.goals.push({id:"g"+Date.now().toString(36),name:gn,cost:isNaN(gc)?0:gc});}
      saveCfg(cfg);return;
    }
    var dp=ev.target.closest("[data-dep]");if(dp){
      var m=dp.dataset.dep,p=monthPoints(m),gid=$("dep-g-"+m).value,amt=monthMoney(m,cfg);
      dp.disabled=true;
      alma.db.doc("alma-deposits/"+m).set({month:m,points:p,amount:amt,goalId:gid,at:Date.now()}).then(function(){rew.msg=money(amt)+" נרשמו בחיסכון ✓";},function(){rew.msg="הרישום נכשל. נסי שוב.";dp.disabled=false;}).then(renderRew);
    }
  });
  claude.use("db").then(function(db){
    if(!db)return;
    db.doc("config/alma-rewards").onSnapshot(function(sn){rew.cfg=sn.exists?sn.data():null;renderRew();},function(){});
    db.collection("alma-deposits").onSnapshot(function(snap){rew.deposits=snap.docs.map(function(d){return d.data();});renderRew();},function(){});
  },function(){});

  function render(){pickShop();renderCats();renderTabs();renderCal();renderToday();renderBlocks();renderScore();renderShop();renderAlma();renderRew();renderRecipes();renderMeta();}

  function setTab(t){state.tab=t;try{localStorage.setItem("yoman-tab3",t);}catch(e){}render();}
  $("tab-today").onclick=function(){setTab("today");};
  $("tab-cal").onclick=function(){setTab("cal");};
  $("wk-prev").onclick=function(){if(state.week>-MAXWEEKS){state.week--;ensureRange();renderCal();}};
  $("wk-next").onclick=function(){if(state.week<MAXWEEKS){state.week++;ensureRange();renderCal();}};
  document.addEventListener("click",function(ev){
    var ct=ev.target.closest(".cat");if(ct){state.cat=ct.dataset.cat;try{localStorage.setItem("yoman-cat",state.cat);}catch(e){}render();return;}
    var s=ev.target.closest("#strip button");if(s){state.sel=s.dataset.k;renderToday();renderBlocks();return;}
    var g=ev.target.closest(".gl");if(g){state.sel=g.dataset.k;setTab("today");var c=document.querySelector('.card[data-id="'+CSS.escape(g.dataset.id)+'"]');if(c){c.classList.add("open");c.scrollIntoView({block:"center"});}return;}
    var c2=ev.target.closest(".card");if(c2&&!ev.target.closest("a"))c2.classList.toggle("open");
  });
  document.addEventListener("keydown",function(ev){var c=ev.target.closest&&ev.target.closest(".card");if(c&&(ev.key==="Enter"||ev.key===" ")){ev.preventDefault();c.classList.toggle("open");}});

  render();

  /* ---------- data ---------- */
  var mcp=null, busy=false;
  function handleError(err){
    var code=err&&err.code;
    var retract=["needs_reauth","server_not_connected","selection_required","server_not_found","blocked_by_policy","not_in_manifest","approval_required","consent_required","not_granted","capability_disabled","capability_removed"].indexOf(code)>=0;
    if(retract){state.events=null;state.storedAt=null;state.loadedTo=null;}
    var retry=function(){load(true);};
    if(code==="needs_reauth")state.err={text:"החיבור ל-Google פג.",btn:"התחברות מחדש",action:function(){window.appAuth.signIn();}};
    else if(code==="server_not_connected"||code==="server_not_found"||code==="selection_required")state.err={text:"צריך להתחבר ל-Google.",btn:"כניסה עם Google",action:function(){window.appAuth.signIn();}};
    else if(code==="blocked_by_policy")state.err={text:"ההגדרות של הארגון לא מאפשרות לעמוד הזה לקרוא את היומן."};
    else if(code==="not_in_manifest"||code==="approval_required"||code==="consent_required")state.err={text:"כדי להציג את האירועים, העמוד צריך אישור לקרוא את היומן.",btn:"אישור והצגת היומן",action:retry};
    else if(code==="not_granted"||code==="capability_disabled"||code==="capability_removed")state.err={text:"צריך להתחבר ל-Google כדי לראות את היומן.",btn:"כניסה עם Google",action:function(){window.appAuth.signIn();}};
    else if(code==="tool_error")state.err={text:"Google Calendar החזיר שגיאה: "+(err.message||""),btn:"לנסות שוב",action:retry};
    else state.err={text:state.events?"לא הצלחתי לרענן. מוצגים הנתונים האחרונים.":"לא הצלחתי להגיע ל-Google Calendar כרגע.",btn:"לנסות שוב",action:retry};
    render();
  }
  function payloadOf(res){var p=res&&res.payload;if(typeof p==="string"){try{p=JSON.parse(p);}catch(e){p=null;}}return p||{};}
  function load(fresh){
    if(!mcp)return;if(busy){state.again=true;return;}
    busy=true;var btn=$("refresh");btn.classList.add("spin");
    var to=addDays(today,(Math.max(state.week,state.off/7,0)+2)*7+1);var from=addDays(today,-state.back);
    var all=[],page=0,stamp=null;
    function next(token,cal){
      var input={startTime:from+"T00:00:00",endTime:to+"T00:00:00",orderBy:"startTime",pageSize:250};
      if(token)input.pageToken=token;
      if(cal)input.calendarId=cal;
      return mcp.callTool(SERVER,TOOL,input,{cache:{staleTime:fresh?0:120000,gcTime:900000,refresh:!!fresh}}).then(function(res){
        var p=payloadOf(res);if(p.timeZone)TZ=p.timeZone;
        if(res.cache&&res.cache.storedAt)stamp=stamp?Math.min(stamp,res.cache.storedAt):res.cache.storedAt;
        (p.events||[]).forEach(function(e){if(cal)e.__cal="alma";all.push(e);});page++;
        if(p.nextPageToken&&page<16)return next(p.nextPageToken,cal);
      });
    }
    next(null).then(function(){return next(null,ALMA_CAL).catch(function(){state.almaCalFailed=true;});}).then(function(){
      state.events=norm(all);state.loadedTo=to;state.loadedFrom=from;state.err=null;state.storedAt=stamp||Date.now();render();
    },handleError).then(function(){busy=false;btn.classList.remove("spin");if(state.again){state.again=false;load(false);}});
  }
  function daysBetween(a,b){return Math.round((utc(b)-utc(a))/864e5);}
  function ensureRange(){
    var start=addDays(today,Math.min(state.week*7,state.off)),end=addDays(addDays(today,Math.max(state.week*7,state.off)),SHOW);
    var need=false;
    if(start<addDays(today,-state.back)){state.back=Math.min(daysBetween(start,today)+7,70);need=true;}
    if(!state.loadedTo||state.loadedTo<=end)need=true;
    if(need)load(false);
  }
  document.addEventListener("click",function(ev){
    var b=ev.target.closest("[data-nav]");if(!b)return;
    var d=+b.dataset.nav;
    if(d===0){state.off=0;state.sel=today;alma.sel=today;}
    else{if(state.off+d<-MAXWEEKS*7||state.off+d>MAXWEEKS*7)return;state.off+=d;state.sel=addDays(state.sel,d);alma.sel=addDays(alma.sel,d);}
    ensureRange();render();
  });
  $("refresh").onclick=function(){load(true);};

  claude.use("mcp").then(function(m){
    if(!m){state.err={text:"צריך להתחבר ל-Google כדי לראות את היומן.",btn:"כניסה עם Google",action:function(){window.appAuth.signIn();}};render();return;}
    mcp=m;load(false);
    setInterval(function(){if(!document.hidden)load(true);},120000);
  },function(){state.err={text:"צריך להתחבר ל-Google."};render();});

  document.addEventListener("visibilitychange",function(){if(document.hidden)return;if(keyOf(new Date())!==today){location.reload();return;}load(true);});
  window.addEventListener("focus",function(){load(true);});
})();
