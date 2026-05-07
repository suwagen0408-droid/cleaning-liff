// ============================================================
// app.js - 管理者承認ページ（LIFF不要・シンプルウェブアプリ版）
// ============================================================

var GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzIEfUMpaOVsMcKOwEQnIIrDa_oqx2Cbz0DmeUKiacrAfsTr_ScoImhbJb8kgIXA2ls2Q/exec';

var state = {
  recordId: null,
  record: null,
  pendingAction: null,
  retakePhotoIndex: null,
  retakePhotoLabel: null,
};

document.addEventListener('DOMContentLoaded', function () {
  var params = new URLSearchParams(window.location.search);
  state.recordId = params.get('record_id');

  if (!state.recordId) {
    showError('URLにrecord_idが含まれていません。\nLINE通知のリンクから開いてください。');
    return;
  }

  loadRecord();
});

// ============================================================
// レコード取得
// ============================================================
async function loadRecord() {
  try {
    var response = await fetch(GAS_API_URL + '?record_id=' + encodeURIComponent(state.recordId));
    var data = await response.json();

    if (!data.success) {
      showError('データが見つかりませんでした。\nrecord_id: ' + state.recordId);
      return;
    }

    state.record = data.record;
    renderRecord(state.record);
    showScreen('main');
  } catch (err) {
    showError('データの取得に失敗しました。\n' + err.message);
  }
}

function renderRecord(record) {
  setText('property-name', record.property_name || '-');
  setText('room-number', record.room_number || '-');
  setText('cleaner-name', record.cleaner_name || '-');
  setText('timestamp', formatTimestamp(record.timestamp));

  var driveLink = document.getElementById('drive-link');
  if (record.drive_url) {
    driveLink.href = record.drive_url;
  } else {
    driveLink.style.display = 'none';
  }

  renderScore(record.ai_score, record.flag, record.score_summary, record.issues);
  renderPhotos(record.photo_urls);

  if (record.status === 'approved') {
    disableActions('承認済み');
  } else if (record.status === 'rejected') {
    disableActions('差し戻し済み');
  }

  var commentInput = document.getElementById('manager-comment');
  commentInput.addEventListener('input', function () {
    document.getElementById('char-count').textContent = this.value.length;
  });
}

function renderScore(score, _flag, summary, issues) {
  var scoreNum = parseInt(score, 10);
  if (isNaN(scoreNum)) {
    setText('score-number', '-');
    setText('score-summary', 'AI判定は後のフェーズで導入予定です');

    // スコア表示エリアを簡易表示に
    var badge = document.getElementById('score-badge');
    if (badge) badge.style.display = 'none';
    var barWrap = document.querySelector('.score-bar-wrap');
    if (barWrap) barWrap.style.display = 'none';
    return;
  }

  setText('score-number', scoreNum);

  var circle = document.getElementById('score-circle');
  var badge = document.getElementById('score-badge');
  var bar = document.getElementById('score-bar');

  if (scoreNum >= 90) {
    circle.className = 'score-circle excellent';
    badge.className = 'score-badge excellent';
    badge.textContent = '✅ 高品質';
    bar.style.background = '#34a853';
  } else if (scoreNum >= 70) {
    circle.className = 'score-circle good';
    badge.className = 'score-badge good';
    badge.textContent = '🟡 要確認';
    bar.style.background = '#fbbc04';
  } else {
    circle.className = 'score-circle poor';
    badge.className = 'score-badge poor';
    badge.textContent = '🔴 要再清掃';
    bar.style.background = '#ea4335';
  }

  requestAnimationFrame(function () {
    setTimeout(function () { bar.style.width = scoreNum + '%'; }, 200);
  });

  setText('score-summary', summary || '');

  if (issues && Array.isArray(issues) && issues.length > 0) {
    var issuesSection = document.getElementById('issues-section');
    var issuesList = document.getElementById('issues-list');
    issuesSection.style.display = 'block';
    issuesList.innerHTML = issues.map(function (i) {
      return '<li>' + escapeHtml(i) + '</li>';
    }).join('');
  }
}

function renderPhotos(photoUrlsRaw) {
  var gallery = document.getElementById('photos-gallery');
  var urls = [];

  if (typeof photoUrlsRaw === 'string') {
    urls = photoUrlsRaw.split(',').map(function (u) { return u.trim(); }).filter(Boolean);
  } else if (Array.isArray(photoUrlsRaw)) {
    urls = photoUrlsRaw;
  }

  if (urls.length === 0) {
    gallery.innerHTML = '<div class="no-photos">📷 写真が登録されていません</div>';
    return;
  }

  var labels = ['清掃前', '清掃後', '玄関', 'リビング', 'キッチン', '浴室', 'トイレ', 'その他'];
  gallery.innerHTML = urls.map(function (url, i) {
    var label = labels[i] || ('写真' + (i + 1));
    var retakeBtn = '<button class="retake-request-btn" onclick="event.stopPropagation();openRetakeModal(' + i + ',\'' + escapeHtml(label) + '\')">📸 撮り直し依頼</button>';
    return [
      '<div class="photo-item">',
      '  <div onclick="window.open(\'' + escapeHtml(url) + '\', \'_blank\')" style="cursor:pointer;min-height:80px;position:relative;">',
      '    <img src="' + escapeHtml(url) + '" alt="' + label + '" loading="lazy"',
      '      onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">',
      '    <div class="photo-error" style="display:none;">🖼️<br><span>' + label + '</span><br><small>タップして開く</small></div>',
      '    <div class="photo-label">' + label + '</div>',
      '  </div>',
      '  ' + retakeBtn,
      '</div>'
    ].join('');
  }).join('');
}

