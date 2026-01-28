"use client"

import * as React from "react"
import { Search, Phone, AlertTriangle, User, Clock, Loader2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  CANDIDATE_STATUS,
  type CandidateStatus,
} from "@/types/constants"
import { normalizePhoneNumber, formatPhoneForDisplay } from "@/types/schemas"

// =============================================================================
// TYPES
// =============================================================================

interface CandidateSearchResult {
  id: string
  full_name: string
  phone: string
  status: CandidateStatus
  last_contacted_at: string | null
  contacted_by?: string
  zone: string | null
}

interface CandidateSearchProps {
  onCandidateSelect?: (candidate: CandidateSearchResult) => void
  onPhoneChange?: (phone: string, hasMatch: boolean) => void
  placeholder?: string
  className?: string
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getStatusBadgeClasses(status: CandidateStatus): string {
  const config = CANDIDATE_STATUS[status]
  const colorMap: Record<string, string> = {
    sky: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800",
    amber: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
    teal: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800",
    lime: "bg-lime-100 text-lime-700 border-lime-200 dark:bg-lime-900/30 dark:text-lime-400 dark:border-lime-800",
    stone: "bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800/50 dark:text-stone-400 dark:border-stone-700",
    rose: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800",
  }
  return colorMap[config.color] || colorMap.stone
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CandidateSearch({
  onCandidateSelect,
  onPhoneChange,
  placeholder = "Buscar por teléfono (ej: 987654321)",
  className,
}: CandidateSearchProps) {
  const [searchValue, setSearchValue] = React.useState("")
  const [isSearching, setIsSearching] = React.useState(false)
  const [searchResult, setSearchResult] = React.useState<CandidateSearchResult | null>(null)
  const [hasSearched, setHasSearched] = React.useState(false)

  // Use ref to store callback to prevent infinite re-renders
  const onPhoneChangeRef = React.useRef(onPhoneChange)
  React.useEffect(() => {
    onPhoneChangeRef.current = onPhoneChange
  })

  // Debounced search - calls API to check for existing candidate
  React.useEffect(() => {
    const digits = searchValue.replace(/\D/g, "")

    // Only search if we have at least 6 digits
    if (digits.length < 6) {
      setSearchResult(null)
      setHasSearched(false)
      onPhoneChangeRef.current?.(digits, false)
      return
    }

    setIsSearching(true)

    const timer = setTimeout(async () => {
      try {
        // Call API to check for duplicate
        const response = await fetch(`/api/candidates/check-duplicate?phone=${encodeURIComponent(digits)}`)

        if (!response.ok) {
          // API error - no match found
          setSearchResult(null)
          onPhoneChangeRef.current?.(digits, false)
        } else {
          const result = await response.json()

          if (result.success && result.data) {
            setSearchResult({
              id: result.data.id,
              full_name: result.data.full_name,
              phone: result.data.phone,
              status: result.data.status,
              last_contacted_at: result.data.last_contacted_at || null,
              contacted_by: result.data.contacted_by,
              zone: result.data.zone || null,
            })
            onPhoneChangeRef.current?.(digits, true)
          } else {
            setSearchResult(null)
            onPhoneChangeRef.current?.(digits, false)
          }
        }
      } catch (error) {
        // Network error - no match found
        setSearchResult(null)
        onPhoneChangeRef.current?.(digits, false)
      }

      setHasSearched(true)
      setIsSearching(false)
    }, 300)

    return () => clearTimeout(timer)
  }, [searchValue])

  const handleClear = () => {
    setSearchValue("")
    setSearchResult(null)
    setHasSearched(false)
    onPhoneChangeRef.current?.("", false)
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Search Input */}
      <div className="relative">
        <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="tel"
          placeholder={placeholder}
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="pl-9 pr-10 h-11 text-base"
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {searchValue && !isSearching && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <span className="sr-only">Limpiar</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        )}
      </div>

      {/* Search Result */}
      {hasSearched && (
        <div className="rounded-lg border bg-card overflow-hidden">
          {searchResult ? (
            <div className="p-4">
              {/* Warning Banner */}
              <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20 mb-4">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    Candidato existente encontrado
                  </p>
                  {searchResult.contacted_by && (
                    <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                      Ya contactado por{" "}
                      <span className="font-semibold">{searchResult.contacted_by}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Candidate Details */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                      <User className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div>
                      <h4 className="font-medium">{searchResult.full_name}</h4>
                      <p className="text-sm text-muted-foreground font-mono">
                        {formatPhoneForDisplay(searchResult.phone)}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={getStatusBadgeClasses(searchResult.status)}
                  >
                    {CANDIDATE_STATUS[searchResult.status].label}
                  </Badge>
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {searchResult.zone && (
                    <span>Zona: {searchResult.zone}</span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {searchResult.last_contacted_at
                      ? formatDistanceToNow(new Date(searchResult.last_contacted_at), {
                          addSuffix: true,
                          locale: es,
                        })
                      : "Sin contactar"}
                  </span>
                </div>

                {onCandidateSelect && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => onCandidateSelect(searchResult)}
                  >
                    Ver perfil completo
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-4 text-center">
              <div className="h-10 w-10 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center mx-auto mb-2">
                <Search className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Candidato no encontrado</p>
              <p className="text-xs text-muted-foreground mt-1">
                No existe ningún candidato con este teléfono en el sistema
              </p>
            </div>
          )}
        </div>
      )}

      {/* Help text */}
      {!hasSearched && searchValue.replace(/\D/g, "").length > 0 && searchValue.replace(/\D/g, "").length < 6 && (
        <p className="text-xs text-muted-foreground">
          Ingrese al menos 6 dígitos para buscar
        </p>
      )}
    </div>
  )
}
