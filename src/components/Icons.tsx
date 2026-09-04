import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Tab icons, traced 1:1 from the design's 18x18 stroke SVGs. */
type IconProps = { color: string; size?: number };

const Frame = ({ size = 17, children }: { size?: number; children: React.ReactNode }) => (
  <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
    {children}
  </Svg>
);

/** Marks a tip: round glass over a screw base, legible down to ~10px. */
export const BulbIcon = ({ color, size }: IconProps) => (
  <Frame size={size}>
    <Circle cx={9} cy={7.4} r={4.2} stroke={color} strokeWidth={1.5} />
    <Path
      d="M6.9 12.7h4.2M7.7 15.1h2.6"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  </Frame>
);

/** The one "there's another option behind this" mark in the app. */
export const CaretIcon = ({ color, size }: IconProps) => (
  <Frame size={size}>
    <Path
      d="M4.5 7 9 11.5 13.5 7"
      stroke={color}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Frame>
);

export const HomeIcon = ({ color, size }: IconProps) => (
  <Frame size={size}>
    <Path
      d="M2.5 7.4 9 2.5l6.5 4.9v7.1a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V7.4Z"
      stroke={color}
      strokeWidth={1.4}
      strokeLinejoin="round"
    />
  </Frame>
);

export const SpendIcon = ({ color, size }: IconProps) => (
  <Frame size={size}>
    <Rect x={2.3} y={4.6} width={13.4} height={9.8} rx={2} stroke={color} strokeWidth={1.4} />
    <Path d="M2.3 8h13.4" stroke={color} strokeWidth={1.4} />
  </Frame>
);

export const AddIcon = ({ color, size }: IconProps) => (
  <Frame size={size}>
    <Path d="M9 3.4v11.2M3.4 9h11.2" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
  </Frame>
);

export const TrendsIcon = ({ color, size }: IconProps) => (
  <Frame size={size}>
    <Path
      d="M3.2 12.6V9.4M7.4 12.6V5.8M11.6 12.6V8M15.8 12.6V3.6"
      stroke={color}
      strokeWidth={1.4}
      strokeLinecap="round"
    />
  </Frame>
);

export const YouIcon = ({ color, size }: IconProps) => (
  <Frame size={size}>
    <Circle cx={9} cy={6.6} r={2.9} stroke={color} strokeWidth={1.4} />
    <Path
      d="M3.6 15.2c.7-2.6 2.8-3.9 5.4-3.9s4.7 1.3 5.4 3.9"
      stroke={color}
      strokeWidth={1.4}
      strokeLinecap="round"
    />
  </Frame>
);

/** Search: the only icon that isn't a tab or a caret. */
export const SearchIcon = ({ color, size }: IconProps) => (
  <Frame size={size}>
    <Circle cx={8.1} cy={8.1} r={4.6} stroke={color} strokeWidth={1.4} />
    <Path d="M11.6 11.6 15 15" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
  </Frame>
);
