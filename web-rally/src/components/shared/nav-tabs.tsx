import { Link, useLocation } from "react-router-dom";
import { BloodyButton } from "../themes/bloody";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";
import { useUserStore } from "@/stores/useUserStore";
import { useState } from "react";
import { Menu, X } from "lucide-react";

type NavTabsProps = ComponentProps<"ul">;

export default function NavTabs({ className, ...props }: NavTabsProps) {
  const location = useLocation();
  const { scopes } = useUserStore((state) => state);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Check if user has admin/manager privileges
  const isAdminOrManager = scopes !== undefined && 
    (scopes.includes("admin") || scopes.includes("manager-rally"));
  
  // Check if user has staff privileges
  const isStaff = scopes !== undefined && scopes.includes("rally-staff");
  
  const navigation = [
    { name: "Pontuação", href: "/scoreboard", show: true },
    { name: "Postos", href: "/postos", show: true },
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
    {
      name: "Avaliação",
      href: "/staff-evaluation",
      show: isStaff || isAdminOrManager,
    },
  ].filter((item) => item.show);

  const NavItems = () => (
    <>
      {navigation.map((item) => (
        <li key={item.name}>
          <Link to={item.href} onClick={() => setIsMobileMenuOpen(false)}>
            <BloodyButton
              blood={location.pathname === item.href}
              variant={location.pathname === item.href ? "default" : "neutral"}
              className="w-full sm:w-auto"
            >
              {item.name}
            </BloodyButton>
          </Link>
        </li>
      ))}
    </>
  );

  return (
    <div className="relative">
      {/* Desktop Navigation */}
      <ul {...props} className={cn("hidden sm:flex gap-3", className)}>
        <NavItems />
      </ul>

      {/* Mobile Navigation */}
      <div className="sm:hidden">
        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="flex items-center justify-center w-full p-3 rounded-lg bg-[rgb(255,255,255,0.1)] border border-[rgb(255,255,255,0.2)] text-white hover:bg-[rgb(255,255,255,0.2)] transition-colors"
        >
          <Menu className="w-5 h-5 mr-2" />
          <span className="font-medium">Menu</span>
        </button>

        {/* Mobile Menu Dropdown */}
        {isMobileMenuOpen && (
          <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-[rgb(0,0,0,0.9)] border border-[rgb(255,255,255,0.2)] rounded-lg shadow-lg">
            <div className="p-2">
              <div className="flex items-center justify-between p-2 mb-2">
                <span className="text-white font-medium">Navigation</span>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-white hover:text-red-400 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ul className="space-y-1">
                <NavItems />
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
