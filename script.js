// =============================================
//  かけいぼ - 起動エラー完全回避版 (script.js)
// =============================================

const { useState, useEffect, useCallback, useRef } = React;

// ─── 設定 ─────────────────────────────────────────────────
const C = { bg: "#FFF5FA", pink: "#F48FB1", text: "#5C3D6B", border: "#F0D8F0" };
const font = "'Zen Maru Gothic', sans-serif";

// ─── API キー管理 ───────────────────────────────────────────
let CLAUDE_API_KEY = localStorage.getItem('kakeibo-api-key') || '';

// ─── メインアプリ ──────────────────────────────────────────
function App() {
  const [tab, setTab] = useState("daily");
  const [unlocked, setUnlocked] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(!!(CLAUDE_API_KEY && CLAUDE_API_KEY.trim()));
  
  // settings を最初からデフォルト値で初期化しておくことで「読み込み中」を回避
  const [settings, setSettings] = useState(() => {
    const raw = localStorage.getItem("kakeibo-settings");
    return raw ? JSON.parse(raw) : { categories: DEFAULT_CATEGORIES, fixedCosts: [] };
  });

  useEffect(() => {
    // 合言葉の状態チェック
    if (sessionStorage.getItem("kakeibo-unlocked") === "1") {
      setUnlocked(true);
    }
  }, []);

  // 設定保存用
  const saveSettings = useCallback(async (newSettings) => {
    setSettings(newSettings);
    localStorage.setItem("kakeibo-settings", JSON.stringify(newSettings));
  }, []);

  // ロック解除
  const handleUnlock = () => {
    sessionStorage.setItem("kakeibo-unlocked", "1");
    setUnlocked(true);
  };

  // APIキー保存
  const handleApiKeySave = () => {
    CLAUDE_API_KEY = localStorage.getItem('kakeibo-api-key') || '';
    setHasApiKey(true);
  };

  // 表示の優先順位（if文の順番が重要です）
  if (!hasApiKey) return <ApiKeyScreen onSave={handleApiKeySave} />;
  if (!unlocked) return <LockScreen onUnlock={handleUnlock} />;

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: C.bg, fontFamily: font }}>
      <header style={{ background: "linear-gradient(135deg,#FFE0EC, #EDD5FF)", padding: "20px", textAlign: "center" }}>
        <h1 style={{ color: C.text, letterSpacing: 5 }}>🌸 かけいぼ</h1>
      </header>

      <nav style={{ display: "flex", background: "white", borderBottom: `1px solid ${C.border}` }}>
        {/* 以前のタブボタンのコード */}
        <button onClick={() => setTab("daily")} style={{flex:1, padding:15, border:"none", background: tab==="daily" ? "#FFF0F7" : "none"}}>今日</button>
        <button onClick={() => setTab("setup")} style={{flex:1, padding:15, border:"none", background: tab==="setup" ? "#FFF0F7" : "none"}}>設定</button>
      </nav>

      <div style={{ padding: 15 }}>
        {tab === "daily" && <DailyView settings={settings} onDataChange={() => {}} />}
        {tab === "setup" && <SetupView settings={settings} onSave={saveSettings} onApiKeyChange={() => setHasApiKey(false)} />}
      </div>
    </div>
  );
}
