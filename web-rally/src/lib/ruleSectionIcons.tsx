/**
 * Icon set for admin-authored /rules sections. Keys must match the backend
 * allowlist (app.schemas.rally_settings.RULE_SECTION_ICONS) exactly — an
 * icon key that isn't in both places either can't be picked in the admin
 * editor or won't render on the public page.
 */
import {
  AlertTriangle,
  Award,
  Ban,
  CheckCircle,
  Clock,
  Flag,
  HelpCircle,
  Info,
  MapPin,
  MessageCircle,
  QrCode,
  Shield,
  Star,
  Swords,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

export const RULE_SECTION_ICON_MAP: Record<string, LucideIcon> = {
  HelpCircle,
  MapPin,
  Trophy,
  Swords,
  Award,
  QrCode,
  Info,
  Clock,
  Shield,
  Star,
  Flag,
  Users,
  MessageCircle,
  AlertTriangle,
  CheckCircle,
  Ban,
};

export const DEFAULT_RULE_SECTION_ICON = "HelpCircle";

export const RULE_SECTION_ICON_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "HelpCircle", label: "Ajuda" },
  { value: "MapPin", label: "Localização" },
  { value: "Trophy", label: "Troféu" },
  { value: "Swords", label: "Versus" },
  { value: "Award", label: "Distintivo" },
  { value: "QrCode", label: "QR Code" },
  { value: "Info", label: "Informação" },
  { value: "Clock", label: "Tempo" },
  { value: "Shield", label: "Segurança" },
  { value: "Star", label: "Destaque" },
  { value: "Flag", label: "Meta" },
  { value: "Users", label: "Equipas" },
  { value: "MessageCircle", label: "Contacto" },
  { value: "AlertTriangle", label: "Aviso" },
  { value: "CheckCircle", label: "Confirmação" },
  { value: "Ban", label: "Proibido" },
];

export function ruleSectionIcon(icon: string | null | undefined): LucideIcon {
  return (icon && RULE_SECTION_ICON_MAP[icon]) || RULE_SECTION_ICON_MAP[DEFAULT_RULE_SECTION_ICON]!;
}
