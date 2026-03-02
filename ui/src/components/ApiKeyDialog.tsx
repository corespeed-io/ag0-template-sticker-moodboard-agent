import { useState, useEffect } from "react";
import { KeyIcon, ExternalLinkIcon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function ApiKeyDialog({ open, onClose, onSaved }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [currentPreview, setCurrentPreview] = useState<string | null>(null);

  // Load current config on open
  useEffect(() => {
    if (!open) return;
    setSuccess(false);
    setError(null);
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        setCurrentPreview(data.apiKeyPreview ?? null);
      })
      .catch(() => {});
  }, [open]);

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setError("Please enter an API key");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ falApiKey: apiKey.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      setSuccess(true);
      setApiKey("");
      onSaved();

      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl shadow-2xl w-full max-w-md border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-6 pb-2">
          <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10">
            <KeyIcon className="size-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">fal.ai API Key</h2>
            <p className="text-xs text-muted-foreground">
              Required for sticker generation (Nano Banana 2)
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {currentPreview && (
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              Current key: <span className="font-mono">{currentPreview}</span>
            </div>
          )}

          <div>
            <label className="text-sm font-medium mb-1.5 block">
              API Key
            </label>
            <Input
              type="password"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              autoFocus
            />
          </div>

          <a
            href="https://fal.ai/dashboard/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ExternalLinkIcon className="size-3.5" />
            Get your API key from fal.ai Dashboard
          </a>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2">
              <CheckIcon className="size-4" />
              API key saved successfully!
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 pb-6 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || success}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
