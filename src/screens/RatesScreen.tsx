import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LoadedRates } from '../data/rates';
import type { Strings } from '../i18n';
import { formatRupees, GRAMS_PER_PAVAN } from '../lib/calculator';
import { changeSinceYesterday, type Change } from '../lib/history';
import { isReminderOn, turnReminderOff, turnReminderOn } from '../reminder';
import { colors, font } from '../theme';
import type { Metal } from '../types';

type Props = { rates: LoadedRates; t: Strings };

function ChangeLine({ change, t }: { change: Change | null; t: Strings }) {
  if (!change) return null;
  if (change.direction === 'same') {
    return <Text style={[styles.change, { color: colors.muted }]}>{t.noChange}</Text>;
  }
  const isUp = change.direction === 'up';
  return (
    <Text style={[styles.change, { color: isUp ? colors.up : colors.down }]}>
      {isUp ? '▲' : '▼'} {formatRupees(Math.abs(change.amount))} {isUp ? t.up : t.down} ({Math.abs(change.percent)}%){' '}
      {t.sinceYesterday}
    </Text>
  );
}

export function RatesScreen({ rates, t }: Props) {
  const { file, origin } = rates;
  const latest = file.history[file.history.length - 1];
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderDenied, setReminderDenied] = useState(false);

  useEffect(() => {
    isReminderOn().then(setReminderOn).catch(() => {});
  }, []);

  const toggleReminder = async () => {
    try {
      const result = reminderOn ? await turnReminderOff() : await turnReminderOn(t.reminderTitle, t.reminderBody);
      setReminderDenied(result === 'denied');
      setReminderOn(result === 'on');
    } catch {
      setReminderDenied(true);
    }
  };

  const card = (metal: Metal, title: string, bigUnit: string, bigMultiplier: number) => (
    <View style={styles.card} key={metal}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.hero}>{formatRupees(latest[metal], metal === 'silver' ? 2 : 0)}</Text>
      <Text style={styles.unit}>{t.perGram}</Text>
      <ChangeLine change={changeSinceYesterday(file.history, metal)} t={t} />
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{bigUnit}</Text>
        <Text style={styles.rowValue}>{formatRupees(latest[metal] * bigMultiplier)}</Text>
      </View>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {file.sample && (
        <View style={styles.warning}>
          <Text style={styles.warningText}>{t.sampleWarning}</Text>
        </View>
      )}
      {origin === 'cache' && <Text style={styles.note}>{t.offlineNote}</Text>}

      {card('gold22', t.gold22, t.perPavan, GRAMS_PER_PAVAN)}
      {card('gold24', t.gold24, t.perPavan, GRAMS_PER_PAVAN)}
      {card('silver', t.silver, t.perKg, 1000)}

      <Pressable
        style={styles.reminder}
        onPress={toggleReminder}
        accessibilityRole="switch"
        accessibilityState={{ checked: reminderOn }}
      >
        <Text style={styles.reminderText}>{reminderOn ? t.reminderOn : t.reminderOff}</Text>
      </Pressable>
      {reminderDenied && <Text style={styles.note}>{t.reminderDenied}</Text>}

      <Text style={styles.note}>
        {t.updated}: {latest.date} · {t.source}: {file.source}
      </Text>
      <Text style={styles.note}>{t.ratesNote}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardTitle: { fontSize: font.body, color: colors.gold, fontWeight: '700' },
  hero: { fontSize: font.hero, color: colors.text, fontWeight: '800', marginTop: 4 },
  unit: { fontSize: font.small, color: colors.muted },
  change: { fontSize: font.small, fontWeight: '600', marginTop: 6 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowLabel: { fontSize: font.body, color: colors.muted },
  rowValue: { fontSize: font.body, color: colors.text, fontWeight: '700' },
  warning: { backgroundColor: colors.warningBg, borderRadius: 10, padding: 12 },
  warningText: { color: colors.warningText, fontSize: font.small, fontWeight: '700' },
  note: { fontSize: font.small, color: colors.muted },
  reminder: {
    backgroundColor: colors.goldSoft,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 48,
    justifyContent: 'center',
  },
  reminderText: { fontSize: font.body, color: colors.text, fontWeight: '600' },
});
