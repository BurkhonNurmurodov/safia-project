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
    def setUp(self):
        assistant_gemini._speech_shape = 0
        self.addCleanup(setattr, assistant_gemini, "_speech_shape", 0)

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
            # «can this pair speak» — asked with no voice named, the shape every TTS model takes
            self.assertEqual(post.call_args.kwargs["json"],
                             {"contents": [{"role": "user", "parts": [{"text": "OK"}]}],
                              "generationConfig": {"responseModalities": ["AUDIO"]}})
            ai_features.ping("gemini", "k", "m", "voice")
            self.assertNotIn("responseModalities", post.call_args.kwargs["json"]["generationConfig"])

    def test_a_refused_shape_gives_way_to_the_next_and_the_one_that_works_is_kept(self):
        wav = assistant_gemini._wav(b"\x01\x00" * 50)
        refused = assistant_gemini.AssistantAIError("rejected", 'Gemini 400: Unknown name "voice"')
        post = mock.AsyncMock(side_effect=[refused, _reply(wav), _reply(wav)])
        with mock.patch.object(assistant_gemini, "_post", post):
            self.assertEqual(asyncio.run(assistant_gemini.speak("Salom", model="m", key="k")), wav)
            asyncio.run(assistant_gemini.speak("Yana", model="m", key="k"))
        bodies = [c.args[1] for c in post.call_args_list]
        self.assertEqual(bodies, [gemini.speech_body("Salom", 0), gemini.speech_body("Salom", 1),
                                  gemini.speech_body("Yana", 1)])

    def test_a_refusal_that_is_not_about_the_request_is_not_retried(self):
        broke = assistant_gemini.AssistantAIError("rejected", "Gemini 402: Your prepayment credits are depleted")
        post = mock.AsyncMock(side_effect=broke)
        with mock.patch.object(assistant_gemini, "_post", post), self.assertRaises(assistant_gemini.AssistantAIError):
            asyncio.run(assistant_gemini.speak("Salom", model="m", key="k"))
        self.assertEqual(post.call_count, 1)

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
        # … whatever the reader's interface is in: the answer follows the QUESTION's language
        self.assertEqual(assistant_ai.speech_text("Первый — Ҳасанов, у него лучший результат", "uz"),
                         "Первый — Ҳасанов, у него лучший результат")


def _assign(feature, key="k"):
    return ai_features.Assign(feature, "gemini" if key else "", f"{feature}-model" if key else "",
                              key, None, "", "", "x")


