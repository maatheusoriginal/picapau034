import type { SettingsConfig } from "./types";

export const MAX_LOGO_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_LOGO_DATA_LENGTH = 240_000;
const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Only embedded raster images reach either the preview or a print document. */
export function safeLogoDataUrl(value: unknown): string {
  return typeof value === "string" && value.length <= MAX_LOGO_DATA_LENGTH
    && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : "";
}

export function logoWidthMm(value: unknown, format = "Cupom 80mm"): number {
  const width = Number(value);
  const maximum = format.includes("58") ? 50 : 64;
  return Math.min(maximum, Math.max(20, Number.isFinite(width) && width > 0 ? width : 44));
}

export function logoForFormat(settings: Partial<SettingsConfig> | null, format: string): string {
  const enabled = format.toLowerCase().includes("a4") ? settings?.logoOnA4 !== false : settings?.logoOnThermal !== false;
  return enabled ? safeLogoDataUrl(settings?.logoDataUrl) : "";
}

/** Resize and re-encode locally before saving; no original file is uploaded. */
export async function prepareLogo(file: File): Promise<string> {
  if (!allowedTypes.has(file.type)) throw new Error("Escolha uma imagem PNG, JPG ou WebP.");
  if (!file.size || file.size > MAX_LOGO_FILE_BYTES) throw new Error("Escolha uma imagem de até 5 MB.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const source = new Image();
    await new Promise<void>((resolve, reject) => {
      source.onload = () => resolve();
      source.onerror = () => reject(new Error("Não foi possível abrir a imagem. Tente outro arquivo."));
      source.src = objectUrl;
    });
    if (!source.naturalWidth || !source.naturalHeight || source.naturalWidth * source.naturalHeight > 40_000_000) {
      throw new Error("A imagem é muito grande. Exporte uma versão menor da logomarca.");
    }
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a imagem neste navegador.");
    const scale = Math.min(1, 800 / source.naturalWidth, 400 / source.naturalHeight);
    for (let attempt = 0; attempt < 5; attempt++) {
      canvas.width = Math.max(1, Math.round(source.naturalWidth * scale * 0.75 ** attempt));
      canvas.height = Math.max(1, Math.round(source.naturalHeight * scale * 0.75 ** attempt));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      if (safeLogoDataUrl(dataUrl)) return dataUrl;
    }
    throw new Error("Não foi possível reduzir esta imagem. Tente uma logomarca mais simples.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
