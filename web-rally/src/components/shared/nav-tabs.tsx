import { Link, useLocation } from "react-router-dom";
import { BloodyButton } from "../themes/bloody";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { useUserStore } from "@/stores/useUserStore";

type NavTabsProps = ComponentProps<"ul">;

export default function NavTabs({ className, ...props }: NavTabsProps) {
  const location = useLocation();
  const { scopes } = useUserStore((state) => state);
  
  // Check if user has admin/manager privileges
  const isAdminOrManager = scopes !== undefined && 
    (scopes.includes("admin") || scopes.includes("manager-rally"));
  
  const navigation = [
    { name: "Pontuação", href: "/scoreboard", show: true },
    { name: "Postos", href: "/postos", show: true },
    { name: "Equipas", href: "/teams", show: true },
    {
      name: "Admin",
      href: "/admin",
      show: isAdminOrManager,
    },
    {
      name: "Atribuições",
      href: "/assignment",
      show: isAdminOrManager,
    },
    {
      name: "Versus",
      href: "/versus",
      show: isAdminOrManager,
    },
    {
      name: "Membros",
      href: "/team-members",
      show: isAdminOrManager,
    },
    {
      name: "Configurações",
      href: "/settings",
      show: isAdminOrManager,
    },
  ].filter((item) => item.show);
  return (
    <ul {...props} className={cn("flex gap-3", className)}>
      {navigation.map((item) => (
        <li key={item.name}>
          <Link to={item.href}>
            <BloodyButton
              blood={location.pathname === item.href}
              variant={location.pathname === item.href ? "default" : "neutral"}
            >
              {item.name}
            </BloodyButton>
          </Link>
        </li>
      ))}
    </ul>
  );
}
