/** Put a value on the clipboard, and say whether it landed.
 *
 *  `navigator.clipboard` needs a secure context and is missing or refused in
 *  parts of the Telegram WebView, so the textarea+execCommand fallback is not
 *  legacy politeness — it is the path that actually runs on the primary device.
 *  The boolean matters as much as the copy: a button that silently did nothing
 *  reads as success, and the operator pastes yesterday's clipboard into a login
 *  form.
 */
export async function copyText(value) {
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch { /* not a secure context, or permission refused — try the fallback */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
