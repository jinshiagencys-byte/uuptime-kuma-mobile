import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Animated,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  X,
  ChevronDown,
  Check,
  Menu,
} from 'lucide-react-native';
import { toastiva } from 'toastiva';
import {
  getMonitorDetail,
  getMonitors,
  pausePage,
  resumePage,
  acknowledgeSite,
  RelayError,
  type MonitorDetail,
  type MonitorItem,
  type HeartbeatPoint,
  type MonitorStatus,
} from '../api/relayClient';

// ─── Theme Colors ────────────────────────────────────────────────────────────
const C = {
  bg: '#0F171E',
  card: '#16212B',
  cardBorder: '#1E2C3A',
  white: '#E1E7ED',
  muted: '#8A99AD',
  green: '#22C55E',
  greenBar: '#22C55E',
  red: '#EF4444',
  yellow: '#FBBF24',
  blue: '#3B82F6',
  slate: '#64748B',
};

const STATUS_COLOR: Record<MonitorStatus, string> = {
  up: C.green,
  down: C.red,
  pending: C.yellow,
  maintenance: C.blue,
  paused: C.slate,
};

// ─── Utilitaires ─────────────────────────────────────────────────────────────

function formatLastChecked(lastCheckedAt: string | null): string {
  if (!lastCheckedAt) return '—';
  try {
    const date = new Date(lastCheckedAt);
    if (isNaN(date.getTime())) return lastCheckedAt;
    return date.toLocaleString([], {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return lastCheckedAt;
  }
}

// Clean URL for concise display by stripping protocol
function cleanUrl(url: string): string {
  if (!url) return '—';
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

// ─── Config Row ─────────────────────────────────────────────────────────────
const ConfigRow: React.FC<{ label: string; value: string; last?: boolean; valueColor?: string }> = ({
  label,
  value,
  last,
  valueColor,
}) => (
  <View style={[s.configRow, last && s.configRowLast]}>
    <Text style={s.configLabel}>{label}</Text>
    <Text
      style={[s.configValue, valueColor ? { color: valueColor } : undefined]}
      numberOfLines={1}
      ellipsizeMode="middle"
    >
      {value}
    </Text>
  </View>
);

// ─── Status Dropdown Component ──────────────────────────────────────────────
const StatusDropdown = ({
  monitorId,
  currentStatus,
  active,
  onChanged,
  hasIncident,
  onResolve,
  resolving,
}: {
  monitorId: number | string;
  currentStatus: MonitorStatus;
  active: boolean;
  onChanged: () => void;
  hasIncident: boolean;
  onResolve: () => void;
  resolving: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const isMaintenance = currentStatus === 'maintenance' || !active;
  const bgColor = isMaintenance ? '#8B5CF6' : C.red;
  const label = isMaintenance ? 'Maintenance' : 'Down';

  const handleSelect = async (next: 'Down' | 'Maintenance') => {
    setIsOpen(false);
    if ((next === 'Maintenance') === isMaintenance) return;
    setPending(true);
    try {
      if (next === 'Maintenance') {
        await pausePage(monitorId);
        toastiva.success('Passé en maintenance');
      } else {
        await resumePage(monitorId);
        toastiva.success('Maintenance terminée (site actif)');
      }
      onChanged();
    } catch (err) {
      toastiva.error('Échec de la modification du statut');
      console.warn('[StatusDropdown] échec du changement de statut:', err);
    } finally {
      setPending(false);
    }
  };

  const handleResolve = () => {
    setIsOpen(false);
    onResolve();
  };

  const isLoading = pending || resolving;

  return (
    <View style={{ position: 'relative', zIndex: 10 }}>
      {/* Largeur fixe (148px) : ne change pas selon le label affiché */}
      <TouchableOpacity
        style={[s.dropdownButton, { backgroundColor: bgColor, opacity: isLoading ? 0.6 : 1, width: 148 }]}
        onPress={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        activeOpacity={0.8}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <ChevronDown color="#FFF" size={16} />
        )}
        <Text style={s.dropdownButtonText}>{label}</Text>
      </TouchableOpacity>

      {isOpen && (
        <View style={s.dropdownMenu}>
          <TouchableOpacity onPress={() => handleSelect('Down')} style={s.dropdownMenuItem}>
            <Text style={s.dropdownMenuItemText}>Down</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleSelect('Maintenance')} style={[s.dropdownMenuItem, { borderTopWidth: 1, borderTopColor: C.cardBorder }]}>
            <Text style={s.dropdownMenuItemText}>Maintenance</Text>
          </TouchableOpacity>
          {hasIncident && (
            <TouchableOpacity onPress={handleResolve} style={[s.dropdownMenuItem, { borderTopWidth: 1, borderTopColor: C.cardBorder }]}>
              <Text style={[s.dropdownMenuItemText, { color: '#4ADE80' }]}>✓ Résolu</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};


function formatIncidentDuration(minutes: number | undefined | null): string {
  if (minutes == null) return '—';
  const d = Math.floor(minutes / (24 * 60));
  const h = Math.floor((minutes % (24 * 60)) / 60);
  const m = Math.floor(minutes % 60);
  let str = '';
  if (d > 0) str += `${d}j `;
  if (h > 0) str += `${h}h `;
  str += `${m}min`;
  return str.trim();
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SIDEBAR_WIDTH = SCREEN_WIDTH * 0.78;

const SidebarItem = ({ label, value }: { label: string; value: string }) => (
  <View style={s.sidebarItemRow}>
    <Text style={s.sidebarItemLabel}>{label}</Text>
    <Text style={s.sidebarItemValue}>{value}</Text>
  </View>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function MonitorDetailScreen({
  monitorId,
  onBack,
}: {
  monitorId: number | string;
  onBack: () => void;
}) {
  const [monitor, setMonitor] = useState<MonitorDetail | null>(null);
  const [, setHistory] = useState<HeartbeatPoint[]>([]);
  const [childrenPages, setChildrenPages] = useState<MonitorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const slideAnim = useRef(new Animated.Value(SIDEBAR_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const openSidebar = () => {
    setSidebarOpen(true);
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0.5,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeSidebar = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SIDEBAR_WIDTH,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSidebarOpen(false);
    });
  };

  const fetchDetail = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      try {
        const [detailData, monitorsData] = await Promise.all([
          getMonitorDetail(monitorId),
          getMonitors()
        ]);
        if (!isMounted.current) return;
        setMonitor(detailData.monitor);
        setHistory(detailData.history);
        
        const groupChildren = monitorsData.monitors.filter(m => String(m.parent) === String(monitorId));
        setChildrenPages(groupChildren);
        
        setError(null);
      } catch (err) {
        if (!isMounted.current) return;
        const msg = err instanceof RelayError ? err.message : 'Erreur lors du chargement.';
        setError(msg);
        toastiva.error(msg);
      } finally {
        if (!isMounted.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [monitorId]
  );

  useEffect(() => {
    isMounted.current = true;
    fetchDetail();
    return () => {
      isMounted.current = false;
    };
  }, [fetchDetail]);

  const isGroup = monitor?.type === 'group';
  const [resolving, setResolving] = useState(false);

  const handleResolve = () => {
    if (!monitor || resolving) return;

    const siteName = monitor.parentName || monitor.name;
    const siteId = monitor.parent ?? monitor.id;

    Alert.alert(
      'Marquer le site comme résolu ?',
      `Cette action concerne l'ensemble du site "${siteName}".\n\nLes vérifications automatiques seront réactivées au prochain cycle.\n\nNote : Si un problème persiste sur l'une des pages, l'incident sera de nouveau signalé au prochain check.`,
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Marquer comme résolu',
          style: 'default',
          onPress: async () => {
            setResolving(true);
            try {
              await acknowledgeSite(siteId);

              toastiva.success('Site marqué comme résolu', {
                description: 'La surveillance automatique a été réactivée pour ce site.',
                duration: 4000,
              });

              await fetchDetail(true);
            } catch (err) {
              const errorMessage = err instanceof RelayError ? err.message : "Erreur lors de la résolution de l'incident.";
              setError(errorMessage);
              toastiva.error('Échec de la résolution', {
                description: errorMessage,
              });
            } finally {
              setResolving(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={s.container}>
      {/* ── Top Navigation Bar ── */}
      <View style={s.headerRow}>
        <TouchableOpacity style={s.backButton} onPress={onBack} activeOpacity={0.7}>
          <ArrowLeft size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{isGroup || !monitor ? 'Détails' : 'Incident View'}</Text>
        <TouchableOpacity style={s.infoButton} onPress={openSidebar} activeOpacity={0.7}>
          <Menu size={22} color={C.white} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchDetail(true)}
            tintColor={C.green}
            colors={[C.green]}
          />
        }
      >
        {/* Loading State */}
        {loading && !monitor && (
          <View style={s.centered}>
            <ActivityIndicator size="large" color={C.green} />
            <Text style={s.emptyText}>Chargement...</Text>
          </View>
        )}

        {/* Error State */}
        {error && !monitor && (
          <View style={s.centered}>
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => fetchDetail()} activeOpacity={0.8}>
              <Text style={s.retryBtnText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        )}

        {monitor && (
          <>
            {monitor.type === 'group' ? (
              <>
                <View style={s.card}>
                  <Text style={s.cardTitle}>Résumé du Groupe</Text>
                  <ConfigRow label="Nom du groupe:" value={monitor.name} />
                  <ConfigRow label="Client:" value={monitor.clientName || '—'} />
                  <ConfigRow label="Responsable:" value={monitor.assignee || '—'} />
                  <ConfigRow label="Pages vérifiées:" value={String(childrenPages.length)} last />
                </View>

                {childrenPages.length > 0 && (
                  <View style={s.card}>
                    <Text style={s.cardTitle}>Pages du groupe</Text>
                    {childrenPages.map((child, index) => {
                      const hasError = child.status !== 'up' || !!child.msg;
                      return (
                        <View key={child.id} style={[s.childRowContainer, index !== childrenPages.length - 1 && s.childRowBorder]}>
                          <View style={s.childRow}>
                            <Text style={s.childName} numberOfLines={1}>
                              {cleanUrl(child.url || child.name)}
                            </Text>
                            <View style={s.childStatusBadge}>
                              <View style={[s.childStatusDot, { backgroundColor: STATUS_COLOR[child.status] || C.muted }]} />
                              <Text style={[s.childStatusText, { color: STATUS_COLOR[child.status] || C.muted }]}>
                                {child.status === 'up' ? 'Online' : child.status === 'down' ? 'Offline' : child.status}
                              </Text>
                            </View>
                          </View>
                          {hasError && child.msg ? (
                            <View style={s.childCauseBox}>
                              <Text style={s.childCauseText}>{child.msg}</Text>
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            ) : (
              <View style={[s.card, { marginTop: 12 }]}>
                <View style={s.incidentViewRow}>
                  <Text style={s.incidentViewLabel}>URL:</Text>
                  <Text style={[s.incidentViewValue, { color: STATUS_COLOR[monitor.status] || C.white }]} numberOfLines={1}>
                    {cleanUrl(monitor.url || monitor.hostname || '')}
                  </Text>
                </View>
                
                <View style={s.incidentViewRow}>
                  <Text style={s.incidentViewLabel}>Group:</Text>
                  <Text style={s.incidentViewValue}>{monitor.parentName || '—'}</Text>
                </View>

                {(() => {
                  const latestIncident = monitor.recentIncidents?.[0];
                  const hasIncident = !!latestIncident;

                  // Extraction prioritaire de la note depuis lastCrawlReport (Supabase page_checks) ou monitor.msg
                  let causeText = monitor.msg || '';

                  if (monitor.lastCrawlReport) {
                    try {
                      const report = typeof monitor.lastCrawlReport === 'string'
                        ? JSON.parse(monitor.lastCrawlReport)
                        : monitor.lastCrawlReport;
                      if (Array.isArray(report)) {
                        const itemWithNote = report.find((r: any) => r.note && String(r.note).trim() !== '');
                        if (itemWithNote?.note) {
                          causeText = itemWithNote.note;
                        }
                      }
                    } catch (e) {}
                  }

                  if (!causeText && hasIncident) {
                    causeText = latestIncident.title;
                  }

                  if (!causeText) {
                    causeText = 'Aucune erreur détectée';
                  }

                  return (
                    <>
                      <View style={[s.incidentViewRow, { marginTop: 16 }]}>
                        <Text style={s.incidentViewLabel}>Incident signalé:</Text>
                        <Text style={s.incidentViewValue}>
                          {hasIncident ? formatLastChecked(latestIncident.startedAt) : '—'}
                        </Text>
                      </View>
                      
                      <View style={s.incidentViewRow}>
                        <Text style={s.incidentViewLabel}>Durée:</Text>
                        <Text style={s.incidentViewValue}>
                          {hasIncident ? `${formatIncidentDuration(latestIncident.durationMinutes)} (en cours)` : '—'}
                        </Text>
                      </View>

                      <View style={[s.incidentViewRow, { flexDirection: 'column', alignItems: 'flex-start', marginTop: 16 }]}>
                        <Text style={[s.incidentViewLabel, { marginBottom: 8 }]}>Cause:</Text>
                        <View style={s.incidentCauseBox}>
                          <Text style={s.incidentCauseText}>
                            {causeText}
                          </Text>
                        </View>
                      </View>
                    </>
                  );
                })()}

                <View style={[s.incidentDropdownContainer, { flexDirection: 'row', justifyContent: 'flex-end' }]}>
                  <StatusDropdown
                    monitorId={monitor.id}
                    currentStatus={monitor.status}
                    active={monitor.active}
                    onChanged={() => fetchDetail(true)}
                    hasIncident={!!monitor.recentIncidents?.[0]}
                    onResolve={handleResolve}
                    resolving={resolving}
                  />
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Backdrop Overlay ── */}
      {sidebarOpen && (
        <Animated.View style={[s.backdrop, { opacity: fadeAnim }]} pointerEvents="auto">
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={closeSidebar} activeOpacity={1} />
        </Animated.View>
      )}

      {/* ── Sidebar Sheet ── */}
      {sidebarOpen && (
        <Animated.View
          style={[s.sidebar, { width: SIDEBAR_WIDTH, transform: [{ translateX: slideAnim }] }]}
        >
          <View style={s.sidebarHeader}>
            <Text style={s.sidebarTitle}>Infos Monitor</Text>
            <TouchableOpacity onPress={closeSidebar} activeOpacity={0.7} style={s.sidebarCloseBtn}>
              <X size={20} color={C.white} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.sidebarContent} showsVerticalScrollIndicator={false}>
            {monitor && (
              <>
                <SidebarItem label="Nom" value={monitor.name} />
                <SidebarItem label="Type" value={monitor.type} />
                {(monitor.url || monitor.hostname) && (
                  <SidebarItem label="URL / Hôte" value={monitor.url || monitor.hostname || '—'} />
                )}
                {monitor.port != null && (
                  <SidebarItem label="Port" value={String(monitor.port)} />
                )}
                <SidebarItem label="Intervalle" value={`${monitor.interval ?? 60} secondes`} />
                {monitor.retryInterval != null && (
                  <SidebarItem label="Retry Interval" value={`${monitor.retryInterval} secondes`} />
                )}
                {monitor.parentName && (
                  <SidebarItem label="Groupe parent" value={monitor.parentName} />
                )}
                <SidebarItem label="Statut" value={monitor.active ? 'Actif' : 'En pause'} />
                {monitor.sslValidTo || monitor.sslDaysRemaining != null ? (
                  <>
                    {monitor.sslValidTo && (
                      <SidebarItem label="SSL Valide jusqu'à" value={monitor.sslValidTo} />
                    )}
                    {monitor.sslDaysRemaining != null && (
                      <SidebarItem label="Jours SSL restants" value={`${monitor.sslDaysRemaining} jours`} />
                    )}
                    {monitor.sslIssuer && (
                      <SidebarItem label="Émetteur SSL" value={monitor.sslIssuer} />
                    )}
                  </>
                ) : (
                  <SidebarItem label="Certificat SSL" value="Aucun" />
                )}
              </>
            )}
          </ScrollView>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
  },
  headerTitle: {
    color: C.white,
    fontSize: 16,
    fontWeight: '600',
  },
  infoButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 14,
  },
  card: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    padding: 16,
    borderColor: '#334155',
    borderWidth: 1,
  },
  cardTitle: {
    color: C.white,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 16,
  },
  configRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  configRowLast: {
    marginBottom: 0,
  },
  configLabel: {
    color: C.muted,
    fontSize: 13,
    flexShrink: 0,
    marginRight: 8,
  },
  configValue: {
    color: C.white,
    fontSize: 13,
    fontWeight: '400',
    flex: 1,
    textAlign: 'right',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    color: C.muted,
    fontSize: 13,
  },
  errorText: {
    color: C.red,
    fontSize: 13,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: C.card,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  retryBtnText: {
    color: C.white,
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Incident View Styles ──
  incidentViewRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 12,
  },
  incidentViewLabel: {
    color: C.white,
    fontSize: 14,
    fontWeight: '600',
    width: 130,
  },
  incidentViewValue: {
    color: C.white,
    fontSize: 14,
    flex: 1,
  },
  incidentCauseBox: {
    backgroundColor: '#0F171E',
    borderColor: '#1E2C3A',
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    width: '100%',
    minHeight: 80,
  },
  incidentCauseText: {
    color: C.white,
    fontSize: 14,
    lineHeight: 20,
  },
  incidentDropdownContainer: {
    alignItems: 'flex-end',
    marginTop: 20,
    marginBottom: 8,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    gap: 8,
  },
  resolveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    gap: 8,
    backgroundColor: C.green,
  },
  dropdownButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    backgroundColor: C.card,
    borderRadius: 6,
    borderColor: C.cardBorder,
    borderWidth: 1,
    marginTop: 4,
    width: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  dropdownMenuItem: {
    padding: 12,
  },
  dropdownMenuItemText: {
    color: C.white,
    fontSize: 14,
    textAlign: 'center',
  },

  // ── Sidebar ──
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000',
    zIndex: 998,
  },
  sidebar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: '#16212B',
    borderLeftWidth: 1,
    borderLeftColor: C.cardBorder,
    paddingTop: 52,
    zIndex: 999,
    shadowColor: '#000000',
    shadowOpacity: 0.6,
    shadowRadius: 12,
    shadowOffset: { width: -6, height: 0 },
    elevation: 20,
  },
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
    marginBottom: 8,
  },
  sidebarTitle: {
    color: C.white,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sidebarCloseBtn: {
    padding: 4,
    opacity: 0.7,
  },
  sidebarContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 0,
  },
  sidebarItemRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E2C3A',
  },
  sidebarItemLabel: {
    color: C.muted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  sidebarItemValue: {
    color: C.white,
    fontSize: 13,
    fontWeight: '500',
  },
  
  // ── Pages du groupe ──
  childRowContainer: {
    paddingVertical: 2,
  },
  childRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  childRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#1E2C3A',
  },
  childName: {
    color: C.white,
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    paddingRight: 10,
  },
  childStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  childStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  childStatusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  childCauseBox: {
    backgroundColor: '#0F171E',
    borderColor: '#1E2C3A',
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
    marginTop: 2,
    marginBottom: 8,
  },
  childCauseText: {
    color: '#F87171',
    fontSize: 12,
    lineHeight: 16,
  },
});