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
  const [roomStatus, setRoomStatus] = useState<string | null>(null);
  const [autoReconnect, setAutoReconnect] = useState(true);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const processedMessagesRef = useRef<Set<string>>(new Set());
  const { toast } = useToast();
  
  // Function to create and configure a WebSocket connection
  const createWebSocketConnection = useCallback(() => {
    if (!enabled || !roomId || !userId) return null;
    
    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Create WebSocket connection
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;
    
    // Event handlers
    socket.addEventListener("open", () => {
      console.log("WebSocket connection established");
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
        
        // Generate a unique key for deduplication
        // Use message ID + type as the key to detect duplicates
        const messageKey = data.type === 'message' && data.message ? 
          `${data.message.id || 'temp'}-${data.message.content}-${data.message.userId}` : null;
        
        // Skip if we've already processed this exact message
        if (messageKey && processedMessagesRef.current.has(messageKey)) {
          return;
        }
        
        // Handle different message types
        if (data.type === 'message' && data.message) {
          const message = data.message;
          
          // Track this message as processed to avoid duplicates
          if (messageKey) {
            processedMessagesRef.current.add(messageKey);
            
            // Limit the size of the processed messages set to avoid memory leaks
            if (processedMessagesRef.current.size > 1000) {
              const entries = Array.from(processedMessagesRef.current);
              processedMessagesRef.current = new Set(entries.slice(-500)); // Keep the most recent 500
            }
          }
          
          setMessages(prev => {
            // Use Map to deduplicate messages by ID
            const newMap = new Map(prev);
            if (message.id) {
              newMap.set(message.id, message);
            } else {
              // For temporary messages without ID, use timestamp + content as key
              const tempKey = `temp-${Date.now()}-${message.content.substring(0, 20)}`;
              newMap.set(tempKey, message);
            }
            return newMap;
          });
        } else if (data.type === 'status_update' && data.status) {
          // Handle room status updates
          console.log('Received room status update:', data);
          setRoomStatus(data.status);
          
          // Force refresh queries to update UI
          try {
            // Access query client from import
            import('@/lib/queryClient').then(({ queryClient }) => {
              queryClient.invalidateQueries({ queryKey: ['/api/rooms'] });
              if (data.roomId) {
                queryClient.invalidateQueries({ queryKey: [`/api/rooms/${data.roomId}`] });
              }
            }).catch(err => {
              console.error('Error importing queryClient:', err);
            });
          } catch (err) {
            console.error('Error refreshing room data:', err);
          }
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
    
    socket.addEventListener("close", (event) => {
      console.log(`WebSocket closed: ${event.code} ${event.reason}`);
      setConnected(false);
      
      // Attempt to reconnect after a delay if auto-reconnect is enabled
      if (autoReconnect && enabled) {
        reconnectTimeoutRef.current = window.setTimeout(() => {
          console.log("Attempting to reconnect WebSocket...");
          createWebSocketConnection();
        }, 3000);
      }
    });
    
    socket.addEventListener("error", (error) => {
      console.error("WebSocket error:", error);
      toast({
        title: "WebSocket Error",
        description: "Connection issue with the room. Will try to reconnect automatically.",
        variant: "destructive",
      });
      
      // The socket will automatically try to close after an error
      // We'll attempt to reconnect in the close handler
    });
    
    return socket;
  }, [enabled, roomId, userId, autoReconnect, toast]);
  
  // Initialize WebSocket connection
  useEffect(() => {
    const socket = createWebSocketConnection();
    
    // Cleanup on unmount or when dependencies change
    return () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close();
      }
    };
  }, [enabled, roomId, userId, createWebSocketConnection]);
  
  // Send message through WebSocket
  const sendMessage = useCallback((message: WebSocketMessage): boolean => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      try {
        socketRef.current.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error("Failed to send message:", error);
        return false;
      }
    } else {
      // If socket is not connected, try to reconnect first then queue the message
      if (enabled && !socketRef.current) {
        createWebSocketConnection();
      }
      return false;
    }
  }, [enabled, createWebSocketConnection]);
  
  // Reset messages when room changes
  useEffect(() => {
    setMessages(new Map());
    processedMessagesRef.current.clear();
  }, [roomId]);
  
  // Convert Map to Array for easier consumption by components
  const messagesArray = Array.from(messages.values());
  
  return {
    connected,
    messages: messagesArray,
    roomStatus,
    sendMessage
  };
}
