import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ProxyPhoto } from "../leaders/ProofPhoto";
import Lightbox from "../ui/Lightbox";
import api from "../../utils/api";
import { fill } from "../../pages/auditsText";

/**
 * A minus's photos as the panel's inspector took them — the evidence, so the
 * record opens on them. Every photo comes through our server
 * (`/api/audits/photo/…`, the «Auditlar» page key), a tile at 480 px, the
 * zoom at the panel's own 800 px; the browser keeps both (the URL is the
 * panel's file name, which never changes content).
 */

const TILE = 480;
const photoApi = (path) => `/api/audits/photo${path}`;
const blob = (path, s) => api.get(photoApi(path), {
  responseType: "blob", params: s ? { s } : undefined, _browserKept: true,
});

function useFullPhoto(path) {
  const { data } = useQuery({
    queryKey: ["audit-photo", path],
    queryFn: () => blob(path).then((r) => r.data),
    enabled: Boolean(path),
    staleTime: Infinity,
    retry: 0,
  });
  const url = useMemo(() => (data ? URL.createObjectURL(data) : null), [data]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

export default function AuditPhotos({ photos, T }) {
  const [zoom, setZoom] = useState(null);   // index of the photo shown full screen
  const [tiles, setTiles] = useState({});   // index → the tile's object URL, shown while the zoom loads
  const full = useFullPhoto(zoom != null ? photos[zoom] : null);
  const n = photos.length;
  const cols = n >= 3 ? "grid-cols-3" : "grid-cols-2";

  return (
    <>
      <div className={`grid ${cols} gap-2 mb-4`}>
        {photos.map((p, i) => (
          <div key={p} className="aspect-square">
            <ProxyPhoto thumb failCaption T={T} className="" deps={[p]}
              load={() => blob(p, TILE)}
              onReady={(url) => setTiles((t) => ({ ...t, [i]: url }))}
              zoomLabel={fill(T.photoOf, { i: i + 1, n })}
              onClick={() => setZoom(i)} />
          </div>
        ))}
      </div>
      <Lightbox src={zoom != null ? full || tiles[zoom] : null} onClose={() => setZoom(null)}
        alt={zoom != null ? fill(T.photoOf, { i: zoom + 1, n }) : ""}
        onPrev={zoom > 0 ? () => setZoom(zoom - 1) : undefined}
        onNext={zoom != null && zoom < n - 1 ? () => setZoom(zoom + 1) : undefined}
        prevLabel={T.prev} nextLabel={T.next} />
    </>
  );
}
