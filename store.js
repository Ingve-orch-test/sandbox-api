// In-memory message store. Message model:
//   { id: string, senderName: string, senderImage: string (URL), title: string, unread: boolean }
const SEED = [
  { id: 'm1', senderName: 'Ada Lovelace', senderImage: 'https://example.com/avatars/ada.png', title: 'The engine is ready for review', unread: true },
  { id: 'm2', senderName: 'Grace Hopper', senderImage: 'https://example.com/avatars/grace.png', title: 'Found the bug, it was a moth', unread: false },
  { id: 'm3', senderName: 'Alan Turing', senderImage: 'https://example.com/avatars/alan.png', title: 'Re: Halting problem notes', unread: true },
  { id: 'm4', senderName: 'Katherine Johnson', senderImage: 'https://example.com/avatars/katherine.png', title: 'Trajectory numbers attached', unread: false },
];

function createStore(seed = SEED) {
  const messages = seed.map((m) => ({ ...m }));
  return {
    list({ unreadOnly = false } = {}) {
      return messages.filter((m) => !unreadOnly || m.unread).map((m) => ({ ...m }));
    },
  };
}

module.exports = { createStore, SEED };
