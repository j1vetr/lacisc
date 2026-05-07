import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Komut paletini aç" },
  { keys: ["Ctrl", "K"], label: "Komut paletini aç (Windows/Linux)" },
  { keys: ["?"], label: "Bu yardım penceresini aç" },
  { keys: ["G", "P"], label: "Panel'e git" },
  { keys: ["G", "T"], label: "Terminaller'e git" },
  { keys: ["G", "S"], label: "Senkronizasyon Kayıtları'na git" },
  { keys: ["Esc"], label: "Açık pencereyi kapat" },
];

interface ShortcutsHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsHelp({ open, onOpenChange }: ShortcutsHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl max-w-md">
        <DialogHeader>
          <DialogTitle>Klavye Kısayolları</DialogTitle>
          <DialogDescription>
            Hızlı navigasyon için kullanabileceğiniz tuş kombinasyonları.
          </DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-border -mx-6">
          {SHORTCUTS.map((s) => (
            <div
              key={s.label}
              className="flex items-center justify-between py-2.5 px-6 text-sm"
            >
              <span className="text-foreground">{s.label}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((k, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="text-muted-foreground text-xs px-0.5">+</span>}
                    <kbd className="inline-flex items-center justify-center min-w-[1.75rem] h-7 px-1.5 rounded-md border border-border bg-secondary font-mono text-[11px] text-foreground">
                      {k}
                    </kbd>
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
