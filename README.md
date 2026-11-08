# Open Enterprise Bot

A focused workspace for working with specialized AI assistants—without losing track of the conversations, documents, decisions, and follow-up work they create.

## What you can do

### Work with the right specialist

Keep different experts together in one workspace, whether you need help with a job search, daily work, finances, health planning, or industry research. Search for a Bot, organize them into groups, pin frequent conversations, and create new specialists with their own name, color, and personality.

### Have conversations that move work forward

Ask questions, reply to a specific message, add reactions, upload a document, or share screenshots. A Bot can respond with several related messages instead of forcing every step into a single reply. Choices, progress updates, and handoffs from other specialists remain in the conversation where they belong.

### Keep files and results close at hand

Open uploaded documents and images directly from the conversation. Review file details, inspect screenshots, and keep generated summaries or supporting material alongside the task they relate to.

### Turn conversations into trackable work

A conversation can produce a living opportunity board rather than another message you have to remember. Review opportunities by stage, open the board from the chat, and drag cards between stages as they progress.

### Stay oriented as work grows

Jump between specialists without mixing their conversations. See recent activity in the sidebar, mark conversations as unread, follow updates from another Bot, share a conversation link, and return to the latest messages when you are ready.

## An example workflow

The included **Get Job** workspace shows how the product fits together:

1. Share a résumé with the career assistant.
2. Discuss interview preparation and review suggested outreach.
3. Receive screenshots and delivery updates in the conversation.
4. Open the opportunity board and track each company from outreach to interview.

Other included specialists demonstrate how the same workspace can support work documents, family planning, financial research, and trend monitoring.

## Current product status

This repository contains an interactive product demo with simulated services and persistent demo data. It is designed for product evaluation and frontend development; it does not perform real external actions such as sending emails or contacting companies.

## Open the demo

```bash
cd Frontend
npm install
npm run dev
```

For access from another device on the local network:

```bash
npm run dev:remote
```

Then open `http://mac-mini-1002:4173`, replacing the hostname with the host machine's reachable name or IP address when necessary.

## Developer documentation

Implementation, API integration, and architectural details are documented separately in [Frontend/README.md](Frontend/README.md).
