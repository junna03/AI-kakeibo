import { useState, useEffect, useCallback } from "react";

// ── ユーティリティ ─────────────────────────────────────────
const PRESET_COLORS = ["#C0392B","#E67E22","#D4AC0D","#27AE60","#1A8C7A","#2980B9","#7D3C98","#D4547A","#5D6D7E","#7B4F2E"];
const PRESET_ICONS  = ["🍽️","🛒","🚃","🚗","💊","👕","🎮","☕","📱","💡","🎁","✈️","📚","🏋️","🎵","🍺","🏠","💰"];

const fmt = (n) => `¥${Math.round(Number(n) || 0).toLocaleString("ja-JP")}`;
const today = () => new Date().toISOString().split("T")[0];

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}
function getMonday(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().split("T")[0];
}
function getMonthStart(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`;
}
function getMonthEnd(dateStr) {
  const d = new Date(dateStr);
  return new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().split("T")[0];
}
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getMonth()+1}/${d.getDate()}(${["日","月","火","水","木","金","土"][d.getDay()]})`;
}
function formatMonth(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth()+1}月`;
}

async function safeGet(key) {
  try { const r = await window.storage.get(key); return r ? r.value : null; } catch { return null; }
}
async function safeSet(key, val) {
  try { await window.storage.set(key, val); } catch {}
}
async function loadExpensesRange(start, end) {
  const result = {};
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const raw = await safeGet(`exp:${d}`);
    if (raw) result[d] = JSON.parse(raw);
  }
  return result;
}

// ── APIコール ──────────────────────────────────────────────
async function callClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await res.json();
  return data.content?.map(b => b.text || "").join("\n") || "エラーが発生しました。";
}

function buildExpenseSummary(settings, expensesByDate) {
  const catMap = {};
  settings.categories.forEach(c => { catMap[c.id] = { ...c, total: 0, items: [] }; });
  let grandTotal = 0;
  Object.entries(expensesByDate).forEach(([date, items]) => {
    (items||[]).forEach(item => {
      if (catMap[item.categoryId]) {
        catMap[item.categoryId].total += Number(item.amount);
        catMap[item.categoryId].items.push({ date, ...item });
      }
      grandTotal += Number(item.amount);
    });
  });
  return { catMap, grandTotal };
}

// ── スタイル定義 ───────────────────────────────────────────
const S = {
  app: {
    maxWidth: 480, margin: "0 auto", minHeight: "100vh",
    background: "#F7F3ED", display: "flex", flexDirection: "column",
    fontFamily: "'Noto Sans JP', sans-serif"
  },
  header: {
    background: "#1C3D2E", color: "#EFE8D8", padding: "18px 20px",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8
  },
  headerTitle: {
    fontFamily: "'Noto Serif JP', serif", fontSize: 20, fontWeight: 700,
    letterSpacing: 4, margin: 0
  },
  nav: {
    display: "flex", background: "#fff", borderBottom: "1px solid #DED6C8",
    position: "sticky", top: 0, zIndex: 20, boxShadow: "0 2px 8px rgba(0,0,0,.06)"
  },
  navBtn: (active) => ({
    flex: 1, padding: "13px 4px", border: "none", cursor: "pointer",
    fontSize: 12, fontWeight: 600, letterSpacing: 1,
    background: active ? "#1C3D2E" : "transparent",
    color: active ? "#EFE8D8" : "#888",
    fontFamily: "'Noto Sans JP', sans-serif",
    transition: "all .2s", borderBottom: active ? "2px solid #A8CF8E" : "2px solid transparent"
  }),
  content: { flex: 1, overflowY: "auto", padding: "16px 16px 32px" },
  card: {
    background: "#fff", borderRadius: 12, padding: "16px",
    boxShadow: "0 2px 10px rgba(0,0,0,.06)", marginBottom: 14
  },
  cardTitle: {
    fontFamily: "'Noto Serif JP', serif", fontSize: 14, fontWeight: 700,
    color: "#1C3D2E", marginBottom: 12, letterSpacing: 1,
    borderBottom: "2px solid #A8CF8E", paddingBottom: 8
  },
  input: {
    width: "100%", padding: "10px 12px", border: "1px solid #DED6C8",
    borderRadius: 8, fontSize: 14, fontFamily: "'Noto Sans JP', sans-serif",
    background: "#FDFAF6", outline: "none", color: "#1C1C1E"
  },
  btn: (variant="primary") => ({
    padding: variant==="sm" ? "7px 14px" : "11px 20px",
    background: variant==="danger" ? "#C0392B" : variant==="outline" ? "transparent" : "#1C3D2E",
    color: variant==="outline" ? "#1C3D2E" : "#fff",
    border: variant==="outline" ? "1.5px solid #1C3D2E" : "none",
    borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
    fontFamily: "'Noto Sans JP', sans-serif", letterSpacing: .5,
    transition: "opacity .15s", whiteSpace: "nowrap"
  }),
  tag: (color) => ({
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
    background: color + "22", color: color, border: `1px solid ${color}44`
  }),
  row: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  label: { fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 4, letterSpacing: .5 },
  reportBox: {
    background: "#FDFAF6", border: "1px solid #DED6C8", borderRadius: 10,
    padding: "16px", fontSize: 13, lineHeight: 1.9, color: "#333",
    whiteSpace: "pre-wrap", fontFamily: "'Noto Sans JP', sans-serif"
  }
};

// ── メインアプリ ───────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("daily");
  const [settings, setSettings] = useState({ categories: [], fixedCosts: [] });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await safeGet("kakeibo-settings");
      if (raw) setSettings(JSON.parse(raw));
      setLoaded(true);
    })();
  }, []);

  const saveSettings = useCallback(async (s) => {
    setSettings(s);
    await safeSet("kakeibo-settings", JSON.stringify(s));
  }, []);

  if (!loaded) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",
      fontFamily:"'Noto Sans JP',sans-serif",color:"#1C3D2E",fontSize:15,letterSpacing:2}}>
      読み込み中...
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@500;700&family=Noto+Sans+JP:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        button:hover { opacity: .85; }
        button:active { opacity: .7; transform: scale(.98); }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #C8C0B4; border-radius: 4px; }
      `}</style>
      <div style={S.app}>
        <header style={S.header}>
          <span style={{fontSize:22}}>📒</span>
          <h1 style={S.headerTitle}>家　計　簿</h1>
        </header>
        <nav style={S.nav}>
          {[["daily","📅 今日"],["reports","📊 レポート"],["setup","⚙️ 設定"]].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} style={S.navBtn(tab===k)}>{l}</button>
          ))}
        </nav>
        <div style={S.content}>
          {tab === "setup"   && <SetupView settings={settings} onSave={saveSettings} />}
          {tab === "daily"   && <DailyView settings={settings} />}
          {tab === "reports" && <ReportsView settings={settings} />}
        </div>
      </div>
    </>
  );
}

