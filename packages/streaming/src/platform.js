// Cordova lifecycle adapter — opt-in hook for mobile environments.
// Call setupCordovaHooks(service) after creating a SimpleService to override
// the default document.addEventListener behaviour with explicit Cordova bindings.
// In non-Cordova (browser) contexts, the default behaviour is already harmless
// (pause/resume events are never fired), so this adapter is only needed when
// Cordova-specific lifecycle semantics are required (e.g. background throttling).
export function setupCordovaHooks(service) {
    service.setLifecycleHooks({
        onPause:  () => service.pause(),
        onResume: () => service.resume()
    })
}
