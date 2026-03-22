// =============================================
//  かけいぼ - アプリ本体 (script.js)
//  React は CDN から読み込まれています
// =============================================

const { useState, useEffect, useCallback, useRef } = React;

// ─── API キー管理 ───────────────────────────────────────────
// ※ この変数に Anthropic API キーが入ります
let CLAUDE_API_KEY = localStorage.getItem('kakeibo-api-key') || '';

// ─── デフォルトカテゴリ ────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { id:"food",      name:"食費",          icon:"🍽️", color:"#FFB3C6" },
  { id:"grocery",   name:"日用品",        icon:"🛒", color:"#FFDAB9" },
  { id:"transport", name:"交通費",        icon:"🚃", color:"#AEC6CF" },
  { id:"health",    name:"医療・健康",    icon:"💊", color:"#B5EAD7" },
  { id:"fashion",   name:"衣類・美容",    icon:"👗", color:"#DDA0DD" },
  { id:"leisure",   name:"娯楽・趣味",    icon:"🎮", color:"#FFF0AA" },
  { id:"telecom",   name:"通信・サブスク",icon:"📱", color:"#A8D8F0" },
  { id:"dining",    name:"外食・飲み会",  icon:"🍜", color:"#FFCBA4" },
  { id:"education", name:"教育・書籍",    icon:"📚", color:"#C3B1E1" },
  { id:"other",     name:"その他",        icon:"✨", color:"#E0E0EE" },
];

const PRESET_ICONS = [
  "🍽️","🍜","🍱","🍰","☕","🍺","🛒","🧴","💊","🏥",
  "🚃","🚗","✈️","🚲","⛽","👗","👠","💄","💅","👔",
  "🎮","🎵","🎬","📚","🎨","🏋️","⚽","🎤","🎹","🎯",
  "📱","💻","📷","🎁","🌸","🏠","💰","✨","🎪","🎀",
  "🐶","🐱","🐰","🐾","🦮","🐟","🌿","💉","🧸","👶",
  "🍼","🎒","🖍️","🧩","🎠","🎡","🏫","🩰","🥋","🎻",
  "🎺","♟️","🧘","🏊","🎽","🌊","⛷️","🧗","🎭","🎪",
];

const PRESET_COLORS = [
  "#FFB3C6","#FFDAB9","#AEC6CF","#B5EAD7","#DDA0DD",
  "#FFF0AA","#A8D8F0","#FFCBA4","#C3B1E1","#FFD4E8",
  "#C8F7C5","#FEDBD0","#D4E6F1","#FAD7A0","#D2B4DE",
];

