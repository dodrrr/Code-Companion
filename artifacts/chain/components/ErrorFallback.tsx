import React, { useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { reloadAppAsync } from 'expo';
import { AmbientScreen } from '@/components/AmbientSurface';
import { AppButton, IconButton, SheetHandle, Surface } from '@/components/ui/AppUI';
import { CONTROL, RADIUS, SCRIM, SPACE, TYPE } from '@/constants/designSystem';
import { useColors } from '@/hooks/useColors';

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
};

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const colors = useColors('today');
  const insets = useSafeAreaInsets();
  const [isModalVisible, setIsModalVisible] = useState(false);

  async function handleRestart() {
    try {
      await reloadAppAsync();
    } catch (restartError) {
      console.error('Failed to restart app:', restartError);
      resetError();
    }
  }

  const details = error.stack
    ? `Error: ${error.message}\n\nStack trace:\n${error.stack}`
    : `Error: ${error.message}`;
  const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

  return (
    <AmbientScreen tone="neutral" style={styles.root}>
      {__DEV__ ? (
        <View style={[styles.detailsAction, { top: insets.top + SPACE.md }]}>
          <IconButton icon="bug-outline" label="View error details" onPress={() => setIsModalVisible(true)} />
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + SPACE.xxxl, paddingBottom: insets.bottom + SPACE.xxxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Surface elevated accentColor={colors.destructive} style={styles.card}>
          <View style={[styles.iconWrap, { backgroundColor: colors.destructive + '1A' }]}>
            <Ionicons name="alert-circle-outline" size={28} color={colors.destructive} />
          </View>
          <Text style={[TYPE.modalTitle, { color: colors.foreground }]}>Chain couldn’t continue.</Text>
          <Text style={[TYPE.body, { color: colors.mutedForeground }]}>Restart Chain to try again. Restarting should leave your saved data unchanged.</Text>
          <View style={styles.restartAction}>
            <AppButton label="Restart Chain" onPress={() => { void handleRestart(); }} />
          </View>
        </Surface>
      </ScrollView>

      {__DEV__ ? (
        <Modal
          visible={isModalVisible}
          animationType="slide"
          transparent
          statusBarTranslucent
          onRequestClose={() => setIsModalVisible(false)}
        >
          <View
            style={styles.modalOverlay}
            accessibilityViewIsModal
            importantForAccessibility="yes"
          >
            <Surface elevated style={[styles.modalContainer, { paddingBottom: insets.bottom }]}>
              <SheetHandle />
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderCopy}>
                  <Text style={[TYPE.eyebrow, { color: colors.destructive }]}>DEVELOPER</Text>
                  <Text style={[TYPE.sectionTitle, { color: colors.foreground }]}>Error details</Text>
                </View>
                <IconButton icon="close" label="Close error details" onPress={() => setIsModalVisible(false)} />
              </View>
              <ScrollView
                style={styles.modalScrollView}
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator
              >
                <Surface style={styles.errorContainer}>
                  <Text style={[styles.errorText, { color: colors.foreground, fontFamily: monoFont }]} selectable>
                    {details}
                  </Text>
                </Surface>
              </ScrollView>
            </Surface>
          </View>
        </Modal>
      ) : null}
    </AmbientScreen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  detailsAction: { position: 'absolute', right: CONTROL.screenHorizontal, zIndex: 10 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: CONTROL.screenHorizontal,
  },
  card: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: SPACE.xl, gap: SPACE.sm },
  iconWrap: {
    width: CONTROL.prominentButtonHeight,
    height: CONTROL.prominentButtonHeight,
    borderRadius: RADIUS.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.xs,
  },
  restartAction: { marginTop: SPACE.sm },
  modalOverlay: { flex: 1, backgroundColor: SCRIM, justifyContent: 'flex-end' },
  modalContainer: {
    width: '100%',
    height: '90%',
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingTop: SPACE.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: CONTROL.screenHorizontal,
    paddingBottom: SPACE.sm,
    gap: SPACE.md,
  },
  modalHeaderCopy: { flex: 1, gap: SPACE.hairline },
  modalScrollView: { flex: 1 },
  modalScrollContent: { paddingHorizontal: CONTROL.screenHorizontal, paddingBottom: SPACE.xl },
  errorContainer: { padding: SPACE.md, borderRadius: RADIUS.control },
  errorText: { ...TYPE.caption, width: '100%' },
});
