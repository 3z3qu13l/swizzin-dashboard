// Applies the saved theme and glass settings before the page paints. A file of its own, not inline:
// the Content-Security-Policy only allows scripts from swizdash itself.
try {
  var theme = localStorage.getItem('swizdash-theme')
  // the themes of 0.1.8 and before
  var renamed = { night: 'aurore', dusk: 'ardoise', day: 'givre' }
  if (renamed[theme]) theme = renamed[theme]
  if (['aurore', 'givre', 'crepuscule', 'abysse', 'ardoise'].indexOf(theme) >= 0) document.documentElement.dataset.theme = theme

  var glass = JSON.parse(localStorage.getItem('swizdash-glass') || 'null')
  // the same bounds as the sliders of the theme menu
  var ok = glass && typeof glass.alpha === 'number' && typeof glass.blur === 'number'
  if (ok && glass.alpha >= 0.35 && glass.alpha <= 1 && glass.blur >= 0 && glass.blur <= 32) {
    document.documentElement.style.setProperty('--glass-alpha', String(glass.alpha))
    document.documentElement.style.setProperty('--glass-blur', glass.blur + 'px')
  }
} catch (e) {
  // private window or unreadable value: the default theme
}
