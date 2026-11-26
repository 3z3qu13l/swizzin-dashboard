// Applies the saved theme before the page paints. A file of its own, not inline:
// the Content-Security-Policy only allows scripts from swizdash itself.
try {
  var theme = localStorage.getItem('swizdash-theme')
  if (theme === 'night' || theme === 'dusk' || theme === 'day') document.documentElement.dataset.theme = theme
} catch (e) {
  // private window: the default theme
}
