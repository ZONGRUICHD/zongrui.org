(function () {
  var storageKey = 'zongrui-theme-preference';
  var paletteKey = 'zongrui-material-palette';
  var paletteSeeds = { blossom: '#d98aa4', 'pixel-blue': '#6f86ff', sage: '#7b9b7a', sunset: '#c77955' };
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function readPreference() {
    try {
      var value = window.localStorage.getItem(storageKey);
      return value === 'system' || value === 'light' || value === 'dark' ? value : 'light';
    } catch (_error) {
      return 'light';
    }
  }

  function apply(preference) {
    var resolved = preference === 'system'
      ? (media && media.matches ? 'dark' : 'light')
      : preference;
    var root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.themePreference = preference;
    root.dataset.resolvedTheme = resolved;
    var palette = 'blossom';
    var motion = 'full';
    var contrast = 'normal';
    var brightness = 100;
    try {
      var storedPalette = window.localStorage.getItem(paletteKey);
      if (paletteSeeds[storedPalette]) palette = storedPalette;
      motion = window.localStorage.getItem('zongrui-motion') === 'reduced' ? 'reduced' : 'full';
      contrast = window.localStorage.getItem('zongrui-contrast') === 'high' ? 'high' : 'normal';
      brightness = Math.min(100, Math.max(40, Number(window.localStorage.getItem('zongrui-brightness') || 100)));
    } catch (_error) {
      // Defaults keep the first paint deterministic when storage is blocked.
    }
    root.dataset.materialPalette = palette;
    root.dataset.motion = motion;
    root.dataset.contrast = contrast;
    root.style.colorScheme = resolved;
    root.style.setProperty('--zr-material-seed', paletteSeeds[palette]);
    root.style.setProperty('--pixel-screen-dim', String((100 - brightness) / 180));
    var themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) themeColorMeta.setAttribute('content', paletteSeeds[palette]);
  }

  apply(readPreference());

  if (media && media.addEventListener) {
    media.addEventListener('change', function () {
      if (document.documentElement.dataset.themePreference === 'system') apply('system');
    });
  }
})();
