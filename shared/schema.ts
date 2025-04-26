import { pgTable, text, serial, integer, boolean, timestamp, foreignKey, unique, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users)
  .pick({
    username: true,
    password: true,
    email: true,
  });

// Room types
export const ROOM_TYPES = ["private", "public"] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

// Room tags
export const ROOM_TAGS = ["hangout", "work", "brainstorm", "wellness", "other"] as const;
export type RoomTag = (typeof ROOM_TAGS)[number];

// Room status
export const ROOM_STATUS = ["scheduled", "live", "closed"] as const;
export type RoomStatus = (typeof ROOM_STATUS)[number];

// Rooms table
export const rooms = pgTable("rooms", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").$type<RoomType>().notNull(),
  tag: text("tag").$type<RoomTag>().notNull(),
  status: text("status").$type<RoomStatus>().default("scheduled").notNull(),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  maxParticipants: integer("max_participants"),
  creatorId: integer("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRoomSchema = createInsertSchema(rooms)
  .pick({
    title: true,
    description: true,
    type: true,
    tag: true,
    startTime: true,
    endTime: true,
    maxParticipants: true,
    creatorId: true,
  })
  .extend({
    type: z.enum(ROOM_TYPES),
    tag: z.enum(ROOM_TAGS),
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    maxParticipants: z.number().int().min(2).optional(),
  });

// Room invitations table
export const roomInvitations = pgTable("room_invitations", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  email: text("email"),
  accepted: boolean("accepted").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    roomUserUnique: unique().on(table.roomId, table.userId),
    roomEmailUnique: unique().on(table.roomId, table.email),
  };
});

export const insertRoomInvitationSchema = createInsertSchema(roomInvitations)
  .pick({
    roomId: true,
    userId: true,
    email: true,
  });

// Room participants table
export const roomParticipants = pgTable("room_participants", {
  roomId: integer("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.roomId, table.userId] }),
  };
});

export const insertRoomParticipantSchema = createInsertSchema(roomParticipants);

// Room messages table
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMessageSchema = createInsertSchema(messages)
  .pick({
    roomId: true,
    userId: true,
    content: true,
  });

// Reaction types
export const REACTION_TYPES = ["👍", "🎉", "❤️", "😂", "😮", "🙏"] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

// Room reactions table
export const reactions = pgTable("reactions", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").$type<ReactionType>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => {
  return {
    roomUserTypeUnique: unique().on(table.roomId, table.userId, table.type),
  };
});

export const insertReactionSchema = createInsertSchema(reactions)
  .pick({
    roomId: true,
    userId: true,
    type: true,
  })
  .extend({
    type: z.enum(REACTION_TYPES),
  });

// Export types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Room = typeof rooms.$inferSelect;
export type InsertRoom = z.infer<typeof insertRoomSchema>;

export type RoomInvitation = typeof roomInvitations.$inferSelect;
export type InsertRoomInvitation = z.infer<typeof insertRoomInvitationSchema>;

export type RoomParticipant = typeof roomParticipants.$inferSelect;
export type InsertRoomParticipant = z.infer<typeof insertRoomParticipantSchema>;

export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;

export type Reaction = typeof reactions.$inferSelect;
export type InsertReaction = z.infer<typeof insertReactionSchema>;
