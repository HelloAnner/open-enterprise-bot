import { create } from "zustand";

interface ReplyReference { id: string; text: string }
interface UiState {
  activeBotId: string;
  searchQuery: string;
  collapsedGroups: string[];
  typingBotIds: string[];
  replyTo?: ReplyReference;
  selectBot: (id: string) => void;
  setSearchQuery: (query: string) => void;
  toggleGroup: (group: string) => void;
  setReplyTo: (reply?: ReplyReference) => void;
  setTyping: (botId: string, typing: boolean) => void;
}

const requestedBot = window.location.hash.startsWith("#bot=") ? window.location.hash.slice(5) : "get-job";

export const useUiStore = create<UiState>((set) => ({
  activeBotId: requestedBot,
  searchQuery: "",
  collapsedGroups: [],
  typingBotIds: [],
  selectBot: (activeBotId) => {
    window.history.replaceState(null, "", `#bot=${activeBotId}`);
    set({ activeBotId, replyTo: undefined });
  },
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  toggleGroup: (group) => set((state) => ({ collapsedGroups: state.collapsedGroups.includes(group) ? state.collapsedGroups.filter((item) => item !== group) : [...state.collapsedGroups, group] })),
  setReplyTo: (replyTo) => set({ replyTo }),
  setTyping: (botId, typing) => set((state) => ({ typingBotIds: typing ? [...new Set([...state.typingBotIds, botId])] : state.typingBotIds.filter((id) => id !== botId) })),
}));
