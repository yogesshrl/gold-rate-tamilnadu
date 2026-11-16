import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StatusBar as NativeStatusBar, StyleSheet, Text, View } from 'react-native';
import { loadRates, type LoadedRates } from './src/data/rates';
import { strings, type Lang } from './src/i18n';
import { CalculatorScreen } from './src/screens/CalculatorScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { RatesScreen } from './src/screens/RatesScreen';
import { colors, font } from './src/theme';

type Tab = 'rates' | 'calculator' | 'history';
const LANG_KEY = 'language-v1';

export default function App() {
  const [lang, setLang] = useState<Lang>('ta');
  const [tab, setTab] = useState<Tab>('rates');
  const [rates, setRates] = useState<LoadedRates | null>(null);
  const [failed, setFailed] = useState(false);
  const t = strings[lang];

  const load = useCallback(() => {
    setFailed(false);
    loadRates()
      .then(setRates)
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    load();
    AsyncStorage.getItem(LANG_KEY)
      .then((saved) => {
        if (saved === 'en' || saved === 'ta') setLang(saved);
      })
      .catch(() => {});
  }, [load]);

  const switchLang = () => {
    const next: Lang = lang === 'ta' ? 'en' : 'ta';
    setLang(next);
    AsyncStorage.setItem(LANG_KEY, next).catch(() => {});
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'rates', label: t.tabRates },
    { key: 'calculator', label: t.tabCalculator },
    { key: 'history', label: t.tabHistory },
  ];

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.appName}>{t.appName}</Text>
          <Text style={styles.region}>{t.region}</Text>
        </View>
        <Pressable
          onPress={switchLang}
          style={styles.langButton}
          accessibilityRole="button"
          accessibilityLabel={lang === 'ta' ? 'Switch to English' : 'தமிழுக்கு மாற்று'}
        >
          <Text style={styles.langText}>{lang === 'ta' ? 'English' : 'தமிழ்'}</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        {!rates && !failed && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.gold} />
            <Text style={styles.message}>{t.loading}</Text>
          </View>
        )}
        {failed && (
          <View style={styles.center}>
            <Text style={styles.message}>{t.loadFailed}</Text>
            <Pressable onPress={load} style={styles.langButton} accessibilityRole="button">
              <Text style={styles.langText}>{t.retry}</Text>
            </Pressable>
          </View>
        )}
        {rates && tab === 'rates' && <RatesScreen rates={rates} t={t} />}
        {rates && tab === 'calculator' && <CalculatorScreen rates={rates} t={t} />}
        {rates && tab === 'history' && <HistoryScreen rates={rates} t={t} />}
      </View>

      <View style={styles.tabBar} accessibilityRole="tablist">
        {tabs.map(({ key, label }) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={styles.tabButton}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
          >
            <Text style={[styles.tabLabel, tab === key && styles.tabLabelActive]}>{label}</Text>
            {tab === key && <View style={styles.tabMarker} />}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingTop: NativeStatusBar.currentHeight ?? 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  headerText: { flex: 1 },
  appName: { fontSize: font.large, fontWeight: '800', color: colors.text },
  region: { fontSize: font.small, color: colors.muted },
  langButton: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langText: { fontSize: font.body, fontWeight: '700', color: colors.text },
  body: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  message: { fontSize: font.body, color: colors.muted, textAlign: 'center' },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    paddingBottom: 16,
  },
  tabButton: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: font.body, color: colors.muted, fontWeight: '600' },
  tabLabelActive: { color: colors.gold, fontWeight: '800' },
  tabMarker: { position: 'absolute', top: 0, height: 3, width: '60%', backgroundColor: colors.gold },
});
