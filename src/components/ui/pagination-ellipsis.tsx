"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

// =============================================================================
// TYPES
// =============================================================================

interface PaginationEllipsisProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  className?: string
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generates page numbers with ellipsis for pagination
 * Shows max 7 buttons: [1] [...] [4] [5] [6] [...] [100]
 * Always shows first, last, and current neighborhood
 */
function getPageNumbers(currentPage: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    // Show all pages if 7 or fewer
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages: (number | "ellipsis")[] = []

  // Always include first page
  pages.push(1)

  // Calculate neighborhood around current page
  const neighborhoodStart = Math.max(2, currentPage - 1)
  const neighborhoodEnd = Math.min(totalPages - 1, currentPage + 1)

  // Add left ellipsis if there's a gap
  if (neighborhoodStart > 2) {
    pages.push("ellipsis")
  }

  // Add neighborhood pages
  for (let i = neighborhoodStart; i <= neighborhoodEnd; i++) {
    if (i > 1 && i < totalPages) {
      pages.push(i)
    }
  }

  // Add right ellipsis if there's a gap
  if (neighborhoodEnd < totalPages - 1) {
    pages.push("ellipsis")
  }

  // Always include last page
  if (totalPages > 1) {
    pages.push(totalPages)
  }

  return pages
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PaginationEllipsis({
  currentPage,
  totalPages,
  onPageChange,
  className,
}: PaginationEllipsisProps) {
  if (totalPages <= 1) {
    return null
  }

  const pageNumbers = getPageNumbers(currentPage, totalPages)

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
      >
        <ChevronLeft className="h-4 w-4" />
        Anterior
      </Button>

      <div className="flex items-center gap-1">
        {pageNumbers.map((page, index) => {
          if (page === "ellipsis") {
            return (
              <span
                key={`ellipsis-${index}`}
                className="flex h-8 w-8 items-center justify-center text-muted-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </span>
            )
          }

          return (
            <Button
              key={page}
              variant={page === currentPage ? "default" : "outline"}
              size="icon-sm"
              onClick={() => onPageChange(page)}
              className={cn(
                page === currentPage && "bg-teal-600 hover:bg-teal-700 text-white"
              )}
            >
              {page}
            </Button>
          )
        })}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
      >
        Siguiente
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
