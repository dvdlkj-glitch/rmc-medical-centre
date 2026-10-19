// Loaded synchronously in <head> so the embedded (iframe) layout applies before first paint.
if (new URLSearchParams(location.search).has('embed') || window.self !== window.top) {
  document.documentElement.classList.add('embed');
}
