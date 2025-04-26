import { users, type User, type InsertUser, rooms, Room, InsertRoom, roomInvitations, RoomInvitation, InsertRoomInvitation, roomParticipants, RoomParticipant, messages, Message, InsertMessage, reactions, Reaction, InsertReaction, RoomStatus } from "@shared/schema";
import { db } from "./db";
import { and, eq, gte, lte, inArray, or, isNull } from "drizzle-orm";
import connectPg from "connect-pg-simple";
import session from "express-session";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  // User related methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Room related methods
  getRoom(id: number): Promise<Room | undefined>;
  getRoomsByCreator(creatorId: number): Promise<Room[]>;
  getRoomsByParticipant(userId: number): Promise<Room[]>;
  getRoomsByInvitation(userId: number): Promise<Room[]>;
  getPublicRooms(): Promise<Room[]>;
  createRoom(room: InsertRoom): Promise<Room>;
  updateRoomStatus(id: number, status: RoomStatus): Promise<Room | undefined>;
  
  // Room invitation methods
  getRoomInvitation(id: number): Promise<RoomInvitation | undefined>;
  getRoomInvitationsByRoom(roomId: number): Promise<RoomInvitation[]>;
  getRoomInvitationsByUser(userId: number): Promise<RoomInvitation[]>;
  createRoomInvitation(invitation: InsertRoomInvitation): Promise<RoomInvitation>;
  acceptRoomInvitation(id: number): Promise<RoomInvitation | undefined>;
  
  // Room participant methods
  addRoomParticipant(roomId: number, userId: number): Promise<RoomParticipant>;
  getRoomParticipants(roomId: number): Promise<User[]>;
  isRoomParticipant(roomId: number, userId: number): Promise<boolean>;
  
  // Message methods
  createMessage(message: InsertMessage): Promise<Message>;
  getRoomMessages(roomId: number): Promise<Message[]>;
  
  // Reaction methods
  createReaction(reaction: InsertReaction): Promise<Reaction>;
  removeReaction(roomId: number, userId: number, type: string): Promise<void>;
  getRoomReactions(roomId: number): Promise<Reaction[]>;
  
  // Utils
  updateRoomStatuses(): Promise<{
    goingLive: Room[];
    goingClosed: Room[];
  }>;
  
  // Session store
  sessionStore: any; // Using 'any' for session store to avoid type conflicts
}

export class DatabaseStorage implements IStorage {
  sessionStore: any; // Using any for session store
  
