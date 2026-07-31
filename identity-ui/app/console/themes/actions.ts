"use server";

import { revalidatePath } from "next/cache";

import { rollbackTheme, updateTheme } from "@/adapters/theme-service";
import type { Theme } from "@/themes/types";

export async function updateThemeAction(formData: FormData): Promise<void> {
  const get = (name: string) => String(formData.get(name) ?? "");

  const theme: Theme = {
    colors: {
      accent: get("colors_accent"),
      accentForeground: get("colors_accentForeground"),
      background: get("colors_background"),
      border: get("colors_border"),
      foreground: get("colors_foreground"),
    },
    companyName: get("companyName"),
    favicon: get("favicon"),
    footer: { links: [], text: get("footer_text") },
    logo: { alt: get("logo_alt"), src: get("logo_src") },
    productName: get("productName"),
    typography: { fontFamily: get("typography_fontFamily") },
  };

  await updateTheme(theme);
  revalidatePath("/console/themes");
}

export async function rollbackThemeAction(formData: FormData): Promise<void> {
  const versionId = formData.get("version_id");
  if (typeof versionId === "string" && versionId) {
    await rollbackTheme(versionId);
  }
  revalidatePath("/console/themes");
}
