// Runs only inside the UniWorld phone app from the App Store / Google Play (a Capacitor shell with these
// same files inside). On the website this file does nothing.
const cap = globalThis.Capacitor;
export const isNative = !!cap?.isNativePlatform?.();
if (isNative) {
  document.documentElement.classList.add('native', 'native-' + cap.getPlatform());
  const { App, StatusBar, SplashScreen } = cap.Plugins || {};
  // Android back button: close the open sheet first, then go back a page, then leave the app.
  App?.addListener?.('backButton', () => {
    const modal = document.querySelector('#modal[open]');
    if (modal) { modal.close(); return; }
    const h = location.hash.replace(/^#/, '');
    if (h && h !== 'home') history.length > 1 ? history.back() : (location.hash = 'home');
    else App.exitApp?.();
  });
  try { StatusBar?.setBackgroundColor?.({ color: '#173f42' }); StatusBar?.setStyle?.({ style: 'DARK' }); } catch { /* not on this platform */ }
  addEventListener('load', () => setTimeout(() => SplashScreen?.hide?.(), 300));
}
