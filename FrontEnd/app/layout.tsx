"use client"
import type React from "react"
import { Inter } from "next/font/google"
import AuthProvider from "@/components/auth-provider"
import { Sidebar } from "@/components/Sidebar"
import "./globals.css"
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useDeskHold } from "@/hooks/use-desk-hold";

const inter = Inter({ subsets: ["latin"] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname();
  const hideSidebar = pathname === "/login" || pathname === "/signup";
  const { user, logout } = useAuth();
  useDeskHold();

  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <div className="flex min-h-screen">
            {!hideSidebar && (
              <aside className="w-56 border-r bg-gray-100/40 hidden md:block fixed inset-y-0 left-0">
                <Sidebar user={user} logout={logout} />
              </aside>
            )}
            <main className={`flex flex-1 flex-col overflow-y-auto ${hideSidebar ? "ml-0" : "ml-56"}`}>
              {children}
            </main>
          </div>
        </AuthProvider>
      </body>
    </html>
  )
}