// ─── ユーティリティ ────────────────────────────────────────
const fmt = n => `¥${Math.round(Number(n)||0).toLocaleString("ja-JP")}`;
const todayStr = () => new Date().toISOString().split("T")[0];
function addDays(d,n){const dt=new Date(d);dt.setDate(dt.getDate()+n);return dt.toISOString().split("T")[0];}
function getMonday(d){const dt=new Date(d);const day=dt.getDay();dt.setDate(dt.getDate()-(day===0?6:day-1));return dt.toISOString().split("T")[0];}
function getMonthStart(d){const dt=new Date(d);return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-01`;}
function getMonthEnd(d){const dt=new Date(d);return new Date(dt.getFullYear(),dt.getMonth()+1,0).toISOString().split("T")[0];}
function fmtDate(d){const dt=new Date(d);return `${dt.getMonth()+1}/${dt.getDate()}(${["日","月","火","水","木","金","土"][dt.getDay()]})`;}
function fmtMonth(d){const dt=new Date(d);return `${dt.getFullYear()}年${dt.getMonth()+1}月`;}
function darken(hex){const n=parseInt(hex.slice(1),16);const r=((n>>16)&255)*0.55,g=((n>>8)&255)*0.55,b=(n&255)*0.55;return `rgb(${r|0},${g|0},${b|0})`;}

// ─── ストレージ (localStorage) ─────────────────────────────
async function sg(key)       { return localStorage.getItem(key); }
async function ss(key, val)  { localStorage.setItem(key, val); }

function monthKey(dateStr){ return "mexp:"+dateStr.substring(0,7); }
function dayKey(dateStr)  { return dateStr.substring(8,10); }

async function getMonthData(dateStr){
  const raw = await sg(monthKey(dateStr));
  return raw ? JSON.parse(raw) : {};
}

async function saveDayData(dateStr, items){
  const data = await getMonthData(dateStr);
  if(items.length===0){ delete data[dayKey(dateStr)]; }
  else { data[dayKey(dateStr)] = items; }
  await ss(monthKey(dateStr), JSON.stringify(data));
  if(items.length>0){ await ss(`exp:${dateStr}`, JSON.stringify(items)); }
  else { localStorage.removeItem(`exp:${dateStr}`); }
}

async function loadDayData(dateStr){
  const data = await getMonthData(dateStr);
  const fromMonth = data[dayKey(dateStr)] || null;
  if(fromMonth) return fromMonth;
  const old = await sg(`exp:${dateStr}`);
  return old ? JSON.parse(old) : [];
}

async function loadMonthData(monthStart){
  const raw = await sg(monthKey(monthStart));
  if(raw){
    const data = JSON.parse(raw);
    const out = {};
    const year  = monthStart.substring(0,4);
    const month = monthStart.substring(5,7);
    Object.entries(data).forEach(([dd,items])=>{ out[`${year}-${month}-${dd}`] = items; });
    return out;
  }
  const end = getMonthEnd(monthStart);
  const dates = [];
  for(let d=monthStart; d<=end; d=addDays(d,1)) dates.push(d);
  const results = await Promise.all(dates.map(d=>sg(`exp:${d}`)));
  const out = {};
  dates.forEach((d,i)=>{ if(results[i]) out[d] = JSON.parse(results[i]); });
  if(Object.keys(out).length>0){
    const newData = {};
    Object.entries(out).forEach(([d,items])=>{ newData[dayKey(d)] = items; });
    await ss(monthKey(monthStart), JSON.stringify(newData));
  }
  return out;
}

// ─── メモリキャッシュ ──────────────────────────────────────
const monthCache = {};

async function loadMonthDataCached(monthStart, forceReload=false){
  if(!forceReload && monthCache[monthStart]) return monthCache[monthStart];
  const data = await loadMonthData(monthStart);
  monthCache[monthStart] = data;
  return data;
}

function invalidateMonthCache(dateStr){ delete monthCache[getMonthStart(dateStr)]; }

async function loadRange(start, end){
  const months = new Set();
  for(let d=start; d<=end; d=addDays(d,1)) months.add(getMonthStart(d));
  const monthDataArr = await Promise.all([...months].map(m=>loadMonthDataCached(m)));
  const merged = {};
  monthDataArr.forEach(md=>Object.assign(merged,md));
  const out = {};
  Object.entries(merged).forEach(([d,items])=>{ if(d>=start&&d<=end) out[d]=items; });
  return out;
}

// ─── Claude API 呼び出し ───────────────────────────────────
async function callClaude(messages, maxTokens=1000){
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:maxTokens, messages }),
  });
  const data = await res.json();
  if(data.error) throw new Error(data.error.message || "API エラー");
  return data.content?.map(b=>b.text||"").join("\n") || "";
}

async function parseNaturalInput(text, categories){
  const catList = categories.map(c=>`"${c.id}":${c.name}`).join(",");
  const raw = await callClaude([{role:"user",content:
    `家計簿。以下のテキストから支出を読み取りJSON配列のみ返してください（説明不要）。\n`+
    `テキスト:\n"${text}"\n`+
    `カテゴリ:{${catList}}\n`+
    `ルール:スーパー/コンビニ/食料品→food,電車/バス→transport,薬局/病院→health,服/化粧品→fashion,ゲーム/映画→leisure,ネット/サブスク→telecom,レストラン/外食→dining,本/勉強→education。\n`+
    `複数行は行ごとに別エントリ。noteは15文字以内。\n`+
    `[{"categoryId":"...","amount":数値,"note":"..."}]`
  }], 400);
  try{
    const arr = raw.match(/\[[\s\S]*\]/);
    if(arr) return JSON.parse(arr[0]);
    const obj = raw.match(/\{[\s\S]*?\}/);
    return obj ? [JSON.parse(obj[0])] : null;
  }catch{ return null; }
}

async function parseReceipt(base64Image, categories){
  const catList = categories.map(c=>`"${c.id}":${c.name}`).join(",");
  const raw = await callClaude([{role:"user",content:[
    {type:"image", source:{type:"base64", media_type:"image/jpeg", data:base64Image}},
    {type:"text", text:`レシートから支出を読み取りJSON配列のみ返してください。カテゴリ:{${catList}} 合算しカテゴリ別に1〜3件で。[{"categoryId":"...","amount":数値,"note":"..."}]`}
  ]}], 400);
  try{ const m=raw.match(/\[[\s\S]*\]/); return m?JSON.parse(m[0]):null; }catch{ return null; }
}

function summarize(settings, expByDate){
  const catMap = {};
  settings.categories.forEach(c=>{ catMap[c.id]={...c,total:0,items:[]}; });
  let grand = 0;
  Object.entries(expByDate).forEach(([date,items])=>{
    (items||[]).forEach(item=>{
      if(catMap[item.categoryId]){ catMap[item.categoryId].total+=Number(item.amount); catMap[item.categoryId].items.push({date,...item}); }
      grand += Number(item.amount);
    });
  });
  return { catMap, grandTotal:grand };
}

// ─── デザイントークン ──────────────────────────────────────
const C = {
  bg:"#FFF5FA", bgCard:"#FFFFFF", bgSoft:"#FFF0F7",
  pink:"#F48FB1", pinkL:"#FFD6E7", pinkD:"#E91E8C",
  mint:"#A8E6CF", lavender:"#C3B1E1", peach:"#FFCBA4", sky:"#AEC6CF",
  text:"#5C3D6B", textSub:"#A08AB8", textLight:"#CDB8DC",
  border:"#F0D8F0", shadow:"rgba(244,143,177,0.18)",
};
const font = "'Zen Maru Gothic','Noto Sans JP',sans-serif";

// ─── 共通コンポーネント ────────────────────────────────────
function PillBtn({children, onClick, variant="primary", size="md", disabled, full, style:ex={}}){
  const bg =
    variant==="primary"  ? `linear-gradient(135deg,#F9A8C9 0%,${C.pink} 100%)` :
    variant==="mint"     ? `linear-gradient(135deg,#C8F7E8 0%,${C.mint} 100%)` :
    variant==="lavender" ? `linear-gradient(135deg,#E0D4FF 0%,${C.lavender} 100%)` :
    variant==="danger"   ? "linear-gradient(135deg,#FFB3C6,#F48FB1)" :
    variant==="ghost"    ? "transparent" : "white";
  const col    = ["primary","mint","lavender","danger"].includes(variant) ? C.text : C.textSub;
  const border = variant==="ghost" ? `1.5px dashed ${C.border}` : `1.5px solid ${C.border}`;
  const pd     = size==="sm" ? "5px 12px" : size==="lg" ? "14px 32px" : "10px 20px";
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding:pd, borderRadius:30, border, cursor:disabled?"not-allowed":"pointer",
      background:bg, color:col, fontFamily:font, fontSize:size==="sm"?12:13, fontWeight:700,
      letterSpacing:0.5, transition:"all .18s", opacity:disabled?.55:1,
      boxShadow:["primary","mint","lavender"].includes(variant)?`0 4px 14px ${C.shadow}`:"none",
      whiteSpace:"nowrap", width:full?"100%":"auto", display:"inline-flex",
      alignItems:"center", justifyContent:"center", gap:4, ...ex
    }}>{children}</button>
  );
}

