import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { reportDiagnostic } from '@/lib/diagnostics';

export type FeedbackKind = 'selection' | 'light' | 'success' | 'warning' | 'error';

/**
 * Haptics are enhancement, never business logic. Keeping failures contained
 * prevents an unavailable motor or platform bridge from breaking an action.
 */
export function playFeedback(kind: FeedbackKind): void {
  if (Platform.OS === 'web') return;
  const operation = kind === 'selection'
    ? Haptics.selectionAsync()
    : kind === 'light'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : Haptics.notificationAsync(
        kind === 'success'
          ? Haptics.NotificationFeedbackType.Success
          : kind === 'warning'
            ? Haptics.NotificationFeedbackType.Warning
            : Haptics.NotificationFeedbackType.Error,
      );
  void operation.catch((error) => {
    reportDiagnostic({ area: 'native', operation: `haptics.${kind}`, severity: 'warning', error });
  });
}
