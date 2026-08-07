import api from "./api";
import { isWebSession } from "./session";

/**
 * Ask the server for a workbook and put it where this session can actually use
 * it.
 *
 * Inside Telegram that is a DM — a mini-app WebView has no downloads folder
 * worth the name, and the file lands in a chat already open on the person's
 * phone. In a browser it is a download: someone at a laptop asking for an Excel
 * file wants the Excel file, not a detour through their phone.
 *
 * The choice has to be made BEFORE the request, because it decides whether the
 * response is read as a blob or as JSON — hence `?download=1` rather than
 * content negotiation. The backend half is app/xlsx_delivery.py.
 *
 * Returns "download" | "telegram" so the caller can word its toast correctly.
 */
export async function exportXlsx(url, { method = "post", body, params, fallbackName = "export.xlsx" } = {}) {
  if (!isWebSession()) {
    if (method === "get") await api.get(url, { params });
    else await api.post(url, body, { params });
    return "telegram";
  }

  const config = {
    params: { ...(params || {}), download: 1 },
    responseType: "blob",
  };
  const response = method === "get"
    ? await api.get(url, config)
    : await api.post(url, body, config);

  saveBlob(response.data, filenameFrom(response) || fallbackName);
  return "download";
}

/** Prefer the server's own filename — these are Cyrillic and Uzbek names the
 *  client has no reliable way to reconstruct. */
function filenameFrom(response) {
  const header = response?.headers?.["content-disposition"] || "";
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8) { try { return decodeURIComponent(utf8[1].trim()); } catch { /* fall through */ } }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  if (plain) { try { return decodeURIComponent(plain[1].trim()); } catch { return plain[1].trim(); } }
  return "";
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick, not immediately: Safari cancels a download whose
  // object URL is released in the same frame as the click.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
