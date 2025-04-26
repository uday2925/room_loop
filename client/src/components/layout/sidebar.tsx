import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Home, Search, Calendar, Bell, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface SidebarProps {
  activePage: "dashboard" | "explore" | "schedule" | "notifications";
}

export default function Sidebar({ activePage }: SidebarProps) {
  const { user, logoutMutation } = useAuth();
  
  const handleLogout = () => {
    logoutMutation.mutate();
  };
  
  return (
    <aside className="hidden md:flex w-64 flex-col bg-white border-r border-gray-200">
      <div className="p-5 border-b border-gray-200">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold mr-2">
            R
          </div>
          <span className="text-xl font-bold text-gray-900">RoomLoop</span>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        <Link href="/">
          <a className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
            activePage === "dashboard" 
              ? "bg-primary-50 text-primary-700" 
              : "text-gray-700 hover:bg-gray-100"
          }`}>
            <Home className={`h-5 w-5 mr-3 ${
              activePage === "dashboard" ? "text-primary" : "text-gray-500"
            }`} />
            Dashboard
          </a>
        </Link>
        <Link href="/explore">
          <a className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
            activePage === "explore" 
              ? "bg-primary-50 text-primary-700" 
              : "text-gray-700 hover:bg-gray-100"
          }`}>
            <Search className={`h-5 w-5 mr-3 ${
              activePage === "explore" ? "text-primary" : "text-gray-500"
            }`} />
            Explore
          </a>
        </Link>
        {/* <Link href="/schedule">
          <a className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
            activePage === "schedule" 
              ? "bg-primary-50 text-primary-700" 
              : "text-gray-700 hover:bg-gray-100"
          }`}>
            <Calendar className={`h-5 w-5 mr-3 ${
              activePage === "schedule" ? "text-primary" : "text-gray-500"
            }`} />
            My Schedule
          </a>
        </Link>
        <Link href="/notifications">
          <a className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
            activePage === "notifications" 
              ? "bg-primary-50 text-primary-700" 
              : "text-gray-700 hover:bg-gray-100"
          }`}>
            <Bell className={`h-5 w-5 mr-3 ${
              activePage === "notifications" ? "text-primary" : "text-gray-500"
            }`} />
            Notifications
            <Badge className="ml-auto bg-accent text-white">3</Badge>
          </a>
        </Link> */}

        
      </nav>
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Avatar className="h-8 w-8 mr-3">
              <AvatarFallback>{user?.username?.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm font-medium text-gray-700">{user?.username}</p>
              <p className="text-xs text-gray-500">@{user?.username}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleLogout}
            className="text-gray-500 hover:text-gray-700"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
