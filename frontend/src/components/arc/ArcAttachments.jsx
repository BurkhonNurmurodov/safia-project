import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import api from "../../utils/api";
import { ProxyPhoto } from "../leaders/ProofPhoto";
import Lightbox from "../ui/Lightbox";
import { FileTile } from "../ui/FileIcon";
import { SkeletonBlock } from "../ui/Skeleton";
import { saveBlob } from "../../utils/exportXlsx";
import { useLang } from "../../context/LangContext";

/* An ARC ticket's photos and files, for the ticket modal on /arc.
 *
 * Every byte comes through OUR origin — /api/arc-legacy/requests/{id}/file/{key}
 * (services/arc_files.py). The page's CSP is img-src 'self', so a picture can
 * never be drawn straight off IT's host; an <img src> pointing there is what
 * left the modal with a bare link where the photo should have been.
 *
 * Photos go through ProxyPhoto (the platform's one blob loader: JWT on the
 * request, its own skeleton, a failed photo keeps its place with a retry).
 * A lone photo is drawn at the card's width, several as a grid of squares;
 * a tap opens the shared Lightbox (it sits above the Modal, z 120). A file that
 * is not a picture is a FileTile that downloads it.
 */

const BASE = (id) => `/api/arc-legacy/requests/${encodeURIComponent(id)}`;

// Only what a browser draws: anything else would paint a broken image.
const DRAWABLE = /^image\/(jpeg|png|gif|webp|bmp)$/i;
const loadPhoto = (id, key) => () =>
  api.get(`${BASE(id)}/file/${key}`, { responseType: "blob" }).then((res) => {
    if (!DRAWABLE.test(res.data?.type || "")) throw new Error("not an image");
    return res;
  });

/** The attachment list of one ticket. A new-app ticket's files live only on
 *  IT's single-ticket card, read on demand; `card` says whether it was read. */
export function useArcFiles(remoteId) {
  return useQuery({
    queryKey: ["arcl-files", remoteId],
    queryFn: () => api.get(`${BASE(remoteId)}/files`).then((r) => r.data),
    enabled: remoteId != null,
    staleTime: 5 * 60_000,
    retry: 0,
    meta: { persist: false },
  });
}

/** Photos (and any other files) as a gallery. `items`: [{key, name, kind}]. */
export function ArcGallery({ remoteId, items }) {
  const { t } = useLang();
  const [zoom, setZoom] = useState("");
  const T = { photoFailed: t("arcl.dPhotoFailed"), retry: t("common.retry") };
  const photos = items.filter((f) => f.kind === "image");
  const others = items.filter((f) => f.kind !== "image");
  const lone = photos.length === 1;

  return (
    <div className="flex flex-col gap-2">
      {lone && (
        <ProxyPhoto key={photos[0].key} T={T} className="" fit="contain" maxHeight={320}
          deps={[remoteId, photos[0].key]} load={loadPhoto(remoteId, photos[0].key)}
          zoomLabel={t("arcl.dPhotoZoom")} onClick={setZoom} />
      )}
      {photos.length > 1 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map((p, i) => (
            <div key={p.key} className="aspect-square">
              <ProxyPhoto T={T} className="" thumb failCaption deps={[remoteId, p.key]}
                load={loadPhoto(remoteId, p.key)}
                zoomLabel={`${t("arcl.dPhotoZoom")} · ${i + 1}/${photos.length}`} onClick={setZoom} />
            </div>
          ))}
        </div>
      )}
      {others.map((f) => <ArcFileRow key={f.key} remoteId={remoteId} file={f} />)}
      <Lightbox src={zoom} onClose={() => setZoom("")} alt={t("arcl.dPhotoAlt")} />
    </div>
  );
}

function ArcFileRow({ remoteId, file }) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const download = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await api.get(`${BASE(remoteId)}/file/${file.key}`,
        { params: { download: 1 }, responseType: "blob" });
      saveBlob(res.data, file.name || "file");
    } catch {
      setErr(t("arcl.dFileFailed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <FileTile name={file.name} onClick={busy ? undefined : download} loading={busy}
      error={err} title={`${t("arcl.dFileDownload")} — ${file.name}`} />
  );
}

/** The filer's attachments block: loading → gallery, «none», or why not. */
export function ArcFilesBody({ remoteId, q }) {
  const { t } = useLang();
  const qc = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  // A failed card is remembered server-side for a minute; a person pressing
  // retry asks past that (`force`).
  const retry = async () => {
    setRetrying(true);
    try {
      const r = await api.get(`${BASE(remoteId)}/files`, { params: { force: 1 } });
      qc.setQueryData(["arcl-files", remoteId], r.data);
    } catch { /* the line stays as it is */ } finally {
      setRetrying(false);
    }
  };
  if (q.isLoading) {
    return (
      <span className="flex gap-2" aria-label={t("arcl.dFilesLoading")}>
        {[0, 1, 2].map((i) => <SkeletonBlock key={i} className="w-20 h-20 rounded-lg" />)}
      </span>
    );
  }
  const files = (q.data?.files || []).map((f) => ({ key: String(f.n), name: f.name, kind: f.kind }));
  const cardFailed = q.isError || (q.data && !["ok", "n/a"].includes(q.data.card));
  if (files.length > 0) return <ArcGallery remoteId={remoteId} items={files} />;
  if (cardFailed) {
    return (
      <span className="inline-flex items-center gap-2 flex-wrap" style={{ color: "var(--text-3)" }}>
        <AlertTriangle size={13} className="flex-shrink-0" style={{ color: "#eab308" }} />
        {q.data?.card === "not_configured" ? t("arcl.dFilesNoApi") : t("arcl.dFilesFailed")}
        {q.data?.card !== "not_configured" && (
          <button type="button" onClick={retry} disabled={retrying}
            className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 disabled:opacity-60"
            style={{ color: "var(--brand-text)" }}>
            <RefreshCw size={11} className={retrying ? "animate-spin" : ""} />{t("common.retry")}
          </button>
        )}
      </span>
    );
  }
  return <span style={{ color: "var(--text-3)" }}>{t("arcl.dFilesNone")}</span>;
}
