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

  var api = { unreadCount: unreadCount, badgeState: badgeState };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InboxUnread = api;
})(typeof self !== 'undefined' ? self : this);