// ============================================================
// 撮り直し依頼
// ============================================================
function openRetakeModal(photoIndex, photoLabel) {
  state.retakePhotoIndex = photoIndex;
  state.retakePhotoLabel = photoLabel;
  document.getElementById('retake-note').value = '';
  document.getElementById('retake-modal').style.display = 'flex';
}

function closeRetakeModal() {
  document.getElementById('retake-modal').style.display = 'none';
}

async function sendRetakeRequest() {
  var note = document.getElementById('retake-note').value.trim();
  if (!note) {
    document.getElementById('retake-note').focus();
    return;
  }
  closeRetakeModal();

  try {
    var response = await fetch(GAS_API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action:    'request_retake',
        record_id: state.recordId,
        note:      '【' + (state.retakePhotoLabel || '写真') + '】' + note,
      })
    });
    var data = JSON.parse(await response.text());
    if (data.success) {
      alert('✅ 撮り直し依頼を送信しました');
    } else {
      alert('送信失敗: ' + (data.error || '不明なエラー'));
    }
  } catch (err) {
    alert('送信に失敗しました: ' + err.message);
  }
}

// ============================================================
// 承認・差し戻し
// ============================================================
function confirmAction(action) {
  state.pendingAction = action;
  var comment = document.getElementById('manager-comment').value.trim();

  var modalTitle = document.getElementById('modal-title');
  var modalMessage = document.getElementById('modal-message');
  var confirmBtn = document.getElementById('modal-confirm-btn');

  if (action === 'approve') {
    modalTitle.textContent = '✅ 承認の確認';
    modalMessage.textContent = state.record.property_name + ' ' + state.record.room_number + ' の清掃を承認し、オーナーへ完了報告を送信します。';
    confirmBtn.className = 'btn btn-approve';
    confirmBtn.textContent = '承認する';
  } else {
    modalTitle.textContent = '🔄 差し戻しの確認';
    modalMessage.textContent = '差し戻し理由：「' + (comment || 'なし') + '」\n清掃員に再清掃依頼を送信します。';
    confirmBtn.className = 'btn btn-reject';
    confirmBtn.textContent = '差し戻す';
  }

  document.getElementById('confirm-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('confirm-modal').style.display = 'none';
  state.pendingAction = null;
}

async function executeAction() {
  var action = state.pendingAction;
  closeModal();
  setButtonsLoading(true);

  var comment = document.getElementById('manager-comment').value.trim();

  try {
    var response = await fetch(GAS_API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: action,
        record_id: state.recordId,
        comment: comment
      })
    });

    var data = JSON.parse(await response.text());

    if (data.success) {
      disableActions(action === 'approve' ? '承認済み' : '差し戻し済み');
      showDone(
        action === 'approve' ? '✅' : '🔄',
        action === 'approve' ? '承認完了' : '差し戻し完了',
        action === 'approve'
          ? 'オーナーへ清掃完了報告を送信しました。'
          : '清掃員へ再清掃依頼を送信しました。'
      );
    } else {
      setButtonsLoading(false);
      showError('処理に失敗しました。\n' + (data.error || '不明なエラー'));
    }
  } catch (err) {
    setButtonsLoading(false);
    showError('送信に失敗しました。\n' + err.message);
  }
}

// ============================================================
// UI ヘルパー
// ============================================================
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
  var target = document.getElementById(name + '-screen');
  if (target) target.classList.add('active');
}

function showError(message) {
  setText('error-message', message);
  showScreen('error');
}

function showDone(icon, title, message) {
  setText('done-icon', icon);
  setText('done-title', title);
  setText('done-message', message);
  showScreen('done');
}

function setText(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}

function disableActions(reason) {
  var approveBtn = document.getElementById('approve-btn');
  var rejectBtn = document.getElementById('reject-btn');
  if (approveBtn) { approveBtn.disabled = true; approveBtn.textContent = reason; }
  if (rejectBtn) rejectBtn.disabled = true;
}

function setButtonsLoading(isLoading) {
  var approveBtn = document.getElementById('approve-btn');
  var rejectBtn = document.getElementById('reject-btn');
  if (approveBtn) approveBtn.disabled = isLoading;
  if (rejectBtn) rejectBtn.disabled = isLoading;
  if (isLoading) {
    if (approveBtn) approveBtn.textContent = '処理中...';
    if (rejectBtn) rejectBtn.textContent = '処理中...';
  } else {
    if (approveBtn) approveBtn.textContent = '✅ 承認する';
    if (rejectBtn) rejectBtn.textContent = '🔄 差し戻す';
  }
}

function formatTimestamp(ts) {
  if (!ts) return '-';
  try {
    var d = new Date(ts);
    return d.getFullYear() + '/' +
      String(d.getMonth() + 1).padStart(2, '0') + '/' +
      String(d.getDate()).padStart(2, '0') + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
  } catch (_) { return String(ts); }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}
