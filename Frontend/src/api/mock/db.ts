import { createInitialBots, createInitialMessages } from "@/domain/bot/data";
import type { Bot } from "@/domain/bot/types";
import type { ChatMessage } from "@/domain/chat/types";
import { initialBoardColumns } from "@/domain/kanban/data";
import type { BoardColumn } from "@/domain/kanban/types";

const STORAGE_KEY = "moss.enterprise.mock-db.v1";
let nodeSnapshot: string | null = null;
const readSnapshot = () => typeof localStorage === "undefined" ? nodeSnapshot : localStorage.getItem(STORAGE_KEY);
const writeSnapshot = (value: string) => { if (typeof localStorage === "undefined") nodeSnapshot = value; else localStorage.setItem(STORAGE_KEY, value); };

export interface MockDatabase {
  bots: Bot[];
  messages: Record<string, ChatMessage[]>;
  board: BoardColumn[];
}

function seed(): MockDatabase {
  return { bots: createInitialBots(), messages: createInitialMessages(), board: structuredClone(initialBoardColumns) };
}

export function loadDatabase(): MockDatabase {
  try {
    const saved = readSnapshot();
    if (saved) return JSON.parse(saved) as MockDatabase;
  } catch {
    nodeSnapshot = null;
  }
  const database = seed();
  writeSnapshot(JSON.stringify(database));
  return database;
}

export const database = loadDatabase();
export const persist = () => writeSnapshot(JSON.stringify(database));