function Tag({icon, name, color, small}){
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:3,
      padding:small?"2px 8px":"4px 11px", borderRadius:20,
      fontSize:small?11:12, fontWeight:700,
      background:color+"30", color:darken(color), border:`1px solid ${color}55`}}>
      {icon} {name}
    </span>
  );
}

function Toast({msg}){
  if(!msg) return null;
  return (
    <div style={{position:"fixed",top:70,left:"50%",transform:"translateX(-50%)",zIndex:999,
      background:"white",border:`1.5px solid ${C.pinkL}`,borderRadius:20,
      padding:"10px 22px",boxShadow:`0 8px 28px ${C.shadow}`,
      fontWeight:700,fontSize:13,color:C.text,whiteSpace:"nowrap",
      animation:"popIn .3s ease forwards"}}>
      {msg}
    </div>
  );
}

// ─── API キー設定画面 ──────────────────────────────────────
function ApiKeyScreen({onSave}){
  const [key,  setKey]  = useState('');
  const [error,setError]= useState('');

  const save = () => {
    const trimmed = key.trim();
    if(!trimmed.startsWith('sk-ant-')){ setError('APIキーは「sk-ant-」で始まります'); return; }
    CLAUDE_API_KEY = trimmed;
    localStorage.setItem('kakeibo-api-key', trimmed);
    onSave();
  };

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#FFE0EC,#EDD5FF,#C5EDF5)",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      fontFamily:font, padding:24}}>
      <div style={{fontSize:52,marginBottom:8,animation:"floatAnim 3s ease-in-out infinite"}}>🌸</div>
      <h1 style={{fontFamily:"'Klee One',serif",fontSize:22,fontWeight:600,color:C.text,letterSpacing:6,marginBottom:6}}>かけいぼ</h1>
      <p style={{fontSize:12,color:C.textSub,marginBottom:32,letterSpacing:1,textAlign:"center"}}>はじめに Anthropic API キーを設定してください</p>

      <div style={{background:"white",borderRadius:24,padding:"28px 24px",
        boxShadow:"0 8px 32px rgba(244,143,177,0.2)",border:"1px solid #F0D8F0",
        width:"100%",maxWidth:360}}>

        <p style={{fontSize:13,color:C.text,fontWeight:700,marginBottom:8}}>🔑 API キーの取得方法</p>
        <ol style={{fontSize:12,color:C.textSub,lineHeight:2,marginBottom:16,paddingLeft:16}}>
          <li><a href="https://console.anthropic.com" target="_blank" style={{color:C.pink}}>console.anthropic.com</a> にアクセス</li>
          <li>アカウント登録 / ログイン</li>
          <li>「API Keys」→「Create Key」</li>
          <li>表示されたキーをコピー</li>
        </ol>

        <p style={{fontSize:12,fontWeight:700,color:C.textSub,marginBottom:6}}>API キーを貼り付け</p>
        <input
          type="password"
          placeholder="sk-ant-api03-..."
          value={key}
          onChange={e=>{ setKey(e.target.value); setError(''); }}
          onKeyDown={e=>e.key==="Enter"&&save()}
          style={{width:"100%",padding:"11px 14px",border:`1.5px solid ${error?'#FF8FA3':C.border}`,
            borderRadius:13,fontSize:14,background:"#FFF8FB",color:C.text,marginBottom:6}}
        />
        {error && <p style={{fontSize:11,color:"#E57373",marginBottom:8}}>{error}</p>}

        <button onClick={save} style={{width:"100%",padding:"13px",borderRadius:30,border:"none",
          cursor:"pointer",background:"linear-gradient(135deg,#F9A8C9,#F48FB1)",
          color:"white",fontFamily:font,fontSize:14,fontWeight:700,letterSpacing:1,
          boxShadow:"0 4px 14px rgba(244,143,177,0.35)",transition:"all .18s",marginBottom:12}}>
          ✨ 設定してはじめる
        </button>

        <p style={{fontSize:11,color:C.textLight,textAlign:"center",lineHeight:1.6}}>
          キーはこのデバイスの<br/>ブラウザにのみ保存されます
        </p>
      </div>
    </div>
  );
}

