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

// Use a type that can be number or string for message IDs
type MessageKey = number | string;

export function useWebSocket({ enabled, roomId, userId }: WebSocketOptions) {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Map<MessageKey, any>>(new Map());
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
          const message = data.message;
          setMessages(prev => {
            // Use Map to deduplicate messages by ID
            const newMap = new Map(prev);
            if (message.id) {
              newMap.set(message.id, message);
            } else {
              // For temporary messages without ID, use timestamp as key
              const tempKey = `temp-${Date.now()}`;
              newMap.set(tempKey, message);
            }
            return newMap;
          });
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
      // Return true if the message was sent successfully
      return true;
    }
    return false;
  }, []);
  
  // Reset messages when room changes
  useEffect(() => {
    setMessages(new Map());
  }, [roomId]);
  
  // Convert Map to Array for easier consumption by components
  const messagesArray = Array.from(messages.values());
  
  return {
    connected,
    messages: messagesArray,
    sendMessage
  };
}
