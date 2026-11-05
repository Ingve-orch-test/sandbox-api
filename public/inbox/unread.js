// Pure unread-count helpers. Loaded as a browser global (InboxUnread) and
// importable in Node for tests.
(function (root) {
  function unreadCount(messages) {
    if (!Array.isArray(messages)) return 0;
    return messages.filter(function (m) { return m && m.unread === true; }).length;
  }

  // Badge state: hidden at 0 (no text), otherwise the count as text.
  function badgeState(messages) {
    var count = unreadCount(messages);
    return {
      hidden: count === 0,
      text: count === 0 ? '' : String(count),
      label: count === 0 ? '' : count + ' unread'
    };
  }

  // "Mark all as read" button is always shown; disabled when nothing is unread.
  function markAllReadState(messages) {
    return { disabled: unreadCount(messages) === 0 };
  }

  // New messages array with the message of the given id removed (input untouched).
  function removeMessage(messages, id) {
    if (!Array.isArray(messages)) return [];
    return messages.filter(function (m) { return !(m && m.id === id); });
  }

  // Query string for GET /messages: the inbox view asks for archived=false, the archive view for archived=true.
  function listQuery(search, archived) {
    var parts = [];
    var q = String(search || '').trim();
    if (q) parts.push('q=' + encodeURIComponent(q));
    parts.push(archived ? 'archived=true' : 'archived=false');
    return parts.join('&');
  }

  var api = { listQuery: listQuery, removeMessage: removeMessage, unreadCount: unreadCount, badgeState: badgeState, markAllReadState: markAllReadState };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InboxUnread = api;
})(typeof self !== 'undefined' ? self : this);
