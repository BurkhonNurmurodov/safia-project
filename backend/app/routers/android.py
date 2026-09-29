"""The Android app's own updates — see services/android_release.py.

Every path here is PUBLIC (security._EXEMPT_PREFIXES): the app's native code
asks them with no session, exactly as it asks /build.json, and the APK is the
same file the operator already hands out in Telegram.

  GET  /api/android/latest          — the published release, or 404
  GET  /api/android/app/{code}.apk  — that release's file (an older code: 404)
  GET  /api/android/download        — a shareable link: redirects to the latest
  POST /api/android/publish         — android/publish-release.sh; X-Publish-Key
"""
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse

from app.services import action_log, android_release as rel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/android", tags=["android"])

_NO_STORE = {"Cache-Control": "no-store"}


@router.get("/latest")
def latest():
    meta = rel.latest()
    if meta is None:
        return JSONResponse({"detail": "no release published"}, status_code=404, headers=_NO_STORE)
    return JSONResponse({**meta, "url": f"/api/android/app/{meta['version_code']}.apk"}, headers=_NO_STORE)


@router.get("/app/{code}.apk")
def apk(code: int):
    meta = rel.latest()
    # Only the latest is offered: an old link answers 404 rather than an old app.
    if meta is None or meta["version_code"] != code:
        raise HTTPException(404, "not the published release")
    return FileResponse(
        rel.apk_path(code),
        media_type="application/vnd.android.package-archive",
        filename=f"Safia-IMS-{meta['version_name']}.apk",
    )


@router.get("/download")
def download():
    meta = rel.latest()
    if meta is None:
        raise HTTPException(404, "no release published")
    return RedirectResponse(f"/api/android/app/{meta['version_code']}.apk", status_code=302, headers=_NO_STORE)


@router.post("/publish")
async def publish(request: Request):
    if not rel.key_ok(request.headers.get("X-Publish-Key")):
        raise HTTPException(403, "bad publish key")
    body = await request.body()
    from app.main import ANDROID_ASSET_LINKS  # lazy: main imports this router
    try:
        meta = rel.publish(body, rel.fingerprints(ANDROID_ASSET_LINKS))
    except rel.BadApk as e:
        raise HTTPException(400, str(e))
    logger.info("ANDROID published %s (versionCode %s, %s bytes)",
                meta["version_name"], meta["version_code"], meta["size"])
    action_log.enrich(target_kind="android_app", target_id=str(meta["version_code"]),
                      target_name=f"Safia IMS {meta['version_name']}")
    return meta
