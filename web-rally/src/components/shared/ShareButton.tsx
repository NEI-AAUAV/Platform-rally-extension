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
    const shareUrl = url ?? window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl });
        return;
      } catch {
        // User dismissed the sheet, or share failed — fall through to copy.
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
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleShare}
      className="gap-1.5"
    >
      {copied ? (
        <Check className="h-4 w-4" />
      ) : (
        <Share2 className="h-4 w-4" />
      )}
      {copied ? "Copiado" : label}
    </Button>
  );
}
