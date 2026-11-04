(function () {
  var list = document.getElementById('list');
  var status = document.getElementById('status');
  var countEl = document.getElementById('unread-count');
  var markAllBtn = document.getElementById('mark-all-read');
  var current = []; // messages currently shown, kept in sync with the DOM
  var errorEl = document.createElement('div');
  errorEl.className = 'inline-error';
  errorEl.setAttribute('role', 'alert');
  errorEl.hidden = true;
  list.parentNode.insertBefore(errorEl, list);

  function initialsfn(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    var first = parts[0].charAt(0);
    var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first+last).toUpperCase();
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function avatar(message) {
    var box = element('div', 'avatar');
    var showInitials = function () {
      box.textContent = initialsfn(message.senderName);
    };
    if (typeof message.senderImage === 'string' && message.senderImage) {
      var img = document.createElement('img');
      img.alt = '';
      img.addEventListener('error', showInitials);
      img.src = message.senderImage;
      box.appendChild(img);
    } else {
      showInitials();
    }
    return box;
  }

  function row(message) {
    var li = element('li', message.unread ? 'row unread' : 'row');
    li.appendChild(element('span', 'dot'));
    li.appendChild(avatar(message));
    var text = element('div', 'text');
    text.appendChild(element('div', 'sender', message.senderName));
    text.appendChild(element('div', 'title', message.title));
    li.appendChild(text);
    var del = element('button', 'delete-btn', 'Delete');
    del.type = 'button';
    del.setAttribute('aria-label', 'Delete message');
    del.addEventListener('click', function () { deleteMessage(message.id, li, del); });
    li.appendChild(del);
    return li;
  }

  function showStatus(message, isError) {
    errorEl.hidden = true;
    list.textContent = '';
    countEl.textContent = '';
    countEl.hidden = true;
    markAllBtn.hidden = true; // hidden whenever the list isn't shown (loading, error, empty)
    status.hidden = false;
    status.className = isError ? 'status error' : 'status';
    status.textContent = message;
    if (isError) {
      var retry = element('button', '', 'Retry');
      retry.type = 'button';
      retry.addEventListener('click', load);
      status.appendChild(retry);
    }
  }

  function updateSummary() {
    var badge = window.InboxUnread.badgeState(current);
    countEl.textContent = badge.text;
    if (badge.label) countEl.setAttribute('aria-label', badge.label);
    else countEl.removeAttribute('aria-label');
    countEl.hidden = badge.hidden;
    markAllBtn.hidden = false;
    markAllBtn.disabled = window.InboxUnread.markAllReadState(current).disabled;
  }

  function deleteMessage(id, li, btn) {
    btn.disabled = true;
    errorEl.hidden = true;
    fetch('/messages/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        current = window.InboxUnread.removeMessage(current, id);
        if (li.parentNode) li.parentNode.removeChild(li);
        if (current.length === 0) showStatus('No messages', false);
        else updateSummary();
      })
      .catch(function () {
        btn.disabled = false;
        errorEl.textContent = 'Could not delete message.';
        errorEl.hidden = false;
      });
  }

  function render(messages) {
    current = messages.slice();
    errorEl.hidden = true;
    if (messages.length === 0) {
      showStatus('No messages', false);
      return;
    }
    status.hidden = true;
    list.textContent = '';
    messages.forEach(function (m) { list.appendChild(row(m)); });
    updateSummary();
  }

  markAllBtn.addEventListener('click', function () {
    markAllBtn.disabled = true;
    fetch('/messages/read-all', { method: 'POST' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        load();
      })
      .catch(function () {
        markAllBtn.disabled = false;
        showStatus('Could not mark messages as read.', true);
      });
  });

  function load() {
    showStatus('Loading…', false);
    fetch('/messages')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (body) {
        if (!body || !Array.isArray(body.messages)) throw new Error('bad response');
        render(body.messages);
      })
      .catch(function () { showStatus('Could not load messages.', true); });
  }

  load();
})();
