"use client"

import type React from "react"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"

interface AuthGuardProps {
  children: React.ReactNode
  requireAuth?: boolean
}

export function AuthGuard({ children, requireAuth = true }: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter()

  useEffect(() => {
    if (isLoading) {
      return; // Still checking auth status
    }

    if (requireAuth && !isAuthenticated) {
      router.push("/login")
    } else if (!requireAuth && isAuthenticated) {
      router.push("/dashboard")
    }
  }, [isAuthenticated, isLoading, router, requireAuth])

  if (isLoading || (requireAuth && !isAuthenticated) || (!requireAuth && isAuthenticated)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return <>{children}</>
}
