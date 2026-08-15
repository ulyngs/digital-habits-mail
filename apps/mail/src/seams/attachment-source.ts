/**
 * Attachments, for a build with no server.
 *
 * `<img src="/api/mail/attachment?…">` is the browser fetching that URL by
 * itself, and nothing here answers it. The bytes have to be read through the
 * transport, which reaches the mail core and Gmail, and then handed to the
 * page as a `blob:` URL.
 *
 * Saving works the same way: the webview has no downloads folder, so the bytes
 * go to Rust, which writes them where the user keeps their files.
 */

import { toast } from "sonner";

import { mailApiFetch } from "@/lib/mail/api";
import type { AttachmentSource } from "@/lib/mail/host/contracts";
import { bytesToBase64 } from "@/lib/base64";
import { tauriInvoke } from "@/lib/mail/store/tauri";

/** Nothing is available until the bytes are read, so the caller has to wait. */
export function attachmentSourceNow(_path: string): string | null {
  return null;
}

/** Read the attachment through the transport, and keep it as a blob URL. */
export async function openAttachmentSource(
  path: string
): Promise<AttachmentSource> {
  const res = await mailApiFetch(path);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Couldn't read the attachment (${res.status})`);
  }
  const url = URL.createObjectURL(await res.blob());
  return {
    url,
    // A blob URL holds its bytes until this runs. Without it, every attachment
    // ever shown stays in memory for the life of the window.
    release: () => URL.revokeObjectURL(url),
  };
}

/** A webview has no downloads folder, so this host writes the file itself. */
export const hostSavesAttachments = true;

export async function saveAttachment(input: {
  path: string;
  filename: string;
  open?: boolean;
}): Promise<void> {
  const invoke = tauriInvoke();
  if (!invoke) throw new Error("Saving a file needs the desktop app");

  const res = await mailApiFetch(input.path);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `Couldn't read the attachment (${res.status})`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());

  const saved = (await invoke("save_attachment", {
    filename: input.filename,
    // Base64 because the bridge carries JSON. An attachment is at most 25 MB,
    // which Gmail will not exceed, so this stays a copy and not a problem.
    contentBase64: bytesToBase64(bytes),
    open: input.open === true,
  })) as string;

  // Opening the file says where it went by itself. Saving does not, and Rust
  // may have renamed it to avoid replacing something, so name what it wrote.
  if (!input.open) toast.success(`Saved ${fileName(saved)} to ${folder(saved)}`);
}

/** The last segment of a path, and the one before it. */
function fileName(path: string): string {
  return path.split("/").pop() || path;
}

function folder(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 2] || "your files";
}
