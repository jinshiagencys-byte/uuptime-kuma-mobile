import React, { useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import { Text } from 'react-native-paper';
import type {
  QaReportRecord,
  QaSideEffect,
  QaTestCase,
  QaTestStep,
} from '../api/relayClient';

const C = {
  background: '#0F1115',
  surface: '#1A1E27',
  surfaceLow: '#171D26',
  surfaceHigh: '#202B38',
  surfaceHighest: '#253242',
  outline: '#384456',
  text: '#F8FAFC',
  muted: '#B7C2CF',
  primary: '#7DD3FC',
  onPrimary: '#082F49',
  primaryContainer: '#2B3747',
  onPrimaryContainer: '#E2E8F0',
  secondary: '#6EE7B7',
  secondaryContainer: '#173D37',
  onSecondaryContainer: '#B7F7DD',
  error: '#FFB4AB',
  errorContainer: '#5C1F1A',
  onErrorContainer: '#FFDAD5',
  tertiary: '#F4D37B',
  tertiaryContainer: '#463B22',
  onTertiaryContainer: '#F9E8B1',
};

type QaStatus = QaTestCase['status'];

const STATUS: Record<QaStatus, { label: string; color: string; background: string }> = {
  passed: { label: 'Réussi', color: C.secondary, background: C.secondaryContainer },
  failed: { label: 'Échec', color: C.error, background: C.errorContainer },
  blocked: { label: 'Bloqué', color: C.tertiary, background: C.tertiaryContainer },
  skipped: { label: 'Ignoré', color: C.muted, background: C.surfaceHigh },
};

const CATEGORY_LABELS: Record<string, string> = {
  functional: 'Fonctionnel',
  security: 'Sécurité',
  accessibility: 'Accessibilité',
  seo: 'SEO',
};

function formatDate(value?: string | null) {
  if (!value) return 'Date inconnue';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusFor(status: string) {
  return STATUS[status as QaStatus] ?? STATUS.skipped;
}

function StatusBadge({ status, compact = false }: { status: string; compact?: boolean }) {
  const appearance = statusFor(status);
  return (
    <View style={[styles.statusBadge, compact && styles.statusBadgeCompact, { backgroundColor: appearance.background }]}>
      <View style={[styles.statusDot, { backgroundColor: appearance.color }]} />
      <Text style={[styles.statusText, { color: appearance.color }]}>{appearance.label}</Text>
    </View>
  );
}

function SeverityBadge({ severity }: { severity: QaTestCase['severity'] }) {
  if (!severity) return null;
  const color = severity === 'P1' ? C.error : severity === 'P0' ? C.primary : C.tertiary;
  return (
    <View style={[styles.severityBadge, { borderColor: `${color}70` }]}>
      <Text style={[styles.severityText, { color }]}>{severity}</Text>
    </View>
  );
}

function Evidence({ step }: { step: QaTestStep }) {
  const evidence = step.evidence;
  if (!evidence) return null;
  const hasEvidence = evidence.url || evidence.http_status != null || evidence.console || evidence.network || evidence.screenshot;
  if (!hasEvidence) return null;

  return (
    <View style={styles.evidence}>
      <Text style={styles.evidenceTitle}>Preuve</Text>
      <View style={styles.evidenceDetails}>
        {evidence.http_status != null && (
          <Text style={styles.evidenceText}>HTTP {evidence.http_status}</Text>
        )}
        {evidence.url && (
          <TouchableOpacity
            accessibilityRole="link"
            accessibilityLabel={`Ouvrir l'URL de preuve ${evidence.url}`}
            onPress={() => {
              void Linking.openURL(evidence.url!).catch((error: unknown) => {
                console.warn('[QaReportPanel] impossible d’ouvrir la preuve:', error);
              });
            }}
            style={styles.evidenceLink}
          >
            <Text style={styles.evidenceLinkText} numberOfLines={2}>{evidence.url}</Text>
            <ExternalLink size={13} color={C.primary} />
          </TouchableOpacity>
        )}
        {!!evidence.console && <Text style={styles.evidenceText}>Console : {evidence.console}</Text>}
        {!!evidence.network && <Text style={styles.evidenceText}>Réseau : {evidence.network}</Text>}
        {!!evidence.screenshot && <Text style={styles.evidenceText}>Capture : {evidence.screenshot}</Text>}
      </View>
    </View>
  );
}

function StepResult({
  step,
  index,
  desktop,
  expanded,
  onToggleDetails,
}: {
  step: QaTestStep;
  index: number;
  desktop: boolean;
  expanded: boolean;
  onToggleDetails: () => void;
}) {
  const details = expanded ? (
    <View style={styles.observedDetails}>
      <Text style={styles.actualText}>{step.actual || 'Aucun résultat observé renseigné.'}</Text>
      <Evidence step={step} />
    </View>
  ) : null;
  const detailsToggle = (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onToggleDetails}
      style={styles.detailsToggle}
    >
      <Text style={styles.detailsToggleText}>{expanded ? 'Masquer les détails' : 'Voir le résultat observé'}</Text>
    </TouchableOpacity>
  );

  const number = (
    <View style={styles.stepNumber}>
      <Text style={styles.stepNumberText}>{String(step.n ?? index + 1).padStart(2, '0')}</Text>
    </View>
  );

  if (!desktop) {
    return (
      <View style={[styles.stepRow, styles.stepRowMobile]}>
        <View style={styles.mobileStepHeader}>
          {number}
          <Text style={[styles.actionText, styles.mobileActionText]}>{step.action || 'Action non renseignée'}</Text>
          <StatusBadge status={step.status} compact />
        </View>
        <View style={styles.mobileStepField}>
          <Text style={styles.cellLabel}>Précondition</Text>
          <Text style={styles.bodyText}>{step.precondition || '—'}</Text>
        </View>
        <View style={styles.mobileStepField}>
          <Text style={styles.cellLabel}>Attendu</Text>
          <Text style={styles.bodyText}>{step.expected || '—'}</Text>
          {detailsToggle}
          {details}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.stepRow, styles.stepRowDesktop]}>
      {number}
      <View style={[styles.stepCell, styles.actionCell]}>
        <Text style={styles.actionText}>{step.action || 'Action non renseignée'}</Text>
      </View>
      <View style={[styles.stepCell, styles.preconditionCell]}>
        <Text style={styles.bodyText}>{step.precondition || '—'}</Text>
      </View>
      <View style={[styles.stepCell, styles.expectedCell]}>
        <Text style={styles.bodyText}>{step.expected || '—'}</Text>
        {detailsToggle}
        {details}
      </View>
      <View style={[styles.stepCell, styles.resultCell]}>
        <StatusBadge status={step.status} compact />
      </View>
    </View>
  );
}

