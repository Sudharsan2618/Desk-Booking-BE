import Link from "next/link";
import { Home, LayoutDashboard, LampDesk } from "lucide-react";

import { Button } from "@/components/ui/button";

export function Sidebar() {
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
                        <Button variant="ghost" className="w-full justify-start">
                            <LayoutDashboard className="h-4 w-4 mr-2" />
                            Dashboard
                        </Button>
                    </Link>
                    <Link href="/desk">
                        <Button variant="ghost" className="w-full justify-start">
                            <LampDesk className="h-4 w-4 mr-2" />
                            Desk Booking
                        </Button>
                    </Link>
                </nav>
            </div>
        </div>
    );
} 