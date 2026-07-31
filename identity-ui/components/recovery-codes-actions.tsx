"use client";

// Download/copy/print for a just-generated set of Kratos recovery codes —
// pure client-side actions over text already rendered server-side; no
// extra request to Kratos needed for any of the three.

import { useState } from "react";

import { Button } from "@/components/vendor/ui/button";

export function RecoveryCodesActions({ codes }: { codes: string[] }): React.ReactNode {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        {copied ? "Copied" : "Copy"}
      </Button>
      <Button
        onClick={() => {
          const blob = new Blob([text], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "recovery-codes.txt";
          a.click();
          URL.revokeObjectURL(url);
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        Download
      </Button>
      <Button
        onClick={() => {
          const win = window.open("", "_blank");
          if (!win) return;
          win.document.write(
            `<pre style="font-family: monospace; font-size: 14px;">${codes.join("\n")}</pre>`,
          );
          win.document.close();
          win.print();
        }}
        size="sm"
        type="button"
        variant="outline"
      >
        Print
      </Button>
    </div>
  );
}