function effectParts(effect: string | QaSideEffect) {
  if (typeof effect === 'string') return { title: effect, details: '', reference: '' };
  return {
    title: effect.action || 'Effet de bord',
    details: effect.details || '',
    reference: effect.reference || '',
  };
}

export default function QaReportPanel({ report }: { report?: QaReportRecord | null }) {
  const { width } = useWindowDimensions();
  const desktop = width >= 980;
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [showSideEffects, setShowSideEffects] = useState(false);
  const [expandedStepIds, setExpandedStepIds] = useState<string[]>([]);

  if (!report?.report) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Aucun rapport QA disponible</Text>
        <Text style={styles.emptyText}>Le relais n’a pas encore renvoyé de résultats pour ce monitor.</Text>
      </View>
    );
  }

  const cases = report.report.test_cases ?? [];
  const selected = cases.find((item) => item.id === selectedCaseId) ?? cases[0] ?? null;
  const counts = {
    passed: report.report.summary?.passed ?? cases.filter((item) => item.status === 'passed').length,
    failed: report.report.summary?.failed ?? cases.filter((item) => item.status === 'failed').length,
    blocked: report.report.summary?.blocked ?? cases.filter((item) => item.status === 'blocked').length,
  };
  const categories = [...new Set(cases.map((item) => item.category))];
  const sideEffects = report.report.side_effects ?? [];
  const stateLabel = report.status ? report.status.replace(/[_-]/g, ' ') : 'Terminé';

  return (
    <View style={styles.container}>
      <View style={styles.reportHeader}>
        <View style={styles.reportHeading}>
          <Text style={styles.eyebrow}>GESTION DES TESTS</Text>
          <Text style={styles.title}>Rapport de test</Text>
          <Text style={styles.subtitle}>
            {cases.length} scénarios · {formatDate(report.finished_at)}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <View style={styles.runStatus}>
            <View style={[styles.statusDot, { backgroundColor: C.primary }]} />
            <Text style={styles.runStatusText}>{stateLabel}</Text>
          </View>
          {!!report.github_run_url && (
            <TouchableOpacity
              accessibilityRole="link"
              onPress={() => {
                void Linking.openURL(report.github_run_url!).catch((error: unknown) => {
                  console.warn('[QaReportPanel] impossible d’ouvrir le run GitHub:', error);
                });
              }}
              style={styles.runLink}
            >
              <Text style={styles.runLinkText}>Voir le run</Text>
              <ExternalLink size={14} color={C.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.summaryRow}>
        <SummaryCard label="Réussis" count={counts.passed} color={C.secondary} />
        <SummaryCard label="Échoués" count={counts.failed} color={C.error} />
        <SummaryCard label="Bloqués" count={counts.blocked} color={C.tertiary} />
      </View>

      <View style={[styles.workspace, desktop && styles.workspaceDesktop]}>
        <View style={[styles.caseNavigation, desktop && styles.caseNavigationDesktop]}>
          <View style={styles.navigationHeader}>
            <Text style={styles.navigationTitle}>Scénarios</Text>
            <Text style={styles.navigationCount}>{cases.length}</Text>
          </View>
          <ScrollView
            horizontal={!desktop}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.caseList, !desktop && styles.caseListHorizontal]}
          >
            {categories.map((category) => {
              const categoryCases = cases.filter((item) => item.category === category);
              return (
                <View key={category} style={styles.categoryGroup}>
                  {desktop && (
                    <Text style={styles.categoryTitle}>
                      {CATEGORY_LABELS[category] ?? category} <Text style={styles.categoryCount}>{categoryCases.length}</Text>
                    </Text>
                  )}
                  {categoryCases.map((item) => (
                    <CaseNavigationItem
                      key={item.id}
                      item={item}
                      active={selected?.id === item.id}
                      desktop={desktop}
                      onPress={() => setSelectedCaseId(item.id)}
                    />
                  ))}
                </View>
              );
            })}
          </ScrollView>
        </View>

        <View style={[styles.caseDetail, desktop && styles.caseDetailDesktop]}>
          {!selected ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Aucun scénario dans ce rapport</Text>
              <Text style={styles.emptyText}>Les scénarios apparaîtront ici une fois le rapport disponible.</Text>
            </View>
          ) : (
            <>
              <View style={styles.caseHeader}>
                <View style={styles.caseHeading}>
                  <Text style={styles.caseId}>{selected.id}</Text>
                  <Text style={styles.caseTitle}>{selected.title}</Text>
                  <View style={styles.caseMetadata}>
                    <Text style={styles.categoryTag}>{CATEGORY_LABELS[selected.category] ?? selected.category}</Text>
                    <SeverityBadge severity={selected.severity} />
                    {selected.discovered && <Text style={styles.discoveredTag}>Découvert</Text>}
                  </View>
                </View>
                <StatusBadge status={selected.status} />
              </View>

              <View style={styles.stepsHeading}>
                <Text style={styles.stepsTitle}>Détail des étapes</Text>
                <Text style={styles.stepsCount}>{selected.steps.length} étapes</Text>
              </View>

              {desktop && (
                <View style={styles.tableHeader}>
                  <View style={styles.stepNumberHeading} />
                  <Text style={[styles.tableHeading, styles.actionCell]}>Action</Text>
                  <Text style={[styles.tableHeading, styles.preconditionCell]}>Précondition</Text>
                  <Text style={[styles.tableHeading, styles.expectedCell]}>Attendu</Text>
                  <Text style={[styles.tableHeading, styles.resultCell]}>Test result</Text>
                </View>
              )}

              <View style={styles.stepList}>
                {selected.steps.map((step, index) => (
                  <StepResult
                    key={`${selected.id}-${step.n}`}
                    step={step}
                    index={index}
                    desktop={desktop}
                    expanded={expandedStepIds.includes(`${selected.id}-${step.n}`)}
                    onToggleDetails={() => {
                      const stepId = `${selected.id}-${step.n}`;
                      setExpandedStepIds((current) => (
                        current.includes(stepId)
                          ? current.filter((id) => id !== stepId)
                          : [...current, stepId]
                      ));
                    }}
                  />
                ))}
              </View>
            </>
          )}
        </View>
      </View>

      {sideEffects.length > 0 && (
        <View style={styles.sideEffects}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ expanded: showSideEffects }}
            onPress={() => setShowSideEffects((visible) => !visible)}
            style={styles.sideEffectsHeader}
          >
            <View style={styles.sideEffectsHeading}>
              <Text style={styles.sideEffectsTitle}>Effets de bord</Text>
              <Text style={styles.navigationCount}>{sideEffects.length}</Text>
            </View>
            <Text style={styles.toggleText}>{showSideEffects ? 'Masquer' : 'Afficher'}</Text>
          </TouchableOpacity>
          {showSideEffects && (
            <View style={styles.effectList}>
              {sideEffects.map((effect, index) => {
                const parts = effectParts(effect);
                return (
                  <View key={`${parts.title}-${index}`} style={styles.effectItem}>
                    <Text style={styles.effectTitle}>{parts.title}</Text>
                    {!!parts.details && <Text style={styles.effectText}>{parts.details}</Text>}
                    {!!parts.reference && <Text style={styles.effectReference}>{parts.reference}</Text>}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function SummaryCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <View style={styles.summaryCard}>
      <View style={[styles.summaryAccent, { backgroundColor: color }]} />
      <View>
        <Text style={styles.summaryCount}>{count}</Text>
        <Text style={styles.summaryLabel}>{label}</Text>
      </View>
    </View>
  );
}

function CaseNavigationItem({
  item,
  active,
  desktop,
  onPress,
}: {
  item: QaTestCase;
  active: boolean;
  desktop: boolean;
  onPress: () => void;
}) {
  const appearance = statusFor(item.status);
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[
        styles.caseNavigationItem,
        desktop ? styles.caseNavigationItemDesktop : styles.caseNavigationItemMobile,
        active && styles.caseNavigationItemActive,
      ]}
    >
      <View style={styles.caseNavigationText}>
        <Text style={[styles.caseNavigationId, active && styles.activeCaseText]}>{item.id}</Text>
        <Text style={styles.caseNavigationTitle} numberOfLines={desktop ? 2 : 1}>{item.title}</Text>
      </View>
      <View style={[styles.navigationStatusDot, { backgroundColor: appearance.color }]} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 2,
  },
  reportHeading: { flex: 1, minWidth: 0, gap: 3 },
  eyebrow: { color: C.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: C.text, fontSize: 24, fontWeight: '700' },
  subtitle: { color: C.muted, fontSize: 14 },
  headerActions: { alignItems: 'flex-end', gap: 8 },
  runStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: C.surfaceHigh,
  },
  runStatusText: { color: C.text, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  runLink: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3 },
  runLinkText: { color: C.primary, fontSize: 14, fontWeight: '600' },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 16,
    borderRadius: 16,
    backgroundColor: C.surfaceLow,
    borderWidth: 1,
    borderColor: C.outline,
  },
  summaryAccent: { width: 3, height: 34, borderRadius: 2 },
  summaryCount: { color: C.text, fontSize: 22, fontWeight: '700' },
  summaryLabel: { color: C.muted, fontSize: 12, fontWeight: '500' },
  workspace: { gap: 12 },
  workspaceDesktop: { flexDirection: 'row', alignItems: 'stretch' },
  caseNavigation: {
    minWidth: 0,
    padding: 16,
    borderRadius: 16,
    backgroundColor: C.surfaceLow,
    borderWidth: 1,
    borderColor: C.outline,
  },
  caseNavigationDesktop: { width: 252 },
  navigationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 3,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.outline,
  },
  navigationTitle: { color: C.text, fontSize: 13, fontWeight: '800' },
  navigationCount: {
    minWidth: 22,
    textAlign: 'center',
    overflow: 'hidden',
    color: C.muted,
    backgroundColor: C.surfaceHigh,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 12,
    fontWeight: '600',
  },
  caseList: { paddingTop: 8, gap: 8 },
  caseListHorizontal: { paddingRight: 4 },
  categoryGroup: { gap: 4 },
  categoryTitle: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: 7,
    marginBottom: 2,
    paddingHorizontal: 7,
  },
  categoryCount: { color: C.muted, fontSize: 9 },
  caseNavigationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 7,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 8,
  },
  caseNavigationItemDesktop: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 8 },
  caseNavigationItemMobile: { width: 206, minHeight: 48, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: C.surface },
  caseNavigationItemActive: { backgroundColor: C.primaryContainer, borderColor: C.primary },
  caseNavigationText: { flex: 1, minWidth: 0, gap: 2 },
  caseNavigationId: { color: C.primary, fontSize: 12, fontWeight: '600' },
  activeCaseText: { color: C.onPrimaryContainer },
  caseNavigationTitle: { color: C.text, fontSize: 12, fontWeight: '500' },
  navigationStatusDot: { width: 7, height: 7, borderRadius: 4 },
  caseDetail: {
    minWidth: 0,
    padding: 16,
    borderRadius: 16,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.outline,
  },
  caseDetailDesktop: { flex: 1 },
  caseHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.outline,
  },
  caseHeading: { flex: 1, minWidth: 0, gap: 4 },
  caseId: { color: C.primary, fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  caseTitle: { color: C.text, fontSize: 20, fontWeight: '600' },
  caseMetadata: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  categoryTag: {
    color: C.muted,
    backgroundColor: C.primaryContainer,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '500',
  },
  severityBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  severityText: { fontSize: 11, fontWeight: '600' },
  discoveredTag: { color: C.primary, fontSize: 11, fontWeight: '600' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusBadgeCompact: { alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 5 },
  statusText: { fontSize: 12, fontWeight: '600' },
  stepsHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 13,
    paddingBottom: 8,
  },
  stepsTitle: { color: C.text, fontSize: 14, fontWeight: '600' },
  stepsCount: { color: C.muted, fontSize: 12 },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.outline,
  },
  stepNumberHeading: { width: 24 },
  tableHeading: { color: C.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  stepList: { gap: 8 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 12,
    borderRadius: 12,
    backgroundColor: C.surfaceLow,
    borderWidth: 1,
    borderColor: C.outline,
  },
  stepRowMobile: { flexDirection: 'column', gap: 10 },
  stepRowDesktop: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12 },
  mobileStepHeader: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  mobileActionText: { flex: 1 },
  mobileStepField: { width: '100%', gap: 3 },
  stepNumber: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: C.surfaceHigh,
  },
  stepNumberText: { color: C.muted, fontSize: 12, fontWeight: '600' },
  stepCell: { minWidth: 0 },
  actionCell: { flex: 1.05 },
  preconditionCell: { flex: 1 },
  expectedCell: { flex: 1.4 },
  resultCell: { width: 74 },
  cellLabel: { color: C.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  actionText: { color: C.text, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  bodyText: { color: C.text, fontSize: 12, lineHeight: 17 },
  actualText: { color: C.muted, fontSize: 12, lineHeight: 17 },
  observedDetails: { gap: 5, marginTop: 8, padding: 12, borderRadius: 8, backgroundColor: C.surfaceHigh },
  detailsToggle: { alignSelf: 'flex-start', marginTop: 6, paddingVertical: 2 },
  detailsToggleText: { color: C.primary, fontSize: 12, fontWeight: '600' },
  evidence: { marginTop: 8, padding: 10, borderRadius: 8, backgroundColor: C.surfaceHigh },
  evidenceTitle: { color: C.primary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  evidenceDetails: { gap: 3 },
  evidenceText: { color: C.muted, fontSize: 11, lineHeight: 16 },
  evidenceLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  evidenceLinkText: { flexShrink: 1, color: C.primary, fontSize: 11, lineHeight: 16 },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: 140,
    padding: 20,
    borderRadius: 16,
    backgroundColor: C.surfaceLow,
    borderWidth: 1,
    borderColor: C.outline,
  },
  emptyTitle: { color: C.text, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: C.muted, fontSize: 11, textAlign: 'center' },
  sideEffects: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: C.surfaceLow,
    borderWidth: 1,
    borderColor: C.outline,
  },
  sideEffectsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sideEffectsHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sideEffectsTitle: { color: C.text, fontSize: 14, fontWeight: '600' },
  toggleText: { color: C.primary, fontSize: 12, fontWeight: '600' },
  effectList: { gap: 8, paddingTop: 12 },
  effectItem: { gap: 4, padding: 12, borderRadius: 8, backgroundColor: C.surfaceHigh },
  effectTitle: { color: C.text, fontSize: 13, fontWeight: '600' },
  effectText: { color: C.muted, fontSize: 12, lineHeight: 17 },
  effectReference: { color: C.primary, fontSize: 12, lineHeight: 17 },
});
