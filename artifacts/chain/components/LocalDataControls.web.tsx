import React, { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { AppButton } from '@/components/ui/AppUI';
import { captureBackup, parseBackup, restoreBackup } from '@/domain/backup';
import { useColors } from '@/hooks/useColors';
import { TYPE, SPACE } from '@/constants/designSystem';

export default function LocalDataControls() {
  const colors = useColors();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('Saved on this iPhone. Export a copy to Files or iCloud Drive for recovery.');
  function download() {
    try {
      const backup = captureBackup(window.localStorage);
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Chain-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage('Backup prepared. Save it to Files or iCloud Drive.');
    } catch { setMessage('The backup could not be created. Please try again.'); }
  }
  return <View style={{ gap: SPACE.sm, padding: SPACE.md }}>
    <Text accessibilityLiveRegion="polite" style={[TYPE.caption, { color: colors.mutedForeground }]}>{message}</Text>
    <AppButton label="Export backup" icon="download-outline" variant="secondary" onPress={download} />
    <AppButton label="Restore backup" icon="cloud-upload-outline" variant="secondary" onPress={() => input.current?.click()} />
    <input ref={input} type="file" accept=".json,application/json" aria-label="Choose a Chain backup" style={{ display: 'none' }} onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file) return;
      try {
        if (file.size > 10_000_000) throw new Error('Backup is too large.');
        const backup = parseBackup(await file.text());
        if (!window.confirm('Replace Chain data on this device with this backup? Export your current data first if you want to keep it.')) return;
        restoreBackup(window.localStorage, backup);
        window.location.assign(new URL('./', document.baseURI).href);
      } catch (error) { setMessage(error instanceof Error ? error.message : 'The backup could not be restored.'); }
    }} />
  </View>;
}
