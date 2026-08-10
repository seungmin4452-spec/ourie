// Kept free of DOM references on purpose: both the app and the service
// worker need this path, and sw.ts is typechecked against the WebWorker lib
// (see tsconfig.sw.json), where `window` and `Navigator` do not exist.
//
// Served by api/pwa-install.ts through a rewrite in vercel.json, but
// deliberately addressed at the root rather than under /api/. A home-screen
// app added without a manifest takes its scope from the directory of the URL
// that was added: adding /api/pwa-install scopes it to /api/, so the launch
// redirect to "/" lands outside scope and iOS kicks it into Safari. From
// /add-to-home the scope is "/", which covers the whole app.
export const PWA_INSTALL_PATH = '/add-to-home'
