import { Stack, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { AmbientScreen } from '@/components/AmbientSurface';
import { AppButton, Surface } from '@/components/ui/AppUI';
import { CONTROL, SPACE, TYPE } from '@/constants/designSystem';
import { readableAccentColor } from '@/constants/sectionTheme';
import { useColors } from '@/hooks/useColors';

export default function NotFoundScreen() {
  const colors = useColors('today');
  const accentText = readableAccentColor(colors.primary, colors.cardSolid);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <AmbientScreen tone="neutral" style={styles.container}>
        <Surface elevated accentColor={colors.primary} style={styles.card}>
          <Text style={[TYPE.eyebrow, { color: accentText }]}>CHAIN</Text>
          <Text style={[TYPE.modalTitle, { color: colors.foreground }]}>This screen isn’t here.</Text>
          <Text style={[TYPE.body, { color: colors.mutedForeground }]}>Your data is safe. Return to your Chains and keep going.</Text>
          <View style={styles.action}>
            <AppButton label="Return to Chains" onPress={() => router.replace('/(tabs)')} />
          </View>
        </Surface>
      </AmbientScreen>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: CONTROL.screenHorizontal,
  },
  card: { padding: SPACE.xl, gap: SPACE.sm },
  action: { marginTop: SPACE.sm },
});
