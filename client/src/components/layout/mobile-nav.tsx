import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Home, Search, Bell, User } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface MobileNavProps {
  activePage: "dashboard" | "explore" | "schedule" | "notifications" | "profile";
}

export default function MobileNav({ activePage }: MobileNavProps) {
  const { user } = useAuth();
  
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg">
      <div className="flex justify-around p-2">
        <Link href="/">
          <a className={`flex flex-col items-center p-2 ${
            activePage === "dashboard" ? "text-primary" : "text-gray-600"
          }`}>
            <Home className="h-6 w-6" />
            <span className="text-xs mt-1">Home</span>
          </a>
        </Link>
        <Link href="/explore">
          <a className={`flex flex-col items-center p-2 ${
            activePage === "explore" ? "text-primary" : "text-gray-600"
          }`}>
            <Search className="h-6 w-6" />
            <span className="text-xs mt-1">Explore</span>
          </a>
        </Link>
        <Link href="/notifications">
          <a className={`flex flex-col items-center p-2 relative ${
            activePage === "notifications" ? "text-primary" : "text-gray-600"
          }`}>
            <Bell className="h-6 w-6" />
            <span className="text-xs mt-1">Alerts</span>
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-accent"></span>
          </a>
        </Link>
        <Link href="/profile">
          <a className={`flex flex-col items-center p-2 ${
            activePage === "profile" ? "text-primary" : "text-gray-600"
          }`}>
            {user ? (
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-xs">{user.username.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
            ) : (
              <User className="h-6 w-6" />
            )}
            <span className="text-xs mt-1">Profile</span>
          </a>
        </Link>
      </div>
    </div>
  );
}
