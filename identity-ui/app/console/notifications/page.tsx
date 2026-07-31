import type { ReactNode } from "react";

import { courierAdmin } from "@/adapters/admin";
import { listTemplates, type NotificationTemplate } from "@/adapters/notification-service";
import { listAuditEvents } from "@/adapters/audit-service";
import { Badge } from "@/components/vendor/ui/badge";
import { Button } from "@/components/vendor/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/vendor/ui/card";
import { Field, FieldLabel } from "@/components/vendor/ui/field";
import { Input } from "@/components/vendor/ui/input";
import { PageHeader } from "../page.header";
import { sendTestNotificationAction, updateTemplateAction } from "./actions";

const VARIABLE_PATTERN = /\{\{\s*\.(\w+)/g;

function extractVariables(templates: NotificationTemplate[]): Map<string, Set<string>> {
  const byFlow = new Map<string, Set<string>>();
  for (const template of templates) {
    const vars = byFlow.get(template.flow) ?? new Set<string>();
    for (const match of template.content.matchAll(VARIABLE_PATTERN)) {
      vars.add(match[1]);
    }
    byFlow.set(template.flow, vars);
  }
  return byFlow;
}

const COURIER_WIRED_FLOWS = new Set(["recovery", "verification"]);

function templateCard(template: NotificationTemplate): ReactNode {
  const isWired = COURIER_WIRED_FLOWS.has(template.flow);
  return (
    <Card className="gap-4" key={template.id}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {template.flow}
          <Badge variant="outline">{template.state}</Badge>
          <Badge variant="outline">{template.kind}</Badge>
          {!isWired ? <Badge variant="destructive">not wired — see note</Badge> : null}
        </CardTitle>
        {!isWired ? (
          <p className="text-muted-foreground text-xs">
            Real, verified limitation: this Kratos version&apos;s <code>courier.templates</code>{" "}
            schema only accepts <code>recovery</code>/<code>verification</code> — an earlier
            attempt to wire <code>login</code>/<code>registration</code> here failed schema
            validation and was removed (see the comment in{" "}
            <code>ory/kratos/config/kratos.yaml.tmpl</code>). Editing this file has no effect on
            real outgoing mail; Kratos falls back to its own built-in default template for this
            flow instead.
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form action={updateTemplateAction} className="flex flex-col gap-2">
          <input name="id" type="hidden" value={template.id} />
          {template.kind === "subject" ? (
            <Input defaultValue={template.content} name="content" />
          ) : (
            <textarea
              className="min-h-32 w-full rounded-xl border border-foreground/20 bg-input/50 px-3 py-2 font-mono text-xs"
              defaultValue={template.content}
              name="content"
            />
          )}
          <Button className="w-fit" size="sm" type="submit">
            Save
          </Button>
        </form>
        {template.kind === "html" ? (
          <details>
            <summary className="cursor-pointer text-muted-foreground text-xs">
              Preview (real HTML bytes — variables like <code>{"{{ .To }}"}</code> render
              literally here; Kratos&apos;s courier substitutes them only at real send time)
            </summary>
            <iframe
              className="mt-2 h-64 w-full rounded border"
              sandbox=""
              srcDoc={template.content}
              title={`${template.id} preview`}
            />
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

// Edits the real .gotmpl files Kratos's own courier reads
// (ory/kratos/email-templates/<flow>/<state>.<kind>.gotmpl) through
// platform/notification-service — no separate copy, no restart needed.
// "Send test email" dispatches a real message through the same path
// registration/recovery/verification emails already use.
export default async function NotificationsPage(): Promise<ReactNode> {
  const [templates, testSendEvents, templateUpdateEvents, courierMessages] = await Promise.all([
    listTemplates(),
    listAuditEvents({ action: "notification.test.send" }),
    listAuditEvents({ action: "notification.template.update" }),
    courierAdmin.listCourierMessages({ pageSize: 50 }).catch(() => []),
  ]);
  const history = [...testSendEvents, ...templateUpdateEvents].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const variablesByFlow = extractVariables(templates);

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader
        description="Email templates Kratos's own courier reads directly — editing here changes the real files, no restart needed. Test email confirms the SMTP path actually works."
        title="Notifications"
      />

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Send test email</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={sendTestNotificationAction}
            className="flex flex-wrap items-end gap-4"
          >
            <Field>
              <FieldLabel htmlFor="recipient">Recipient</FieldLabel>
              <Input id="recipient" name="recipient" required type="email" />
            </Field>
            <Button type="submit">Send</Button>
          </form>
          <p className="mt-2 text-muted-foreground text-sm">
            Check <a className="underline" href="http://localhost:8025" target="_blank">Mailhog</a> for delivery.
          </p>
        </CardContent>
      </Card>

      {templates.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No templates found — is notification-service reachable?
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {templates.map(templateCard)}
        </div>
      )}

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Delivery history</CardTitle>
          <p className="text-muted-foreground text-sm">
            Kratos&apos;s own real courier message log (<code>GET /admin/courier/messages</code>)
            — every self-service registration/recovery/verification email Kratos has actually
            sent, with its real delivery status and send count. Not a separate tracking store.
          </p>
        </CardHeader>
        <CardContent>
          {courierMessages.length === 0 ? (
            <p className="text-muted-foreground text-sm">No courier messages yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {courierMessages.map((message) => (
                <li className="flex items-center justify-between gap-2" key={message.id}>
                  <span className="flex items-center gap-2">
                    <Badge
                      variant={
                        message.status === "sent"
                          ? "outline"
                          : message.status === "abandoned"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {message.status}
                    </Badge>
                    <span>{message.recipient}</span>
                    <span className="text-muted-foreground text-xs">{message.subject}</span>
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {message.send_count}x · {message.created_at.toISOString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Retry failed delivery</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Not implemented: Kratos&apos;s courier admin API is read-only (confirmed via the
            official SDK — <code>CourierApi</code> exposes only <code>list</code>/
            <code>get</code>, no resend/retry method, and no such endpoint exists in Kratos OSS).
            An operator can only trigger a fresh message by re-running the real flow (e.g. asking
            the user to request another recovery code) or using &quot;Send test email&quot; above
            to confirm the SMTP path itself still works.
          </p>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Variables</CardTitle>
          <p className="text-muted-foreground text-sm">
            Extracted live from each flow&apos;s real template files (every <code>{"{{ .X }}"}</code>
            {" "}reference found) — not a hand-maintained list that can drift from the actual
            templates.
          </p>
        </CardHeader>
        <CardContent>
          {variablesByFlow.size === 0 ? (
            <p className="text-muted-foreground text-sm">No templates found.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {Array.from(variablesByFlow.entries()).map(([flow, vars]) => (
                <li key={flow}>
                  <Badge variant="outline">{flow}</Badge>{" "}
                  <span className="font-mono text-xs">
                    {Array.from(vars).map((v) => `{{ .${v} }}`).join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">Localization</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Not implemented: Kratos itself supports locale-specific courier templates via a
            per-locale subdirectory under each flow&apos;s template folder, but this
            platform&apos;s <code>ory/kratos/email-templates/&lt;flow&gt;/</code> directories are
            flat (state.kind.gotmpl only, no locale segment) — a real gap in this repo&apos;s
            current template layout, not an Ory OSS limitation. Adding it would mean extending
            <code> ory/kratos/config/kratos.yaml.tmpl</code>&apos;s courier template paths and
            this page&apos;s template listing to be locale-aware.
          </p>
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
          <p className="text-muted-foreground text-sm">
            Read from platform/audit-service's real event log — the same events recorded on
            every template edit and test send, not a separate delivery-tracking store.
            &quot;Delivered&quot;/&quot;Failed&quot; reflects the real HTTP status the
            downstream email-service returned at send time.
          </p>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground text-sm">No notification activity yet.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {history.map((event) => {
                const statusCode = event.metadata_json.status_code as number | undefined;
                return (
                  <li className="flex items-center justify-between gap-2" key={event.id}>
                    <span className="flex items-center gap-2">
                      <Badge variant="outline">{event.action}</Badge>
                      <span className="font-mono text-xs">{event.resource_id}</span>
                      {statusCode !== undefined ? (
                        <Badge variant={statusCode < 400 ? "outline" : "destructive"}>
                          {statusCode < 400 ? "delivered" : "failed"} ({statusCode})
                        </Badge>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground text-xs">{event.created_at}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
