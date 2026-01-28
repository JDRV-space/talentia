"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ZONES,
  PRIORITY_LEVELS,
  CAPABILITY_LEVELS,
  type Zone,
  type PriorityLevel,
  type CapabilityLevel,
} from "@/types/constants"
import type { Position } from "@/types/database"

// =============================================================================
// FORM SCHEMA
// =============================================================================

const positionFormSchema = z.object({
  title: z
    .string({ message: "El título es requerido" })
    .min(3, { message: "El título debe tener al menos 3 caracteres" })
    .max(255, { message: "El título es muy largo" }),
  zone: z.enum(ZONES, { message: "Seleccione una zona válida" }),
  priority: z.enum(["P1", "P2", "P3"] as const, { message: "Seleccione una prioridad válida" }),
  level: z
    .string({ message: "Seleccione un nivel" })
    .min(1, { message: "Seleccione un nivel válido" }),
  headcount: z
    .number({ message: "Ingrese un número válido" })
    .int({ message: "Debe ser un número entero" })
    .positive({ message: "Debe ser mayor a 0" }),
  description: z.string().max(2000, { message: "Descripción muy larga" }).optional(),
})

type PositionFormData = z.infer<typeof positionFormSchema>

// =============================================================================
// TYPES
// =============================================================================

interface PositionFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: PositionFormData) => void
  initialData?: Partial<Position>
  mode?: "create" | "edit"
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PositionForm({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  mode = "create",
}: PositionFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
    watch,
  } = useForm<PositionFormData>({
    resolver: zodResolver(positionFormSchema),
    defaultValues: {
      title: initialData?.title || "",
      zone: (initialData?.zone as Zone) || undefined,
      priority: (initialData?.priority as PriorityLevel) || undefined,
      level: initialData?.level || "",
      headcount: initialData?.headcount || 1,
      description: initialData?.description || "",
    },
  })

  const selectedZone = watch("zone")
  const selectedPriority = watch("priority")
  const selectedLevel = watch("level")

  // Reset form when dialog closes
  React.useEffect(() => {
    if (!open) {
      reset({
        title: initialData?.title || "",
        zone: (initialData?.zone as Zone) || undefined,
        priority: (initialData?.priority as PriorityLevel) || undefined,
        level: initialData?.level || "",
        headcount: initialData?.headcount || 1,
        description: initialData?.description || "",
      })
    }
  }, [open, reset, initialData])

  const handleFormSubmit = (data: PositionFormData) => {
    onSubmit(data)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Nueva Posición" : "Editar Posición"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Complete los datos para crear una nueva posición de reclutamiento."
              : "Modifique los datos de la posición."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          {/* Título */}
          <div className="space-y-2">
            <Label htmlFor="title">
              Título del Puesto <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="title"
              placeholder="Ej: Operario de Cosecha"
              {...register("title")}
              aria-invalid={!!errors.title}
            />
            {errors.title && (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {errors.title.message}
              </p>
            )}
          </div>

          {/* Zona */}
          <div className="space-y-2">
            <Label htmlFor="zone">
              Zona <span className="text-rose-500">*</span>
            </Label>
            <select
              id="zone"
              className={cn(
                "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "dark:bg-input/30",
                !selectedZone && "text-muted-foreground",
                errors.zone && "border-rose-500 ring-rose-500/20"
              )}
              {...register("zone")}
              aria-invalid={!!errors.zone}
            >
              <option value="" disabled>
                Seleccione una zona
              </option>
              {ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            {errors.zone && (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {errors.zone.message}
              </p>
            )}
          </div>

          {/* Prioridad */}
          <div className="space-y-2">
            <Label htmlFor="priority">
              Prioridad <span className="text-rose-500">*</span>
            </Label>
            <select
              id="priority"
              className={cn(
                "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "dark:bg-input/30",
                !selectedPriority && "text-muted-foreground",
                errors.priority && "border-rose-500 ring-rose-500/20"
              )}
              {...register("priority")}
              aria-invalid={!!errors.priority}
            >
              <option value="" disabled>
                Seleccione una prioridad
              </option>
              {(Object.keys(PRIORITY_LEVELS) as PriorityLevel[]).map((key) => (
                <option key={key} value={key}>
                  {PRIORITY_LEVELS[key].label} - {PRIORITY_LEVELS[key].sla_days} días
                </option>
              ))}
            </select>
            {errors.priority && (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {errors.priority.message}
              </p>
            )}
            {selectedPriority && (
              <p className="text-xs text-muted-foreground">
                SLA: {PRIORITY_LEVELS[selectedPriority].sla_days} días para cubrir la posición
              </p>
            )}
          </div>

          {/* Nivel del Puesto */}
          <div className="space-y-2">
            <Label htmlFor="level">
              Nivel del Puesto <span className="text-rose-500">*</span>
            </Label>
            <select
              id="level"
              className={cn(
                "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "dark:bg-input/30",
                !selectedLevel && "text-muted-foreground",
                errors.level && "border-rose-500 ring-rose-500/20"
              )}
              {...register("level")}
              aria-invalid={!!errors.level}
            >
              <option value="" disabled>
                Seleccione un nivel
              </option>
              {(Object.keys(CAPABILITY_LEVELS) as unknown as CapabilityLevel[]).map((key) => (
                <option key={key} value={CAPABILITY_LEVELS[key].label.toLowerCase()}>
                  {CAPABILITY_LEVELS[key].label} - {CAPABILITY_LEVELS[key].description}
                </option>
              ))}
            </select>
            {errors.level && (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {errors.level.message}
              </p>
            )}
          </div>

          {/* Cantidad */}
          <div className="space-y-2">
            <Label htmlFor="headcount">
              Cantidad de Vacantes <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="headcount"
              type="number"
              min={1}
              placeholder="1"
              {...register("headcount", { valueAsNumber: true })}
              aria-invalid={!!errors.headcount}
            />
            {errors.headcount && (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {errors.headcount.message}
              </p>
            )}
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <Label htmlFor="description">Descripción (Opcional)</Label>
            <textarea
              id="description"
              rows={3}
              placeholder="Descripción del puesto, requisitos, etc."
              className={cn(
                "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "dark:bg-input/30",
                "resize-none",
                errors.description && "border-rose-500 ring-rose-500/20"
              )}
              {...register("description")}
              aria-invalid={!!errors.description}
            />
            {errors.description && (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {errors.description.message}
              </p>
            )}
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {isSubmitting
                ? "Guardando..."
                : mode === "create"
                ? "Crear Posición"
                : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { positionFormSchema }
export type { PositionFormData }
