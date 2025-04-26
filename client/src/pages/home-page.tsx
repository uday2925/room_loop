import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import Sidebar from "@/components/layout/sidebar";
import MobileNav from "@/components/layout/mobile-nav";
import RoomCard from "@/components/room-card";
import CreateRoomDialog from "@/components/create-room-dialog";
import { Room } from "@shared/schema";
import { Loader2, Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const { user } = useAuth();
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  
  const { data: rooms, isLoading } = useQuery({
    queryKey: ['/api/rooms'],
  });
  
  // Filter and categorize rooms
  const liveRooms = rooms?.participating?.filter((room: Room) => room.status === 'live') || [];
  const scheduledRooms = rooms?.participating?.filter((room: Room) => room.status === 'scheduled') || [];
  const pastRooms = rooms?.participating?.filter((room: Room) => room.status === 'closed') || [];
  const publicRooms = rooms?.public || [];
  const invitedRooms = rooms?.invited || []; // Add invited rooms
  
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar (desktop only) */}
      <Sidebar activePage="dashboard" />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Nav (mobile and tablet) */}
        <header className="bg-white border-b border-gray-200 md:py-0 py-2">
          <div className="md:hidden flex items-center justify-between px-4">
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold">
                R
              </div>
              <span className="ml-2 text-lg font-bold text-gray-900">RoomLoop</span>
            </div>
            <button className="p-1 rounded-md text-gray-500 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary">
              <Search className="h-6 w-6" />
            </button>
          </div>
          <div className="hidden md:flex items-center justify-between px-6 py-3">
            <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
            <div className="flex items-center">
              <Button 
                onClick={() => setCreateRoomOpen(true)}
                variant="default" 
                className="ml-4 flex items-center"
              >
                <Plus className="h-5 w-5 mr-1" />
                Create Room
              </Button>
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4 md:p-6 pb-24 md:pb-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Hero section */}
              <div className="mb-6 bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="md:flex">
                  <div className="p-6 md:w-1/2 flex flex-col justify-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to RoomLoop</h2>
                    <p className="text-gray-600 mb-4">
                      Create temporary rooms for hangouts, work sessions, or quick catch-ups. 
                      No complicated setups, just simple micro-meetups.
                    </p>
                    <Button
                      onClick={() => setCreateRoomOpen(true)}
                      className="bg-primary text-white inline-flex items-center md:hidden"
                    >
                      <Plus className="h-5 w-5 mr-1" />
                      Create Room
                    </Button>
                  </div>
                  <div className="md:w-1/2 h-48 md:h-auto">
                    <img
                      className="w-full h-full object-cover"
                      src="https://images.unsplash.com/photo-1588196749597-9ff075ee6b5b?ixlib=rb-1.2.1&auto=format&fit=crop&w=1050&q=80"
                      alt="People in a virtual meetup"
                    />
                  </div>
                </div>
              </div>

              {/* Live Rooms Section */}
              {liveRooms.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Live Now</h2>
                    <a href="/explore" className="text-primary hover:text-primary-800 text-sm font-medium">View all</a>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {liveRooms.map((room: Room) => (
                      <RoomCard key={`live-${room.id}`} room={room} />
                    ))}
                  </div>
                </div>
              )}

              {/* My Scheduled Rooms Section */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">My Scheduled Rooms</h2>
                  <a href="/explore" className="text-primary hover:text-primary-800 text-sm font-medium">View all</a>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {scheduledRooms.length > 0 ? (
                    scheduledRooms.map((room: Room) => (
                      <RoomCard key={`scheduled-${room.id}`} room={room} />
                    ))
                  ) : (
                    <div className="col-span-full bg-white rounded-lg p-8 text-center">
                      <p className="text-gray-500 mb-4">You don't have any scheduled rooms yet.</p>
                      <Button onClick={() => setCreateRoomOpen(true)}>Create Your First Room</Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Room Invitations Section */}
              {invitedRooms.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Room Invitations</h2>
                    <a href="/explore" className="text-primary hover:text-primary-800 text-sm font-medium">View all</a>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {invitedRooms.map((room: Room) => (
                      <RoomCard key={`invited-${room.id}`} room={room} isInvitation={true} />
                    ))}
                  </div>
                </div>
              )}

              {/* Public Rooms Section */}
              {publicRooms.length > 0 && (
                <div className="mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Public Rooms</h2>
                    <a href="/explore" className="text-primary hover:text-primary-800 text-sm font-medium">View all</a>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {publicRooms.slice(0, 3).map((room: Room) => (
                      <RoomCard key={`public-${room.id}`} room={room} />
                    ))}
                  </div>
                </div>
              )}

              {/* Past Rooms Section */}
              {pastRooms.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Past Rooms</h2>
                    <a href="/explore" className="text-primary hover:text-primary-800 text-sm font-medium">View all</a>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pastRooms.slice(0, 3).map((room: Room) => (
                      <RoomCard key={`past-${room.id}`} room={room} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      
      {/* Bottom Navigation (mobile only) */}
      <MobileNav activePage="dashboard" />
      
      {/* Create Room Dialog */}
      <CreateRoomDialog open={createRoomOpen} onOpenChange={setCreateRoomOpen} />
    </div>
  );
}
