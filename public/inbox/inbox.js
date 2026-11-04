(function () {
  var list = document.getElementById('list');
  var status = document.getElementById('status');
  var countEl = document.getElementById('unread-count');
  var markAllBtn = document.getElementById('mark-all-read');

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    var first = parts[0].charAt(0);
    var last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function avatar(message) {
    var box = el('div', 'avatar');
    var showInitials = function () {
      box.textContent = initials(message.senderName);
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
    var li = el('li', message.unread ? 'row unread' : 'row');
    li.appendChild(el('span', 'dot'));
    li.appendChild(avatar(message));
    var text = el('div', 'text');
    text.appendChild(el('div', 'sender', message.senderName));
    text.appendChild(el('div', 'title', message.title));
    li.appendChild(text);
    return li;
  }

  function showStatus(message, isError) {
    list.textContent = '';
    countEl.textContent = '';
    countEl.hidden = true;
    markAllBtn.hidden = true;
    status.hidden = false;
    status.className = isError ? 'status error' : 'status';
    status.textContent = message;
    if (isError) {
      var retry = el('button', '', 'Retry');
      retry.type = 'button';
      retry.addEventListener('click', load);
      status.appendChild(retry);
    }
  }

  function render(messages) {
    if (messages.length === 0) {
      showStatus('No messages', false);
      return;
    }
    status.hidden = true;
    list.textContent = '';
    messages.forEach(function (m) { list.appendChild(row(m)); });
    var badge = window.InboxUnread.badgeState(messages);
    countEl.textContent = badge.text;
    if (badge.label) countEl.setAttribute('aria-label', badge.label);
    else countEl.removeAttribute('aria-label');
    countEl.hidden = badge.hidden;
    markAllBtn.hidden = window.InboxUnread.markAllReadState(messages).hidden;
  }

  markAllBtn.addEventListener('click', function () {
    markAllBtn.disabled = true;
    fetch('/messages/read-all', { method: 'POST' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        markAllBtn.disabled = false;
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
