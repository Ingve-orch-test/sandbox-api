(function () {
  var list = document.getElementById('list');
  var status = document.getElementById('status');
  var countEl = document.getElementById('unread-count');
  var markAllBtn = document.getElementById('mark-all-read');
  var searchEl = document.getElementById('search');
  var inboxBtn = document.getElementById('view-inbox');
  var archiveBtn = document.getElementById('view-archive');
  var archivedView = false;
  var searchTerm = '';
  var requestId = 0;
  var debounce = null;
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
    var arch = element('button', 'delete-btn', archivedView ? 'Unarchive' : 'Archive');
    arch.type = 'button';
    arch.setAttribute('aria-label', archivedView ? 'Unarchive message' : 'Archive message');
    arch.addEventListener('click', function () {
      send('/messages/' + encodeURIComponent(message.id) + (archivedView ? '/unarchive' : '/archive'),
        'POST', message.id, li, arch, 'Could not ' + (archivedView ? 'unarchive' : 'archive') + ' message.');
    });
    li.appendChild(arch);
    var del = element('button', 'delete-btn', 'Delete');
    del.type = 'button';
    del.setAttribute('aria-label', 'Delete message');
    del.addEventListener('click', function () {
      send('/messages/' + encodeURIComponent(message.id), 'DELETE', message.id, li, del, 'Could not delete message.');
    });
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

  function emptyText() {
    if (searchTerm.trim()) return 'No matches';
    return archivedView ? 'No archived messages' : 'No messages';
  }

  // Delete / archive / unarchive: on success the row leaves the current view.
  function send(url, method, id, li, btn, failText) {
    btn.disabled = true;
    errorEl.hidden = true;
    fetch(url, { method: method })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        current = window.InboxUnread.removeMessage(current, id);
        if (li.parentNode) li.parentNode.removeChild(li);
        if (current.length === 0) showStatus(emptyText(), false);
        else updateSummary();
      })
      .catch(function () {
        btn.disabled = false;
        errorEl.textContent = failText;
        errorEl.hidden = false;
      });
  }

  function render(messages) {
    current = messages.slice();
    errorEl.hidden = true;
    if (messages.length === 0) {
      showStatus(emptyText(), false);
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
    var mine = ++requestId;
    var qs = window.InboxUnread.listQuery(searchTerm, archivedView);
    (qs ? fetch('/messages?' + qs) : fetch('/messages'))
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (body) {
        if (mine !== requestId) return; // a newer search/view superseded this one
        if (!body || !Array.isArray(body.messages)) throw new Error('bad response');
        render(body.messages);
      })
      .catch(function () { if (mine === requestId) showStatus('Could not load messages.', true); });
  }

  function setView(archived) {
    archivedView = archived;
    inboxBtn.className = 'view-btn' + (archived ? '' : ' active');
    archiveBtn.className = 'view-btn' + (archived ? ' active' : '');
    inboxBtn.setAttribute('aria-pressed', String(!archived));
    archiveBtn.setAttribute('aria-pressed', String(archived));
    load();
  }
  inboxBtn.addEventListener('click', function () { setView(false); });
  archiveBtn.addEventListener('click', function () { setView(true); });
  searchEl.addEventListener('input', function () {
    clearTimeout(debounce);
    debounce = setTimeout(function () { searchTerm = searchEl.value; load(); }, 250);
  });

  // Deep links: /inbox?q=ada&view=archive
  var initial = new URLSearchParams(location.search);
  searchTerm = initial.get('q') || '';
  searchEl.value = searchTerm;
  setView(initial.get('view') === 'archive');
})();
