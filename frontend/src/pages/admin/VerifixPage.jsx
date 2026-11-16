import AdminTabs from "./AdminTabs";
import VerifixSync from "./VerifixSync";
import VerifixSettings from "./VerifixSettings";

// «Verifix» — `/panel/verifixsync`: the sync (what an admin works in) and the
// API connection (opened when something breaks). Two pages until 2026-11-16;
// `/panel/verifix` lands on the second tab. The id stays `verifixsync`: the
// sidebar's queue count and the bot's / notifications' links name it.
const TABS = [
  { value: "sync",       labelKey: "admin.vfxTab.sync",       descKey: "admin.desc.verifixsync", Page: VerifixSync },
  { value: "connection", labelKey: "admin.vfxTab.connection", descKey: "admin.desc.verifix",     Page: VerifixSettings },
];

export default function VerifixPage() {
  return <AdminTabs id="verifixsync" tabs={TABS} />;
}
