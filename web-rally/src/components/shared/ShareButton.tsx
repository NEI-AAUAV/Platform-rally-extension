import { useState } from "react";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppToast } from "@/hooks/use-toast";

interface ShareButtonProps {
  /** Title used by the native share sheet (falls back to the page title). */
  readonly title: string;
  /** URL to share; defaults to the current page. */
  readonly url?: string;
  /** Optional longer label; defaults to "Partilhar". */
  readonly label?: string;
}

/**
 * Share the current page via the Web Share API, falling back to copying the
 * link to the clipboard. Gives visual + toast feedback either way.
 */
export function ShareButton({ title, url, label = "Partilhar" }: ShareButtonProps) {
  const toast = useAppToast();
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const shareUrl = url ?? globalThis.location.href;

    const shareData = { title, url: shareUrl };
    // canShare rejects payloads the platform cannot handle, which `share`
    // itself would only surface as a thrown error after the tap. Optional
    // because Safari shipped `share` before `canShare`.
    const canShare =
      typeof navigator.share === "function" && (navigator.canShare?.(shareData) ?? true);

    if (canShare) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        // Dismissing the Android share sheet rejects with AbortError. Falling
        // through would copy the link and toast "copiado" for a share the user
        // just cancelled, so treat it as done. Any other error still falls back.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Link copiado para a área de transferência");
      globalThis.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível partilhar o link");
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleShare} className="gap-1.5">
      {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
      {copied ? "Copiado" : label}
    </Button>
  );
}
