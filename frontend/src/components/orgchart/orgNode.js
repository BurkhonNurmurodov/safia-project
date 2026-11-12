// «Tashkiliy tuzilma» — what a node of the chart is CALLED and how a role
// looks, shared by the canvas's cards, the details panel and the picker.
import { useCallback } from "react";
import { Flag, Shield, ShieldQuestion, Star, UserCog, UserRound, Users } from "lucide-react";
import { useLang } from "../../context/LangContext";
import { factoryName } from "../../context/FactoryContext";
import { useTranslit } from "../../utils/transliterate";
import { ROLE_LABEL_KEYS } from "../../config/pages";
import { CATEGORY_COLORS, ROLE_COLORS } from "../../utils/chartPalette";
import { fill } from "../../pages/admin/orgChartText";

// The profile page's own glyphs and hues, so a role looks the same on both.
export const ROLE_ICON = {
  "top-manager": Star, "shift-manager": UserCog, supervisor: Users, leader: Flag,
  admin: Shield, guest: UserRound, "idle-owner": ShieldQuestion,
};
export const roleHue = (role) => ROLE_COLORS[role] ?? CATEGORY_COLORS[8];

/** What a card is called — shared with the details panel and the picker. */
export function useNodeText(P) {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  return useCallback((node, root) => {
    if (node.kind === "person") {
      const p = node.profile;
      let sub = t(ROLE_LABEL_KEYS[p.role] ?? "role.guest");
      if (p.role === "leader" && p.cells?.length) sub += ` · ${fill(P.nCells, { n: p.cells.length })}`;
      if (p.role === "shift-manager" && p.shift) sub += ` · ${fill(P.shiftN, { n: p.shift })}`;
      return { title: tl(p.name), sub };
    }
    if (node.kind === "root") return { title: P.company, sub: fill(P.profiles, { n: node.people }) };
    if (node.kind === "group") return { title: P.tier[node.role] ?? node.role, sub: fill(P.nPeople, { n: node.people }) };
    const counts = [
      node.roles.supervisor ? fill(P.nUnits, { n: node.roles.supervisor }) : null,
      node.roles.leader ? fill(P.nLeaders, { n: node.roles.leader }) : null,
    ].filter(Boolean).join(" · ");
    if (node.kind === "factory") {
      const title = node.factory
        ? (factoryName(node.factory, lang) || node.factory.code)
        : (root?.anyPlant ? P.noPlant : P.production);
      return { title, sub: counts };
    }
    return { title: node.shift ? fill(P.shiftN, { n: node.shift }) : P.shiftNone, sub: counts };
  }, [t, tl, lang, P]);
}
