import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
  Modal,
  FlatList,
  TouchableWithoutFeedback,
} from 'react-native';
import { ChevronDown } from 'lucide-react-native';

export interface DropdownOption {
  label: string;
  value: string;
}

interface CustomDropdownProps {
  label: string;
  value: string;
  options: DropdownOption[];
  onSelect: (value: string) => void;
  leftIcon?: React.ReactNode;
  textColor?: string;
  outlineColor?: string;
  activeOutlineColor?: string;
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
}

export const CustomDropdown: React.FC<CustomDropdownProps> = ({
  label,
  value,
  options,
  onSelect,
  leftIcon,
  textColor = '#FFFFFF',
  outlineColor = '#334155',
  activeOutlineColor = '#4ADE80',
  backgroundColor = '#0F1216',
  style,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const animatedValue = useRef(new Animated.Value(value ? 1 : 0)).current;
  const buttonRef = useRef<View>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

  const isFloating = isOpen || (value && value.length > 0);

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
    outputRange: ['#94A3B8', isOpen ? activeOutlineColor : '#94A3B8'],
  });

  const selectedOption = options.find((opt) => opt.value === value);

  const openDropdown = () => {
    buttonRef.current?.measure((fx, fy, width, height, px, py) => {
      setDropdownPosition({
        top: py + height + 4,
        left: px,
        width: width,
      });
      setIsOpen(true);
    });
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={openDropdown}
        style={[styles.container, style]}
      >
        <View
          ref={buttonRef}
          style={[
            styles.inputContainer,
            {
              borderColor: isOpen ? activeOutlineColor : outlineColor,
              borderWidth: isOpen ? 2 : 1,
              backgroundColor: 'transparent',
            },
          ]}
        >
          {leftIcon && <View style={styles.leftIconContainer}>{leftIcon}</View>}

          <View style={[styles.textWrapper, { paddingLeft: leftIcon ? 48 : 16 }]}>
            <Text style={[styles.text, { color: value ? textColor : 'transparent' }]}>
              {selectedOption ? selectedOption.label : ''}
            </Text>
          </View>

          <View style={styles.rightIconContainer}>
            <ChevronDown size={20} color="#94A3B8" />
          </View>
        </View>

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
      </TouchableOpacity>

      <Modal visible={isOpen} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setIsOpen(false)}>
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.dropdownMenu,
                {
                  top: dropdownPosition.top,
                  left: dropdownPosition.left,
                  width: dropdownPosition.width,
                  backgroundColor: '#161B22', // Surface color
                  borderColor: outlineColor,
                },
              ]}
            >
              <FlatList
                data={options}
                keyExtractor={(item) => item.value}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.optionItem}
                    onPress={() => {
                      onSelect(item.value);
                      setIsOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        { color: item.value === value ? activeOutlineColor : textColor },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
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
  rightIconContainer: {
    position: 'absolute',
    right: 14,
    top: 18,
    zIndex: 1,
  },
  textWrapper: {
    flex: 1,
    justifyContent: 'center',
    height: 56,
    paddingRight: 40,
  },
  text: {
    fontSize: 16,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  dropdownMenu: {
    position: 'absolute',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    maxHeight: 200,
  },
  optionItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  optionText: {
    fontSize: 16,
  },
});

export default CustomDropdown;
