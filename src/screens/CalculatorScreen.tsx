import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { LoadedRates } from '../data/rates';
import type { Strings } from '../i18n';
import { calculateBill, formatRupees, parseAmount } from '../lib/calculator';
import { colors, font } from '../theme';

type Props = { rates: LoadedRates; t: Strings };

export function CalculatorScreen({ rates, t }: Props) {
  const latest = rates.file.history[rates.file.history.length - 1];
  const [weight, setWeight] = useState('');
  const [rate, setRate] = useState(String(latest.gold22));
  const [wastage, setWastage] = useState('10');
  const [making, setMaking] = useState('0');
  const [gst, setGst] = useState('3');

  const bill = calculateBill({
    weightGrams: parseAmount(weight),
    ratePerGram: parseAmount(rate),
    wastagePercent: parseAmount(wastage),
    makingPerGram: parseAmount(making),
    gstPercent: parseAmount(gst),
  });

  const field = (label: string, value: string, onChange: (text: string) => void) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        accessibilityLabel={label}
        selectTextOnFocus
      />
    </View>
  );

  const line = (label: string, amount: number) => (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={styles.lineValue}>{formatRupees(amount, 2)}</Text>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t.calcTitle}</Text>
        {field(t.weight, weight, setWeight)}
        {field(t.rate, rate, setRate)}
        {field(t.wastage, wastage, setWastage)}
        {field(t.making, making, setMaking)}
        {field(t.gst, gst, setGst)}

        <View style={styles.card}>
          {bill ? (
            <>
              {line(t.goldValue, bill.goldValue)}
              {line(t.wastageAmount, bill.wastage)}
              {line(t.makingAmount, bill.making)}
              {line(t.gstAmount, bill.gst)}
              <View style={[styles.line, styles.totalLine]}>
                <Text style={styles.totalLabel}>{t.total}</Text>
                <Text style={styles.totalValue}>{formatRupees(bill.total, 2)}</Text>
              </View>
            </>
          ) : (
            <Text style={styles.hint}>{t.calcHint}</Text>
          )}
        </View>
        <Text style={styles.hint}>{t.calcNote}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 12 },
  title: { fontSize: font.large, fontWeight: '800', color: colors.text },
  field: { gap: 6 },
  label: { fontSize: font.body, color: colors.muted },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 52,
    fontSize: font.large,
    color: colors.text,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  lineLabel: { fontSize: font.body, color: colors.muted },
  lineValue: { fontSize: font.body, color: colors.text, fontWeight: '600' },
  totalLine: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  totalLabel: { fontSize: font.large, color: colors.text, fontWeight: '800' },
  totalValue: { fontSize: font.large, color: colors.gold, fontWeight: '800' },
  hint: { fontSize: font.small, color: colors.muted },
});
