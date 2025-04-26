import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { X, Plus, Loader2 } from "lucide-react";
import { ROOM_TYPES, ROOM_TAGS } from "@shared/schema";
import { addMinutes, addHours, format } from "date-fns";

// Create schema for room creation
const createRoomSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100, "Title cannot exceed 100 characters"),
  description: z.string().optional(),
  type: z.enum(ROOM_TYPES as unknown as [string, ...string[]]),
  tag: z.enum(ROOM_TAGS as unknown as [string, ...string[]]),
  startTime: z.coerce.date().refine(date => date > new Date(), {
    message: "Start time must be in the future",
  }),
  endTime: z.coerce.date().refine(date => date > new Date(), {
    message: "End time must be in the future",
  }),
  maxParticipants: z.coerce.number().int().min(2, "Must allow at least 2 participants").optional(),
});

// Extend schema with custom validation
const createRoomFormSchema = createRoomSchema.refine(
  data => data.endTime > data.startTime,
  {
    message: "End time must be after start time",
    path: ["endTime"],
  }
);

interface CreateRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CreateRoomDialog({ open, onOpenChange }: CreateRoomDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [invitations, setInvitations] = useState<{ username?: string; email?: string }[]>([]);
  const [inviteInput, setInviteInput] = useState("");
  
  // Default form values
  const now = new Date();
  const defaultStartTime = addMinutes(now, 15);
  const defaultEndTime = addHours(defaultStartTime, 1);
  
  // Initialize form
  const form = useForm<z.infer<typeof createRoomFormSchema>>({
    resolver: zodResolver(createRoomFormSchema),
    defaultValues: {
      title: "",
      description: "",
      type: "private",
      tag: "hangout",
      startTime: defaultStartTime,
      endTime: defaultEndTime,
    },
  });
  
  // Create room mutation
  const createRoomMutation = useMutation({
    mutationFn: async (values: z.infer<typeof createRoomFormSchema>) => {
      const payload = {
        ...values,
        invitations,
      };
      const res = await apiRequest("POST", "/api/rooms", payload);
      return res.json();
    },
    onSuccess: (room) => {
      toast({
        title: "Room created successfully",
        description: "Your room has been scheduled.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      form.reset();
      setInvitations([]);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create room",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Form submission handler
  function onSubmit(values: z.infer<typeof createRoomFormSchema>) {
    createRoomMutation.mutate(values);
  }
  
  // Add invitation handler
  function addInvitation() {
    if (!inviteInput.trim()) return;
    
    const invitation = inviteInput.includes('@')
      ? { email: inviteInput.trim() }
      : { username: inviteInput.trim() };
    
    setInvitations([...invitations, invitation]);
    setInviteInput("");
  }
  
  // Remove invitation handler
  function removeInvitation(index: number) {
    const newInvitations = [...invitations];
    newInvitations.splice(index, 1);
    setInvitations(newInvitations);
  }
  
  // Format date-time for input
  function formatDateTime(date: Date) {
    return format(date, "yyyy-MM-dd'T'HH:mm");
  }
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-center">Create a New Room</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Room Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Friday Night Doodles" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="What's this room about?" 
                      className="resize-none"
                      {...field} 
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Room Type</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="private">Private</SelectItem>
                        <SelectItem value="public">Public</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="tag"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tag</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a tag" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="hangout">Hangout</SelectItem>
                        <SelectItem value="work">Work</SelectItem>
                        <SelectItem value="brainstorm">Brainstorm</SelectItem>
                        <SelectItem value="wellness">Wellness</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <Input 
                        type="datetime-local" 
                        {...field}
                        value={formatDateTime(field.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="endTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Time</FormLabel>
                    <FormControl>
                      <Input 
                        type="datetime-local" 
                        {...field}
                        value={formatDateTime(field.value)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="maxParticipants"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Participants (Optional)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      placeholder="Leave empty for unlimited"
                      min={2}
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {form.watch("type") === "private" && (
              <div className="border-t border-gray-200 pt-4">
                <FormLabel>Invite People (Private Room Only)</FormLabel>
                <div className="flex space-x-2 mb-2 mt-1">
                  <Input
                    type="text"
                    placeholder="Username or email"
                    value={inviteInput}
                    onChange={(e) => setInviteInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addInvitation();
                      }
                    }}
                  />
                  <Button 
                    type="button" 
                    onClick={addInvitation}
                    className="shrink-0"
                  >
                    Add
                  </Button>
                </div>
                
                {invitations.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {invitations.map((invite, index) => (
                      <div
                        key={index}
                        className="bg-gray-100 rounded-full px-3 py-1 text-sm flex items-center"
                      >
                        <span>{invite.username || invite.email}</span>
                        <button
                          type="button"
                          className="ml-1 text-gray-500 hover:text-gray-700"
                          onClick={() => removeInvitation(index)}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            <DialogFooter className="gap-3 sm:gap-0">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={createRoomMutation.isPending}
              >
                {createRoomMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Room"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
