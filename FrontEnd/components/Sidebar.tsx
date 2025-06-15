import Link from "next/link";
import { Home, LayoutDashboard, LampDesk } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";

interface User {
    id: string;
    name?: string | null;
    email: string;
}

interface SidebarProps {
    user: User | null;
    logout: () => void;
}

export function Sidebar({logout }: SidebarProps) {
    const pathname = usePathname();
    const [user, setUser] = useState<User | null>(null);

    useEffect(() => {
        const storedUser = localStorage.getItem("user");
        if (storedUser) {
            setUser(JSON.parse(storedUser));
        }
    }, []);

    const getUserInitials = (name: string, email: string) => {
        if (name) {
            return name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)
        }
        return email?.charAt(0)?.toUpperCase()
    }

    const userInitials = user ? getUserInitials(user.name || user.email, user.email) : "";

    return (
        <div className="flex h-full max-h-screen flex-col overflow-hidden border-r bg-background">
            <div className="flex h-16 items-center border-b px-6">
                <Link href="/" className="flex items-center gap-2 font-semibold">
                    <Home className="h-6 w-6" />
                    <span className="">Desk Booking</span>
                </Link>
            </div>
            <div className="flex-1 overflow-auto py-2">
                <nav className="grid items-start gap-2 px-4 text-sm font-medium">
                    <Link href="/dashboard">
                        <Button variant={pathname === "/dashboard" ? "secondary" : "ghost"} className={`w-full justify-start ${pathname === "/dashboard" ? "text-primary" : ""}`}>
                            <LayoutDashboard className="h-4 w-4 mr-2" />
                            Dashboard
                        </Button>
                    </Link>
                    <Link href="/desk">
                        <Button variant={pathname === "/desk" ? "secondary" : "ghost"} className={`w-full justify-start ${pathname === "/desk" ? "text-primary" : ""}`}>
                            <LampDesk className="h-4 w-4 mr-2" />
                            Desk Booking
                        </Button>
                    </Link>
                </nav>
            </div>
            {/* {user && ( */}
                <div className="border-t p-4 mt-auto">
                    <div className="flex items-center space-x-2 mb-4">
                        <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium size-10">
                            {userInitials}
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium">{user?.name || user?.email}</p>
                            <p className="text-xs text-muted-foreground">{user?.email}</p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={logout} className="w-full">
                        <LogOut className="h-4 w-4 mr-2" />
                        Sign Out
                    </Button>
                </div>
             {/* )} */}
             
        </div>
    );
} 