class FastTest(unittest.TestCase):
    """A question spoken to the orb is answered on the voice feature's model,
    asked to think less, in words to be heard, in fewer steps."""

    def test_the_fast_assignment_is_the_voice_features(self):
        with mock.patch.object(ai_features, "resolve", side_effect=_assign):
            self.assertEqual(assistant_ai.current().feature, "assistant")
            self.assertEqual(assistant_ai.current(True).feature, "voice")
        off = lambda f: _assign(f, "" if f == "voice" else "k")          # noqa: E731
        with mock.patch.object(ai_features, "resolve", side_effect=off):
            self.assertEqual(assistant_ai.current(True).feature, "assistant")   # voice is off: the chat's own

    def _generate(self, post, fast):
        with mock.patch.object(assistant_gemini, "_post", post):
            return asyncio.run(assistant_gemini.generate(
                system="s", contents=[{"role": "user", "parts": [{"text": "q"}]}], tools=None,
                model="m", key="k", fast=fast))

    def test_a_fast_turn_thinks_less_and_an_older_model_is_asked_without(self):
        self.addCleanup(setattr, assistant_gemini, "_think_less", True)
        answer = {"candidates": [{"content": {"parts": [{"text": "87"}]}}]}
        post = mock.AsyncMock(return_value=answer)
        self._generate(post, False)
        self.assertNotIn("generationConfig", post.call_args.args[1])
        self._generate(post, True)
        self.assertEqual(post.call_args.args[1]["generationConfig"],
                         {"thinkingConfig": {"thinkingLevel": "low"}})
        refused = assistant_gemini.AssistantAIError("rejected", "Gemini 400: Thinking level is not supported")
        post = mock.AsyncMock(side_effect=[refused, answer, answer])
        self.assertEqual(self._generate(post, True).text, "87")
        self._generate(post, True)
        self.assertEqual(["generationConfig" in c.args[1] for c in post.call_args_list], [True, False, False])

    def test_a_fast_model_that_refuses_hands_the_run_to_the_chats_own(self):
        from app.services import assistant as engine
        state = ([{"role": "user", "parts": [{"text": "q"}]}], {}, {"_orb": True, "_now": "2026-11-26 12:00"},
                 "voice-model", 0)
        done = []

        async def db(fn, *a, **kw):
            if fn is engine._load:
                return state
            if fn is engine._cancel_asked:
                return False
            if fn is engine._finish:
                done.append((a, kw))
            return None

        answer = assistant_gemini.Reply(content={"role": "model", "parts": [{"text": "87"}]},
                                        text="87", calls=[], finish="STOP")
        refused = assistant_gemini.AssistantAIError("rejected", "Gemini 400: bad tool schema")
        gen = mock.AsyncMock(side_effect=[refused, answer])
        ctx = engine.Ctx({"full_name": "A", "role": "admin"}, {}, "p:1", None)
        with mock.patch.object(engine, "_db", db), mock.patch.object(engine, "_system", return_value="s"), \
             mock.patch.object(engine.ai, "current", side_effect=lambda fast=False: _assign("voice" if fast else "assistant")), \
             mock.patch.object(engine.ai, "generate", gen), \
             mock.patch.object(engine.ai, "transcode", side_effect=lambda c: c):
            asyncio.run(engine._drive(1, ctx, 0.0))
        self.assertEqual([c.args[0].feature for c in gen.call_args_list], ["voice", "assistant"])
        self.assertEqual(done[0][0][1], "done")
        # a failure the chat's model would share is the run's failure, not a reason to switch
        gen = mock.AsyncMock(side_effect=assistant_gemini.AssistantAIError("quota", "limit"))
        with mock.patch.object(engine, "_db", db), mock.patch.object(engine, "_system", return_value="s"), \
             mock.patch.object(engine.ai, "current", side_effect=lambda fast=False: _assign("voice" if fast else "assistant")), \
             mock.patch.object(engine.ai, "generate", gen), self.assertRaises(assistant_gemini.AssistantAIError):
            asyncio.run(engine._drive(1, ctx, 0.0))
        self.assertEqual(gen.call_count, 1)

    def test_only_a_spoken_question_gets_the_spoken_rules(self):
        from app.services import assistant as engine
        ctx = engine.Ctx({"full_name": "A", "role": "admin"}, {}, "p:1", None)
        with mock.patch.object(engine.docs, "toc", return_value=""), \
             mock.patch.object(engine.api, "index_text", return_value=""):
            self.assertNotIn("SPOKEN", engine._system(ctx, {"path": "/"}))
            self.assertTrue(engine._system(ctx, {"path": "/", "_orb": True}).rstrip().endswith(
                engine._SPOKEN.rstrip()))
        self.assertLess(engine.MAX_STEPS_SPOKEN, engine.MAX_STEPS)


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

    def test_speech_takes_the_voice_key_once(self):
        from app import startup
        from app.models import AiFeature, AppSetting

        def rows(**new):
            s = self.pg.Session()
            try:
                for feature, ref in new.items():
                    r = s.get(AiFeature, feature) or AiFeature(feature=feature)
                    r.key_ref, r.model = ref, ("m" if ref else None)
                    s.add(r)
                s.commit()
                return {r.feature: (r.key_ref, r.model) for r in s.query(AiFeature).all()}
            finally:
                s.close()

        def forget():
            s = self.pg.Session()
            try:
                s.query(AppSetting).filter_by(key=startup.SPEECH_ON_FLAG).delete()
                s.commit()
            finally:
                s.close()

        tts = ai_features.BY_ID["speech"].defaults["gemini"]
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
             mock.patch.object(startup, "_dm_admins_plain"):
            rows(voice="env")
            startup.speech_on_voice_key()
            self.assertEqual(rows()["speech"], ("env", tts))
            rows(speech=None)                    # an admin switches it off later
            startup.speech_on_voice_key()
            self.assertEqual(rows()["speech"], (None, None))
            forget()
            rows(speech="7")                     # a row somebody set is left alone
            startup.speech_on_voice_key()
            self.assertEqual(rows()["speech"], ("7", "m"))
            forget()
            rows(voice=None, speech=None)        # no voice key: nothing to take
            startup.speech_on_voice_key()
            self.assertEqual(rows()["speech"], (None, None))


if __name__ == "__main__":
    unittest.main()
