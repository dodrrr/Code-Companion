import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import AnimatedPressable from '@/components/AnimatedPressable';
import { CONTROL, RADIUS, TYPE } from '@/constants/designSystem';

export type SevenChoiceOption = {
  label: string;
  value: number;
  accessibilityLabel: string;
};

export type SevenChoiceSelectorProps = {
  options: readonly SevenChoiceOption[];
  selectionMode: 'single' | 'multiple';
  selectedValues: readonly number[];
  onSelectionChange: (selectedValues: number[]) => void;
  accentColor: string;
  selectedTextColor: string;
  textColor: string;
  borderColor: string;
  backgroundColor: string;
  accessibilityLabel: string;
};

const CHOICE_COUNT = 7;
const MINIMUM_ROW_WIDTH = CONTROL.minimumTarget * CHOICE_COUNT;

/**
 * A compact seven-value selector. Each 36pt circle sits inside a 44pt native
 * press target, while the row only becomes horizontally scrollable below the
 * minimum width needed by those targets.
 */
export function SevenChoiceSelector({
  options,
  selectionMode,
  selectedValues,
  onSelectionChange,
  accentColor,
  selectedTextColor,
  textColor,
  borderColor,
  backgroundColor,
  accessibilityLabel,
}: SevenChoiceSelectorProps) {
  if (options.length !== CHOICE_COUNT) {
    throw new Error(`SevenChoiceSelector requires exactly ${CHOICE_COUNT} options.`);
  }

  const selected = new Set(selectedValues);

  function select(value: number) {
    if (selectionMode === 'single') {
      if (!selected.has(value) || selectedValues.length !== 1) {
        onSelectionChange([value]);
      }
      return;
    }

    const nextSelected = new Set(selectedValues);
    if (nextSelected.has(value)) nextSelected.delete(value);
    else nextSelected.add(value);

    // Always emit values in visual order so Sunday and other trailing choices
    // remain stable after a multiple-selection update.
    onSelectionChange(options.filter((option) => nextSelected.has(option.value)).map((option) => option.value));
  }

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={selectionMode === 'single' ? 'radiogroup' : undefined}
    >
      <ScrollView
        horizontal
        alwaysBounceHorizontal={false}
        directionalLockEnabled
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.row, { minWidth: MINIMUM_ROW_WIDTH }]}
      >
        {options.map((option) => {
          const isSelected = selected.has(option.value);
          return (
            <AnimatedPressable
              key={option.value}
              accessibilityRole={selectionMode === 'single' ? 'radio' : 'checkbox'}
              accessibilityLabel={option.accessibilityLabel}
              accessibilityState={{ checked: isSelected }}
              onPress={() => select(option.value)}
              scaleTo={0.92}
              containerStyle={styles.target}
              style={[
                styles.circle,
                {
                  backgroundColor: isSelected ? accentColor : backgroundColor,
                  borderColor: isSelected ? accentColor : borderColor,
                  borderWidth: isSelected ? 2 : StyleSheet.hairlineWidth,
                },
              ]}
            >
              <Text
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                numberOfLines={1}
                style={[styles.label, { color: isSelected ? selectedTextColor : textColor }]}
              >
                {option.label}
              </Text>
            </AnimatedPressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  target: {
    width: CONTROL.minimumTarget,
    height: CONTROL.minimumTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.capsule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...TYPE.bodyStrong,
    maxWidth: 30,
    textAlign: 'center',
  },
});
