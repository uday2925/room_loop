import { useState, useRef, useEffect } from "react";
import { User, Message, REACTION_TYPES, ReactionType } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { Send, Plus, Loader2 } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface RoomChatProps {
  roomId: number;
  messages: any[];
  participants: User[];
  onSendMessage: (content: string | object) => boolean;
}

export default function RoomChat({
  roomId,
  messages,
  participants,
  onSendMessage,
}: RoomChatProps) {
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // New simplified reaction handling
  // Group reactions by emoji type for display
  const groupedReactions = messages
    .filter((message) => message.type === "reaction")
    .reduce((acc: Record<string, number>, message: any) => {
      // Get the emoji from the content field in the new format
      // or fallback to reaction.type for backwards compatibility
      const emoji =
        message.content ||
        (message.reaction && message.reaction.type) ||
        message.emoji ||
        null;

      if (!emoji) return acc;

      if (!acc[emoji]) {
        acc[emoji] = 0;
      }
      acc[emoji]++;
      return acc;
    }, {});

  // When WebSocket is working, we don't need to make API calls for messages
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      // First try to send via WebSocket
      const websocketSuccess = onSendMessage(content);

      // WebSocket might return void, so we need to check differently
      // This will skip the API call when websockets work
      if (websocketSuccess === true) {
        return { success: true, content };
      }

      // Fall back to API if WebSocket fails
      const res = await apiRequest("POST", `/api/rooms/${roomId}/messages`, {
        content,
      });
      return res.json();
    },
    onSuccess: () => {
      setMessageInput("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Send reaction mutation - simplified to send just the emoji
  const sendReactionMutation = useMutation({
    mutationFn: async (type: ReactionType) => {
      // New approach: Send just the reaction emoji directly as a special message type
      // This simplifies everything and prevents JSON parsing issues
      const reactionMessage = `${type}`;

      // Send the simplified reaction format
      const websocketSuccess = onSendMessage(reactionMessage);

      // If WebSocket worked, no need for API call
      if (websocketSuccess === true) {
        return { success: true, type };
      }

      // Fall back to API if WebSocket fails
      const res = await apiRequest("POST", `/api/rooms/${roomId}/reactions`, {
        type,
      });
      return res.json();
    },
    onSuccess: () => {
      // We don't need to invalidate queries if using WebSockets since we'll get real-time updates
      // But keep this as a fallback if WebSockets aren't working
      queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add reaction",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle message submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;

    // We need to avoid sending the message twice
    // The mutationFn will try WebSocket, then fall back to API if needed
    // No need to call onSendMessage directly here
    sendMessageMutation.mutate(messageInput);

    // Clear input immediately for better UX
    setMessageInput("");
  };

  // Handle reaction click - optimistic update to prevent duplicates
  const handleReaction = (type: ReactionType) => {
    // Skip sending the reaction if it's in an existing mutation
    if (sendReactionMutation.isPending) {
      return;
    }
    
    sendReactionMutation.mutate(type);
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Chat messages */}
      <ScrollArea className="flex-grow p-4">
        <div className="space-y-4">
          {/* More aggressive duplicate message filtering with multiple check strategies */}
          {Array.from(
            new Map(
              // First filter out reactions
              messages
                .filter((message) => message.type !== "reaction")
                // Then deduplicate using a more sophisticated approach
                // First by ID if available
                // Then by content + userId + approximate timestamp (rounded to the nearest second)
                .map((message) => {
                  // Create a composite key for messages without IDs
                  const key = message.id
                    ? message.id
                    : `${message.userId}-${message.content}-${Math.floor(new Date(message.createdAt).getTime() / 1000)}`;
                  return [key, message];
                }),
            ).values(),
          )
            // Sort by timestamp to ensure messages appear in chronological order
            .sort(
              (a, b) =>
                new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime(),
            )
            .map((message, index) => {
              // Find the user for this message
              const messageUser = participants.find(
                (p) => p.id === message.userId,
              ) || {
                username: "Unknown User",
              };

              // Check if this message is from the current user by comparing with the user's ID in the message
              const isCurrentUser = user?.id === message.userId;

              return (
                <div
                  key={message.id || `temp-${index}`}
                  className={`flex items-start ${isCurrentUser ? "justify-end" : ""}`}
                >
                  {!isCurrentUser && (
                    <Avatar className="h-8 w-8 mr-2 flex-shrink-0">
                      <AvatarFallback>
                        {messageUser.username?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div
                    className={`max-w-[75%] ${isCurrentUser ? "bg-primary text-white" : "bg-gray-100 text-gray-800"} rounded-lg px-4 py-2`}
                  >
                    <div className="flex items-center">
                      <span
                        className={`font-medium text-sm ${isCurrentUser ? "text-gray-100" : "text-gray-900"}`}
                      >
                        {isCurrentUser ? "You" : messageUser.username}
                      </span>
                      <span
                        className={`ml-2 text-xs ${isCurrentUser ? "text-gray-200" : "text-gray-500"}`}
                      >
                        {format(new Date(message.createdAt), "HH:mm")}
                      </span>
                    </div>
                    <div className="mt-1 text-sm break-words">
                      <p>{message.content}</p>
                    </div>
                  </div>

                  {isCurrentUser && (
                    <Avatar className="h-8 w-8 ml-2 flex-shrink-0">
                      <AvatarFallback>
                        {messageUser.username?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              );
            })}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Reactions */}
      <div className="flex items-center space-x-3 p-3 bg-gray-50 border-t border-gray-200">
        {Object.entries(groupedReactions).map(([type, count]) => (
          <Button
            key={type}
            type="button"
            variant="outline"
            className="inline-flex items-center px-3 py-1 border border-transparent text-sm rounded-full text-gray-800 bg-gray-100 hover:bg-gray-200"
            onClick={() => handleReaction(type as ReactionType)}
          >
            {type} <span className="ml-1">{count}</span>
          </Button>
        ))}

        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="inline-flex items-center px-3 py-1 border border-transparent text-sm rounded-full text-gray-800 bg-gray-100 hover:bg-gray-200"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2">
            <div className="flex gap-2 flex-wrap">
              {REACTION_TYPES.map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant="ghost"
                  className="text-xl p-2 h-auto"
                  onClick={() => handleReaction(type)}
                >
                  {type}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Message input */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center p-3 bg-white border-t border-gray-200"
      >
        <Input
          type="text"
          className="flex-grow"
          placeholder="Type your message..."
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          disabled={sendMessageMutation.isPending}
        />
        <Button
          type="submit"
          className="ml-2"
          disabled={sendMessageMutation.isPending || !messageInput.trim()}
        >
          {sendMessageMutation.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </form>
    </div>
  );
}
