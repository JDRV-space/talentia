"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { motion, AnimatePresence } from "framer-motion"
import {
  LayoutDashboard,
  UserCheck,
  Upload,
  ChevronUp,
  LogOut,
  User,
  Calendar,
  ClipboardList,
  Copy,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

const navigationItems = [
  {
    title: "Panel",
    url: "/panel",
    icon: LayoutDashboard,
  },
  {
    title: "Reclutadores",
    url: "/reclutadores",
    icon: UserCheck,
  },
  {
    title: "Asignaciones",
    url: "/asignaciones",
    icon: ClipboardList,
  },
  {
    title: "Duplicados",
    url: "/duplicados",
    icon: Copy,
  },
  {
    title: "Campañas",
    url: "/campanas",
    icon: Calendar,
  },
  {
    title: "Subir Excel",
    url: "/subir",
    icon: Upload,
  },
  // ==========================================================================
  // HIDDEN PAGES - Simplified for 600 PEN budget (Jan 2026)
  // These pages still exist but are hidden from navigation
  // To restore: uncomment the items below
  // ==========================================================================
  // {
  //   title: "Posiciones",
  //   url: "/posiciones",
  //   icon: Briefcase,
  // },
  // {
  //   title: "Candidatos",
  //   url: "/candidatos",
  //   icon: Users,
  // },
  // {
  //   title: "Pronostico",
  //   url: "/pronostico",
  //   icon: TrendingUp,
  // },
  // {
  //   title: "Configuración",
  //   url: "/configuracion",
  //   icon: Settings,
  // },
]

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <span className="text-lg font-semibold text-sidebar-foreground">
          TALENTIA
        </span>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item, index) => {
                const isActive = pathname === item.url
                return (
                  <SidebarMenuItem key={item.title}>
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: index * 0.03 }}
                      className="relative"
                    >
                      {/* Active indicator bar */}
                      <AnimatePresence>
                        {isActive && (
                          <motion.div
                            layoutId="activeIndicator"
                            className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-teal-600"
                            initial={{ opacity: 0, scaleY: 0 }}
                            animate={{ opacity: 1, scaleY: 1 }}
                            exit={{ opacity: 0, scaleY: 0 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                          />
                        )}
                      </AnimatePresence>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                        className={cn(
                          "transition-all duration-200 ease-out",
                          isActive && "pl-3"
                        )}
                      >
                        <Link href={item.url}>
                          <item.icon className={cn(
                            "size-4 transition-colors duration-200",
                            isActive && "text-teal-600"
                          )} />
                          <span className={cn(
                            "transition-colors duration-200",
                            isActive && "font-medium"
                          )}>
                            {item.title}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </motion.div>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <User className="size-4" />
                  </div>
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="font-medium">Hola, Admin</span>
                    <span className="text-xs text-muted-foreground">
                      Administrador
                    </span>
                  </div>
                  <ChevronUp className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
                side="top"
                align="start"
                sideOffset={4}
              >
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 size-4" />
                  <span>Cerrar sesión</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
