"use client";

import { PrinterIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STORAGE_KEY = "tsqa:report-notes";

interface StoredReportNotes {
  notes: string;
  conclusions: string;
}

function isStoredReportNotes(value: unknown): value is StoredReportNotes {
  if (typeof value !== "object" || value === null) return false;
  return (
    "notes" in value &&
    typeof value.notes === "string" &&
    "conclusions" in value &&
    typeof value.conclusions === "string"
  );
}

/**
 * QA observations and conclusions (spec section 19, items 13 and 15).
 *
 * Kept in localStorage so a draft survives a reload while the operator works
 * through the data. It is a convenience, not storage: nothing here is
 * evidence, and the printed PDF is what gets kept.
 */
export function ReportNotes() {
  const [notes, setNotes] = useState("");
  const [conclusions, setConclusions] = useState("");
  const [mounted, setMounted] = useState(false);

  // Read after mount: localStorage does not exist on the server, and seeding
  // state from it during render would break hydration.
  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isStoredReportNotes(parsed)) {
          setNotes(parsed.notes);
          setConclusions(parsed.conclusions);
        }
      }
    } catch {
      // A blocked or corrupt store is not worth interrupting the operator for.
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ notes, conclusions }));
    } catch {
      // Ignore: private browsing and full quotas both land here.
    }
  }, [notes, conclusions, mounted]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-2 print:hidden">
        <Label htmlFor="qa-notes">Observaciones de QA</Label>
        <Textarea
          id="qa-notes"
          rows={4}
          placeholder="Qué se probó, con qué configuración, qué se observó."
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      <div className="grid gap-2 print:hidden">
        <Label htmlFor="qa-conclusions">Conclusiones</Label>
        <Textarea
          id="qa-conclusions"
          rows={4}
          placeholder="Veredicto de la prueba y acciones pendientes."
          value={conclusions}
          onChange={(event) => setConclusions(event.target.value)}
        />
      </div>

      <Button className="print:hidden" onClick={() => window.print()}>
        <PrinterIcon />
        Imprimir o guardar como PDF
      </Button>

      <div className="hidden gap-5 print:grid">
        <section>
          <h3 className="font-semibold">Observaciones de QA</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm">
            {notes || "Sin observaciones registradas."}
          </p>
        </section>
        <section>
          <h3 className="font-semibold">Conclusiones</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm">
            {conclusions || "Sin conclusiones registradas."}
          </p>
        </section>
      </div>
    </div>
  );
}
