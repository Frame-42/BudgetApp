/**
 * Every haptic in the app goes through here. The Expo API rejects on hardware
 * that has no taptic engine (and on web), and none of these are worth failing a
 * gesture over — so each call is fire-and-forget with the rejection swallowed.
 */
import * as Haptics from 'expo-haptics';

const fire = (run: () => Promise<void>) => {
  void run().catch(() => {});
};

/** A choice landed: a chip, a menu row. */
export const tapSelect = () => fire(() => Haptics.selectionAsync());

/** A destructive action is armed and waiting for a second tap. */
export const tapWarn = () =>
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));

/** The write went through. */
export const tapDone = () =>
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
