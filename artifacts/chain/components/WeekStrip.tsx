import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Chain, isRestDay, toLocalDateString } from '@/context/ChainsContext';

interface Props {
  chain: Chain;
  days?: number;
}

const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function getCurrentWeekDates(): string[] {
  const monday = new Date();
  const mondayOffset = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return toLocalDateString(date);
  });
}

export default function WeekStrip({ chain }: Props) {
  const colors = useColors();
  const dates = getCurrentWeekDates();

  return (
    <View style={styles.row}>
      {dates.map((date, i) => {
        const dow = new Date(date + 'T12:00:00').getDay();
        const completed = chain.completedDates.includes(date);
        const minimum = chain.minimumDates.includes(date);
        const frozen = chain.frozenDates.includes(date);
        const rest = isRestDay(chain, date);
        const isToday = date === toLocalDateString(new Date());

        return (
          <View key={date} style={styles.dayCol}>
            <Text
              style={[
                styles.dayLabel,
                {
                  color: isToday ? colors.foreground : colors.mutedForeground,
                  fontFamily: isToday ? 'Inter_600SemiBold' : 'Inter_400Regular',
                },
              ]}
            >
              {DOW_LABELS[dow]}
            </Text>
            <View
              style={[
                styles.dot,
                completed
                  ? { backgroundColor: chain.color, borderWidth: 0 }
                  : minimum
                  ? { backgroundColor: chain.color + '33', borderColor: chain.color, borderWidth: 1.5 }
                  : frozen
                  ? { backgroundColor: 'transparent', borderColor: '#4488ff', borderWidth: 1.5 }
                  : rest
                  ? { backgroundColor: colors.mutedForeground + '26', borderColor: colors.mutedForeground + '66', borderWidth: 1 }
                  : isToday
                  ? { backgroundColor: 'transparent', borderColor: chain.color, borderWidth: 2 }
                  : { backgroundColor: 'transparent', borderColor: colors.border, borderWidth: 1 },
              ]}
            >
              {frozen && !completed && (
                <Ionicons name="snow-outline" size={9} color="#4488ff" />
              )}
              {minimum && !completed && <Ionicons name="leaf-outline" size={10} color={chain.color} />}
              {rest && !completed && !frozen && <Ionicons name="moon" size={13} color={colors.foreground} />}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  dayCol: {
    alignItems: 'center',
    gap: 5,
  },
  dayLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
