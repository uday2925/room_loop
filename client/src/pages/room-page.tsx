import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import Sidebar from "@/components/layout/sidebar";
import MobileNav from "@/components/layout/mobile-nav";
import RoomChat from "@/components/room-chat";
import { Loader2, ArrowLeft, Clock, Users, Mail, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import { format, isAfter, isBefore } from "date-fns";
import { useWebSocket } from "@/hooks/use-websocket";

export default function RoomPage() {
  const [match, params] = useRoute("/room/:id");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Get roomId from params
  const roomId = params?.id ? parseInt(params.id) : null;
  
  // Fetch room details
  const { 
    data: roomData, 
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: [`/api/rooms/${roomId}`],
    enabled: !!roomId,
  });
  
  // Join room mutation
  const joinRoomMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/rooms/${roomId}/join`);
      return res.json();
    },
    onSuccess: (data) => {
      // Handle both cases - already a participant or newly joined
      if (data.message === "Already a participant in this room") {
        toast({
          title: "Rejoined room",
          description: "You are already a participant in this room",
        });
      } else {
        toast({
          title: "Room joined successfully",
          description: "You can now participate in the discussion",
        });
      }
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to join room",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Set up WebSocket for real-time updates if user is a participant
  const { connected, messages, sendMessage } = useWebSocket({
    enabled: roomData?.userAccess?.isParticipant && roomData?.room?.status === 'live',
    roomId: roomId as number,
    userId: user?.id as number
  });
  
  // More robust message deduplication by using a composite key
  const messageMap = new Map();
  
  // Helper function to create a unique key for each message that accounts for content
  const createMessageKey = (msg: any) => {
    if (!msg) return '';
    const id = msg.id ? String(msg.id) : '';
    const userId = msg.userId ? String(msg.userId) : '';
    const content = msg.content ? String(msg.content) : '';
    // Use either ID (if exists) or a composite of userID + content for deduplication
    return id ? id : `${userId}-${content.substring(0, 30)}`;
  };
  
  // First add backend messages to the map
  (roomData?.messages || []).forEach(message => {
    const key = createMessageKey(message);
    if (key) messageMap.set(key, message);
  });
  
  // Then add WebSocket messages, but only if they're not already in the map
  // This prevents old messages from being shown again
  (messages || []).forEach(message => {
    const key = createMessageKey(message);
    // Only add the message if we don't have it already or if it's a new temp message
    if (key && (!messageMap.has(key) || key.startsWith('temp-'))) {
      messageMap.set(key, message);
    }
  });
  
  // Convert map to sorted array and filter out any malformed messages
  const allMessages = Array.from(messageMap.values())
    .filter(msg => msg && msg.content && msg.createdAt) // Ensure valid messages
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  
  // Get status badge styling
  const getStatusBadge = () => {
    if (!roomData?.room) return null;
    
    const { status } = roomData.room;
    
    if (status === 'live') {
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100 flex items-center">
          <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-green-500 animate-pulse"></span>
          Live Now
        </Badge>
      );
    } else if (status === 'scheduled') {
      return (
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 flex items-center">
          <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-amber-500"></span>
          Scheduled
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100 flex items-center">
          <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-gray-500"></span>
          Closed
        </Badge>
      );
    }
  };
  
  // Format time
  const formatTimeRange = () => {
    if (!roomData?.room) return "";
    
    const { startTime, endTime } = roomData.room;
    const start = new Date(startTime);
    const end = new Date(endTime);
    
    const now = new Date();
    if (isBefore(now, start)) {
      return `Starts ${format(start, "MMM d, h:mm a")}`;
    } else if (isAfter(now, end)) {
      return `Ended ${format(end, "MMM d, h:mm a")}`;
    } else {
      return `Live until ${format(end, "h:mm a")}`;
    }
  };
  
  // Check for room status updates more frequently (every 10 seconds) 
  // This ensures users can join as soon as a room becomes live
  useEffect(() => {
    if (!roomData?.room) return;
    
    // Check more frequently for scheduled rooms that are about to go live
    const isScheduled = roomData.room.status === 'scheduled';
    const checkInterval = isScheduled ? 10 * 1000 : 60 * 1000;
    
    const interval = setInterval(() => {
      refetch();
    }, checkInterval);
    
    return () => clearInterval(interval);
  }, [roomData, refetch]);
  
  // Handle room not found or error
  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Room Not Found</h1>
          <p className="mb-6 text-gray-600">The room may have been deleted or you may not have access.</p>
          <Button onClick={() => navigate("/")}>Return to Dashboard</Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar (desktop only) */}
      <Sidebar activePage="dashboard" />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Nav */}
        <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
          {isLoading ? (
            <div className="flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="mr-2"
                  onClick={() => navigate("/")}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">{roomData?.room?.title}</h1>
                  <div className="flex items-center text-sm text-gray-500 mt-1">
                    <Clock className="h-4 w-4 mr-1" />
                    <span>{formatTimeRange()}</span>
                    <span className="mx-2">•</span>
                    <Users className="h-4 w-4 mr-1" />
                    <span>{roomData?.participants?.length || 0} participants</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                {getStatusBadge()}
                <Badge className="capitalize bg-gray-100 text-gray-800 hover:bg-gray-100">
                  {roomData?.room?.tag}
                </Badge>
                <Badge className="capitalize bg-gray-100 text-gray-800 hover:bg-gray-100">
                  {roomData?.room?.type}
                </Badge>
                
                {/* Participants popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="ml-2 text-xs flex items-center gap-1"
                    >
                      <Users className="h-3.5 w-3.5" />
                      View Participants
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0">
                    <div className="p-4 border-b">
                      <h4 className="font-medium">Room Participants</h4>
                    </div>
                    <ScrollArea className="h-72 p-4">
                      {roomData?.participants?.length > 0 ? (
                        <div className="space-y-4">
                          {roomData.participants.map((participant) => (
                            <div key={participant.id} className="flex items-center justify-between">
                              <div className="flex items-center">
                                <Avatar className="h-8 w-8 mr-2">
                                  <AvatarFallback>{participant.username[0].toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <span>{participant.username}</span>
                              </div>
                              {participant.id === roomData.room.creatorId && (
                                <Badge variant="outline" className="text-xs">Host</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-center text-sm text-gray-500 py-4">No participants yet</p>
                      )}
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
                
                {/* Invitations popover - only show for private rooms & if user is creator */}
                {roomData?.room?.type === 'private' && roomData?.userAccess?.isCreator && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="ml-2 text-xs flex items-center gap-1"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Invitations
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-0">
                      <div className="p-4 border-b">
                        <h4 className="font-medium">Room Invitations</h4>
                      </div>
                      <ScrollArea className="h-72 p-4">
                        {roomData?.invitations && roomData.invitations.length > 0 ? (
                          <div className="space-y-4">
                            {roomData.invitations.map((invitation) => (
                              <div key={invitation.id} className="flex items-center justify-between">
                                <div className="flex items-center">
                                  {invitation.userId ? (
                                    <>
                                      <Avatar className="h-8 w-8 mr-2">
                                        <AvatarFallback>{invitation.user?.username?.[0]?.toUpperCase() || '?'}</AvatarFallback>
                                      </Avatar>
                                      <span>{invitation.user?.username || 'Unknown User'}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Avatar className="h-8 w-8 mr-2">
                                        <AvatarFallback>@</AvatarFallback>
                                      </Avatar>
                                      <span>{invitation.email}</span>
                                    </>
                                  )}
                                </div>
                                <Badge variant={invitation.accepted ? "default" : "outline"} className="text-xs">
                                  {invitation.accepted ? (
                                    <div className="flex items-center">
                                      <UserCheck className="w-3 h-3 mr-1" />
                                      Joined
                                    </div>
                                  ) : (
                                    <div className="flex items-center">
                                      <UserX className="w-3 h-3 mr-1" />
                                      Pending
                                    </div>
                                  )}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-center text-sm text-gray-500 py-4">No invitations sent</p>
                        )}
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          )}
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-gray-50 p-0">
          {isLoading ? (
            <div className="flex justify-center items-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="h-full flex flex-col">
              {/* Room content */}
              <div className="flex-1 flex flex-col">
                {/* Room is live and user can join */}
                {roomData?.room?.status === 'live' && !roomData?.userAccess?.isParticipant && roomData?.userAccess?.canJoin && (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">This room is live!</h2>
                    <p className="text-gray-600 mb-8 max-w-md">
                      Join the conversation to participate in this {roomData?.room?.tag} session.
                    </p>
                    <Button 
                      size="lg"
                      onClick={() => joinRoomMutation.mutate()}
                      disabled={joinRoomMutation.isPending}
                    >
                      {joinRoomMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Joining...
                        </>
                      ) : (
                        "Join Room"
                      )}
                    </Button>
                  </div>
                )}
                
                {/* Room is scheduled */}
                {roomData?.room?.status === 'scheduled' && (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">This room is scheduled</h2>
                    <p className="text-gray-600 mb-2 max-w-md">
                      This room will be live from {format(new Date(roomData.room.startTime), "MMMM d, yyyy h:mm a")} to {format(new Date(roomData.room.endTime), "h:mm a")}.
                    </p>
                    <p className="text-gray-600 mb-8 max-w-md">
                      You'll be able to join the conversation once it's live.
                    </p>
                    
                    {roomData?.userAccess?.isParticipant && (
                      <Badge variant="outline" className="px-4 py-2">
                        You're on the participant list!
                      </Badge>
                    )}
                  </div>
                )}
                
                {/* Room is closed */}
                {roomData?.room?.status === 'closed' && (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">This room is closed</h2>
                    <p className="text-gray-600 mb-8 max-w-md">
                      This session ended on {format(new Date(roomData.room.endTime), "MMMM d, yyyy h:mm a")}.
                    </p>
                    
                    {roomData?.messages?.length > 0 && roomData?.userAccess?.isParticipant && (
                      <div className="bg-white rounded-lg p-6 shadow-sm max-w-md w-full">
                        <h3 className="text-lg font-medium text-gray-900 mb-3">Session Summary</h3>
                        <p className="text-gray-600 mb-4">
                          {roomData.messages.length} messages were exchanged during this session.
                        </p>
                        <div className="flex flex-wrap gap-2 mb-4">
                          <span className="text-sm font-medium text-gray-700">Participants:</span>
                          <div className="flex -space-x-2 overflow-hidden">
                            {roomData.participants.slice(0, 5).map((participant, idx) => (
                              <Avatar key={idx} className="border-2 border-white w-8 h-8">
                                <AvatarFallback>{participant.username.charAt(0).toUpperCase()}</AvatarFallback>
                              </Avatar>
                            ))}
                            {roomData.participants.length > 5 && (
                              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 border-2 border-white text-xs text-gray-500">
                                +{roomData.participants.length - 5}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Chat component for participants in live rooms */}
                {roomData?.room?.status === 'live' && roomData?.userAccess?.isParticipant && (
                  <RoomChat 
                    roomId={roomId as number}
                    messages={allMessages}
                    participants={roomData.participants}
                    onSendMessage={(content): boolean => {
                      const now = new Date().toISOString();
                      return sendMessage({
                        type: 'message',
                        content,
                        roomId,
                        userId: user?.id,
                        createdAt: now,
                        message: {
                          content,
                          roomId,
                          userId: user?.id,
                          createdAt: now
                        }
                      });
                    }}
                  />
                )}
              </div>
            </div>
          )}
        </main>
      </div>
      
      {/* Bottom Navigation (mobile only) */}
      <MobileNav activePage="dashboard" />
    </div>
  );
}
