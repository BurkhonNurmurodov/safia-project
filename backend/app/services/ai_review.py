"""The proof reviewer's AI — its feature («review») on the «AI kalitlari» tab.

From 2026-10-19 the key store lives in `services/ai_keys.py` and which key and
model each feature runs on in `services/ai_features.py`. This module is the
reviewer's view of that: `leader_ai` asks `available()`, `active_model()` and
`generate_json()` here and knows nothing about providers, keys or the tab.
"""
from app.services import ai_features, gemini

FEATURE = "review"


def active(db=None):
    """The reviewer's assignment right now (`ai_features.Assign`)."""
    return ai_features.resolve(FEATURE, db)


def available() -> bool:
    return bool(active().key)


def active_model() -> str:
    """The model id the ledger stamps on a verdict (`LeaderAiReview.model`) and
    the strip / stall DM print — self-describing, so no provider prefix."""
    return active().model


def model_source(a=None) -> str:
    a = a or active()
    if a.provider == "gemini" and gemini.cli_model_override():
        return "cli"
    return "db"


def generate_json(prompt: str, images: list, schema: dict, *, assign=None) -> dict:
    """One review call on the reviewer's own key and model — the only
    function `leader_ai` calls to judge a proof."""
    return ai_features.generate_json(FEATURE, prompt, images, schema, assign=assign)