// ─── 合言葉ロック画面 ──────────────────────────────────────
const PASSPHRASE = "AI家計簿";

function LockScreen({onUnlock}){
  const [input,    setInput]    = useState('');
  const [shake,    setShake]    = useState(false);
  const [unlocking,setUnlocking]= useState(false);

  const tryUnlock = () => {
    if(input===PASSPHRASE){
      setUnlocking(true);
      setTimeout(()=>onUnlock(), 600);
    } else {
      setShake(true);
      setTimeout(()=>setShake(false), 500);
      setInput('');
    }
  };

  return (
    <div style={{minHeight:"100vh",background:"linear-gradient(160deg,#FFE0EC,#EDD5FF,#C5EDF5)",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      fontFamily:font, padding:24, animation:unlocking?"unlock .6s ease forwards":"none"}}>
      <div style={{fontSize:52,marginBottom:8,animation:"floatAnim 3s ease-in-out infinite"}}>🌸</div>
      <h1 style={{fontFamily:"'Klee One',serif",fontSize:24,fontWeight:600,color:C.text,letterSpacing:6,marginBottom:4}}>かけいぼ</h1>
      <p style={{fontSize:12,color:C.textSub,marginBottom:36,letterSpacing:2}}>合言葉を入力してください</p>

      <div style={{background:"white",borderRadius:24,padding:"28px 24px",
        boxShadow:"0 8px 32px rgba(244,143,177,0.2)",border:"1px solid #F0D8F0",
        width:"100%",maxWidth:320,
        animation:shake?"shakeX .4s ease":"none"}}>
        <input type="text" placeholder="合言葉を入力…" value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&tryUnlock()}
          autoFocus
          style={{width:"100%",padding:"12px 16px",border:"1.5px solid #F0D8F0",borderRadius:14,
            fontSize:16,fontFamily:font,background:"#FFF8FB",color:C.text,
            textAlign:"center",letterSpacing:3,marginBottom:14}}/>
        <button onClick={tryUnlock} style={{width:"100%",padding:"13px",borderRadius:30,border:"none",
          cursor:"pointer",background:"linear-gradient(135deg,#F9A8C9,#F48FB1)",
          color:"white",fontFamily:font,fontSize:14,fontWeight:700,letterSpacing:1,
          boxShadow:"0 4px 14px rgba(244,143,177,0.35)",transition:"all .18s"}}>
          ✨ ひらく
        </button>
      </div>
      <p style={{fontSize:11,color:"#CDB8DC",marginTop:24,letterSpacing:1}}>合言葉を知っている人だけが使えます</p>
    </div>
  );
}

