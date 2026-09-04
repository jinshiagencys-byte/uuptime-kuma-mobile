import React, { useRef } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  View,
} from 'react-native';

interface SwipeableRowProps {
  children: React.ReactNode;
  renderLeftActions: () => React.ReactNode;
  leftOpenValue?: number; // e.g., 120
}

export default function SwipeableRow({
  children,
  renderLeftActions,
  leftOpenValue = 120,
}: SwipeableRowProps) {
  const rowTranslationX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const snapTo = (toValue: number) => {
    Animated.spring(rowTranslationX, {
      toValue,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
    isOpen.current = toValue !== 0;
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Active gesture only if movement is primarily horizontal
        return Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dy) < 8;
      },
      onPanResponderGrant: () => {
        rowTranslationX.setOffset(isOpen.current ? leftOpenValue : 0);
      },
      onPanResponderMove: (_, gestureState) => {
        // Calculate new value with offset
        let newX = gestureState.dx;
        if (isOpen.current) {
          newX += leftOpenValue;
        }

        // Only allow swiping to the right (positive X) up to a limit
        if (newX < 0) {
          newX = 0;
        } else if (newX > leftOpenValue + 40) {
          // Add friction/resistance beyond the action area
          newX = leftOpenValue + 40 + (newX - (leftOpenValue + 40)) * 0.3;
        }

        rowTranslationX.setValue(newX - (isOpen.current ? leftOpenValue : 0));
      },
      onPanResponderRelease: (_, gestureState) => {
        rowTranslationX.flattenOffset();
        const currentX = (rowTranslationX as any)._value;

        // If swipe right exceeds 40% of the open value
        const threshold = leftOpenValue * 0.4;
        if (gestureState.dx > 20 && currentX > threshold) {
          snapTo(leftOpenValue);
        } else {
          snapTo(0);
        }
      },
      onPanResponderTerminate: () => {
        rowTranslationX.flattenOffset();
        snapTo(0);
      },
    })
  ).current;

  return (
    <View style={styles.container}>
      {/* Background/Action area */}
      <View style={styles.actionsContainer}>{renderLeftActions()}</View>

      {/* Foreground/Content card */}
      <Animated.View
        style={[
          styles.content,
          {
            transform: [{ translateX: rowTranslationX }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 8,
  },
  actionsContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  content: {
    backgroundColor: 'transparent',
  },
});
