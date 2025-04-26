import { useState, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

interface WebSocketMessage {
  type: string;
  content?: string;
  reactionType?: string;
  [key: string]: any;
}

// We need to accept string | object for proper message type handling
type WebSocketSendMessage = WebSocketMessage | string;

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
        // Log raw message for debugging
        console.log("WebSocket received:", event.data.substring(0, 100));
        
        // Parse the message
        const data = JSON.parse(event.data);
        
        // Generate a unique key for deduplication based on message type
        let messageKey = null;
        
        if (data.type === 'message' && data.message) {
          // For regular messages, use ID + content + userId as the key
          // If ID exists, use it as the primary key
          if (data.message.id) {
            messageKey = `msg-${data.message.id}`;
          } else {
            // For messages without ID, use content hash + userId + approximate timestamp
            const contentHash = data.message.content?.substring(0, 20) || 'empty';
            const userId = data.message.userId || 'unknown';
            const timestamp = Math.floor((data.message.createdAt ? 
              new Date(data.message.createdAt).getTime() : 
              Date.now()) / 1000); // Round to seconds
            
            messageKey = `msg-temp-${userId}-${contentHash}-${timestamp}`;
          }
        } else if (data.type === 'reaction' && data.reaction) {
          // For reactions, use ID + type + userId as the key
          // For reactions, prefer using the reaction ID if available
          if (data.reaction.id) {
            messageKey = `reaction-${data.reaction.id}`;
          } else {
            messageKey = `reaction-temp-${data.reaction.userId || 'unknown'}-${data.reaction.type || 'unknown'}-${Date.now()}`;
          }
        } else if (data.type === 'room_status_update') {
          // For room updates, use the roomId + status + timestamp
          messageKey = `status-${data.roomId}-${data.room?.status || 'unknown'}-${Math.floor(Date.now() / 1000)}`;
        }
        
        // Log message key for debugging
        console.log("WebSocket message key:", messageKey);
        
        // Skip if we've already processed this exact message/reaction in the last few seconds
        if (messageKey && processedMessagesRef.current.has(messageKey)) {
          console.log("Skipping duplicate message:", messageKey);
          return;
        }
        
        // Add to processed messages to avoid duplicates
        if (messageKey) {
          processedMessagesRef.current.add(messageKey);
          
          // Limit the size of the processed messages set to avoid memory leaks
          if (processedMessagesRef.current.size > 1000) {
            const entries = Array.from(processedMessagesRef.current);
            processedMessagesRef.current = new Set(entries.slice(-500)); // Keep the most recent 500
          }
          
          // Only keep messages for 10 seconds to allow reprocessing after a reasonable time
          // This helps if the same message is legitimately sent again later
          setTimeout(() => {
            processedMessagesRef.current.delete(messageKey!);
          }, 10000);
        }
        
        // Handle different message types
        if (data.type === 'message' && data.message) {
          const message = data.message;
          
          setMessages(prev => {
            // Use Map to deduplicate messages by ID
            const newMap = new Map(prev);
            
            // For messages with an ID, check if we already have it to avoid replacing existing ones
            if (message.id && !newMap.has(message.id)) {
              newMap.set(message.id, message);
            } 
            // For messages without an ID (like temporary messages), always add as new
            else if (!message.id) {
              // Generate a unique key with timestamp to prevent collisions
              const timestamp = Date.now();
              const tempKey = `temp-${timestamp}-${Math.random().toString(36).substring(2, 9)}-${message.content.substring(0, 10)}`;
              newMap.set(tempKey, {
                ...message,
                // Add an artificial ID to the message to prevent future replacements
                id: tempKey 
              });
            }
            return newMap;
          });
        } else if (data.type === 'reaction' && data.reaction) {
          const reaction = data.reaction;
          
          setMessages(prev => {
            // Use Map to deduplicate reactions by ID
            const newMap = new Map(prev);
            const reactionKey = reaction.id ? 
              `reaction-${reaction.id}` : 
              `reaction-temp-${Date.now()}-${reaction.type}-${reaction.userId}`;
            
            newMap.set(reactionKey, { 
              type: 'reaction', 
              reaction, 
              id: reactionKey,
              // We need a timestamp for sorting
              createdAt: reaction.createdAt || new Date().toISOString()
            });
            
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
  
  // Send message through WebSocket - handle both string and object formats
  const sendMessage = useCallback((message: WebSocketSendMessage): boolean => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      try {
        // Handle different message formats
        if (typeof message === 'string') {
          // Check if it's already a JSON string
          if (message.startsWith('{') && message.endsWith('}')) {
            console.log('Sending pre-formatted JSON string');
            socketRef.current.send(message);
          } else {
            // Plain text message
            socketRef.current.send(JSON.stringify({
              type: 'message',
              content: message
            }));
          }
        } else {
          // Object - convert to JSON
          socketRef.current.send(JSON.stringify(message));
        }
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
    sendMessage
  };
}
