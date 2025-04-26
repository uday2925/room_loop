import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import Sidebar from "@/components/layout/sidebar";
import MobileNav from "@/components/layout/mobile-nav";
import RoomCard from "@/components/room-card";
import CreateRoomDialog from "@/components/create-room-dialog";
import { Room, ROOM_TAGS, RoomTag } from "@shared/schema";
import { Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

export default function ExplorePage() {
  const { user } = useAuth();
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTags, setSelectedTags] = useState<RoomTag[]>([]);
  
  const { data: rooms, isLoading } = useQuery({
    queryKey: ['/api/rooms'],
  });
  
  // Filter functions
  const filterBySearch = (room: Room) => {
    if (!searchTerm) return true;
    return room.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (room.description && room.description.toLowerCase().includes(searchTerm.toLowerCase()));
  };
  
  const filterByTags = (room: Room) => {
    if (selectedTags.length === 0) return true;
    return selectedTags.includes(room.tag as RoomTag);
  };
  
  // Combined filter
  const filterRoom = (room: Room) => filterBySearch(room) && filterByTags(room);
  
  // Apply filters
  const filteredPublic = rooms?.public?.filter(filterRoom) || [];
  const filteredUpcoming = [...(rooms?.created || []), ...(rooms?.participating || [])]
    .filter(room => room.status === 'scheduled')
    .filter(filterRoom);
  const filteredLive = [...(rooms?.created || []), ...(rooms?.participating || [])]
    .filter(room => room.status === 'live')
    .filter(filterRoom);
  const filteredPast = [...(rooms?.created || []), ...(rooms?.participating || [])]
    .filter(room => room.status === 'closed')
    .filter(filterRoom);
  
  // Toggle tag selection
  const toggleTag = (tag: RoomTag) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag) 
        : [...prev, tag]
    );
  };
  
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar (desktop only) */}
      <Sidebar activePage="explore" />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Nav */}
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
            <h1 className="text-xl font-semibold text-gray-900">Explore Rooms</h1>
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
              {/* Search and Filter Section */}
              <div className="mb-6 bg-white p-4 rounded-xl shadow-sm">
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                  <Input
                    className="pl-10"
                    placeholder="Search rooms by title or description"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <span className="text-sm font-medium text-gray-700 mr-2 mt-1">Filter by tag:</span>
                  {ROOM_TAGS.map((tag) => (
                    <Badge 
                      key={tag}
                      variant={selectedTags.includes(tag) ? "default" : "outline"}
                      className="cursor-pointer capitalize"
                      onClick={() => toggleTag(tag as RoomTag)}
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
              
              {/* Tabs for Different Room Categories */}
              <Tabs defaultValue="all">
                <TabsList className="mb-6">
                  <TabsTrigger value="all">All Rooms</TabsTrigger>
                  <TabsTrigger value="live">Live Now</TabsTrigger>
                  <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                  <TabsTrigger value="past">Past</TabsTrigger>
                </TabsList>
                
                <TabsContent value="all">
                  {/* Public Rooms */}
                  {filteredPublic.length > 0 && (
                    <div className="mb-8">
                      <h2 className="text-lg font-semibold text-gray-900 mb-4">Public Rooms</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredPublic.map((room: Room) => (
                          <RoomCard key={`public-${room.id}`} room={room} />
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Live Rooms */}
                  {filteredLive.length > 0 && (
                    <div className="mb-8">
                      <h2 className="text-lg font-semibold text-gray-900 mb-4">Live Now</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredLive.map((room: Room) => (
                          <RoomCard key={`live-${room.id}`} room={room} />
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Upcoming Rooms */}
                  {filteredUpcoming.length > 0 && (
                    <div className="mb-8">
                      <h2 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Rooms</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredUpcoming.map((room: Room) => (
                          <RoomCard key={`upcoming-${room.id}`} room={room} />
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* No Rooms Found */}
                  {filteredPublic.length === 0 && filteredLive.length === 0 && filteredUpcoming.length === 0 && (
                    <div className="text-center py-12">
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No rooms match your search</h3>
                      <p className="text-gray-500 mb-6">Try adjusting your search or filters</p>
                      <Button onClick={() => {
                        setSearchTerm("");
                        setSelectedTags([]);
                      }}>Clear Filters</Button>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="live">
                  {filteredLive.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredLive.map((room: Room) => (
                        <RoomCard key={`live-tab-${room.id}`} room={room} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No live rooms at the moment</h3>
                      <p className="text-gray-500 mb-6">Check back later or create your own room</p>
                      <Button onClick={() => setCreateRoomOpen(true)}>Create Room</Button>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="upcoming">
                  {filteredUpcoming.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredUpcoming.map((room: Room) => (
                        <RoomCard key={`upcoming-tab-${room.id}`} room={room} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No upcoming rooms scheduled</h3>
                      <p className="text-gray-500 mb-6">Create a new room to schedule a meetup</p>
                      <Button onClick={() => setCreateRoomOpen(true)}>Schedule a Room</Button>
                    </div>
                  )}
                </TabsContent>
                
                <TabsContent value="past">
                  {filteredPast.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredPast.map((room: Room) => (
                        <RoomCard key={`past-tab-${room.id}`} room={room} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No past rooms</h3>
                      <p className="text-gray-500">Join or create rooms to see your history</p>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </main>
      </div>
      
      {/* Bottom Navigation (mobile only) */}
      <MobileNav activePage="explore" />
      
      {/* Create Room Dialog */}
      <CreateRoomDialog open={createRoomOpen} onOpenChange={setCreateRoomOpen} />
    </div>
  );
}
