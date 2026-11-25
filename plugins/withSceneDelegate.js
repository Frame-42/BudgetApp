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
 *
 * The window has to be created *by the scene*, and React Native started in it.
 * The template builds `UIWindow(frame:)` in `didFinishLaunching` — before any
 * scene exists — and attaching that window to a scene afterwards looks fine but
 * leaves the scene's presentation context wrong: the system share sheet
 * (UIActivityViewController) came up squeezed against the right edge and
 * clipped, while the document picker, presented the same way, was unaffected.
 */

/** Matches the class however it is spaced, so a reformat doesn't duplicate it. */
const DECLARATION = /class\s+SceneDelegate\s*:/;

/** The template's window-and-start block, which the scene delegate takes over. */
const LAUNCH_WINDOW =
  /#if os\(iOS\) \|\| os\(tvOS\)\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\s*factory\.startReactNative\(\s*withModuleName: "main",\s*in: window,\s*launchOptions: launchOptions\)\s*#endif\n*/;

const SCENE_DELEGATE = `
/**
 * Creates the window for the scene UIKit hands us and starts React Native in
 * it. A window made earlier, in \`didFinishLaunching\`, has no scene yet, and
 * moving it into one leaves system-hosted UI such as the share sheet laid out
 * against the wrong geometry.
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
          let appDelegate = UIApplication.shared.delegate as? AppDelegate else {
      return
    }
    let sceneWindow = UIWindow(windowScene: windowScene)
    appDelegate.window = sceneWindow
    window = sceneWindow
    appDelegate.reactNativeFactory?.startReactNative(
      withModuleName: "main",
      in: sceneWindow,
      launchOptions: nil)
    sceneWindow.makeKeyAndVisible()

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
 * Rewrites an AppDelegate.swift source. Idempotent, and it replaces a scene
 * delegate an earlier version of this plugin left behind: a prebuild over an
 * already-patched file is the common case, and skipping it would keep the old
 * window handling.
 */
function addSceneDelegate(contents) {
  let source = contents;

  const declared = DECLARATION.exec(source);
  if (declared) {
    // Cut from the class's doc comment, which sits directly above it, to the end
    // of the file, where it was appended.
    const comment = source.lastIndexOf('/**', declared.index);
    source = source.slice(0, comment === -1 ? declared.index : comment);
  }

  source = source.replace(LAUNCH_WINDOW, '');

  // React Native must start exactly once, in the scene. A template that no
  // longer matches would leave it starting here as well, in a window with no scene.
  if (/startReactNative\(/.test(source)) {
    throw new Error(
      'withSceneDelegate could not remove the template\'s startReactNative call from ' +
        'AppDelegate.swift; the scene delegate would start React Native a second time.',
    );
  }

  return `${source.trimEnd()}\n${SCENE_DELEGATE}`;
}

const withSceneDelegate = (config) =>
  withAppDelegate(config, (cfg) => {
    const { language, contents } = cfg.modResults;
    if (language !== 'swift') {
      throw new Error(
        `withSceneDelegate needs a Swift AppDelegate to patch, but prebuild produced ${language}.`,
      );
    }
    // The delegate reaches for AppDelegate.reactNativeFactory, so bail loudly if
    // it is gone rather than emitting a file that fails to compile.
    if (!/class\s+AppDelegate\b/.test(contents) || !/reactNativeFactory/.test(contents)) {
      throw new Error(
        'withSceneDelegate could not find the AppDelegate class and its reactNativeFactory to attach to.',
      );
    }
    cfg.modResults.contents = addSceneDelegate(contents);
    return cfg;
  });

module.exports = withSceneDelegate;
module.exports.addSceneDelegate = addSceneDelegate;
