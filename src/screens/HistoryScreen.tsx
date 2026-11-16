import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LoadedRates } from '../data/rates';
import type { Strings } from '../i18n';
import { formatRupees, GRAMS_PER_PAVAN } from '../lib/calculator';
import { lastDays, lookback } from '../lib/history';
import { colors, font } from '../theme';

type Props = { rates: LoadedRates; t: Strings };

const RANGES = [7, 30, 90] as const;
const CHART_HEIGHT = 140;

export function HistoryScreen({ rates, t }: Props) {
  const { history } = rates.file;
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const days = lastDays(history, range);
  const values = days.map((d) => d.gold22);
  const high = Math.max(...values);
  const low = Math.min(...values);
  const span = high - low || 1;
  const rangeLabel = { 7: t.days7, 30: t.days30, 90: t.days90 };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>
        {t.historyTitle} · {t.gold22}
      </Text>

      <View style={styles.tabs}>
        {RANGES.map((r) => (
          <Pressable
            key={r}
            onPress={() => setRange(r)}
            style={[styles.tab, range === r && styles.tabActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: range === r }}
          >
            <Text style={[styles.tabText, range === r && styles.tabTextActive]}>{rangeLabel[r]}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        <View style={styles.chart} accessible accessibilityLabel={`${t.highest} ${formatRupees(high)}, ${t.lowest} ${formatRupees(low)}`}>
          {days.map((d) => (
            <View
              key={d.date}
              style={[styles.bar, { height: 12 + ((d.gold22 - low) / span) * (CHART_HEIGHT - 12) }]}
            />
          ))}
        </View>
        <View style={styles.line}>
          <Text style={styles.muted}>{days[0]?.date}</Text>
          <Text style={styles.muted}>{days[days.length - 1]?.date}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.body}>
            {t.highest}: {formatRupees(high)}
          </Text>
          <Text style={styles.body}>
            {t.lowest}: {formatRupees(low)}
          </Text>
        </View>
      </View>

      <Text style={styles.title}>{t.lookbackTitle}</Text>
      {RANGES.map((daysAgo) => {
        const result = lookback(history, 'gold22', GRAMS_PER_PAVAN, daysAgo);
        if (!result) {
          return (
            <View style={styles.card} key={daysAgo}>
              <Text style={styles.body}>
                {daysAgo} {t.daysAgo}
              </Text>
              <Text style={styles.muted}>{t.notEnoughHistory}</Text>
            </View>
          );
        }
        const { change } = result;
        const color = change.direction === 'up' ? colors.up : change.direction === 'down' ? colors.down : colors.muted;
        const arrow = change.direction === 'up' ? '▲' : change.direction === 'down' ? '▼' : '';
        const word = change.direction === 'up' ? t.up : change.direction === 'down' ? t.down : t.noChange;
        return (
          <View style={styles.card} key={daysAgo}>
            <Text style={styles.body}>
              {daysAgo} {t.daysAgo} ({result.boughtOn})
            </Text>
            <View style={styles.line}>
              <Text style={styles.muted}>{t.paidThen}</Text>
              <Text style={styles.body}>{formatRupees(result.thenValue)}</Text>
            </View>
            <View style={styles.line}>
              <Text style={styles.muted}>{t.worthNow}</Text>
              <Text style={styles.body}>{formatRupees(result.nowValue)}</Text>
            </View>
            <Text style={[styles.changeText, { color }]}>
              {arrow} {formatRupees(Math.abs(change.amount))} {word} ({Math.abs(change.percent)}%)
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  title: { fontSize: font.large, fontWeight: '800', color: colors.text },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  tabText: { fontSize: font.body, color: colors.text, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  chart: { height: CHART_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', gap: 1 },
  bar: { flex: 1, backgroundColor: colors.gold, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  body: { fontSize: font.body, color: colors.text, fontWeight: '600' },
  muted: { fontSize: font.small, color: colors.muted },
  changeText: { fontSize: font.body, fontWeight: '700' },
});
