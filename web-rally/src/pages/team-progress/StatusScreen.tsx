import { Loader2 } from "lucide-react";
import { useThemedComponents } from "@/components/themes/ThemeContext";

type StatusScreenProps = Readonly<{
  variant: "loading" | "error";
  title: string;
  description?: string;
}>;

export default function StatusScreen({ variant, title, description }: StatusScreenProps) {
  const { Card, config, background } = useThemedComponents();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 transition-colors duration-500" style={background}>
      <Card className="text-center max-w-md p-8 backdrop-blur-md bg-black/40 border-white/10">
        {variant === "loading" ? (
          <>
            <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" style={{ color: config?.colors?.primary }} />
            <div className="text-lg font-semibold" style={{ color: config?.colors?.text }}>{title}</div>
          </>
        ) : (
          <>
            <div className="text-lg font-semibold text-red-400 mb-2">{title}</div>
            {description && (
              <div className="opacity-70" style={{ color: config?.colors?.text }}>{description}</div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
