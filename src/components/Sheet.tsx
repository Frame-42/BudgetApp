import React, { useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isHorizontalSwipe } from '../motion';
import { GUTTER, makeStyles, radius, useTheme } from '../theme';

/** How far a finger travels before a touch is treated as a drag rather than a press. */
const DRAG_SLOP = 10;

/** Past this far down — or this fast — the release dismisses instead of springing back. */
const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 0.5;

/**
 * A bottom sheet on the core Modal, which renders above the tab bar without any
 * restructuring. The card is opaque so the blurred page behind it stays
 * background rather than reading through the content.
 *
 * The drag is built on raw touch events rather than PanResponder: inside this
 * Modal the responder negotiation never runs — onMoveShouldSetPanResponder is
 * never called, in either phase — while onTouchMove fires normally. Touch
 * events bubble from whatever child was hit, so a drag that starts on a button
 * arrives here too. Everything runs on the JS driver, since a native-driven
 * node ignores the setValue stream a gesture produces.
 */
export function Sheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  const { tint } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;
  const height = useRef(600);

  const startX = useRef(0);
  const startY = useRef(0);
  const startT = useRef(0);
  const lastY = useRef(0);
  /* Set once a touch has gone sideways first — a swipe through months on the
     day picker — so drifting downward partway through doesn't turn it into a
     dismiss. Cleared by the next touch. */
  const sideways = useRef(false);
  /*
   * While a drag is live the content stops taking touches, which cancels the
   * press on whichever button the drag began on — otherwise releasing after a
   * short drag would fire it.
   */
  const [dragging, setDragging] = useState(false);
  const isDragging = useRef(false);

  const settle = (toValue: number) =>
    Animated.spring(translateY, { toValue, bounciness: 2, useNativeDriver: false }).start();

  const close = () => {
    Animated.timing(translateY, {
      toValue: height.current,
      duration: 180,
      useNativeDriver: false,
    }).start(() => onClose());
  };

  const endDrag = () => {
    if (!isDragging.current) return;
    const dy = lastY.current - startY.current;
    const seconds = (Date.now() - startT.current) / 1000;
    const velocity = seconds > 0 ? dy / seconds / 1000 : 0;
    isDragging.current = false;
    setDragging(false);
    startT.current = 0;
    if (dy > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) close();
    else settle(0);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={close}
    >
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.overlay}>
          <BlurView intensity={22} tint={tint} style={StyleSheet.absoluteFill}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.fill}
              onPress={close}
            />
          </BlurView>

          <Animated.View
            onTouchStart={(e) => {
              sideways.current = false;
              startX.current = e.nativeEvent.pageX;
              startY.current = e.nativeEvent.pageY;
              lastY.current = e.nativeEvent.pageY;
              startT.current = Date.now();
            }}
            onTouchMove={(e) => {
              /* Only onTouchMove is known to arrive here; if start never did,
                 seed the origin from the first move rather than measuring from
                 whatever the last gesture left behind. */
              if (startT.current === 0) {
                startX.current = e.nativeEvent.pageX;
                startY.current = e.nativeEvent.pageY;
                startT.current = Date.now();
              }
              lastY.current = e.nativeEvent.pageY;
              const dy = lastY.current - startY.current;
              if (
                !isDragging.current &&
                !sideways.current &&
                isHorizontalSwipe(e.nativeEvent.pageX - startX.current, dy)
              ) {
                sideways.current = true;
              }
              if (sideways.current) return;
              if (!isDragging.current && dy > DRAG_SLOP) {
                isDragging.current = true;
                setDragging(true);
              }
              if (isDragging.current) translateY.setValue(Math.max(0, dy));
            }}
            onTouchEnd={endDrag}
            onTouchCancel={endDrag}
            onLayout={(e) => {
              height.current = e.nativeEvent.layout.height;
            }}
            style={[
              styles.card,
              { paddingBottom: Math.max(insets.bottom, 14) + 10, transform: [{ translateY }] },
            ]}
          >
            <View
              accessibilityRole="adjustable"
              accessibilityLabel="Drag down to close"
              accessibilityActions={[{ name: 'decrement', label: 'Close' }]}
              onAccessibilityAction={close}
              style={styles.grabber}
            />
            {/*
              Not a ScrollView: its pan recogniser is native and would take the
              drag before this view saw it. The content is bounded, keypad and all.
            */}
            <View pointerEvents={dragging ? 'none' : 'auto'} style={styles.body}>
              {children}
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles(({ color, w }) => ({
  fill: { flex: 1 },
  /* The scrim is absolute, so the card is the only flow child — pin it low. */
  overlay: { flex: 1, justifyContent: 'flex-end' },
  card: {
    borderTopLeftRadius: radius.hero,
    borderTopRightRadius: radius.hero,
    borderTopWidth: 1,
    borderColor: color.heroBorder,
    backgroundColor: color.sheet,
    paddingTop: 10,
    paddingHorizontal: GUTTER,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    backgroundColor: w(0.14),
    /* Generous margin doubles as the drag target's breathing room. */
    marginTop: 2,
    marginBottom: 14,
  },
  body: { gap: 14, paddingBottom: 4 },
}));
