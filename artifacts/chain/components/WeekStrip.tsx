import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Chain } from '@/context/ChainsContext';

interface Props {
  chain: Chain;
  days?: number;
}

const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function getRecentDates(count: number): string[] {
  const dates: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

export default function WeekStrip({ chain, days = 7 }: Props) {
  const colors = useColors();
  const dates = getRecentDates(days);

  return (
    <View style={styles.row}>
      {dates.map((date, i) => {
        const dow = new Date(date + 'T12:00:00').getDay();
        const completed = chain.completedDates.includes(date);
        const frozen = chain.frozenDates.includes(date);
        const isToday = i === dates.length - 1;

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
                  : frozen
                  ? { backgroundColor: 'transparent', borderColor: '#4488ff', borderWidth: 1.5 }
                  : isToday
                  ? { backgroundColor: 'transparent', borderColor: colors.primary, borderWidth: 1.5 }
                  : { backgroundColor: 'transparent', borderColor: colors.border, borderWidth: 1 },
              ]}
            >
              {frozen && !completed && (
                <Ionicons name="snow-outline" size={9} color="#4488ff" />
              )}
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
