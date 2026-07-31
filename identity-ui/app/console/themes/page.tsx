import type { ReactNode } from "react";

import { getTheme, getThemeVersion, listThemeHistory, type ThemeVersion } from "@/adapters/theme-service";
import { Badge } from "@/components/vendor/ui/badge";
import { Button } from "@/components/vendor/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/vendor/ui/card";
import { ConfirmSubmitButton } from "@/components/vendor/ui/confirm-submit-button";
import { Field, FieldLabel } from "@/components/vendor/ui/field";
import { Input } from "@/components/vendor/ui/input";
import type { Theme } from "@/themes/types";
import { PageHeader } from "../page.header";
import { rollbackThemeAction, updateThemeAction } from "./actions";

function swatch(color: string): ReactNode {
  return (
    <span
      className="inline-block h-4 w-4 shrink-0 rounded border border-foreground/20 align-middle"
      style={{ backgroundColor: color }}
      title={color}
    />
  );
}

function versionCompareRow(label: string, current: string, historical: string): ReactNode {
  const changed = current !== historical;
  return (
    <li className="flex items-center justify-between gap-4 text-xs" key={label}>
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <span className={changed ? "text-destructive" : ""}>{historical}</span>
        {changed ? (
          <>
            <span className="text-muted-foreground">→</span>
            <span>{current}</span>
          </>
        ) : null}
      </span>
    </li>
  );
}

async function versionCard(version: ThemeVersion, current: Theme): Promise<ReactNode> {
  const historical = await getThemeVersion(version.id);
  return (
    <li className="flex flex-col gap-2 border-b py-3 last:border-b-0" key={version.id}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm">
          <Badge variant="outline">{version.id}</Badge>
          <span className="text-muted-foreground text-xs">{version.created_at}</span>
        </span>
        <form action={rollbackThemeAction}>
          <ConfirmSubmitButton
            description="This overwrites config/themes/neobim.yaml with this prior snapshot. Requires an identity-ui restart to take effect, same as any other theme save."
            name="version_id"
            title="Roll back to this version?"
            value={version.id}
            variant="outline"
          >
            Rollback
          </ConfirmSubmitButton>
        </form>
      </div>
      {historical ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Compare with current (changed fields shown in red)
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {versionCompareRow("Product name", current.productName, historical.productName)}
            {versionCompareRow("Company name", current.companyName, historical.companyName)}
            {versionCompareRow("Background", current.colors.background, historical.colors.background)}
            {versionCompareRow("Foreground", current.colors.foreground, historical.colors.foreground)}
            {versionCompareRow("Accent", current.colors.accent, historical.colors.accent)}
            {versionCompareRow("Font family", current.typography.fontFamily, historical.typography.fontFamily)}
          </ul>
        </details>
      ) : (
        <p className="text-destructive text-xs">Could not load this version&apos;s content.</p>
      )}
    </li>
  );
}

// Edits config/themes/neobim.yaml through platform/console-api's
// GET/PUT /api/v1/theme — the same file identity-ui/themes/load-theme.ts
// reads at request time. A save here does NOT take effect immediately:
// load-theme.ts caches the parsed theme for the life of the Node process,
// so an operator needs to restart identity-ui to see it (same tradeoff as
// Identity Providers — Kratos needs a restart for the same reason).
export default async function ThemesPage(): Promise<ReactNode> {
  const [theme, history] = await Promise.all([getTheme(), listThemeHistory()]);

  if (!theme) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-6">
        <PageHeader description="Theme configuration." title="Themes" />
        <p className="text-muted-foreground text-sm">
          Could not load the theme — is console-api reachable?
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description="Branding for the User Portal and Admin Portal, stored in config/themes/neobim.yaml. Saving requires an identity-ui restart to take effect (the running process caches the parsed theme)."
        title="Themes"
      />

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Brand</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateThemeAction} className="flex w-full min-w-0 flex-col gap-6">
            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="productName">Product name</FieldLabel>
                <Input defaultValue={theme.productName} id="productName" name="productName" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="companyName">Company name</FieldLabel>
                <Input defaultValue={theme.companyName} id="companyName" name="companyName" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="logo_src">Logo path</FieldLabel>
                <Input defaultValue={theme.logo.src} id="logo_src" name="logo_src" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="logo_alt">Logo alt text</FieldLabel>
                <Input defaultValue={theme.logo.alt} id="logo_alt" name="logo_alt" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="favicon">Favicon path</FieldLabel>
                <Input defaultValue={theme.favicon} id="favicon" name="favicon" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="footer_text">Footer text</FieldLabel>
                <Input defaultValue={theme.footer.text} id="footer_text" name="footer_text" required />
              </Field>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="font-semibold text-sm">Colors</h2>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                <Field>
                  <FieldLabel htmlFor="colors_background">Background</FieldLabel>
                  <span className="flex items-center gap-2">
                    {swatch(theme.colors.background)}
                    <Input
                      defaultValue={theme.colors.background}
                      id="colors_background"
                      name="colors_background"
                      required
                    />
                  </span>
                </Field>
                <Field>
                  <FieldLabel htmlFor="colors_foreground">Foreground</FieldLabel>
                  <span className="flex items-center gap-2">
                    {swatch(theme.colors.foreground)}
                    <Input
                      defaultValue={theme.colors.foreground}
                      id="colors_foreground"
                      name="colors_foreground"
                      required
                    />
                  </span>
                </Field>
                <Field>
                  <FieldLabel htmlFor="colors_accent">Accent</FieldLabel>
                  <span className="flex items-center gap-2">
                    {swatch(theme.colors.accent)}
                    <Input
                      defaultValue={theme.colors.accent}
                      id="colors_accent"
                      name="colors_accent"
                      required
                    />
                  </span>
                </Field>
                <Field>
                  <FieldLabel htmlFor="colors_accentForeground">Accent foreground</FieldLabel>
                  <span className="flex items-center gap-2">
                    {swatch(theme.colors.accentForeground)}
                    <Input
                      defaultValue={theme.colors.accentForeground}
                      id="colors_accentForeground"
                      name="colors_accentForeground"
                      required
                    />
                  </span>
                </Field>
                <Field>
                  <FieldLabel htmlFor="colors_border">Border</FieldLabel>
                  <span className="flex items-center gap-2">
                    {swatch(theme.colors.border)}
                    <Input
                      defaultValue={theme.colors.border}
                      id="colors_border"
                      name="colors_border"
                      required
                    />
                  </span>
                </Field>
              </div>
            </div>

            <Field>
              <FieldLabel htmlFor="typography_fontFamily">Font family</FieldLabel>
              <Input
                defaultValue={theme.typography.fontFamily}
                id="typography_fontFamily"
                name="typography_fontFamily"
                required
              />
            </Field>

            <Button className="w-fit" type="submit">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Export</CardTitle>
        </CardHeader>
        <CardContent>
          <a
            className="inline-flex h-9 items-center justify-center rounded-3xl border border-foreground/20 bg-input/50 px-4 text-sm hover:bg-muted"
            download="neobim-theme.json"
            href={`data:application/json,${encodeURIComponent(JSON.stringify(theme, null, 2))}`}
          >
            Download current theme (JSON)
          </a>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Version history</CardTitle>
          <p className="text-muted-foreground text-sm">
            Every save snapshots the previous config/themes/neobim.yaml first — these are real
            prior file contents, restorable with Rollback.
          </p>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground text-sm">No prior versions yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">{await Promise.all(history.map((v) => versionCard(v, theme)))}</ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
