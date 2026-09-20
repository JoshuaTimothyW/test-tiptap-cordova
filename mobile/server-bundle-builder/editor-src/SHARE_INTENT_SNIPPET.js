/**
 * Tempel snippet ini di dalam editor-src/index.html kamu (setelah Tiptap
 * editor selesai di-init), supaya konten yang di-share dari app lain
 * otomatis masuk ke editor.
 *
 * Cara kerja:
 * bootstrap.js (di www/) menyimpan share intent ke localStorage
 * dengan key 'pending_share'. File:// origin di Android WebView
 * konsisten untuk semua path file://, jadi localStorage ini bisa
 * dibaca oleh halaman editor manapun (baik fallback maupun hasil
 * extract bundle terbaru).
 */

function checkPendingShare(editor) {
  var pending = localStorage.getItem('pending_share');
  if (!pending) return;

  try {
    var data = JSON.parse(pending);
    // data.content bisa berupa URL/link atau teks biasa tergantung apa yang di-share
    editor.commands.focus('end');
    editor.commands.insertContent(
      '<p><a href="' + data.content + '">' + data.content + '</a></p>'
    );
  } catch (e) {
    console.warn('gagal parse pending_share', e);
  } finally {
    localStorage.removeItem('pending_share');
  }
}

// panggil setelah editor Tiptap kamu ready, contoh:
// const editor = new Editor({ ...konfigurasi tiptap kamu... });
// document.addEventListener('deviceready', function () {
//   checkPendingShare(editor);
// });
