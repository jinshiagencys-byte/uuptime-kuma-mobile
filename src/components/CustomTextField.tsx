import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  Animated,
  StyleSheet,
  TextInputProps,
  StyleProp,
  ViewStyle,
} from 'react-native';

interface CustomTextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  leftIcon?: React.ReactNode;
  textColor?: string;
  outlineColor?: string;
  activeOutlineColor?: string;
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
}

export const CustomTextField: React.FC<CustomTextFieldProps> = ({
  label,
  value,
  onChangeText,
  leftIcon,
  textColor = '#FFFFFF',
  outlineColor = '#334155',
  activeOutlineColor = '#4ADE80',
  backgroundColor = '#0F1216',
  style,
  ...rest
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const animatedValue = useRef(new Animated.Value(value ? 1 : 0)).current;

  const isFloating = isFocused || (value && value.length > 0);

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: isFloating ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [isFloating, animatedValue]);

  const labelLeftOffset = leftIcon ? 48 : 16;

  const labelTop = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [16, -10],
  });

  const labelLeft = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [labelLeftOffset, 12],
  });

  const labelFontSize = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 12],
  });

  const labelColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['#94A3B8', isFocused ? activeOutlineColor : '#94A3B8'],
  });

  return (
    <View style={[styles.container, style]}>
      {/* Outer Border Container */}
      <View
        style={[
          styles.inputContainer,
          {
            borderColor: isFocused ? activeOutlineColor : outlineColor,
            borderWidth: isFocused ? 2 : 1,
            backgroundColor: 'transparent',
          },
        ]}
      >
        {leftIcon && <View style={styles.leftIconContainer}>{leftIcon}</View>}

        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={[
            styles.textInput,
            {
              paddingLeft: leftIcon ? 48 : 16,
              color: textColor,
            },
          ]}
          placeholderTextColor="transparent"
          {...rest}
        />
      </View>

      {/* Floating Label with Background Cutout Notch */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.labelContainer,
          {
            top: labelTop,
            left: labelLeft,
            backgroundColor: backgroundColor,
          },
        ]}
      >
        <Animated.Text
          style={[
            styles.labelText,
            {
              fontSize: labelFontSize,
              color: labelColor,
            },
          ]}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    marginVertical: 4,
  },
  inputContainer: {
    height: 56,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftIconContainer: {
    position: 'absolute',
    left: 14,
    top: 18,
    zIndex: 1,
  },
  textInput: {
    flex: 1,
    height: 56,
    fontSize: 16,
    paddingRight: 16,
  },
  labelContainer: {
    position: 'absolute',
    paddingHorizontal: 6,
    borderRadius: 4,
    zIndex: 2,
  },
  labelText: {
    fontWeight: '500',
  },
});

export default CustomTextField;
