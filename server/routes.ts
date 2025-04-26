import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { WebSocket } from "ws";
import { storage } from "./storage";
import { setupAuth } from "./auth";
import { insertRoomSchema, insertMessageSchema, insertReactionSchema, insertRoomInvitationSchema } from "@shared/schema";
import { ZodError } from "zod";

interface WebSocketData {
  userId: number;
  roomId: number;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication routes
  setupAuth(app);

  // Create HTTP server
  const httpServer = createServer(app);
  
  // Set up WebSocket server for real-time chat
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Keep track of room connections for broadcasting
  const roomConnections = new Map<number, Set<WebSocket>>();
  
  wss.on('connection', (ws: WebSocket) => {
    let userData: WebSocketData | null = null;
    
    ws.on('message', async (message: string) => {
      try {
        const data = JSON.parse(message);
        
        // Handle connection initialization
        if (data.type === 'init') {
          userData = {
            userId: data.userId,
            roomId: data.roomId
          };
          
          // Add to room connections
          if (!roomConnections.has(userData.roomId)) {
            roomConnections.set(userData.roomId, new Set());
          }
          roomConnections.get(userData.roomId)?.add(ws);
          
          // Send confirmation
          ws.send(JSON.stringify({ type: 'init', success: true }));
          return;
        }
        
        // Handle messages
        if (data.type === 'message' && userData) {
          // Save message to database
          const message = await storage.createMessage({
            roomId: userData.roomId,
            userId: userData.userId,
            content: data.content
          });
          
          // Get user information
          const user = await storage.getUser(userData.userId);
          
          // Broadcast to all clients in the room
          const roomClients = roomConnections.get(userData.roomId) || new Set();
          const outMessage = JSON.stringify({
            type: 'message',
            message: {
              ...message,
              user: { 
                id: user?.id,
                username: user?.username 
              }
            }
          });
          
          roomClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(outMessage);
            }
          });
        }
        
        // Handle reactions
        if (data.type === 'reaction' && userData) {
          const reaction = await storage.createReaction({
            roomId: userData.roomId,
            userId: userData.userId,
            type: data.reactionType
          });
          
          // Broadcast to all clients in the room
          const roomClients = roomConnections.get(userData.roomId) || new Set();
          const outMessage = JSON.stringify({
            type: 'reaction',
            reaction
          });
          
          roomClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(outMessage);
            }
          });
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({ 
          type: 'error', 
          message: error instanceof Error ? error.message : 'Unknown error'
        }));
      }
    });
    
    ws.on('close', () => {
      if (userData) {
        // Remove from room connections
        const roomClients = roomConnections.get(userData.roomId);
        if (roomClients) {
          roomClients.delete(ws);
          if (roomClients.size === 0) {
            roomConnections.delete(userData.roomId);
          }
        }
      }
    });
  });
  
  // Update room statuses periodically (every minute)
  setInterval(async () => {
    try {
      await storage.updateRoomStatuses();
    } catch (error) {
      console.error('Error updating room statuses:', error);
    }
  }, 60 * 1000);
  
  // API routes
  app.get('/api/rooms', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    
    try {
      await storage.updateRoomStatuses();
      
      const user = req.user!;
      const createdRooms = await storage.getRoomsByCreator(user.id);
      const participatingRooms = await storage.getRoomsByParticipant(user.id);
      const invitedRooms = await storage.getRoomsByInvitation(user.id);
      
      // Get unique rooms
      const userRoomIds = new Set([
        ...createdRooms.map(r => r.id),
        ...participatingRooms.map(r => r.id)
      ]);
      
      // Get public rooms that the user is not already part of
      const publicRooms = (await storage.getPublicRooms())
        .filter(room => !userRoomIds.has(room.id));
      
      res.json({
        created: createdRooms,
        participating: participatingRooms,
        invited: invitedRooms,
        public: publicRooms
      });
    } catch (error) {
      console.error('Error fetching rooms:', error);
      res.status(500).json({ message: 'Error fetching rooms' });
    }
  });
  
  app.post('/api/rooms', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    
    try {
      const roomData = insertRoomSchema.parse({
        ...req.body,
        creatorId: req.user!.id
      });
      
      const room = await storage.createRoom(roomData);
      
      // Process invitations if provided
      if (req.body.invitations && Array.isArray(req.body.invitations)) {
        for (const invite of req.body.invitations) {
          try {
            if (invite.username) {
              const user = await storage.getUserByUsername(invite.username);
              if (user) {
                await storage.createRoomInvitation({
                  roomId: room.id,
                  userId: user.id
                });
              }
            } else if (invite.email) {
              await storage.createRoomInvitation({
                roomId: room.id,
                email: invite.email
              });
            }
          } catch (error) {
            console.error('Error creating invitation:', error);
            // Continue with other invitations even if one fails
          }
        }
      }
      
      res.status(201).json(room);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: 'Invalid room data', errors: error.errors });
      } else {
        console.error('Error creating room:', error);
        res.status(500).json({ message: 'Error creating room' });
      }
    }
  });
  
  app.get('/api/rooms/:id', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    
    try {
      const roomId = parseInt(req.params.id);
      if (isNaN(roomId)) {
        return res.status(400).json({ message: 'Invalid room ID' });
      }
      
      const room = await storage.getRoom(roomId);
      if (!room) {
        return res.status(404).json({ message: 'Room not found' });
      }
      
      // Check if user can access the room
      const user = req.user!;
      const isCreator = room.creatorId === user.id;
      const isParticipant = await storage.isRoomParticipant(roomId, user.id);
      const isPublic = room.type === 'public';
      
      if (!isCreator && !isParticipant && !isPublic) {
        return res.status(403).json({ message: 'You do not have access to this room' });
      }
      
      // Check if room is within its time window
      const now = new Date();
      const isWithinTimeWindow = room.startTime <= now && room.endTime > now;
      
      // For closed or scheduled rooms, allow access to creator and participants
      // For live rooms, allow access to creator, participants, and public rooms to anyone
      if (room.status === 'live' && !isWithinTimeWindow) {
        await storage.updateRoomStatus(roomId, 'closed');
        room.status = 'closed';
      } else if (room.status === 'scheduled' && isWithinTimeWindow) {
        await storage.updateRoomStatus(roomId, 'live');
        room.status = 'live';
      }
      
      // Get participants
      const participants = await storage.getRoomParticipants(roomId);
      
      // Get messages if room is live or if user is creator/participant
      let messages = [];
      if (room.status === 'live' || isCreator || isParticipant) {
        messages = await storage.getRoomMessages(roomId);
      }
      
      // Get reactions
      const reactions = await storage.getRoomReactions(roomId);
      
      res.json({
        room,
        participants,
        messages,
        reactions,
        userAccess: {
          isCreator,
          isParticipant,
          canJoin: (room.status === 'live' && (isPublic || isParticipant)),
          canChat: (room.status === 'live' && isParticipant)
        }
      });
    } catch (error) {
      console.error('Error fetching room details:', error);
      res.status(500).json({ message: 'Error fetching room details' });
    }
  });
  
  app.post('/api/rooms/:id/join', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    
    try {
      const roomId = parseInt(req.params.id);
      if (isNaN(roomId)) {
        return res.status(400).json({ message: 'Invalid room ID' });
      }
      
      const room = await storage.getRoom(roomId);
      if (!room) {
        return res.status(404).json({ message: 'Room not found' });
      }
      
      // Check if room is live
      if (room.status !== 'live') {
        return res.status(400).json({ message: 'Room is not currently live' });
      }
      
      // Check if room is at max capacity
      if (room.maxParticipants) {
        const participants = await storage.getRoomParticipants(roomId);
        if (participants.length >= room.maxParticipants) {
          return res.status(400).json({ message: 'Room is at maximum capacity' });
        }
      }
      
      // Check if user is already a participant
      const userId = req.user!.id;
      const isParticipant = await storage.isRoomParticipant(roomId, userId);
      if (isParticipant) {
        return res.status(400).json({ message: 'You are already a participant in this room' });
      }
      
      // Check room type and permission
      if (room.type === 'private') {
        // For private rooms, check if user has an invitation
        const invitations = await storage.getRoomInvitationsByRoom(roomId);
        const userInvitation = invitations.find(inv => inv.userId === userId);
        
        if (!userInvitation) {
          return res.status(403).json({ message: 'You need an invitation to join this private room' });
        }
        
        // Accept the invitation
        await storage.acceptRoomInvitation(userInvitation.id);
      } else {
        // For public rooms, add as participant directly
        await storage.addRoomParticipant(roomId, userId);
      }
      
      res.status(200).json({ message: 'Successfully joined the room' });
    } catch (error) {
      console.error('Error joining room:', error);
      res.status(500).json({ message: 'Error joining room' });
    }
  });
  
  app.post('/api/rooms/:id/messages', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    
    try {
      const roomId = parseInt(req.params.id);
      if (isNaN(roomId)) {
        return res.status(400).json({ message: 'Invalid room ID' });
      }
      
      const room = await storage.getRoom(roomId);
      if (!room) {
        return res.status(404).json({ message: 'Room not found' });
      }
      
      // Check if room is live
      if (room.status !== 'live') {
        return res.status(400).json({ message: 'Cannot send messages to a room that is not live' });
      }
      
      // Check if user is a participant
      const userId = req.user!.id;
      const isParticipant = await storage.isRoomParticipant(roomId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: 'You must be a participant to send messages' });
      }
      
      // Create the message
      const messageData = insertMessageSchema.parse({
        roomId,
        userId,
        content: req.body.content
      });
      
      const message = await storage.createMessage(messageData);
      
      res.status(201).json(message);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: 'Invalid message data', errors: error.errors });
      } else {
        console.error('Error sending message:', error);
        res.status(500).json({ message: 'Error sending message' });
      }
    }
  });
  
  app.post('/api/rooms/:id/reactions', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    
    try {
      const roomId = parseInt(req.params.id);
      if (isNaN(roomId)) {
        return res.status(400).json({ message: 'Invalid room ID' });
      }
      
      const room = await storage.getRoom(roomId);
      if (!room) {
        return res.status(404).json({ message: 'Room not found' });
      }
      
      // Check if room is live
      if (room.status !== 'live') {
        return res.status(400).json({ message: 'Cannot react to a room that is not live' });
      }
      
      // Check if user is a participant
      const userId = req.user!.id;
      const isParticipant = await storage.isRoomParticipant(roomId, userId);
      if (!isParticipant) {
        return res.status(403).json({ message: 'You must be a participant to react' });
      }
      
      // Create the reaction
      const reactionData = insertReactionSchema.parse({
        roomId,
        userId,
        type: req.body.type
      });
      
      const reaction = await storage.createReaction(reactionData);
      
      res.status(201).json(reaction);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: 'Invalid reaction data', errors: error.errors });
      } else {
        console.error('Error adding reaction:', error);
        res.status(500).json({ message: 'Error adding reaction' });
      }
    }
  });
  
  app.post('/api/rooms/:id/invitations', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    
    try {
      const roomId = parseInt(req.params.id);
      if (isNaN(roomId)) {
        return res.status(400).json({ message: 'Invalid room ID' });
      }
      
      const room = await storage.getRoom(roomId);
      if (!room) {
        return res.status(404).json({ message: 'Room not found' });
      }
      
      // Check if user is the creator
      const userId = req.user!.id;
      if (room.creatorId !== userId) {
        return res.status(403).json({ message: 'Only the room creator can send invitations' });
      }
      
      // Handle invitation
      let invitation;
      
      if (req.body.username) {
        // Find user by username
        const invitedUser = await storage.getUserByUsername(req.body.username);
        if (!invitedUser) {
          return res.status(404).json({ message: 'User not found' });
        }
        
        // Create invitation
        invitation = await storage.createRoomInvitation({
          roomId,
          userId: invitedUser.id
        });
      } else if (req.body.email) {
        // Create invitation by email
        invitation = await storage.createRoomInvitation({
          roomId,
          email: req.body.email
        });
      } else {
        return res.status(400).json({ message: 'Either username or email must be provided' });
      }
      
      res.status(201).json(invitation);
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({ message: 'Invalid invitation data', errors: error.errors });
      } else {
        console.error('Error creating invitation:', error);
        res.status(500).json({ message: 'Error creating invitation' });
      }
    }
  });
  
  app.post('/api/invitations/:id/accept', async (req: Request, res: Response) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: 'Unauthorized' });
    
    try {
      const invitationId = parseInt(req.params.id);
      if (isNaN(invitationId)) {
        return res.status(400).json({ message: 'Invalid invitation ID' });
      }
      
      const invitation = await storage.getRoomInvitation(invitationId);
      if (!invitation) {
        return res.status(404).json({ message: 'Invitation not found' });
      }
      
      // Check if user is the invited user
      const userId = req.user!.id;
      if (invitation.userId !== userId) {
        return res.status(403).json({ message: 'This invitation is not for you' });
      }
      
      // Accept the invitation
      await storage.acceptRoomInvitation(invitationId);
      
      res.status(200).json({ message: 'Invitation accepted' });
    } catch (error) {
      console.error('Error accepting invitation:', error);
      res.status(500).json({ message: 'Error accepting invitation' });
    }
  });

  return httpServer;
}
