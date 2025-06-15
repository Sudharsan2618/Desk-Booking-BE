"use client"

import { useState, useEffect, useCallback } from "react"
import { User, authenticateUser, registerUser } from "@/lib/auth"
import { useRouter } from "next/navigation";

interface UseAuthReturn {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  signup: (userData: { email: string; password: string; first_name: string; last_name: string; phone?: string }) => Promise<{ success: boolean; error?: string }>
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();
  useEffect(() => {
    console.log("Auth hook: useEffect running");
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        const parsedUser: User = JSON.parse(storedUser);
        setUser(parsedUser);
        console.log("Auth hook: User loaded from localStorage:", parsedUser);
      } catch (e) {
        console.error("Auth hook: Failed to parse user from localStorage:", e);
        localStorage.removeItem("user"); // Clear invalid data
      }
    }
    setIsLoading(false);
    console.log("Auth hook: Initial isLoading set to false");
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    console.log("Auth hook: Login attempt for email:", email);
    setIsLoading(true);
    try {
      const authenticatedUser = await authenticateUser(email, password);
      if (authenticatedUser) {
        setUser(authenticatedUser);
        localStorage.setItem("user", JSON.stringify(authenticatedUser));
        console.log("Auth hook: Login successful, user set and stored:", authenticatedUser);
        return { success: true };
      } else {
        console.log("Auth hook: Login failed - invalid credentials");
        return { success: false, error: "Invalid credentials" };
      }
    } catch (error: any) {
      console.error("Auth hook: Login error:", error);
      return { success: false, error: error.message || "An unknown error occurred during login" };
    } finally {
      setIsLoading(false);
      console.log("Auth hook: Login attempt finished, isLoading set to false");
    }
  }, []);

  const logout = useCallback(() => {
    console.log("Auth hook: Logout initiated");
    setUser(null);
    localStorage.removeItem("user");
    console.log("Auth hook: User cleared from state and localStorage");
    router.push("/login");
  }, []);

  const signup = useCallback(async (userData: { email: string; password: string; first_name: string; last_name: string; phone?: string }) => {
    console.log("Auth hook: Signup attempt for email:", userData.email);
    setIsLoading(true);
    try {
      const newUser = await registerUser(userData);
      if (newUser) {
        setUser(newUser);
        localStorage.setItem("user", JSON.stringify(newUser));
        console.log("Auth hook: Signup successful, user set and stored:", newUser);
        return { success: true };
      } else {
        console.log("Auth hook: Signup failed");
        return { success: false, error: "Registration failed" };
      }
    } catch (error: any) {
      console.error("Auth hook: Signup error:", error);
      return { success: false, error: error.message || "An unknown error occurred during signup" };
    } finally {
      setIsLoading(false);
      console.log("Auth hook: Signup attempt finished, isLoading set to false");
    }
  }, []);

  console.log("Auth hook: Current state - user:", user, "isAuthenticated:", !!user, "isLoading:", isLoading);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    signup,
  }
}
