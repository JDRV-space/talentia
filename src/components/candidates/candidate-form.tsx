"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { Loader2 } from "lucide-react"

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
import { DuplicateResolutionPanel } from "./duplicate-resolution-panel"
import type { Candidate } from "@/types/database"
import type {
  DuplicateDisplayInfo,
  DuplicateResolutionAction,
  ResolveDuplicateResponse,
} from "@/types/dedup"
import { normalizePhoneNumber } from "@/types/schemas"

// =============================================================================
// FORM SCHEMA
// =============================================================================

const candidateFormSchema = z.object({
  first_name: z
    .string()
    .min(2, { message: "El nombre debe tener al menos 2 caracteres" })
    .max(100, { message: "El nombre es muy largo" }),
  last_name: z
    .string()
    .min(2, { message: "El apellido debe tener al menos 2 caracteres" })
    .max(150, { message: "El apellido es muy largo" }),
  maternal_last_name: z
    .string()
    .max(100, { message: "El apellido materno es muy largo" })
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .min(9, { message: "El telefono debe tener al menos 9 digitos" })
    .max(20, { message: "El telefono es muy largo" })
    .refine(
      (val) => {
        const digits = val.replace(/\D/g, "")
        return digits.length >= 9 && digits.length <= 11
      },
      { message: "Formato de telefono invalido" }
    ),
  email: z
    .string()
    .email({ message: "Email invalido" })
    .optional()
    .or(z.literal("")),
  dni: z
    .string()
    .regex(/^\d{8}$/, { message: "DNI debe tener exactamente 8 digitos" })
    .optional()
    .or(z.literal("")),
})

type CandidateFormData = z.infer<typeof candidateFormSchema>

// =============================================================================
// TYPES
// =============================================================================