// ─── メインアプリ ──────────────────────────────────────────
function App(){
  const [tab,        setTab]        = useState("daily");
  const [settings,   setSettings]   = useState(null);
  const [unlocked,   setUnlocked]   = useState(false);
  const [hasApiKey,  setHasApiKey]  = useState(!!CLAUDE_API_KEY);
  const [dataVersion,setDataVersion]= useState(0);

  useEffect(()=>{
    const ok = sessionStorage.getItem("kakeibo-unlocked");
    if(ok==="1") setUnlocked(true);
  },[]);

  useEffect(()=>{
    if(!unlocked) return;
    (async()=>{
      const raw = await sg("kakeibo-settings");
      if(raw){ setSettings(JSON.parse(raw)); }
      else { const init={categories:DEFAULT_CATEGORIES,fixedCosts:[]};setSettings(init);await ss("kakeibo-settings",JSON.stringify(init)); }
      const thisMonth = getMonthStart(todayStr());
      const lastMonth = (()=>{ const d=new Date(thisMonth);d.setMonth(d.getMonth()-1);return getMonthStart(d.toISOString().split("T")[0]); })();
      loadMonthDataCached(thisMonth);
      loadMonthDataCached(lastMonth);
    })();
  },[unlocked]);

  const handleUnlock   = ()=>{ sessionStorage.setItem("kakeibo-unlocked","1"); setUnlocked(true); };
  const saveSettings   = useCallback(async s=>{ setSettings(s); await ss("kakeibo-settings",JSON.stringify(s)); },[]);
  const handleApiKeySave = () => setHasApiKey(true);

  if(!hasApiKey)  return <ApiKeyScreen onSave={handleApiKeySave}/>;
  if(!unlocked)   return <LockScreen   onUnlock={handleUnlock}/>;
  if(!settings)   return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      height:"100vh",background:C.bg,fontFamily:font,color:C.pink,gap:14}}>
      <div style={{fontSize:46,animation:"floatAnim 2s ease-in-out infinite"}}>🌸</div>
      <p style={{fontSize:15,letterSpacing:4,color:C.textSub}}>よみこみ中…</p>
    </div>
  );

  const tabs = [["daily","📅","今日"],["calendar","🗓️","カレンダー"],["reports","✨","レポート"],["setup","🌸","設定"]];

  return (
    <div style={{maxWidth:480,margin:"0 auto",minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",fontFamily:font}}>
      <header style={{background:"linear-gradient(135deg,#FFE0EC 0%,#EDD5FF 55%,#C5EDF5 100%)",padding:"18px 20px 14px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
          <span style={{fontSize:26,animation:"floatAnim 3s ease-in-out infinite"}}>🌸</span>
          <h1 style={{fontFamily:"'Klee One',serif",fontSize:21,fontWeight:600,color:C.text,letterSpacing:7}}>かけいぼ</h1>
          <span style={{fontSize:26,animation:"floatAnim 3s ease-in-out infinite",animationDelay:".6s"}}>💕</span>
        </div>
      </header>

      <nav style={{display:"flex",background:"white",borderBottom:`1px solid ${C.border}`,boxShadow:`0 2px 10px ${C.shadow}`,position:"sticky",top:0,zIndex:30}}>
        {tabs.map(([k,ic,lb])=>(
          <button key={k} onClick={()=>setTab(k)} style={{
            flex:1,padding:"11px 4px 10px",border:"none",cursor:"pointer",
            fontFamily:font,fontSize:11,fontWeight:700,letterSpacing:.5,lineHeight:1.5,
            background:tab===k?"linear-gradient(to bottom,#FFF0F7,white)":"transparent",
            color:tab===k?C.text:C.textLight,
            borderBottom:tab===k?`2.5px solid ${C.pink}`:"2.5px solid transparent",transition:"all .2s",
          }}>{ic}<br/>{lb}</button>
        ))}
      </nav>

      <div style={{flex:1,overflowY:"auto",padding:"14px 13px 44px"}}>
        {tab==="setup"    && <SetupView   settings={settings} onSave={saveSettings} onApiKeyChange={()=>setHasApiKey(false)}/>}
        {tab==="daily"    && <DailyView   settings={settings} onDataChange={()=>setDataVersion(v=>v+1)}/>}
        {tab==="calendar" && <CalendarView settings={settings} dataVersion={dataVersion}/>}
        {tab==="reports"  && <ReportsView  settings={settings}/>}
      </div>
    </div>
  );
}

// ─── 設定 ─────────────────────────────────────────────────
function SetupView({settings, onSave, onApiKeyChange}){
  const [sub,setSub] = useState("categories");
  const [nc,  setNc] = useState({name:"",icon:PRESET_ICONS[0],color:PRESET_COLORS[0]});
  const [nf,  setNf] = useState({name:"",amount:"",categoryId:""});

  const [aiPrompt,    setAiPrompt]     = useState("");
  const [aiLoading,   setAiLoading]    = useState(false);
  const [aiSuggestions,setAiSuggestions]=useState([]);
  const [aiToast,     setAiToast]      = useState("");

  const showAiToast = msg => { setAiToast(msg); setTimeout(()=>setAiToast(""),2400); };

  const generateCategories = async () => {
    if(!aiPrompt.trim()) return;
    setAiLoading(true); setAiSuggestions([]);
    try{
      const existing = settings.categories.map(c=>c.name).join("、")||"なし";
      const raw = await callClaude([{role:"user",content:
        `家計簿カテゴリをJSON配列のみで返してください。説明不要。\n`+
        `状況:「${aiPrompt}」\n`+
        `既存カテゴリ(重複不可):${existing}\n`+
        `重要ルール:\n`+
        `・状況に書かれていることに直結するカテゴリのみ提案する\n`+
        `・状況と矛盾・無関係なカテゴリは絶対に出さない\n`+
        `・例:「外食多め」→「外食費」を出す。「自炊費」は出さない\n`+
        `4個。形式:[{"name":"名前","icon":"絵文字1つ","color":"#パステルカラー"}]`
      }], 150);
      const clean = raw.replace(/```[a-z]*\n?/gi,"").replace(/```/g,"").trim();
      const m = clean.match(/\[[\s\S]*\]/);
      if(!m) throw new Error("no array");
      const list = JSON.parse(m[0]);
      if(!Array.isArray(list)||list.length===0) throw new Error("empty");
      const validated = list.map((item,i)=>({
        name:  String(item.name||"カテゴリ").slice(0,12),
        icon:  String(item.icon||"✨"),
        color: /^#[0-9A-Fa-f]{6}$/.test(item.color) ? item.color : PRESET_COLORS[i%PRESET_COLORS.length],
      }));
      setAiSuggestions(validated);
    }catch(e){ showAiToast("💦 生成に失敗しました。もう一度お試しください"); }
    setAiLoading(false);
  };

  const addSuggestion = item => {
    if(settings.categories.some(c=>c.name===item.name)){ showAiToast(`「${item.name}」は既に追加されています`); return; }
    onSave({...settings, categories:[...settings.categories,{id:Date.now().toString(),...item}]});
    setAiSuggestions(prev=>prev.filter(s=>s.name!==item.name));
    showAiToast(`✨「${item.name}」を追加しました！`);
  };

  const addAllSuggestions = () => {
    const newCats = aiSuggestions.filter(item=>!settings.categories.some(c=>c.name===item.name)).map(item=>({id:Date.now().toString()+Math.random(),...item}));
    if(newCats.length===0){ showAiToast("すべて追加済みです"); return; }
    onSave({...settings, categories:[...settings.categories,...newCats]});
    setAiSuggestions([]);
    showAiToast(`✨ ${newCats.length}件を追加しました！`);
  };

  const addCat   = () => { if(!nc.name.trim()) return; onSave({...settings,categories:[...settings.categories,{id:Date.now().toString(),...nc}]}); setNc({name:"",icon:PRESET_ICONS[0],color:PRESET_COLORS[0]}); showAiToast(`✨「${nc.name}」を追加しました！`); };
  const remCat   = id => onSave({...settings, categories:settings.categories.filter(c=>c.id!==id)});
  const addFixed = () => { if(!nf.name.trim()||!nf.amount) return; onSave({...settings,fixedCosts:[...settings.fixedCosts,{id:Date.now().toString(),...nf}]}); setNf({name:"",amount:"",categoryId:""}); };
  const remFixed = id => onSave({...settings, fixedCosts:settings.fixedCosts.filter(f=>f.id!==id)});

  const card      = {background:"white",borderRadius:20,padding:16,boxShadow:`0 4px 20px ${C.shadow}`,border:`1px solid ${C.border}`,marginBottom:13};
  const cardTitle = {fontSize:14,fontWeight:700,color:C.text,marginBottom:12,paddingBottom:8,borderBottom:`2px dashed ${C.pinkL}`};
  const lbl       = {fontSize:12,fontWeight:700,color:C.textSub,marginBottom:5,letterSpacing:.5,display:"block"};
  const inp       = {width:"100%",padding:"10px 13px",border:`1.5px solid ${C.border}`,borderRadius:13,fontSize:14,background:"#FFF8FB",color:C.text};

  return (
    <div style={{position:"relative"}}>
      {aiToast&&<div style={{position:"fixed",top:70,left:"50%",transform:"translateX(-50%)",zIndex:999,background:"white",border:`1.5px solid ${C.pinkL}`,borderRadius:20,padding:"10px 22px",boxShadow:`0 8px 28px ${C.shadow}`,fontWeight:700,fontSize:13,color:C.text,whiteSpace:"nowrap",animation:"popIn .3s ease forwards"}}>{aiToast}</div>}

      <div style={{display:"flex",gap:8,marginBottom:14}}>
        {[["categories","🏷️ カテゴリ"],["fixed","🏠 固定費"],["apikey","🔑 APIキー"]].map(([k,l])=>(
          <button key={k} onClick={()=>setSub(k)} style={{flex:1,padding:"8px 4px",borderRadius:13,border:`2px solid ${sub===k?C.pink:C.border}`,background:sub===k?C.pinkL:"white",color:sub===k?C.text:C.textSub,fontFamily:font,fontWeight:700,fontSize:11,cursor:"pointer",transition:"all .2s"}}>{l}</button>
        ))}
      </div>

      {sub==="categories"&&<>
        {/* AI自動生成 */}
        <div style={card}>
          <p style={cardTitle}>🤖 AIでカテゴリを自動生成</p>
          <p style={{fontSize:11,color:C.textSub,marginBottom:10,lineHeight:1.7}}>
            あなたの生活スタイルを教えると、ぴったりのカテゴリを提案するよ✨<br/>
            例：「子供2人・ペット・習い事あり」「一人暮らし・外食多め」
          </p>
          <input style={{...inp,marginBottom:10}} placeholder="例：小学生の子供がいて、ペットもいます" value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} onKeyDown={e=>e.key==="Enter"&&generateCategories()}/>
          <PillBtn onClick={generateCategories} disabled={aiLoading||!aiPrompt.trim()} variant="lavender" full>
            {aiLoading?"⏳ 生成中…":"✨ カテゴリを提案してもらう"}
          </PillBtn>
          {aiSuggestions.length>0&&(
            <div style={{marginTop:14,animation:"slideUp .3s ease"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <p style={{fontSize:12,fontWeight:700,color:C.text}}>💡 提案されたカテゴリ</p>
                <PillBtn onClick={addAllSuggestions} variant="mint" size="sm">すべて追加</PillBtn>
              </div>
              {aiSuggestions.map((item,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,background:C.bgSoft,borderRadius:13,padding:"10px 12px",border:`1px solid ${C.border}`,marginBottom:8}}>
                  <span style={{fontSize:22}}>{item.icon}</span>
                  <div style={{flex:1}}><p style={{fontWeight:700,fontSize:13,color:C.text}}>{item.name}</p><div style={{width:40,height:5,borderRadius:3,background:item.color,marginTop:3}}/></div>
                  <PillBtn onClick={()=>addSuggestion(item)} variant="primary" size="sm">＋ 追加</PillBtn>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* 手動追加 */}
        <div style={card}>
          <p style={cardTitle}>✏️ 自分でカテゴリを追加</p>
          <label style={lbl}>名前</label>
          <input style={{...inp,marginBottom:10}} placeholder="例：推し活" value={nc.name} onChange={e=>setNc({...nc,name:e.target.value})}/>
          <label style={lbl}>アイコン</label>
          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
            {PRESET_ICONS.map(ic=>(
              <button key={ic} onClick={()=>setNc({...nc,icon:ic})} style={{width:34,height:34,borderRadius:9,border:nc.icon===ic?`2px solid ${C.pink}`:`1px solid ${C.border}`,background:nc.icon===ic?C.pinkL:"white",cursor:"pointer",fontSize:16,transition:"all .15s"}}>{ic}</button>
            ))}
          </div>
          <label style={lbl}>カラー</label>
          <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:13}}>
            {PRESET_COLORS.map(cl=>(
              <button key={cl} onClick={()=>setNc({...nc,color:cl})} style={{width:24,height:24,borderRadius:"50%",background:cl,cursor:"pointer",border:nc.color===cl?`3px solid ${C.text}`:"3px solid white",boxShadow:`0 2px 8px ${cl}`,transition:"all .15s"}}/>
            ))}
          </div>
          <PillBtn onClick={addCat} full>＋ 追加する</PillBtn>
        </div>
        {/* 一覧 */}
        <div style={card}>
          <p style={cardTitle}>🏷️ カテゴリ一覧 ({settings.categories.length}件)</p>
          {settings.categories.length===0&&<p style={{color:C.textLight,fontSize:13,textAlign:"center",padding:"8px 0"}}>まだありません</p>}
          {settings.categories.map(c=>(
            <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px dashed ${C.border}`}}>
              <Tag icon={c.icon} name={c.name} color={c.color}/>
              <div style={{flex:1,height:6,borderRadius:4,background:c.color}}/>
              <PillBtn onClick={()=>remCat(c.id)} variant="danger" size="sm">✕</PillBtn>
            </div>
          ))}
        </div>
      </>}

      {sub==="fixed"&&<>
        <div style={card}>
          <p style={cardTitle}>➕ 固定費を追加</p>
          <label style={lbl}>項目名</label>
          <input style={{...inp,marginBottom:10}} placeholder="例：家賃" value={nf.name} onChange={e=>setNf({...nf,name:e.target.value})}/>
          <label style={lbl}>金額（円）</label>
          <input style={{...inp,marginBottom:10}} type="number" placeholder="0" value={nf.amount} onChange={e=>setNf({...nf,amount:e.target.value})}/>
          <label style={lbl}>カテゴリ（任意）</label>
          <select style={{...inp,cursor:"pointer",marginBottom:13}} value={nf.categoryId} onChange={e=>setNf({...nf,categoryId:e.target.value})}>
            <option value="">なし</option>
            {settings.categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <PillBtn onClick={addFixed} full>＋ 追加する</PillBtn>
        </div>
        <div style={card}>
          <p style={cardTitle}>🏠 固定費一覧</p>
          {settings.fixedCosts.length===0&&<p style={{color:C.textLight,fontSize:13,textAlign:"center",padding:"8px 0"}}>まだありません</p>}
          {settings.fixedCosts.map(f=>{
            const cat=settings.categories.find(c=>c.id===f.categoryId);
            return (
              <div key={f.id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 0",borderBottom:`1px dashed ${C.border}`}}>
                <div style={{flex:1}}><p style={{fontWeight:700,fontSize:13,color:C.text}}>{f.name}</p>{cat&&<Tag icon={cat.icon} name={cat.name} color={cat.color} small/>}</div>
                <span style={{fontWeight:700,fontSize:15,color:C.pink}}>{fmt(f.amount)}</span>
                <PillBtn onClick={()=>remFixed(f.id)} variant="danger" size="sm">✕</PillBtn>
              </div>
            );
          })}
          {settings.fixedCosts.length>0&&<div style={{textAlign:"right",marginTop:10,fontWeight:700,color:C.text,fontSize:15}}>合計：{fmt(settings.fixedCosts.reduce((s,f)=>s+Number(f.amount),0))}</div>}
        </div>
      </>}

      {sub==="apikey"&&(
        <div style={card}>
          <p style={cardTitle}>🔑 API キーの変更</p>
          <p style={{fontSize:12,color:C.textSub,marginBottom:12,lineHeight:1.7}}>
            現在のAPIキー：<span style={{fontFamily:"monospace",color:C.text}}>{CLAUDE_API_KEY ? CLAUDE_API_KEY.substring(0,12)+"..." : "未設定"}</span>
          </p>
          <PillBtn onClick={()=>{ localStorage.removeItem('kakeibo-api-key'); CLAUDE_API_KEY=''; onApiKeyChange(); }} variant="danger" full>
            🔄 API キーを変更する
          </PillBtn>
        </div>
      )}
    </div>
  );
}

// ─── 今日の支出 ────────────────────────────────────────────
function DailyView({settings, onDataChange}){
  const [date,      setDate]      = useState(todayStr());
  const [expenses,  setExpenses]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [parsed,    setParsed]    = useState(null);
  const [inputText, setInputText] = useState("");
  const [imgPreview,setImgPreview]= useState(null);
  const [manualOpen,setManualOpen]= useState(false);
  const [mf,        setMf]        = useState({categoryId:"",amount:"",note:""});
  const [toast,     setToast]     = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm,  setEditForm]  = useState({categoryId:"",amount:"",note:""});
  const fileRef = useRef(null);

  useEffect(()=>{
    (async()=>{ setExpenses(await loadDayData(date)); })();
  },[date]);

  const saveExp = async list => {
    setExpenses(list);
    await saveDayData(date, list);
    await loadMonthDataCached(date, true);
    onDataChange();
  };

  const showToast = msg => { setToast(msg); setTimeout(()=>setToast(""),2400); };

  const handleTextSubmit = async () => {
    if(!inputText.trim()) return;
    setLoading(true); setParsed(null);
    const r = await parseNatura
