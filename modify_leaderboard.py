import re
import os

with open("frontend/src/pages/Leaderboard.jsx", "r", encoding="utf-8") as f:
    code = f.read()

# 1. Imports
code = code.replace(
    'import { useMemo, useState } from "react";',
    'import { useMemo, useState, useEffect } from "react";'
)

if 'import api from "../utils/api";' not in code:
    code = code.replace(
        'import { useTheme } from "../context/ThemeContext";',
        'import { useTheme } from "../context/ThemeContext";\nimport api from "../utils/api";'
    )

# 2. Delete dummy data arrays and generation
code = re.sub(r'const RAW = \[.*?\];', '', code, flags=re.DOTALL)
code = re.sub(r'function mulberry32\(a\).*?return \(\(t \^ \(t >>> 14\)\) >>> 0\) / 4294967296;\n  };\n}', '', code, flags=re.DOTALL)
code = re.sub(r'function composite\(s\) \{.*?return den \? num / den : 0;\n}', '', code, flags=re.DOTALL)
code = re.sub(r'function buildData\(period\) \{.*?return \{ sups, byRank \};\n}', '', code, flags=re.DOTALL)

# 3. Update useLeaderboardData
new_hook = """function useLeaderboardData(period) {
  const [data, setData] = useState({ sups: [], byRank: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get(`/api/leaderboard?period=${period}`).then((res) => {
      if (active) {
        setData(res.data);
        setLoading(false);
      }
    }).catch((err) => {
      console.error("Leaderboard fetch failed", err);
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [period]);

  return { ...data, loading };
}"""
code = re.sub(r'function useLeaderboardData\(period\) \{.*?return useMemo\(\(\) => buildData\(period\), \[period\]\);\n}', new_hook, code, flags=re.DOTALL)

# 4. Update the component state
code = code.replace(
    'const { sups, byRank } = useLeaderboardData(period);',
    'const { sups, byRank, loading } = useLeaderboardData(period);'
)

# Replace the initial states for selectedId and expandedId
code = re.sub(
    r'const \[selectedId, setSelectedId\] = useState\(3\);\n  const \[expandedId, setExpandedId\] = useState\(3\);',
    'const [selectedId, setSelectedId] = useState(null);\n  const [expandedId, setExpandedId] = useState(null);\n\n  useEffect(() => {\n    if (byRank.length > 0 && selectedId === null) {\n      setSelectedId(byRank[0].id);\n      setExpandedId(byRank[0].id);\n    }\n  }, [byRank, selectedId]);',
    code,
    flags=re.DOTALL
)

# 5. Handle loading in render
code = code.replace(
    '<Podium byRank={byRank} selectedId={selectedId} onSelect={selectSup} catMeta={catMeta} st={st} />',
    '{loading ? <div className="py-20 text-center text-sm" style={{color: "var(--text-3)"}}>Yuklanmoqda...</div> : byRank.length > 0 && <Podium byRank={byRank} selectedId={selectedId} onSelect={selectSup} catMeta={catMeta} st={st} />}'
)

# Hide category leaders if loading or empty
code = code.replace(
    '<div className="flex flex-col gap-2.5">',
    '{loading || sups.length === 0 ? null : <div className="flex flex-col gap-2.5">'
)
code = code.replace(
    '</div>\n\n        {/* ── main ranking table ── */}',
    '</div>}\n\n        {/* ── main ranking table ── */}'
)

# Prevent errors in Podium / BumpChart by conditionally rendering charts
code = code.replace(
    '<div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)" }}>',
    '{loading || sups.length === 0 || selectedId === null ? null : <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,1.2fr) minmax(0,1fr)" }}>'
)
code = code.replace(
    '<details className="rounded-2xl overflow-hidden"',
    '</div>\n\n        {/* ── methodology ── */}\n        <details className="rounded-2xl overflow-hidden"'
)


with open("frontend/src/pages/Leaderboard.jsx", "w", encoding="utf-8") as f:
    f.write(code)

print("Modification complete.")
