import { z } from "zod";
export const text = z.string().trim().min(1).max(100);
export const integer = z.number().int().min(0).max(1_000_000);
export const reservationSchema = z
  .object({
    seatId: text,
    name: text,
    studentId: z.string().trim().min(1).max(30),
  })
  .strict();
export const productSchema = z
  .object({
    id: text.optional(),
    name: text,
    price: integer,
    stock: integer,
    enabled: z.boolean().optional(),
  })
  .strict();
export const extensionSchema = z
  .object({
    id: text.optional(),
    name: text,
    price: integer,
    seconds: integer.min(60).max(86400),
    enabled: z.boolean().optional(),
  })
  .strict();
export const gameSchema = z
  .object({
    id: text.optional(),
    name: text,
    description: z.string().max(200).default(""),
    executable: z.string().max(1000).default(""),
    args: z.array(z.string().max(1000)).max(20).default([]),
    paths: z.record(z.string().max(1000)).default({}),
    enabled: z.boolean().default(true),
  })
  .strict();
export const settingsSchema = z
  .object({
    title: text,
    initialSeconds: integer.min(60).max(86400),
    initialMoney: integer,
    reservationSeconds: integer.min(60).max(3600),
  })
  .strict();
export type Product = z.infer<typeof productSchema> & {
  id: string;
  enabled: boolean;
};
export type Extension = z.infer<typeof extensionSchema> & {
  id: string;
  enabled: boolean;
};
export type Game = z.infer<typeof gameSchema> & { id: string };
export type Settings = z.infer<typeof settingsSchema>;
export type Session = {
  id: string;
  seatId: string;
  name: string;
  studentId: string;
  codeHash: string;
  code?: string;
  money: number;
  seconds: number;
  createdAt: number;
  expiresAt: number;
  endAt: number | null;
  status: "reserved" | "active" | "ended";
};
export type Seat = { id: string; name: string; enabled: boolean };
export type Device = {
  id: string;
  seatId: string;
  tokenHash: string;
  lastSeen: number;
  recoveryHash: string;
};
export type Order = {
  id: string;
  sessionId: string;
  seatId: string;
  productId: string;
  name: string;
  price: number;
  status: "received" | "preparing" | "delivered" | "cancelled";
  createdAt: number;
};
export type Command = {
  id: string;
  deviceId: string;
  type: "exit" | "shutdown";
  expiresAt: number;
  status: "pending" | "accepted" | "failed" | "expired";
  message?: string;
};
export type ExitRequest = {
  id: string;
  deviceId: string;
  seatId: string;
  expiresAt: number;
  status: "pending" | "approved" | "rejected" | "expired";
};
export type Audit = {
  at: number;
  action: string;
  target: string;
  detail: string;
};
export type PublicSeat = Seat & {
  online: boolean;
  session: { status: string } | null;
};
export type PublicState = {
  settings: Settings;
  seats: PublicSeat[];
  products: Product[];
  extensions: Extension[];
  games: { id: string; name: string; description: string }[];
  serverNow: number;
};
export type DeviceState = {
  device: { id: string; seatId: string; seatName: string };
  session: Omit<Session, "codeHash" | "code"> | null;
  products: Product[];
  extensions: Extension[];
  games: Game[];
  orders: Order[];
  commands: Command[];
  exitRequests: ExitRequest[];
  serverNow: number;
};
export type AdminState = {
  settings: Settings;
  seats: (PublicSeat & { deviceId?: string })[];
  sessions: Omit<Session, "codeHash" | "code">[];
  products: Product[];
  extensions: Extension[];
  games: Game[];
  orders: Order[];
  exitRequests: ExitRequest[];
  commands: Command[];
  audit: Audit[];
  serverNow: number;
};