  constructor() {
    this.sessionStore = new PostgresSessionStore({ 
      pool,
      createTableIfMissing: true 
    });
  }
  
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }
  
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }
  
  // Room methods
  async getRoom(id: number): Promise<Room | undefined> {
    const [room] = await db.select().from(rooms).where(eq(rooms.id, id));
    return room;
  }
  
  async getRoomsByCreator(creatorId: number): Promise<Room[]> {
    return db.select().from(rooms).where(eq(rooms.creatorId, creatorId))
      .orderBy(rooms.startTime);
  }
  
  async getRoomsByParticipant(userId: number): Promise<Room[]> {
    return db.select({ room: rooms })
      .from(rooms)
      .innerJoin(roomParticipants, eq(rooms.id, roomParticipants.roomId))
      .where(eq(roomParticipants.userId, userId))
      .orderBy(rooms.startTime)
      .then(results => results.map(r => r.room));
  }
  
  async getRoomsByInvitation(userId: number): Promise<Room[]> {
    return db.select({ room: rooms })
      .from(rooms)
      .innerJoin(roomInvitations, eq(rooms.id, roomInvitations.roomId))
      .where(and(
        eq(roomInvitations.userId, userId),
        eq(roomInvitations.accepted, false)
      ))
      .orderBy(rooms.startTime)
      .then(results => results.map(r => r.room));
  }
  
  async getPublicRooms(): Promise<Room[]> {
    return db.select().from(rooms)
      .where(eq(rooms.type, 'public'))
      .orderBy(rooms.startTime);
  }
  
  async createRoom(insertRoom: InsertRoom): Promise<Room> {
    const now = new Date();
    let status: RoomStatus = "scheduled";
    
    if (insertRoom.startTime <= now && insertRoom.endTime > now) {
      status = "live";
    } else if (insertRoom.endTime <= now) {
      status = "closed";
    }
    
    const [room] = await db
      .insert(rooms)
      .values({ ...insertRoom, status })
      .returning();
      
    // Add creator as participant
    await this.addRoomParticipant(room.id, room.creatorId);
    
    return room;
  }
  
  async updateRoomStatus(id: number, status: RoomStatus): Promise<Room | undefined> {
    const [room] = await db
      .update(rooms)
      .set({ status })
      .where(eq(rooms.id, id))
      .returning();
    
    return room;
  }
  
  // Room invitation methods
  async getRoomInvitation(id: number): Promise<RoomInvitation | undefined> {
    const [invitation] = await db.select().from(roomInvitations).where(eq(roomInvitations.id, id));
    return invitation;
  }
  
  async getRoomInvitationsByRoom(roomId: number): Promise<RoomInvitation[]> {
    return db.select().from(roomInvitations).where(eq(roomInvitations.roomId, roomId));
  }
  
  async getRoomInvitationsByUser(userId: number): Promise<RoomInvitation[]> {
    return db.select().from(roomInvitations).where(eq(roomInvitations.userId, userId));
  }
  
  async createRoomInvitation(invitation: InsertRoomInvitation): Promise<RoomInvitation> {
    // Don't allow both userId and email to be set
    if (invitation.userId && invitation.email) {
      throw new Error("Cannot set both userId and email for an invitation");
    }
    
    // Don't allow neither userId nor email to be set
    if (!invitation.userId && !invitation.email) {
      throw new Error("Either userId or email must be set for an invitation");
    }
    
    const [createdInvitation] = await db
      .insert(roomInvitations)
      .values(invitation)
      .returning();
      
    return createdInvitation;
  }
  
  async acceptRoomInvitation(id: number): Promise<RoomInvitation | undefined> {
    const [invitation] = await db
      .update(roomInvitations)
      .set({ accepted: true })
      .where(eq(roomInvitations.id, id))
      .returning();
    
    if (invitation && invitation.userId) {
      await this.addRoomParticipant(invitation.roomId, invitation.userId);
    }
    
    return invitation;
  }
  
  // Room participant methods
  async addRoomParticipant(roomId: number, userId: number): Promise<RoomParticipant> {
    // Check if already a participant
    const isParticipant = await this.isRoomParticipant(roomId, userId);
    
    if (isParticipant) {
      throw new Error("User is already a participant in this room");
    }
    
    const [participant] = await db
      .insert(roomParticipants)
      .values({ roomId, userId })
      .returning();
      
    return participant;
  }
  
  async getRoomParticipants(roomId: number): Promise<User[]> {
    return db.select({ user: users })
      .from(users)
      .innerJoin(roomParticipants, eq(users.id, roomParticipants.userId))
      .where(eq(roomParticipants.roomId, roomId))
      .then(results => results.map(r => r.user));
  }
  
  async isRoomParticipant(roomId: number, userId: number): Promise<boolean> {
    const [participant] = await db.select()
      .from(roomParticipants)
      .where(and(
        eq(roomParticipants.roomId, roomId),
        eq(roomParticipants.userId, userId)
      ));
      
    return !!participant;
  }
  
  // Message methods
  async createMessage(message: InsertMessage): Promise<Message> {
    const [createdMessage] = await db
      .insert(messages)
      .values(message)
      .returning();
      
    return createdMessage;
  }
  
  async getRoomMessages(roomId: number): Promise<Message[]> {
    return db.select().from(messages)
      .where(eq(messages.roomId, roomId))
      .orderBy(messages.createdAt);
  }
  
  // Reaction methods
  async createReaction(reaction: InsertReaction): Promise<Reaction> {
    // Remove any existing reaction of the same type from the same user
    await this.removeReaction(reaction.roomId, reaction.userId, reaction.type);
    
    const [createdReaction] = await db
      .insert(reactions)
      .values(reaction)
      .returning();
      
    return createdReaction;
  }
  
  async removeReaction(roomId: number, userId: number, type: string): Promise<void> {
    await db.delete(reactions)
      .where(and(
        eq(reactions.roomId, roomId),
        eq(reactions.userId, userId),
        eq(reactions.type, type)
      ));
  }
  
  async getRoomReactions(roomId: number): Promise<Reaction[]> {
    return db.select().from(reactions)
      .where(eq(reactions.roomId, roomId));
  }
  
  // Utils
  async updateRoomStatuses(): Promise<{
    goingLive: Room[];
    goingClosed: Room[];
  }> {
    const now = new Date();
    
    // Find rooms that should be live (currently scheduled but within time window)
    const roomsToGoLive = await db.select()
      .from(rooms)
      .where(and(
        eq(rooms.status, "scheduled"),
        lte(rooms.startTime, now),
        gte(rooms.endTime, now)
      ));
    
    if (roomsToGoLive.length > 0) {
      // Update them to live status
      await db.update(rooms)
        .set({ status: "live" })
        .where(inArray(rooms.id, roomsToGoLive.map(r => r.id)));
    }
      
    // Find rooms that should be closed (currently live but past end time)
    const roomsToClose = await db.select()
      .from(rooms)
      .where(and(
        eq(rooms.status, "live"),
        lte(rooms.endTime, now)
      ));
    
    if (roomsToClose.length > 0) {
      // Update them to closed status
      await db.update(rooms)
        .set({ status: "closed" })
        .where(inArray(rooms.id, roomsToClose.map(r => r.id)));
    }
    
    return {
      goingLive: roomsToGoLive,
      goingClosed: roomsToClose
    };
  }
}

export const storage = new DatabaseStorage();
