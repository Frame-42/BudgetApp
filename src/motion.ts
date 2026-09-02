import { LayoutAnimation } from 'react-native';

/**
 * The same 280ms ease the tab bar uses. Anything that changes a layout in place
 * — a sheet stepping forward, a chip row expanding — runs through this, so the
 * app has one movement rather than several near-identical ones.
 */
export const morph = () =>
  LayoutAnimation.configureNext({
    duration: 280,
    create: { type: 'easeInEaseOut', property: 'opacity' },
    update: { type: 'easeInEaseOut' },
    delete: { type: 'easeInEaseOut', property: 'opacity' },
  });
