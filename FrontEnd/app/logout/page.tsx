"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/use-auth"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, LogOut } from "lucide-react"

export default function LogoutPage() {
  const { logout, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If the user is authenticated when they land on this page, log them out.
    // We check isAuthenticated to ensure logout is only called if they are actually logged in,
    // preventing unnecessary actions if they somehow navigate here while already logged out.
    if (isAuthenticated) {
      const performLogout = async () => {
        await logout();
        router.push("/login");
      };
      performLogout();
    } else {
      // If not authenticated, just redirect to login immediately
      router.push("/login");
    }
  }, [logout, router, isAuthenticated]);

  // This component will primarily handle redirection, so no interactive elements needed after initiation
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <LogOut className="h-6 w-6 text-red-600" />
          </div>
          <CardTitle className="text-xl font-semibold">Signing Out...</CardTitle>
          <CardDescription>
            Please wait while you are securely signed out.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    </div>
  );
}
