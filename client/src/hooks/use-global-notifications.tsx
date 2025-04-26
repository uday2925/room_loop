import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import { Room } from "@shared/schema";

interface GlobalNotification {
  type: string;
  room?: Room;
  message?: string;
  [key: string]: any;
}

export function useGlobalNotifications() {
  const [connected, setConnected] = useState(false);
  const [notifications, setNotifications] = useState<GlobalNotification[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Create or reconnect the WebSocket
  const connectWebSocket = useCallback(() => {
    if (!user?.id) return null;
    
    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Initialize a WebSocket for global notifications
    // Using roomId=0 to indicate a global notification connection
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;
    
    socket.addEventListener("open", () => {
      console.log("Global notification WebSocket connected");
      setConnected(true);
      
      // Initialize with user info and room ID of 0 (global notification channel)
      socket.send(JSON.stringify({
        type: 'init',
        userId: user.id,
        roomId: 0 // Special room ID for global notifications
      }));
    });
    
    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle different notification types
        if (data.type === 'room_created' || data.type === 'room_invitation') {
          // Add to notifications array
          setNotifications(prev => [...prev, data]);
          
          // Show toast notification
          toast({
            title: data.type === 'room_created' ? "New Room Available" : "Room Invitation",
            description: data.message || (data.type === 'room_created' 
              ? `A new public room "${data.room?.title}" is available` 
              : `You've been invited to "${data.room?.title}"`),
            variant: "default",
          });
          
          // Invalidate rooms query to refresh the rooms list
          queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
        } 
        
        // Handle room status updates
        else if (data.type === 'room_status_update') {
          // Invalidate specific room query to reflect the status change
          queryClient.invalidateQueries({ queryKey: ["/api/rooms", data.roomId] });
          
          // Also invalidate the rooms list
          queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
          
          // Add to notifications
          setNotifications(prev => [...prev, data]);
          
          // Show toast for status changes
          toast({
            title: "Room Status Updated",
            description: `Room "${data.room?.title}" is now ${data.room?.status}`,
            variant: "default",
          });
        }
      } catch (error) {
        console.error("Failed to parse WebSocket notification:", error);
      }
    });
    
    socket.addEventListener("close", (event) => {
      console.log(`Global notification WebSocket closed: ${event.code}`);
      setConnected(false);
      
      // Attempt to reconnect after a delay
      reconnectTimeoutRef.current = window.setTimeout(() => {
        console.log("Attempting to reconnect global notification WebSocket...");
        connectWebSocket();
      }, 5000);
    });
    
    socket.addEventListener("error", (error) => {
      console.error("Global notification WebSocket error:", error);
      
      // Socket will close automatically after an error
      // We'll attempt to reconnect in the close handler
    });
    
    return socket;
  }, [user?.id, toast]);
  
  // Connect WebSocket on mount and when user changes
  useEffect(() => {
    const socket = connectWebSocket();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close();
      }
    };
  }, [user?.id, connectWebSocket]);
  
  // Function to clear a notification
  const clearNotification = useCallback((index: number) => {
    setNotifications(prev => prev.filter((_, i) => i !== index));
  }, []);
  
  return {
    connected,
    notifications,
    clearNotification
  };
}