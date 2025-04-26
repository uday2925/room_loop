import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Room } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format, formatDistance } from "date-fns";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface RoomCardProps {
  room: Room;
  participants?: any[];
}

export default function RoomCard({ room, participants }: RoomCardProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Join room mutation
  const joinRoomMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/rooms/${room.id}/join`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Room joined successfully",
        description: "You can now participate in the discussion",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      navigate(`/room/${room.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to join room",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Status badge color
  const getStatusBadge = () => {
    switch (room.status) {
      case "live":
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100 flex items-center">
            <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-green-500 animate-pulse"></span>
            Live Now
          </Badge>
        );
      case "scheduled":
        return (
          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 flex items-center">
            <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-amber-500"></span>
            Scheduled
          </Badge>
        );
      case "closed":
        return (
          <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100 flex items-center">
            <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-gray-500"></span>
            Closed
          </Badge>
        );
    }
  };
  
  // Format date/time
  const formatRoomTime = () => {
    const start = new Date(room.startTime);
    const end = new Date(room.endTime);
    const now = new Date();
    
    if (room.status === "live") {
      return `Started ${formatDistance(start, now, { addSuffix: true })}`;
    } else if (room.status === "scheduled") {
      return `${format(start, "MMM d, h:mm a")} - ${format(end, "h:mm a")}`;
    } else {
      return `${formatDistance(end, now, { addSuffix: true })}`;
    }
  };
  
  const handleCardClick = () => {
    navigate(`/room/${room.id}`);
  };
  
  return (
    <div 
      className={cn(
        "bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition duration-150 ease-in-out",
        room.status === "closed" && "opacity-75"
      )}
    >
      <div className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div className="flex flex-wrap gap-1">
            {getStatusBadge()}
            <Badge className="capitalize bg-gray-100 text-gray-800 hover:bg-gray-100">
              {room.tag}
            </Badge>
          </div>
          <span className="text-xs text-gray-500">{formatRoomTime()}</span>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">{room.title}</h3>
        <p className="text-sm text-gray-600 mb-3 line-clamp-2">
          {room.description || "No description provided."}
        </p>
        <div className="flex items-center justify-between">
          <div className="flex -space-x-2 overflow-hidden">
            {/* This would be populated with actual participants */}
            <div className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500 border border-white">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-xs">
                  {room.id % 5 + 1}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
          
          {room.status === "live" ? (
            <Button 
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                joinRoomMutation.mutate();
              }}
              disabled={joinRoomMutation.isPending}
            >
              {joinRoomMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  Joining...
                </>
              ) : (
                "Join Now"
              )}
            </Button>
          ) : (
            <Button 
              variant="ghost" 
              size="sm"
              className="text-primary hover:text-primary-800 font-medium"
              onClick={handleCardClick}
            >
              More info
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
