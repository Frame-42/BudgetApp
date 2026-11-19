const { withAppDelegate } = require('expo/config-plugins');

/**
 * iOS 26 and newer trap at launch unless the app adopts the UIScene lifecycle,
 * and neither React Native 0.86 nor Expo 57 generates a scene delegate — see the
 * standing `// TODO: - Configuring and Discarding Scenes` in ExpoAppDelegate.swift.
 *
 * `ios/` is regenerated output, so the class has to be re-injected on every
 * prebuild rather than hand-edited into AppDelegate.swift. The matching
 * UIApplicationSceneManifest lives in app.json under `ios.infoPlist`; without
 * both halves the app dies before any JS runs.
 */

/** Matches the class however it is spaced, so a reformat doesn't duplicate it. */
const DECLARATION = /class\s+SceneDelegate\s*:/;

const SCENE_DELEGATE = `
/**
 * Hands the window React Native builds in \`didFinishLaunchingWithOptions\` —
 * which runs before any scene exists — to the scene UIKit creates for it.
 * Injected by plugins/withSceneDelegate.js; edit it there, not here.
 */
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let rootWindow = (UIApplication.shared.delegate as? AppDelegate)?.window else {
      return
    }
    rootWindow.windowScene = windowScene
    window = rootWindow
    rootWindow.makeKeyAndVisible()

    // A link that launched the app arrives here rather than through the delegate.
    if let url = connectionOptions.urlContexts.first?.url {
      RCTLinkingManager.application(UIApplication.shared, open: url, options: [:])
    }
  }

  // Scenes take over the linking callbacks that AppDelegate would otherwise get.
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let url = URLContexts.first?.url else { return }
    RCTLinkingManager.application(UIApplication.shared, open: url, options: [:])
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    RCTLinkingManager.application(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in })
  }
}
`;

/**
 * Appends the scene delegate to an AppDelegate.swift source. Idempotent, so a
 * prebuild over an already-patched file leaves it alone.
 */
function addSceneDelegate(contents) {
  if (DECLARATION.test(contents)) return contents;
  return `${contents.trimEnd()}\n${SCENE_DELEGATE}`;
}

const withSceneDelegate = (config) =>
  withAppDelegate(config, (cfg) => {
    const { language, contents } = cfg.modResults;
    if (language !== 'swift') {
      throw new Error(
        `withSceneDelegate needs a Swift AppDelegate to patch, but prebuild produced ${language}.`,
      );
    }
    // The delegate reaches for AppDelegate.window, so bail loudly if it is gone
    // rather than emitting a file that fails to compile.
    if (!/class\s+AppDelegate\b/.test(contents)) {
      throw new Error('withSceneDelegate could not find the AppDelegate class to attach to.');
    }
    cfg.modResults.contents = addSceneDelegate(contents);
    return cfg;
  });

module.exports = withSceneDelegate;
module.exports.addSceneDelegate = addSceneDelegate;
