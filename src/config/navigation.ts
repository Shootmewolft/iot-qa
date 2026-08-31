import type { LucideIcon } from "lucide-react";
import {
  DatabaseIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  SettingsIcon,
  UploadIcon,
  Wand2Icon,
  WrenchIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Phase that will deliver this screen. Absent once it exists. */
  pendingPhase?: number;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

/**
 * Application navigation, mirroring the route map in the MVP spec (section 9).
 * Route segments stay in Spanish because they are part of the product surface.
 */
export const navigation: NavGroup[] = [
  {
    title: "Panel",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboardIcon,
      },
    ],
  },
  {
    title: "Datos",
    items: [
      {
        title: "Datasets",
        href: "/datasets",
        icon: DatabaseIcon,
      },
      { title: "Generar", href: "/datasets/generar", icon: Wand2Icon },
      {
        title: "Importar",
        href: "/datasets/importar",
        icon: UploadIcon,
      },
    ],
  },
  {
    title: "Operación",
    items: [
      {
        title: "Trabajos",
        href: "/trabajos",
        icon: ListChecksIcon,
      },
      {
        title: "Reportes",
        href: "/reportes",
        icon: FileTextIcon,
      },
    ],
  },
  {
    title: "Sistema",
    items: [
      {
        title: "Mantenimiento",
        href: "/mantenimiento",
        icon: WrenchIcon,
      },
      { title: "Configuración", href: "/configuracion", icon: SettingsIcon },
    ],
  },
];
