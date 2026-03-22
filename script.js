// =============================================
//  かけいぼ - 修正済みスクリプト (script.js)
// =============================================

// ─── Claude API 呼び出し (モデル名を修正) ───────────────────
async function callClaude(messages, maxTokens = 1000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    // モデル名を実在する最新安定版に修正
    body: JSON.stringify({ model: "claude-3-5-sonnet-20240620", max_tokens: maxTokens, messages }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "API エラー");
  return data.content?.map(b => b.text || "").join("\n") || "";
}

// ─── メインアプリ (初期化ロジックとタイポを修正) ─────────────
function App() {
  const [tab, setTab] = useState("daily");
  const [settings, setSettings] = useState(null);
  const [unlocked, setUnlocked] = useState(false);
  // APIキーの判定をより厳格に修正
  const [hasApiKey, setHasApiKey] = useState(!!(CLAUDE_API_KEY && CLAUDE_API_KEY.trim()));
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    const ok = sessionStorage.getItem("kakeibo-unlocked");
    if (ok === "1") setUnlocked(true);
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    (async () => {
      try {
        // 1. まず設定を読み込む
        const raw = await sg("kakeibo-settings");
        let currentSettings;
        if (raw) {
          currentSettings = JSON.parse(raw);
        } else {
          currentSettings = { categories: DEFAULT_CATEGORIES, fixedCosts: [] };
          await ss("kakeibo-settings", JSON.stringify(currentSettings));
        }
        
        // 先に設定をセットして「よみこみ中」を解除できるようにする
        setSettings(currentSettings);

        // 2. その後、非同期でキャッシュを準備（失敗しても画面は出す）
        const now = todayStr();
        const thisMonth = getMonthStart(now);
        const lastMonth = (() => { 
          const d = new Date(thisMonth); 
          d.setMonth(d.setMonth(d.getMonth() - 1)); 
          return getMonthStart(d.toISOString().split("T")[0]); 
        })();

        await Promise.all([
          loadMonthDataCached(thisMonth).catch(e => console.warn("Cache load failed", e)),
          loadMonthDataCached(lastMonth).catch(e => console.warn("Cache load failed", e))
        ]);
      } catch (err) {
        console.error("Initialization error:", err);
        // エラー時も最低限の初期設定をセット
        setSettings({ categories: DEFAULT_CATEGORIES, fixedCosts: [] });
      }
    })();
  }, [unlocked]);

  const handleUnlock = () => { sessionStorage.setItem("kakeibo-unlocked", "1"); setUnlocked(true); };
  const saveSettings = useCallback(async s => { setSettings(s); await ss("kakeibo-settings", JSON.stringify(s)); }, []);
  const handleApiKeySave = () => setHasApiKey(true);

  if (!hasApiKey) return <ApiKeyScreen onSave={handleApiKeySave} />;
  if (!unlocked) return <LockScreen onUnlock={handleUnlock} />;
  if (!settings) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg, fontFamily: font, color: C.pink, gap: 14 }}>
      <div style={{ fontSize: 46, animation: "floatAnim 2s ease-in-out infinite" }}>🌸</div>
      <p style={{ fontSize: 15, letterSpacing: 4, color: C.textSub }}>よみこみ中…</p>
    </div>
  );

  const tabs = [["daily", "📅", "今日"], ["calendar", "🗓️", "カレンダー"], ["reports", "✨", "レポート"], ["setup", "🌸", "設定"]];

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", fontFamily: font }}>
      <header style={{ background: "linear-gradient(135deg,#FFE0EC 0%,#EDD5FF 55%,#C5EDF5 100%)", padding: "18px 20px 14px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <span style={{ fontSize: 26, animation: "floatAnim 3s ease-in-out infinite" }}>🌸</span>
          <h1 style={{ fontFamily: "'Klee One',serif", fontSize: 21, fontWeight: 600, color: C.text, letterSpacing: 7 }}>かけいぼ</h1>
          <span style={{ fontSize: 26, animation: "floatAnim 3s ease-in-out infinite", animationDelay: ".6s" }}>💕</span>
        </div>
      </header>

      <nav style={{ display: "flex", background: "white", borderBottom: `1px solid ${C.border}`, boxShadow: `0 2px 10px ${C.shadow}`, position: "sticky", top: 0, zIndex: 30 }}>
        {tabs.map(([k, ic, lb]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex: 1, padding: "11px 4px 10px", border: "none", cursor: "pointer",
            fontFamily: font, fontSize: 11, fontWeight: 700, letterSpacing: .5, lineHeight: 1.5,
            background: tab === k ? "linear-gradient(to bottom,#FFF0F7,white)" : "transparent",
            color: tab === k ? C.text : C.textLight,
            borderBottom: tab === k ? `2.5px solid ${C.pink}` : "2.5px solid transparent", transition: "all .2s",
          }}>{ic}<br />{lb}</button>
        ))}
      </nav>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 13px 44px" }}>
        {tab === "setup" && <SetupView settings={settings} onSave={saveSettings} onApiKeyChange={() => setHasApiKey(false)} />}
        {tab === "daily" && <DailyView settings={settings} onDataChange={() => setDataVersion(v => v + 1)} />}
        {tab === "calendar" && <CalendarView settings={settings} dataVersion={dataVersion} />}
        {tab === "reports" && <ReportsView settings={settings} />}
      </div>
    </div>
  );
}

// ─── DailyView (タイポ修正) ──────────────────────────────────
function DailyView({ settings, onDataChange }) {
  // ... (中略) ...
  const handleTextSubmit = async () => {
    if (!inputText.trim()) return;
    setLoading(true); setParsed(null);
    try {
      // parseNatura を parseNaturalInput に修正
      const r = await parseNaturalInput(inputText, settings.categories);
      if (r) setParsed(r);
      else showToast("解析できませんでした");
    } catch (e) {
      showToast("エラーが発生しました");
    }
    setLoading(false);
  };
  // ... (以下略) ...
}
