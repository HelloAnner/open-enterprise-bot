import { create } from "zustand";

interface ReplyReference { id: string; text: string }
interface UiState {
  activeBotId: string;
  searchQuery: string;
  collapsedGroups: string[];
  typingBotIds: string[];
  taskPhases: Record<string, "working" | "thinking">;
  replyTo?: ReplyReference;
  selectBot: (id: string) => void;
  setSearchQuery: (query: string) => void;
  toggleGroup: (group: string) => void;
  setReplyTo: (reply?: ReplyReference) => void;
  setTyping: (botId: string, typing: boolean) => void;
  setTaskPhase: (botId: string, phase: "working" | "thinking") => void;
}

const requestedBot = window.location.hash.startsWith("#bot=") ? window.location.hash.slice(5) : "get-job";

export const useUiStore = create<UiState>((set) => ({
  activeBotId: requestedBot,
  searchQuery: "",
  collapsedGroups: [],
  typingBotIds: [],
  taskPhases: {},
  selectBot: (activeBotId) => {
    window.history.replaceState(null, "", `#bot=${activeBotId}`);
    set({ activeBotId, replyTo: undefined });
  },
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  toggleGroup: (group) => set((state) => ({ collapsedGroups: state.collapsedGroups.includes(group) ? state.collapsedGroups.filter((item) => item !== group) : [...state.collapsedGroups, group] })),
  setReplyTo: (replyTo) => set({ replyTo }),
  setTyping: (botId, typing) => set((state) => {
    const taskPhases = { ...state.taskPhases };
    if (typing) taskPhases[botId] = "working";
    else delete taskPhases[botId];
    return { taskPhases, typingBotIds: typing ? [...new Set([...state.typingBotIds, botId])] : state.typingBotIds.filter((id) => id !== botId) };
  }),
  setTaskPhase: (botId, phase) => set((state) => ({ taskPhases: { ...state.taskPhases, [botId]: phase }, typingBotIds: [...new Set([...state.typingBotIds, botId])] })),
}));
