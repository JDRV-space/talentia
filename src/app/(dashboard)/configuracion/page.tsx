import { Header } from "@/components/layout/header"
import { Settings, Bell, Users, Palette, Shield, Database } from "lucide-react"

export default function ConfiguracionPage() {
  return (
    <>
      <Header title="Configuración" />
      <div className="flex flex-1 flex-col gap-6 p-4">
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-2xl font-semibold text-card-foreground">
            Configuración del Sistema
          </h2>
          <p className="mt-2 text-muted-foreground">
            Ajusta las preferencias y configuraciones del sistema de reclutamiento
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* General Settings */}
          <div className="rounded-lg border bg-card p-4 hover:border-teal-600 transition-colors cursor-pointer">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-teal-100 p-2 dark:bg-teal-900/30">
                <Settings className="h-5 w-5 text-teal-600" />
              </div>
              <div>
                <h3 className="font-medium text-card-foreground">General</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Configuración general del sistema
                </p>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="rounded-lg border bg-card p-4 hover:border-teal-600 transition-colors cursor-pointer">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
                <Bell className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-medium text-card-foreground">Notificaciones</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Alertas y recordatorios
                </p>
              </div>
            </div>
          </div>

          {/* Team */}
          <div className="rounded-lg border bg-card p-4 hover:border-teal-600 transition-colors cursor-pointer">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-sky-100 p-2 dark:bg-sky-900/30">
                <Users className="h-5 w-5 text-sky-600" />
              </div>
              <div>
                <h3 className="font-medium text-card-foreground">Equipo</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Gestión de usuarios y permisos
                </p>
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div className="rounded-lg border bg-card p-4 hover:border-teal-600 transition-colors cursor-pointer">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-rose-100 p-2 dark:bg-rose-900/30">
                <Palette className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-medium text-card-foreground">Apariencia</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tema y personalización visual
                </p>
              </div>
            </div>
          </div>

          {/* Security */}
          <div className="rounded-lg border bg-card p-4 hover:border-teal-600 transition-colors cursor-pointer">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-lime-100 p-2 dark:bg-lime-900/30">
                <Shield className="h-5 w-5 text-lime-600" />
              </div>
              <div>
                <h3 className="font-medium text-card-foreground">Seguridad</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Contraseña y autenticación
                </p>
              </div>
            </div>
          </div>

          {/* Data */}
          <div className="rounded-lg border bg-card p-4 hover:border-teal-600 transition-colors cursor-pointer">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-stone-100 p-2 dark:bg-stone-800">
                <Database className="h-5 w-5 text-stone-600 dark:text-stone-400" />
              </div>
              <div>
                <h3 className="font-medium text-card-foreground">Datos</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Exportar e importar datos
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* SLA Configuration Preview */}
        <div className="rounded-lg border bg-card p-6">
          <h3 className="font-semibold text-card-foreground mb-4">
            Configuración de SLA
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 p-4 border border-rose-200 dark:border-rose-800">
              <p className="text-sm font-medium text-rose-700 dark:text-rose-300">Prioridad 1 (P1)</p>
              <p className="text-2xl font-bold text-rose-600">3 días</p>
              <p className="text-xs text-muted-foreground mt-1">Urgente - Crítico</p>
            </div>
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-4 border border-amber-200 dark:border-amber-800">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Prioridad 2 (P2)</p>
              <p className="text-2xl font-bold text-amber-600">7 días</p>
              <p className="text-xs text-muted-foreground mt-1">Alta prioridad</p>
            </div>
            <div className="rounded-lg bg-stone-50 dark:bg-stone-900 p-4 border border-stone-200 dark:border-stone-700">
              <p className="text-sm font-medium text-stone-700 dark:text-stone-300">Prioridad 3 (P3)</p>
              <p className="text-2xl font-bold text-stone-600 dark:text-stone-400">14 días</p>
              <p className="text-xs text-muted-foreground mt-1">Normal</p>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
