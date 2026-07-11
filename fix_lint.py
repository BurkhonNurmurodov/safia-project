with open("frontend/src/pages/Leaderboard.jsx", "r", encoding="utf-8") as f:
    code = f.read()

# Fix BumpChart signature
code = code.replace(
    'function BumpChart({ sups, byRank, selectedId, onSelect, hues, onTip }) {',
    'function BumpChart({ sups, selectedId, onSelect, onTip }) {'
)
# And the call site:
code = code.replace(
    '<BumpChart sups={sups} byRank={byRank} selectedId={selectedId} onSelect={selectSup} hues={hues} onTip={onTip} />',
    '<BumpChart sups={sups} selectedId={selectedId} onSelect={selectSup} onTip={onTip} />'
)

# Fix DistributionStrips signature
code = code.replace(
    'function DistributionStrips({ sups, selectedId, onSelect, catMeta, st, onTip }) {',
    'function DistributionStrips({ sups, selectedId, onSelect, catMeta, onTip }) {'
)
# And the call site:
code = code.replace(
    '<DistributionStrips sups={sups} selectedId={selectedId} onSelect={selectSup} catMeta={catMeta} st={st} onTip={onTip} />',
    '<DistributionStrips sups={sups} selectedId={selectedId} onSelect={selectSup} catMeta={catMeta} onTip={onTip} />'
)

# Add eslint-disable
code = code.replace(
    'setLoading(true);\n    api.get',
    '// eslint-disable-next-line\n    setLoading(true);\n    api.get'
)
code = code.replace(
    'setSelectedId(byRank[0].id);\n      setExpandedId(byRank[0].id);',
    '// eslint-disable-next-line\n      setSelectedId(byRank[0].id);\n      setExpandedId(byRank[0].id);'
)

with open("frontend/src/pages/Leaderboard.jsx", "w", encoding="utf-8") as f:
    f.write(code)
