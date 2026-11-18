"""The admin-report card (startup._report_text / _dm_report): what a one-shot
tells the admins in Telegram. Pure text — no database."""
import re
import unittest
from unittest import mock

from app import startup


class ReportCardTest(unittest.TestCase):
    def test_title_status_rows_in_order(self):
        t = startup._report_text(
            "ok", "Davron · «Konteyner berish»", status="Logistika sahifasi berildi",
            rows=[("🪪", "Profil", "Davron · Mehmon"), ("📲", "Telegram", "1 ta akkaunt")])
        self.assertEqual(t.split("\n"), [
            "✅ <b>Davron · «Konteyner berish»</b>",
            "<i>Logistika sahifasi berildi</i>",
            "",
            "🪪 Profil — <b>Davron · Mehmon</b>",
            "📲 Telegram — <b>1 ta akkaunt</b>"])

    def test_tone_icon_and_default_status(self):
        for tone, icon in (("ok", "✅"), ("warn", "⚠️"), ("fail", "🛑"), ("pause", "⏸")):
            first, second = startup._report_text(tone, "T").split("\n")[:2]
            self.assertTrue(first.startswith(icon))
            self.assertTrue(second.startswith("<i>") and second.endswith("</i>"))

    def test_a_list_is_bullets_and_an_empty_value_drops_its_row(self):
        t = startup._report_text("ok", "T", rows=[
            ("📨", "AXO yuboradi", ["Nuriddin aka", "", "Yusuf aka"]),
            ("🔁", "Oldingi mas'ul", None),
            ("🚫", "Yopilgan", []),
            ("📲", "Telegram", "")])
        self.assertIn("📨 AXO yuboradi:\n   • Nuriddin aka\n   • Yusuf aka", t)
        for gone in ("Oldingi", "Yopilgan", "Telegram", "—"):
            self.assertNotIn(gone, t)

    def test_values_are_escaped_and_the_tags_stay_balanced(self):
        t = startup._report_text("warn", "A <b> & B", rows=[("🔎", "x", "<script>")],
                                 notes=[("👉", "1 < 2")], error="boom <pre>")
        self.assertNotIn("<script>", t)
        self.assertIn("&lt;script&gt;", t)
        for tag in ("b", "i", "blockquote", "pre"):
            self.assertEqual(len(re.findall(rf"<{tag}>", t)), len(re.findall(rf"</{tag}>", t)), tag)

    def test_notes_share_one_quote_and_an_error_is_cut(self):
        t = startup._report_text("fail", "T", notes=[("ℹ️", "a"), ("⚠️", "b")], error="x" * 900)
        self.assertEqual(t.count("<blockquote>"), 1)
        self.assertIn("ℹ️ a\n⚠️ b</blockquote>", t)
        self.assertEqual(len(re.search(r"<pre>(x+)</pre>", t).group(1)), 600)


class SendTest(unittest.TestCase):
    def test_a_refused_message_falls_back_to_bare_text(self):
        bot = mock.Mock()
        bot.send_message.side_effect = [Exception("can't parse entities"), None]
        with mock.patch("app.routers.boot._recipients", return_value=[7]), \
                mock.patch("app.telegram_bot.bot", bot):
            startup._dm_admins_plain("✅ <b>Done &amp; dusted</b>", open=("Ochish", "/panel/permissions"))
        first, second = bot.send_message.call_args_list
        self.assertEqual(first.kwargs["parse_mode"], "HTML")
        self.assertIsNotNone(first.kwargs["reply_markup"])
        self.assertEqual(second.args, (7, "✅ Done & dusted"))


if __name__ == "__main__":
    unittest.main()