interface CandidateFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: CandidateFormData) => void
  initialData?: Partial<Candidate>
  mode?: "create" | "edit"
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CandidateForm({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  mode = "create",
}: CandidateFormProps) {
  const [duplicateMatches, setDuplicateMatches] = React.useState<DuplicateDisplayInfo[]>([])
  const [isCheckingDuplicate, setIsCheckingDuplicate] = React.useState(false)
  const [dedupRecommendation, setDedupRecommendation] = React.useState<{
    accion: string
    descripcion: string
  } | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
    setValue,
    getValues,
  } = useForm<CandidateFormData>({
    resolver: zodResolver(candidateFormSchema),
    defaultValues: {
      first_name: initialData?.first_name || "",
      last_name: initialData?.last_name || "",
      maternal_last_name: initialData?.maternal_last_name || "",
      phone: initialData?.phone || "",
      email: initialData?.email || "",
      dni: initialData?.dni || "",
    },
  })

  const phoneValue = watch("phone")
  const firstNameValue = watch("first_name")
  const lastNameValue = watch("last_name")
  const maternalLastNameValue = watch("maternal_last_name")

  // Reset form when dialog closes
  React.useEffect(() => {
    if (!open) {
      reset({
        first_name: initialData?.first_name || "",
        last_name: initialData?.last_name || "",
        maternal_last_name: initialData?.maternal_last_name || "",
        phone: initialData?.phone || "",
        email: initialData?.email || "",
        dni: initialData?.dni || "",
      })
      setDuplicateMatches([])
      setDedupRecommendation(null)
    }
  }, [open, reset, initialData])

  // Debounced duplicate check when name or phone changes
  const checkForDuplicates = React.useCallback(async () => {
    const phone = normalizePhoneNumber(phoneValue)
    const firstName = firstNameValue?.trim()
    const lastName = lastNameValue?.trim()

    // Need at least phone or name to check
    if ((!phone || phone.length < 9) && (!firstName || !lastName)) {
      setDuplicateMatches([])
      setDedupRecommendation(null)
      return
    }

    // Skip check if no meaningful data
    if (!firstName || firstName.length < 2 || !lastName || lastName.length < 2) {
      if (!phone || phone.length < 9) {
        setDuplicateMatches([])
        setDedupRecommendation(null)
        return
      }
    }

    setIsCheckingDuplicate(true)

    try {
      const response = await fetch("/api/candidates/check-duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone || "000000000", // Placeholder if no phone
          first_name: firstName || "placeholder",
          last_name: lastName || "placeholder",
          maternal_last_name: maternalLastNameValue?.trim() || undefined,
          dni: getValues("dni") || undefined,
        }),
      })

      if (!response.ok) {
        setDuplicateMatches([])
        setDedupRecommendation(null)
        return
      }

      const result = await response.json()

      if (result.success && result.coincidencias && result.coincidencias.length > 0) {
        // Transform API response to DuplicateDisplayInfo format
        const matches: DuplicateDisplayInfo[] = result.coincidencias.map((match: {
          candidato_id: string
          nombre_completo: string
          telefono: string | null
          dni: string | null
          zona: string | null
          estado: string | null
          ultimo_contacto: string | null
          veces_contratado: number
          confianza: number
          tipo_coincidencia: string
          detalles: {
            coincide_telefono: boolean
            similitud_nombre: number
            coincidencia_fonetica: boolean
          }
        }) => ({
          id: match.candidato_id,
          nombre_completo: match.nombre_completo,
          telefono: match.telefono || "",
          dni: match.dni,
          zona: match.zona,
          estado: match.estado || "available",
          ultimo_contacto: match.ultimo_contacto,
          veces_contratado: match.veces_contratado,
          confianza: match.confianza,
          tipo_coincidencia: mapMatchType(match.tipo_coincidencia),
          detalles: {
            coincide_telefono: match.detalles.coincide_telefono,
            similitud_nombre: match.detalles.similitud_nombre,
            coincidencia_fonetica: match.detalles.coincidencia_fonetica,
          },
        }))

        setDuplicateMatches(matches)
        setDedupRecommendation(result.recomendacion || null)
      } else {
        setDuplicateMatches([])
        setDedupRecommendation(null)
      }
    } catch {
      // Network error - no warning shown
      setDuplicateMatches([])
      setDedupRecommendation(null)
    }

    setIsCheckingDuplicate(false)
  }, [phoneValue, firstNameValue, lastNameValue, maternalLastNameValue, getValues])

  // Map Spanish match type to enum
  function mapMatchType(tipo: string): "phone" | "name" | "phone_and_name" {
    if (tipo.includes("telefono y nombre")) return "phone_and_name"
    if (tipo.includes("telefono")) return "phone"
    return "name"
  }

  // Normalize phone on blur and trigger duplicate check
  const handlePhoneBlur = () => {
    const normalizedPhone = normalizePhoneNumber(phoneValue)
    if (normalizedPhone !== phoneValue) {
      setValue("phone", normalizedPhone)
    }
    checkForDuplicates()
  }

  // Check duplicates on name blur
  const handleNameBlur = () => {
    checkForDuplicates()
  }

  // Handle duplicate resolution
  const handleDuplicateResolved = (
    action: DuplicateResolutionAction,
    response: ResolveDuplicateResponse
  ) => {
    // Remove the resolved duplicate from the list
    if (response.candidato_secundario) {
      setDuplicateMatches((prev) =>
        prev.filter((m) => m.id !== response.candidato_secundario?.id)
      )
    }
  }

  // Dismiss duplicate panel without action
  const handleDismissPanel = () => {
    setDuplicateMatches([])
    setDedupRecommendation(null)
  }

  const handleFormSubmit = (data: CandidateFormData) => {
    // Normalize phone before submitting
    const normalizedData = {
      ...data,
      phone: normalizePhoneNumber(data.phone),
    }
    onSubmit(normalizedData)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Nuevo Candidato" : "Editar Candidato"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Complete los datos del candidato. El telefono es el identificador principal."
              : "Modifique los datos del candidato."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          {/* First Name */}
          <div className="space-y-2">
            <Label htmlFor="first_name">
              Nombre <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="first_name"
              placeholder="Juan Carlos"
              {...register("first_name")}
              onBlur={handleNameBlur}
              aria-invalid={!!errors.first_name}
            />
            {errors.first_name && (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {errors.first_name.message}
              </p>
            )}
          </div>

          {/* Last Name (Paterno) */}
          <div className="space-y-2">
            <Label htmlFor="last_name">
              Apellido Paterno <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="last_name"
              placeholder="Perez"
              {...register("last_name")}
              onBlur={handleNameBlur}
              aria-invalid={!!errors.last_name}
            />
            {errors.last_name && (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {errors.last_name.message}
              </p>
            )}
          </div>

          {/* Maternal Last Name */}
          <div className="space-y-2">
            <Label htmlFor="maternal_last_name">Apellido Materno</Label>
            <Input
              id="maternal_last_name"
              placeholder="Quispe"
              {...register("maternal_last_name")}
              onBlur={handleNameBlur}
              aria-invalid={!!errors.maternal_last_name}
            />
            {errors.maternal_last_name && (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {errors.maternal_last_name.message}
              </p>
            )}
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone">
              Telefono <span className="text-rose-500">*</span>
            </Label>
            <div className="relative">
              <Input
                id="phone"
                placeholder="987 654 321"
                {...register("phone")}
                onBlur={handlePhoneBlur}
                aria-invalid={!!errors.phone}
              />
              {isCheckingDuplicate && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
            {errors.phone && (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {errors.phone.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Se normalizara automaticamente a formato peruano
            </p>
          </div>

          {/* Duplicate Warning with Resolution Actions */}
          {duplicateMatches.length > 0 && (
            <div className="space-y-2">
              {/* Recommendation banner */}
              {dedupRecommendation && dedupRecommendation.accion !== "continuar" && (
                <div className={cn(
                  "text-xs px-3 py-2 rounded-md",
                  dedupRecommendation.accion === "fusion_automatica"
                    ? "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                )}>
                  <strong>Recomendacion:</strong> {dedupRecommendation.descripcion}
                </div>
              )}

              {/* Show resolution panels for each match */}
              {duplicateMatches.map((match) => (
                <DuplicateResolutionPanel
                  key={match.id}
                  masterId={mode === "edit" ? initialData?.id : undefined}
                  duplicate={match}
                  onResolved={handleDuplicateResolved}
                  onDismissPanel={handleDismissPanel}
                  compact={duplicateMatches.length > 1}
                />
              ))}

              {/* Info for create mode */}
              {mode === "create" && (
                <p className="text-xs text-muted-foreground px-1">
                  Puede continuar creando el candidato. El duplicado sera marcado automaticamente.
                </p>
              )}
            </div>
          )}

          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="correo@ejemplo.com"
              {...register("email")}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* DNI */}
          <div className="space-y-2">
            <Label htmlFor="dni">DNI</Label>
            <Input
              id="dni"
              placeholder="12345678"
              maxLength={8}
              {...register("dni")}
              aria-invalid={!!errors.dni}
            />
            {errors.dni && (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                {errors.dni.message}
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
                ? "Crear Candidato"
                : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export { candidateFormSchema }
export type { CandidateFormData }
