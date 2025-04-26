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
  PopoverTrigger 
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

interface RoomChatProps {
  roomId: number;
  messages: any[];
  participants: User[];
  onSendMessage: (content: string) => void;
}

export default function RoomChat({ roomId, messages, participants, onSendMessage }: RoomChatProps) {
  const [messageInput, setMessageInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Group reactions by type for display
  const groupedReactions = messages
    .filter(message => message.type === 'reaction')
    .reduce((acc: Record<string, number>, reaction: any) => {
      if (!acc[reaction.type]) {
        acc[reaction.type] = 0;
      }
      acc[reaction.type]++;
      return acc;
    }, {});
  
  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await apiRequest("POST", `/api/rooms/${roomId}/messages`, { content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}`] });
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
  
  // Send reaction mutation
  const sendReactionMutation = useMutation({
    mutationFn: async (type: ReactionType) => {
      const res = await apiRequest("POST", `/api/rooms/${roomId}/reactions`, { type });
      return res.json();
    },
    onSuccess: () => {
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
    
    onSendMessage(messageInput);
    sendMessageMutation.mutate(messageInput);
  };
  
  // Handle reaction click
  const handleReaction = (type: ReactionType) => {
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
          {messages
            .filter(message => message.type !== 'reaction')
            .map((message, index) => {
              // Find the user for this message
              const messageUser = participants.find(p => p.id === message.userId) || { 
                username: 'Unknown User' 
              };
              
              return (
                <div key={message.id || `temp-${index}`} className="flex items-start">
                  <Avatar className="h-8 w-8 mr-2">
                    <AvatarFallback>{messageUser.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center">
                      <span className="font-medium text-gray-900 text-sm">{messageUser.username}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        {format(new Date(message.createdAt), "HH:mm")}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-gray-700">
                      <p>{message.content}</p>
                    </div>
                  </div>
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
              {REACTION_TYPES.map(type => (
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
