import React, { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Activity, Check, ChevronDown, ChevronUp, CircleHelp, ExternalLink, ShieldAlert } from 'lucide-react-native';
import { Text } from 'react-native-paper';
import type { QaReportRecord, QaTestCase, QaTestStep } from '../api/relayClient';

const PALETTE = {
  bg: '#0B0B0D',
  panel: '#16171A',
  panelAlt: '#1D2128',
  muted: '#98A3AE',
  primary: '#F472B6',
  success: '#86EFAC',
  danger: '#FCA5A5',
  warn: '#FCD34D',
  text: '#E6EEF3',
};

function formatDate(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  return d.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function StepRow({ step }: { step: QaTestStep }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepIndex}><Text style={styles.stepIndexText}>{String(step.n).padStart(2, '0')}</Text></View>
      <View style={styles.stepContent}>
        <Text style={styles.stepAction}>{step.action}</Text>
        <View style={styles.stepMetaRow}>
          <Text style={styles.stepMetaLabel}>Attendu</Text>
          <Text style={styles.stepMetaValue}>{step.expected}</Text>
        </View>
        <View style={styles.stepMetaRow}>
          <Text style={styles.stepMetaLabel}>Observé</Text>
          <Text style={styles.stepMetaValue}>{step.actual}</Text>
        </View>
      </View>
      <View style={styles.stepStatusCol}>
        <Text style={[styles.statusPill, step.status === 'passed' ? { backgroundColor: PALETTE.success } : step.status === 'failed' ? { backgroundColor: PALETTE.danger } : { backgroundColor: PALETTE.warn }]}>
          {step.status.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

export default function QaReportPanel({ report }: { report?: QaReportRecord | null }) {
  const { width } = useWindowDimensions();
  const isWide = width >= 980;
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  const cases = report?.report?.test_cases ?? [];
  const selected = useMemo(() => cases.find((c) => c.id === selectedCaseId) ?? cases[0] ?? null, [cases, selectedCaseId]);

  if (!report) return (
    <View style={styles.empty}><Text style={{ color: PALETTE.muted }}>Aucun rapport disponible</Text></View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Rapport QA · {formatDate(report.finished_at)}</Text>
          <Text style={styles.subtitle}>{(report.report?.test_cases?.length ?? 0)} cas · {report.status}</Text>
        </View>
        {!!report.github_run_url && (
          <TouchableOpacity onPress={() => { void Linking.openURL(report.github_run_url!); }} style={styles.viewRunBtn}>
            <Text style={{ color: PALETTE.primary }}>Voir le run</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.body, isWide ? styles.bodyWide : null]}>
        <View style={styles.leftPanel}>
          <ScrollView>
            {cases.map((c) => (
              <TouchableOpacity key={c.id} onPress={() => setSelectedCaseId(c.id)} style={[styles.caseRow, selectedCaseId === c.id ? styles.caseRowActive : null]}>
                <View>
                  <Text style={styles.caseId}>{c.id}</Text>
                  <Text style={styles.caseTitle}>{c.title}</Text>
                </View>
                <View style={styles.caseMetaRight}>
                  <Text style={{ color: PALETTE.muted }}>{c.steps.length} étapes</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.rightPanel}>
          {!selected && (
            <View style={styles.empty}><Text style={{ color: PALETTE.muted }}>Sélectionne un cas</Text></View>
          )}
          {selected && (
            <ScrollView>
              <View style={styles.caseHeader}>
                <Text style={styles.caseHeaderTitle}>{selected.title}</Text>
                <Text style={styles.caseHeaderMeta}>{selected.category} · {selected.severity ?? '—'}</Text>
              </View>

              <View style={styles.stepsList}>
                {selected.steps.map((s) => <StepRow key={`${selected.id}-${s.n}`} step={s} />)}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8 },
  title: { color: PALETTE.text, fontSize: 18, fontWeight: '800' },
  subtitle: { color: PALETTE.muted, fontSize: 12 },
  viewRunBtn: { padding: 8, borderRadius: 8, backgroundColor: PALETTE.panelAlt },
  body: { flexDirection: 'column', gap: 12 },
  bodyWide: { flexDirection: 'row' },
  leftPanel: { width: 320, backgroundColor: PALETTE.panel, borderRadius: 12, padding: 12, maxHeight: 640 },
  rightPanel: { flex: 1, backgroundColor: PALETTE.panelAlt, borderRadius: 12, padding: 12, minHeight: 240 },
  caseRow: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'transparent', marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  caseRowActive: { borderColor: PALETTE.primary, backgroundColor: '#20121A' },
  caseId: { color: PALETTE.primary, fontWeight: '800' },
  caseTitle: { color: PALETTE.text, fontWeight: '700', maxWidth: 220 },
  caseMetaRight: { marginLeft: 8 },
  caseHeader: { paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#23242A', marginBottom: 12 },
  caseHeaderTitle: { color: PALETTE.text, fontSize: 16, fontWeight: '800' },
  caseHeaderMeta: { color: PALETTE.muted, fontSize: 12 },
  stepsList: { gap: 10 },
  stepRow: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 10, backgroundColor: PALETTE.panel, marginBottom: 8, alignItems: 'center' },
  stepIndex: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#111214', alignItems: 'center', justifyContent: 'center' },
  stepIndexText: { color: PALETTE.muted, fontWeight: '800' },
  stepContent: { flex: 1, gap: 6 },
  stepAction: { color: PALETTE.text, fontWeight: '700' },
  stepMetaRow: { flexDirection: 'row', gap: 8 },
  stepMetaLabel: { color: PALETTE.muted, fontSize: 11, width: 86 },
  stepMetaValue: { color: PALETTE.text, fontSize: 13, flex: 1 },
  stepStatusCol: { width: 120, alignItems: 'flex-end' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 18, color: '#082F49', fontWeight: '800' },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 22 },
});
