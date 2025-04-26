import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

interface WebSocketOptions {
  enabled: boolean;
  roomId: number;
  userId: number;
}

export function useWebSocket({ enabled, roomId, userId }: WebSocketOptions) {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();
  
  // Initialize WebSocket connection
  useEffect(() => {
    if (!enabled || !roomId || !userId) return;
    
    // Create WebSocket connection
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;
    
    // Event handlers
    socket.addEventListener("open", () => {
      setConnected(true);
      
      // Initialize the connection with user and room info
      socket.send(JSON.stringify({
        type: 'init',
        userId,
        roomId
      }));
    });
    
    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle different message types
        if (data.type === 'message') {
          setMessages(prev => [...prev, data.message]);
        } else if (data.type === 'reaction') {
          // Reactions are handled separately in the room data
        } else if (data.type === 'error') {
          toast({
            title: "WebSocket Error",
            description: data.message,
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    });
    
    socket.addEventListener("close", () => {
      setConnected(false);
    });
    
    socket.addEventListener("error", () => {
      toast({
        title: "WebSocket Error",
        description: "Failed to connect to the room. Please try again.",
        variant: "destructive",
      });
      setConnected(false);
    });
    
    // Cleanup on unmount
    return () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    };
  }, [enabled, roomId, userId, toast]);
  
  // Send message through WebSocket
  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);
  
  // Reset messages when room changes
  useEffect(() => {
    setMessages([]);
  }, [roomId]);
  
  return {
    connected,
    messages,
    sendMessage
  };
}