// ── 設定画面 ──────────────────────────────────────────────
function SetupView({ settings, onSave }) {
  const [sub, setSub] = useState("categories");
  const [newCat, setNewCat] = useState({ name:"", icon: PRESET_ICONS[0], color: PRESET_COLORS[0] });
  const [newFixed, setNewFixed] = useState({ name:"", amount:"", categoryId:"" });

  const addCategory = () => {
    if (!newCat.name.trim()) return;
    const updated = { ...settings, categories: [...settings.categories, { id: Date.now().toString(), ...newCat }] };
    onSave(updated);
    setNewCat({ name:"", icon: PRESET_ICONS[0], color: PRESET_COLORS[0] });
  };
  const removeCategory = (id) => {
    const updated = { ...settings, categories: settings.categories.filter(c => c.id !== id) };
    onSave(updated);
  };
  const addFixed = () => {
    if (!newFixed.name.trim() || !newFixed.amount) return;
    const updated = { ...settings, fixedCosts: [...settings.fixedCosts, { id: Date.now().toString(), ...newFixed }] };
    onSave(updated);
    setNewFixed({ name:"", amount:"", categoryId:"" });
  };
  const removeFixed = (id) => {
    const updated = { ...settings, fixedCosts: settings.fixedCosts.filter(f => f.id !== id) };
    onSave(updated);
  };

  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {[["categories","カテゴリ"],["fixed","固定費"]].map(([k,l]) => (
          <button key={k} onClick={() => setSub(k)} style={{
            ...S.btn(sub===k ? "primary" : "outline"), flex:1
          }}>{l}</button>
        ))}
      </div>

      {sub === "categories" && (
        <>
          <div style={S.card}>
            <p style={S.cardTitle}>カテゴリを追加</p>
            <div style={S.row}>
              <div style={{flex:1}}>
                <p style={S.label}>カテゴリ名</p>
                <input style={S.input} placeholder="例: 食費" value={newCat.name}
                  onChange={e => setNewCat({...newCat, name:e.target.value})} />
              </div>
            </div>
            <div style={{marginBottom:10}}>
              <p style={S.label}>アイコン</p>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {PRESET_ICONS.map(icon => (
                  <button key={icon} onClick={() => setNewCat({...newCat, icon})} style={{
                    width:38, height:38, border: newCat.icon===icon ? "2px solid #1C3D2E" : "1px solid #DED6C8",
                    borderRadius:8, background: newCat.icon===icon ? "#E8F0EB" : "#fff",
                    cursor:"pointer", fontSize:18
                  }}>{icon}</button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:12}}>
              <p style={S.label}>カラー</p>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setNewCat({...newCat, color:c})} style={{
                    width:28, height:28, borderRadius:"50%", background:c,
                    border: newCat.color===c ? "3px solid #1C3D2E" : "3px solid transparent",
                    cursor:"pointer", outline: newCat.color===c ? "2px solid #fff" : "none",
                    outlineOffset:"-5px"
                  }} />
                ))}
              </div>
            </div>
            <button style={{...S.btn(), width:"100%"}} onClick={addCategory}>追加する</button>
          </div>

          <div style={S.card}>
            <p style={S.cardTitle}>登録カテゴリ</p>
            {settings.categories.length === 0 && <p style={{color:"#aaa",fontSize:13,textAlign:"center"}}>まだカテゴリがありません</p>}
            {settings.categories.map(c => (
              <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #F0EAE0"}}>
                <span style={{fontSize:20}}>{c.icon}</span>
                <span style={S.tag(c.color)}>{c.name}</span>
                <div style={{marginLeft:"auto"}}>
                  <button style={S.btn("danger")} onClick={() => removeCategory(c.id)}>削除</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {sub === "fixed" && (
        <>
          <div style={S.card}>
            <p style={S.cardTitle}>固定費を追加</p>
            <div style={{marginBottom:10}}>
              <p style={S.label}>項目名</p>
              <input style={S.input} placeholder="例: 家賃" value={newFixed.name}
                onChange={e => setNewFixed({...newFixed, name:e.target.value})} />
            </div>
            <div style={{marginBottom:10}}>
              <p style={S.label}>金額 (円)</p>
              <input style={S.input} type="number" placeholder="0" value={newFixed.amount}
                onChange={e => setNewFixed({...newFixed, amount:e.target.value})} />
            </div>
            <div style={{marginBottom:12}}>
              <p style={S.label}>カテゴリ (任意)</p>
              <select style={{...S.input}} value={newFixed.categoryId}
                onChange={e => setNewFixed({...newFixed, categoryId:e.target.value})}>
                <option value="">カテゴリなし</option>
                {settings.categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <button style={{...S.btn(), width:"100%"}} onClick={addFixed}>追加する</button>
          </div>

          <div style={S.card}>
            <p style={S.cardTitle}>固定費一覧</p>
            {settings.fixedCosts.length === 0 && <p style={{color:"#aaa",fontSize:13,textAlign:"center"}}>まだ固定費がありません</p>}
            {settings.fixedCosts.map(f => {
              const cat = settings.categories.find(c => c.id === f.categoryId);
              return (
                <div key={f.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #F0EAE0"}}>
                  <div style={{flex:1}}>
                    <p style={{fontSize:14,fontWeight:600}}>{f.name}</p>
                    {cat && <span style={S.tag(cat.color)}>{cat.icon} {cat.name}</span>}
                  </div>
                  <span style={{fontWeight:700,color:"#1C3D2E",fontSize:15}}>{fmt(f.amount)}</span>
                  <button style={S.btn("danger")} onClick={() => removeFixed(f.id)}>削除</button>
                </div>
              );
            })}
            {settings.fixedCosts.length > 0 && (
              <div style={{textAlign:"right",marginTop:10,fontWeight:700,color:"#1C3D2E"}}>
                合計: {fmt(settings.fixedCosts.reduce((s,f) => s+Number(f.amount),0))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── 今日の支出 ────────────────────────────────────────────
function DailyView({ settings }) {
  const [date, setDate] = useState(today());
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState({ categoryId:"", amount:"", note:"" });
  const [expLoaded, setExpLoaded] = useState(false);

  useEffect(() => {
    setExpLoaded(false);
    (async () => {
      const raw = await safeGet(`exp:${date}`);
      setExpenses(raw ? JSON.parse(raw) : []);
      setExpLoaded(true);
    })();
  }, [date]);

  const saveExpenses = async (list) => {
    setExpenses(list);
    await safeSet(`exp:${date}`, JSON.stringify(list));
  };

  const addExpense = () => {
    if (!form.categoryId || !form.amount) return;
    const newList = [...expenses, { id: Date.now().toString(), ...form }];
    saveExpenses(newList);
    setForm({ categoryId: form.categoryId, amount:"", note:"" });
  };

  const removeExpense = (id) => saveExpenses(expenses.filter(e => e.id !== id));

  // カテゴリ別集計
  const catTotals = {};
  expenses.forEach(e => {
    catTotals[e.categoryId] = (catTotals[e.categoryId]||0) + Number(e.amount);
  });
  const dayTotal = expenses.reduce((s,e) => s+Number(e.amount), 0);

  return (
    <div>
      {/* 日付選択 */}
      <div style={S.card}>
        <p style={S.cardTitle}>📅 日付</p>
        <input type="date" style={S.input} value={date} onChange={e => setDate(e.target.value)} />
      </div>

      {/* 支出入力 */}
      <div style={S.card}>
        <p style={S.cardTitle}>支出を追加</p>
        {settings.categories.length === 0 ? (
          <p style={{color:"#aaa",fontSize:13}}>先に設定画面でカテゴリを追加してください</p>
        ) : (
          <>
            <div style={{marginBottom:10}}>
              <p style={S.label}>カテゴリ</p>
              <select style={S.input} value={form.categoryId}
                onChange={e => setForm({...form, categoryId:e.target.value})}>
                <option value="">選択してください</option>
                {settings.categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
            <div style={{marginBottom:10}}>
              <p style={S.label}>金額 (円)</p>
              <input style={S.input} type="number" placeholder="0" value={form.amount}
                onChange={e => setForm({...form, amount:e.target.value})}
                onKeyDown={e => e.key==="Enter" && addExpense()} />
            </div>
            <div style={{marginBottom:12}}>
              <p style={S.label}>メモ (任意)</p>
              <input style={S.input} placeholder="例: ランチ" value={form.note}
                onChange={e => setForm({...form, note:e.target.value})} />
            </div>
            <button style={{...S.btn(), width:"100%"}} onClick={addExpense}>追加する</button>
          </>
        )}
      </div>

      {/* 本日の合計 */}
      {expLoaded && expenses.length > 0 && (
        <>
          <div style={{...S.card, background:"#1C3D2E", color:"#EFE8D8"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontFamily:"'Noto Serif JP',serif",fontSize:13,letterSpacing:1}}>
                {formatDate(date)} の合計
              </span>
              <span style={{fontSize:24,fontWeight:700,letterSpacing:1}}>{fmt(dayTotal)}</span>
            </div>
          </div>

          {/* カテゴリ別集計 */}
          <div style={S.card}>
            <p style={S.cardTitle}>カテゴリ別合計</p>
            {Object.entries(catTotals).map(([catId, total]) => {
              const cat = settings.categories.find(c => c.id === catId);
              if (!cat) return null;
              const pct = dayTotal > 0 ? (total/dayTotal*100) : 0;
              return (
                <div key={catId} style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={S.tag(cat.color)}>{cat.icon} {cat.name}</span>
                    <span style={{fontWeight:700,fontSize:14}}>{fmt(total)}</span>
                  </div>
                  <div style={{height:6,background:"#F0EAE0",borderRadius:4,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:cat.color,borderRadius:4,transition:"width .4s"}} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* 支出一覧 */}
          <div style={S.card}>
            <p style={S.cardTitle}>支出一覧</p>
            {expenses.map(e => {
              const cat = settings.categories.find(c => c.id === e.categoryId);
              return (
                <div key={e.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #F0EAE0"}}>
                  <span style={{fontSize:18}}>{cat?.icon || "❓"}</span>
                  <div style={{flex:1}}>
                    {cat && <span style={{...S.tag(cat.color),fontSize:11}}>{cat.name}</span>}
                    {e.note && <p style={{fontSize:12,color:"#888",marginTop:2}}>{e.note}</p>}
                  </div>
                  <span style={{fontWeight:700,fontSize:15}}>{fmt(e.amount)}</span>
                  <button style={S.btn("danger")} onClick={() => removeExpense(e.id)}>✕</button>
                </div>
              );
            })}
          </div>
        </>
      )}
      {expLoaded && expenses.length === 0 && (
        <div style={{textAlign:"center",color:"#aaa",marginTop:32,fontSize:14}}>
          <p style={{fontSize:28,marginBottom:8}}>📭</p>
          <p>この日の支出はまだありません</p>
        </div>
      )}
    </div>
  );
}

// ── レポート画面 ──────────────────────────────────────────
function ReportsView({ settings }) {
  const [mode, setMode] = useState(null); // "weekly-summary" | "weekly-analysis" | "monthly-summary" | "monthly-analysis"
  const [weekStart, setWeekStart] = useState(getMonday(today()));
  const [monthRef, setMonthRef] = useState(getMonthStart(today()));
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [dataPreview, setDataPreview] = useState(null);

  const generate = async () => {
    if (!mode) return;
    setLoading(true);
    setResult("");

    const isWeekly = mode.startsWith("weekly");
    const start = isWeekly ? weekStart : monthRef;
    const end   = isWeekly ? addDays(weekStart, 6) : getMonthEnd(monthRef);

    const expByDate = await loadExpensesRange(start, end);
    const { catMap, grandTotal } = buildExpenseSummary(settings, expByDate);
    const days = Object.keys(expByDate).length || 1;
    setDataPreview({ catMap, grandTotal, days, start, end });

    // 固定費合計
    const fixedTotal = settings.fixedCosts.reduce((s,f) => s+Number(f.amount), 0);

    // カテゴリ別集計テキスト
    const catLines = Object.values(catMap)
      .filter(c => c.total > 0)
      .sort((a,b) => b.total-a.total)
      .map(c => `  ${c.icon}${c.name}: ${fmt(c.total)} (${c.items.length}件)`)
      .join("\n");

    // 日別支出テキスト
    const dailyLines = Object.entries(expByDate).map(([date, items]) => {
      const daySum = items.reduce((s,i) => s+Number(i.amount), 0);
      const detail = items.map(i => {
        const cat = settings.categories.find(c=>c.id===i.categoryId);
        return `    ${cat?.name||"不明"} ${fmt(i.amount)}${i.note?` (${i.note})`:""}`;
      }).join("\n");
      return `  ${formatDate(date)}: ${fmt(daySum)}\n${detail}`;
    }).join("\n");

    // 固定費テキスト
    const fixedLines = settings.fixedCosts
      .map(f => {
        const cat = settings.categories.find(c=>c.id===f.categoryId);
        return `  ${f.name}: ${fmt(f.amount)}${cat?` (${cat.name})`:""}`;
      }).join("\n") || "  設定なし";

    let prompt = "";

    if (mode === "weekly-summary") {
      prompt = `あなたは家計アドバイザーです。以下の1週間の支出データを分析し、まとめレポートを作成してください。

【期間】${formatDate(start)} 〜 ${formatDate(end)}
【固定費】（月額）
${fixedLines}
【固定費合計(月額)】${fmt(fixedTotal)}

【支出データ】
${dailyLines}

【カテゴリ別集計】
${catLines}
【変動費合計】${fmt(grandTotal)}
【平均(1日)】${fmt(Math.round(grandTotal/days))}

以下の形式でレポートを作成してください（絵文字を使って読みやすく）：

📊 カテゴリ別合計
（各カテゴリの合計金額と割合を箇条書き）

📅 1日の平均支出
（平均金額）

📝 支出傾向
・全体の特徴：
・使いすぎているカテゴリ：
・良かった点：

※具体的な数字を使い、親しみやすい日本語で書いてください。`;
    }
    else if (mode === "weekly-analysis") {
      prompt = `あなたは家計アドバイザーです。以下の1週間の支出データを詳しく分析してください。

【期間】${formatDate(start)} 〜 ${formatDate(end)}
【固定費】（月額）${fixedLines}
【固定費合計(月額)】${fmt(fixedTotal)}
【変動費支出データ】
${dailyLines}
【カテゴリ別集計】${catLines}
【変動費合計】${fmt(grandTotal)}

以下の形式で分析レポートを作成してください（絵文字と具体的な数字を使って）：

💸 無駄な出費
（具体的な項目と金額を指摘）

🎯 削減インパクトが大きい項目トップ3
1. 
2. 
3. 

🏠 固定費の見直し余地
（あれば具体的に、なければ「現状維持で問題なし」）

⚡ 今すぐできる節約アクション3つ
1. 
2. 
3. 

📋 来週の最適予算（カテゴリ別）
（カテゴリごとに推奨予算を提示）

⚠️ 注意すべき支出パターン
（今週見られた気になる傾向）

※厳しすぎず、でも具体的に。実践的なアドバイスをください。`;
    }
    else if (mode === "monthly-summary") {
      // 週別集計
      const monthStart2 = monthRef;
      const monthEnd2 = getMonthEnd(monthRef);
      let weekNum = 1;
      const weekSummaries = [];
      for (let ws = monthStart2; ws <= monthEnd2; ) {
        const we = addDays(ws, 6) > monthEnd2 ? monthEnd2 : addDays(ws, 6);
        const weekTotal = Object.entries(expByDate)
          .filter(([d]) => d >= ws && d <= we)
          .reduce((s,[,items]) => s+items.reduce((ss,i)=>ss+Number(i.amount),0),0);
        weekSummaries.push(`  第${weekNum}週 (${formatDate(ws)}〜${formatDate(we)}): ${fmt(weekTotal)}`);
        ws = addDays(we, 1);
        weekNum++;
      }

      prompt = `あなたは家計アドバイザーです。以下の1ヶ月の支出データをまとめてください。

【期間】${formatMonth(monthRef)}（${formatDate(start)}〜${formatDate(end)}）
【固定費一覧】（月額）
${fixedLines}
【固定費合計】${fmt(fixedTotal)}

【変動費カテゴリ別集計】
${catLines}
【変動費合計】${fmt(grandTotal)}
【1日の平均（変動費）】${fmt(Math.round(grandTotal/days))}
【総支出】${fmt(grandTotal+fixedTotal)}（変動費＋固定費）

【週別支出（変動費）】
${weekSummaries.join("\n")}

以下の形式でまとめレポートを作成してください（絵文字と具体的な数字を使って）：

💰 1ヶ月の総支出
（固定費＋変動費の内訳）

🏠 固定費の内訳と合計
（各固定費を箇条書き）

📊 変動費（カテゴリ別内訳）
（各カテゴリの金額と割合）

📅 週別の内訳
（第1週〜第5週）

📈 1日の平均支出

📝 支出傾向
・全体の特徴：
・増減のポイント：
・使いすぎたカテゴリ：
・良かった点：

※具体的な数字を交えて、分かりやすくまとめてください。`;
    }
    else if (mode === "monthly-analysis") {
      prompt = `あなたは家計アドバイザーです。以下の1ヶ月の支出データを徹底分析してください。

【期間】${formatMonth(monthRef)}
【固定費（月額）】${fixedLines}
【固定費合計】${fmt(fixedTotal)}
【変動費データ（カテゴリ別）】
${catLines}
【変動費合計】${fmt(grandTotal)}
【総支出】${fmt(grandTotal+fixedTotal)}
【全支出明細】
${dailyLines}

以下の形式で月次分析レポートを作成してください（絵文字と具体的な数字を使って）：

🗑️ 無駄遣いランキング
（1位〜3位、金額と削減可能額を明示）

🏠 固定費の見直しポイント
（削減できそうな固定費を具体的に）

🎯 削減インパクトが大きい項目トップ3
1. 
2. 
3. 

⚖️ 理想の支出バランス
・固定費の理想割合：（現状と比較）
・変動費カテゴリ別の理想額：

📋 来月の最適予算（カテゴリ別）
（実現可能な予算を設定）

💰 貯金を増やすための具体プラン
（今すぐ実行できる3〜5つのアクション、月の削減見込み金額も）

※厳しすぎず現実的に。数字の根拠も示してください。`;
    }

    try {
      const text = await callClaude(prompt);
      setResult(text);
    } catch(e) {
      setResult("エラーが発生しました。もう一度お試しください。");
    }
    setLoading(false);
  };

  const modes = [
    ["weekly-summary",   "週まとめ",   "📊"],
    ["weekly-analysis",  "週分析",     "🔍"],
    ["monthly-summary",  "月まとめ",   "📅"],
    ["monthly-analysis", "月分析",     "💡"],
  ];

  return (
    <div>
      {/* モード選択 */}
      <div style={S.card}>
        <p style={S.cardTitle}>レポートの種類</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {modes.map(([k,l,icon]) => (
            <button key={k} onClick={() => { setMode(k); setResult(""); setDataPreview(null); }} style={{
              padding:"12px 8px", border: mode===k ? "2px solid #1C3D2E" : "1.5px solid #DED6C8",
              borderRadius:10, cursor:"pointer", background: mode===k ? "#E8F0EB" : "#fff",
              fontFamily:"'Noto Sans JP',sans-serif", fontSize:13, fontWeight:600,
              color: mode===k ? "#1C3D2E" : "#555", transition:"all .15s"
            }}>{icon} {l}</button>
          ))}
        </div>
      </div>

      {/* 期間設定 */}
      {mode && (
        <div style={S.card}>
          <p style={S.cardTitle}>期間を選択</p>
          {mode.startsWith("weekly") ? (
            <div>
              <p style={S.label}>週の開始日（月曜日）</p>
              <input type="date" style={S.input} value={weekStart}
                onChange={e => { setWeekStart(getMonday(e.target.value)); setResult(""); }} />
              <p style={{fontSize:12,color:"#888",marginTop:6}}>
                選択期間: {formatDate(weekStart)} 〜 {formatDate(addDays(weekStart,6))}
              </p>
            </div>
          ) : (
            <div>
              <p style={S.label}>対象月</p>
              <input type="month" style={S.input}
                value={monthRef.substring(0,7)}
                onChange={e => { setMonthRef(e.target.value+"-01"); setResult(""); }} />
            </div>
          )}
        </div>
      )}

      {/* 生成ボタン */}
      {mode && (
        <button style={{...S.btn(), width:"100%", padding:"14px", fontSize:15, marginBottom:16,
          background: loading ? "#4A7A5C" : "#1C3D2E"}}
          onClick={generate} disabled={loading}>
          {loading ? "⏳ AI分析中..." : `✨ ${modes.find(m=>m[0]===mode)?.[1]}を生成する`}
        </button>
      )}

      {/* データプレビュー */}
      {dataPreview && !loading && (
        <div style={{...S.card, background:"#F0F7F2", border:"1px solid #A8CF8E"}}>
          <p style={{fontSize:12,color:"#1C3D2E",fontWeight:700,marginBottom:8}}>📊 集計データ</p>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{fontSize:13,color:"#555"}}>変動費合計</span>
            <span style={{fontSize:15,fontWeight:700,color:"#1C3D2E"}}>{fmt(dataPreview.grandTotal)}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:13,color:"#555"}}>1日平均</span>
            <span style={{fontSize:15,fontWeight:700,color:"#1C3D2E"}}>{fmt(Math.round(dataPreview.grandTotal/dataPreview.days))}</span>
          </div>
        </div>
      )}

      {/* 結果表示 */}
      {result && (
        <div style={S.card}>
          <p style={S.cardTitle}>{modes.find(m=>m[0]===mode)?.[2]} {modes.find(m=>m[0]===mode)?.[1]}レポート</p>
          <div style={S.reportBox}>{result}</div>
        </div>
      )}

      {!mode && (
        <div style={{textAlign:"center",color:"#aaa",marginTop:32,fontSize:14}}>
          <p style={{fontSize:28,marginBottom:8}}>📈</p>
          <p>レポートの種類を選んでください</p>
        </div>
      )}
    </div>
  );
}
