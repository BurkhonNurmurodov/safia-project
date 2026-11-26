"""«Yordamchi» out loud (2026-11-26): the speech feature's request, the audio
it hands back, what is sent to be spoken, and the one-shot that opened the
assistant to top-managers.
"""
import asyncio
import base64
import unittest
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

from app.services import ai_features, assistant_ai, assistant_gemini, gemini


def _reply(data: bytes, key: str = "inlineData") -> dict:
    return {"candidates": [{"content": {"parts": [{key: {"data": base64.b64encode(data).decode()}}]}}],
            "usageMetadata": {"promptTokenCount": 7}}


class SpeakTest(unittest.TestCase):
    def _speak(self, payload):
        usage = {}
        with mock.patch.object(assistant_gemini, "_post", mock.AsyncMock(return_value=payload)) as post:
            out = asyncio.run(assistant_gemini.speak("Salom", model="m-tts", key="k", usage=usage))
        return out, usage, post

    def test_a_wav_comes_back_as_it_is(self):
        wav = assistant_gemini._wav(b"\x01\x00" * 50)
        out, usage, post = self._speak(_reply(wav))
        self.assertEqual(out, wav)
        self.assertEqual(usage, {"promptTokenCount": 7})
        self.assertEqual(post.call_args.args[:2], ("m-tts", gemini.speech_body("Salom")))

    def test_raw_pcm_gets_a_header(self):
        pcm = b"\x01\x00" * 50
        out, _, _ = self._speak(_reply(pcm, "inline_data"))
        self.assertEqual(out[:4] + out[8:12], b"RIFFWAVE")
        self.assertEqual(len(out), 44 + len(pcm))
        self.assertEqual(int.from_bytes(out[24:28], "little"), 24000)
        self.assertEqual(out[44:], pcm)

    def test_no_audio_is_an_error(self):
        with self.assertRaises(assistant_gemini.AssistantAIError) as e:
            self._speak({"candidates": [{"content": {"parts": [{"text": "hm"}]}}]})
        self.assertEqual(e.exception.code, "empty")

    def test_the_tab_checks_a_speech_pair_with_the_speech_request(self):
        res = mock.Mock(status_code=200)
        with mock.patch.object(gemini.httpx, "Client") as client:
            post = client.return_value.__enter__.return_value.post
            post.return_value = res
            ai_features.ping("gemini", "k", "m-tts", "speech")
            self.assertEqual(post.call_args.kwargs["json"], gemini.speech_body("OK"))
            ai_features.ping("gemini", "k", "m", "voice")
            self.assertNotIn("responseModalities", post.call_args.kwargs["json"]["generationConfig"])

    def test_speech_is_a_gemini_only_feature(self):
        self.assertEqual(ai_features.BY_ID["speech"].providers, ("gemini",))
        self.assertIn("speech", ai_features.NAMES_UZ)


class SpeechTextTest(unittest.TestCase):
    def test_one_line_and_capped(self):
        self.assertEqual(assistant_ai.speech_text("  Bugun \n\n 5 ta  vazifa "), "Bugun 5 ta vazifa")
        self.assertEqual(len(assistant_ai.speech_text("a" * 5000)), assistant_ai.MAX_SPEECH)
        self.assertEqual(assistant_ai.speech_text(" \n "), "")

    def test_uzbek_cyrillic_is_latinised_and_russian_is_not(self):
        self.assertEqual(assistant_ai.speech_text("Ўртача юклама 87 фоиз"), "O'rtacha yuklama 87 foiz")
        self.assertEqual(assistant_ai.speech_text("Средняя загрузка 87 процентов", "ru"),
                         "Средняя загрузка 87 процентов")
        # a Russian answer naming an Uzbek person stays Russian
        self.assertEqual(assistant_ai.speech_text("Лидирует Ҳасанов — 97 процентов", "ru"),
                         "Лидирует Ҳасанов — 97 процентов")
        self.assertEqual(assistant_ai.speech_text("Ҳасанов олдинда", "uz_cyrl"), "Hasanov oldinda")


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG not set")
class TopManagersTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def test_the_oneshot_opens_it_once(self):
        from app import startup
        from app.permissions import get_page_access, set_page_access

        def access():
            s = self.pg.Session()
            try:
                return get_page_access(s)["assistant"]
            finally:
                s.close()

        def matrix_with(roles):
            s = self.pg.Session()
            try:
                m = get_page_access(s)
                m["assistant"] = roles
                set_page_access(s, m)
            finally:
                s.close()

        matrix_with([])                      # an Access-tab save that names the page, nobody ticked
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
             mock.patch.object(startup, "_dm_admins_plain") as dm:
            startup.assistant_top_managers()
            self.assertEqual(access(), ["top-manager"])
            matrix_with([])                  # an admin unticks it later
            startup.assistant_top_managers()
            self.assertEqual(access(), [])
            self.assertEqual(dm.call_count, 1)


if __name__ == "__main__":
    unittest.main()
