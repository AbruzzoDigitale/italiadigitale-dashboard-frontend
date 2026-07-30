import type { IconName } from "../components/ui/Icon";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif|avif|tiff?)$/i;

/**
 * Icona per un allegato in base al MIME (`content_type`) o, in fallback, all'estensione.
 * Il set icone non ha pdf/video/audio dedicati: le immagini usano "image", tutto il
 * resto "document-text". (Per i collegamenti/link si usa invece resourceIconName/ResourceIcon.)
 */
export function attachmentIconName(contentType?: string | null, filename?: string | null): IconName {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.startsWith("image/")) return "image";
  if (!ct && filename && IMAGE_EXT.test(filename)) return "image";
  return "document-text";
}
