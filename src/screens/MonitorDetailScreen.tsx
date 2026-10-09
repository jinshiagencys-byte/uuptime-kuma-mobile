import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  useWindowDimensions,
  Animated,
  StatusBar,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  MoreHorizontal,
  X,
  CheckCircle2,
  Clock,
  Layers,
  ArrowUp,
  ArrowDown,
  ClipboardCheck,
  Activity,
} from 'lucide-react-native';
import {
  getMonitorDetail,
  getMonitors,
  RelayError,
  type MonitorDetail,
  type HeartbeatPoint,
  type MonitorItem,
  type MonitorStatus,
} from '../api/relayClient';
import {
  formatAvailabilityPercent,
  getAverageAvailability,
  getAvailabilityPercent,
  getStatusTone,
  getSubPageLabels,
} from '../utils/monitors';
import QaReportPanel from '../components/QaReportPanel';

// ─── Theme Colors ────────────────────────────────────────────────────────────
const C = {
  bg: '#0F1115',
  card: '#1A1E27',
  cardBorder: '#384456',
  textDark: '#F8FAFC',
  muted: '#A6B0BF',
  mutedLight: '#B7C2CF',
  primary: '#7DD3FC',
  green: '#A7F3D0',
  red: '#FCA5A5',
  yellow: '#FCD34D',
  slate: '#B9C3CF',
};

const STATUS_COLOR: Record<MonitorStatus, string> = {
  up: C.green,
  down: C.red,
  pending: C.yellow,
  maintenance: C.primary,
  paused: C.slate,
};

function formatStatusCode(monitor: MonitorDetail): string {
  if (monitor.msg) return monitor.msg;
  if (monitor.status === 'up') return '200 OK';
  if (monitor.status === 'down') return 'Down';
  return '—';
}

function formatLastChecked(lastCheckedAt: string | null): string {
  if (!lastCheckedAt) return '—';
  try {
    const date = new Date(lastCheckedAt);
    if (isNaN(date.getTime())) return lastCheckedAt;
    return date.toLocaleString('fr-FR', {
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

function formatSSLExpiry(validTo: string | null): string {
  if (!validTo) return 'Non disponible';
  try {
    const date = new Date(validTo);
    if (isNaN(date.getTime())) return validTo;
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return validTo;
  }
}

function formatResponseTimeShort(avgPing: number | null): string {
  if (avgPing == null) return '—';
  if (avgPing >= 1000) return `${(avgPing / 1000).toFixed(2)} s`;
  return `${avgPing.toFixed(2)} ms`;
}

// ─── Timeline Heartbeats Component ───────────────────────────────────────────
const HeartbeatTimeline = memo<{ history: HeartbeatPoint[] }>(({ history }) => {
  const TOTAL = 24;
  const recent = history && history.length > 0 ? history.slice(-TOTAL) : [];
  const blocks: (HeartbeatPoint | null)[] = Array(TOTAL).fill(null);

  for (let i = 0; i < recent.length; i++) {
    const src = recent[recent.length - 1 - i];
    blocks[TOTAL - 1 - i] = src;
  }

  return (
    <View style={s.heartbeatWrapper}>
      <View style={s.heartbeatContainer}>
        {blocks.map((h, index) => {
          const status = h ? (h.status as MonitorStatus) : null;
          const bg = status ? (STATUS_COLOR[status] || C.red) : C.cardBorder;
          return <View key={index} style={[s.heartbeatBar, { backgroundColor: bg }]} />;
        })}
      </View>
      <View style={s.heartbeatLegend}>
        <Text style={s.heartbeatLegendText}>Il y a 24 checks</Text>
        <Text style={s.heartbeatLegendText}>Maintenant</Text>
      </View>
    </View>
  );
});

// ─── Config Row ───────────────────────────────────────────────────────────────
const ConfigRow: React.FC<{ label: string; value: string; last?: boolean }> = ({
  label,
  value,
  last,
}) => (
  <View style={[s.configRow, !last && s.configRowBorder]}>
    <Text style={s.configLabel}>{label}</Text>
    <Text style={s.configValue} numberOfLines={1} ellipsizeMode="tail">{value}</Text>
  </View>
);

// ─── Progress Row (Barres Statistiques) ──────────────────────────────────────
const ProgressRow: React.FC<{
  label: string;
  percent: number;
  leftText: string;
  rightText: string;
  percentDisplay?: string;
  barColor?: string;
}> = ({ label, percent, leftText, rightText, percentDisplay, barColor = C.primary }) => {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View style={s.progressRow}>
      <View style={s.progressHeaderRow}>
        <Text style={s.progressLabel}>{label}</Text>
        <Text style={[s.progressPercent, { color: barColor }]}>
          {percentDisplay || `${Math.round(clamped)}%`}
        </Text>
      </View>
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${clamped}%`, backgroundColor: barColor }]} />
      </View>
      <View style={s.progressFooterRow}>
        <Text style={s.progressFooterText}>{leftText}</Text>
        <Text style={s.progressFooterText}>{rightText}</Text>
      </View>
    </View>
  );
};

// ─── Sidebar Item ─────────────────────────────────────────────────────────────
const SidebarItem = ({ label, value }: { label: string; value: string }) => (
  <View style={s.sidebarItemRow}>
    <Text style={s.sidebarItemLabel}>{label}</Text>
    <Text style={s.sidebarItemValue}>{value}</Text>
  </View>
);

/** Onglets de l'écran de détail (exporté pour la navigation depuis l'accueil). */
export type DetailTabKey = 'incident' | 'session' | 'monitor' | 'stats' | 'qa';

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function MonitorDetailScreen({
  monitorId,
  initialTab = 'incident',
  onBack,
}: {
  monitorId: number | string;
  /** Onglet initial demandé par l'écran appelant. */
  initialTab?: DetailTabKey;
  onBack: () => void;
}) {
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const SIDEBAR_WIDTH = Math.min(width * 0.82, 480);

  const [monitor, setMonitor] = useState<MonitorDetail | null>(null);
  const [history, setHistory] = useState<HeartbeatPoint[]>([]);
  const [groupChildren, setGroupChildren] = useState<MonitorItem[]>([]);
  const [childrenLoading, setChildrenLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTabKey>(initialTab);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isGroup = monitor?.type === 'group';

  const isMounted = useRef(true);
  const slideAnim = useRef(new Animated.Value(SIDEBAR_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const openSidebar = () => {
    setSidebarOpen(true);
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0.4,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeSidebar = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: SIDEBAR_WIDTH,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
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
        const data = await getMonitorDetail(monitorId);
        if (!isMounted.current) return;
        setMonitor(data.monitor);
        setActiveTab(
          data.monitor.type === 'group'
            ? 'qa'
            : initialTab === 'qa'
              ? 'monitor'
              : initialTab
        );
        setHistory(data.history);
        setError(null);

        if (data.monitor.type === 'group') {
          // Le relay n'expose pas de route dédiée aux sous-moniteurs d'un
          // groupe : on réutilise la liste complète des monitors et on garde
          // ceux dont `parent` pointe vers ce groupe.
          setChildrenLoading(true);
          try {
            const { monitors } = await getMonitors();
            if (!isMounted.current) return;
            setGroupChildren(monitors.filter((item) => item.parent === data.monitor.id));
          } catch (childrenError) {
            if (!isMounted.current) return;
            setGroupChildren([]);
            console.warn('[MonitorDetailScreen] sous-moniteurs indisponibles:', childrenError);
          } finally {
            if (isMounted.current) setChildrenLoading(false);
          }
        } else {
          setGroupChildren([]);
        }
      } catch (err) {
        if (!isMounted.current) return;
        setError(err instanceof RelayError ? err.message : 'Erreur lors du chargement.');
      } finally {
        if (!isMounted.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [monitorId, initialTab]
  );

  useEffect(() => {
    isMounted.current = true;
    fetchDetail();
    return () => {
      isMounted.current = false;
    };
  }, [fetchDetail]);

  const tabs: { id: DetailTabKey; label: string; icon?: typeof Activity }[] = isGroup
    ? [{ id: 'qa', label: 'Test lancé', icon: Activity }]
    : [
        { id: 'incident', label: 'Incident' },
        { id: 'session', label: 'Sessions' },
        { id: 'monitor', label: 'Monitoring' },
        { id: 'stats', label: 'Statistiques' },
      ];

  const responseTimeScaleMs = 3500;
  const responseTimeMs = monitor?.loadTimeMs ?? null;
  const pingPercent = responseTimeMs
    ? Math.min(100, Math.max(5, (responseTimeMs / responseTimeScaleMs) * 100))
    : 0;
  const groupAvailability = getAverageAvailability(groupChildren, monitor);
  const uptimePercent = isGroup
    ? groupAvailability
    : monitor
      ? getAvailabilityPercent(monitor)
      : 0;
  const statusLabel: Record<MonitorStatus, string> = {
    up: 'Opérationnel',
    down: 'Incident détecté',
    pending: 'En attente de contrôle',
    maintenance: 'En maintenance',
    paused: 'En pause',
  };

  /**
   * Carte d'une sous-page d'un groupe.
   * Le nom du monitor revient avec le domaine du site à côté
   * (« Tarifs » + « markhorus.com »), et la ligne du dessous ne montre que la
   * partie après le « .com » (« /tarifs », sans https://).
   * L'indicateur de tendance reste à droite : pas de logo, pas de pourcentage
   * et aucune navigation au toucher.
   */
  const renderChildRow = (child: MonitorItem) => {
    const percent = getAvailabilityPercent(child);
    const tone = getStatusTone(percent, child.status, STATUS_COLOR);

    const { title, site, path } = getSubPageLabels(child);

    return (
      <View
        key={child.id}
        style={s.childRow}
        accessible
        accessibilityLabel={`${child.name}, disponibilité ${formatAvailabilityPercent(percent)}`}
      >
        <View style={s.childTexts}>
          <View style={s.childTitleRow}>
            <Text style={s.childName} numberOfLines={1}>{title}</Text>
            {site && <Text style={s.childSite} numberOfLines={1}>{site}</Text>}
          </View>

          {path && <Text style={s.childPath} numberOfLines={1}>{path}</Text>}
        </View>

        <View style={[s.childTrendBadge, { backgroundColor: `${tone}22` }]}>
          {tone === STATUS_COLOR.up ? (
            <ArrowUp size={14} color={tone} strokeWidth={3} />
          ) : (
            <ArrowDown size={14} color={tone} strokeWidth={3} />
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      {/* ── Top Navigation Bar ── */}
      <View style={s.headerRow}>
        <TouchableOpacity
          style={s.headerBtn}
          onPress={onBack}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <ChevronLeft size={26} color={C.textDark} strokeWidth={2.5} />
        </TouchableOpacity>

        <View style={s.headerTitleGroup}>
          {monitor?.logoUrl ? (
            <Image source={{ uri: monitor.logoUrl }} style={s.headerLogo} />
          ) : (
            <View style={s.headerLogoFallback}>
              <Layers size={17} color={C.primary} />
            </View>
          )}
          <View style={s.headerTitleTextGroup}>
            <Text style={s.headerTitle} numberOfLines={1}>{monitor?.name ?? 'Détails du monitor'}</Text>
            {!!(monitor?.url || monitor?.hostname) && (
              <Text style={s.headerSubtitle} numberOfLines={1}>{monitor.url || monitor.hostname}</Text>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={s.headerBtn}
          onPress={openSidebar}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir les informations avancées"
        >
          <MoreHorizontal size={24} color={C.textDark} />
        </TouchableOpacity>
      </View>

      <View style={[s.detailBody, isWide && s.detailBodyWide]}>
        {isWide ? (
          <View style={[s.tabBarContainer, s.tabBarContainerWide]}>
            <Text style={s.navSectionLabel}>MONITOR</Text>
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[s.tabItem, s.tabItemVertical, isActive && s.tabItemVerticalActive]}
                  onPress={() => setActiveTab(tab.id)}
                  activeOpacity={0.7}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isActive }}
                >
                  {Icon && <Icon size={18} color={isActive ? C.primary : C.muted} strokeWidth={2} />}
                  <Text style={[s.tabText, s.tabTextVertical, isActive && s.tabTextActive]}>
                    {tab.label}
                  </Text>
                  {isActive && <View style={s.activeIndicatorVertical} />}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={s.tabBarContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.tabScrollContent}
            >
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    style={s.tabItem}
                    onPress={() => setActiveTab(tab.id)}
                    activeOpacity={0.7}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text style={[s.tabText, isActive && s.tabTextActive]}>{tab.label}</Text>
                    {isActive && <View style={s.activeIndicator} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Screen Body Content ── */}
        <ScrollView
          style={isWide ? s.detailContentWide : undefined}
          contentContainerStyle={[s.scrollContent, isWide && s.scrollContentWide]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchDetail(true)}
              tintColor={C.primary}
              colors={[C.primary]}
            />
          }
        >
        {loading && !monitor && (
          <View style={s.centered}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={s.emptyText}>Chargement des données...</Text>
          </View>
        )}

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
            {!isGroup && (
              <View style={s.detailHero}>
                <View style={s.heroTopRow}>
                  <View style={s.heroTitleGroup}>
                    <View style={[s.statusIndicator, { backgroundColor: STATUS_COLOR[monitor.status] }]} />
                    <View style={s.heroTitleText}>
                      <Text style={s.heroEyebrow}>MONITOR HTTP</Text>
                      <Text style={s.heroStatus}>{statusLabel[monitor.status]}</Text>
                    </View>
                  </View>
                  <View style={[s.liveBadge, { borderColor: `${STATUS_COLOR[monitor.status]}55` }]}>
                    <Text style={[s.liveBadgeText, { color: STATUS_COLOR[monitor.status] }]}>
                      {monitor.active ? 'ACTIF' : 'EN PAUSE'}
                    </Text>
                  </View>
                </View>
                <View style={s.heroMetrics}>
                  <View style={s.heroMetric}>
                    <Text style={s.heroMetricLabel}>Disponibilité</Text>
                    <Text style={[s.heroMetricValue, { color: getStatusTone(groupAvailability, monitor.status, STATUS_COLOR) }]}>
                      {formatAvailabilityPercent(getAvailabilityPercent(monitor))}
                    </Text>
                    <Text style={s.heroMetricHint}>sur les dernières 24 h</Text>
                  </View>
                  <View style={s.heroMetricDivider} />
                  <View style={s.heroMetric}>
                    <Text style={s.heroMetricLabel}>Temps de réponse</Text>
                    <Text style={s.heroMetricValue}>{formatResponseTimeShort(responseTimeMs)}</Text>
                    <Text style={s.heroMetricHint}>{formatLastChecked(monitor.metricsCheckedAt || monitor.lastCheckedAt)}</Text>
                  </View>
                  <View style={s.heroMetricDivider} />
                  <View style={s.heroMetric}>
                    <Text style={s.heroMetricLabel}>Dernier code HTTP</Text>
                    <Text style={s.heroMetricValue}>{monitor.lastHttpCode ?? '—'}</Text>
                    <Text style={s.heroMetricHint}>{formatLastChecked(monitor.lastCheckedAt)}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* ── Tab: Incident ── */}
            {activeTab === 'incident' && (
              <>
                {(monitor.url || monitor.hostname) && (
                  <View style={s.card}>
                    <Text style={s.cardTitle}>État du service</Text>
                    <ConfigRow label="URL" value={monitor.url || monitor.hostname || '—'} />
                    <ConfigRow label="Code HTTP" value={formatStatusCode(monitor)} />
                    <ConfigRow label="Dernier contrôle" value={formatLastChecked(monitor.lastCheckedAt)} last />
                  </View>
                )}

                <View style={s.card}>
                  <View style={s.sectionHeader}>
                    <View>
                      <Text style={s.cardTitle}>Incidents récents</Text>
                      <Text style={s.sectionSubtitle}>Historique des interruptions détectées</Text>
                    </View>
                    <View style={s.countBadge}><Text style={s.countBadgeText}>{monitor.recentIncidents.length}</Text></View>
                  </View>
                  {monitor.recentIncidents.length === 0 ? (
                    <View style={s.emptyStateBox}>
                      <CheckCircle2 size={34} color={C.green} />
                      <Text style={s.emptyStateTitle}>Aucun incident récent</Text>
                      <Text style={s.emptyStateSub}>Aucune interruption n’a été enregistrée dans l’historique disponible.</Text>
                    </View>
                  ) : (
                    <View style={s.incidentsList}>
                      {monitor.recentIncidents.map((incident, index) => (
                        <View key={`${incident.startedAt}-${index}`} style={s.incidentRow}>
                          <View style={s.incidentIcon}><X size={15} color={C.red} /></View>
                          <View style={s.incidentContent}>
                            <Text style={s.incidentTitle}>{incident.title}</Text>
                            <Text style={s.incidentMeta}>{formatLastChecked(incident.startedAt)} · {incident.durationMinutes} min</Text>
                          </View>
                          {incident.httpCode != null && (
                            <View style={s.httpCodeBadge}><Text style={s.httpCodeText}>{incident.httpCode}</Text></View>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </>
            )}

            {/* ── Tab: Record session ── */}
            {activeTab === 'session' && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Enregistrement de session</Text>
                <View style={s.emptyStateBox}>
                  <Clock size={36} color={C.mutedLight} />
                  <Text style={s.emptyStateTitle}>Aucune session enregistrée</Text>
                  <Text style={s.emptyStateSub}>
                    Les enregistrements d'exécution s'afficheront ici.
                  </Text>
                </View>
              </View>
            )}

            {/* ── Tab: Monitor ── */}
            {activeTab === 'monitor' && (
              <>
                {isGroup && (
                  <View style={s.card}>
                    <Text style={s.cardTitle}>{`Sous-moniteurs (${groupChildren.length})`}</Text>

                    {childrenLoading ? (
                      <ActivityIndicator color={C.primary} />
                    ) : groupChildren.length === 0 ? (
                      <View style={s.emptyStateBox}>
                        <Layers size={36} color={C.mutedLight} />
                        <Text style={s.emptyStateTitle}>Aucun sous-moniteur</Text>
                        <Text style={s.emptyStateSub}>
                          Ce groupe ne contient encore aucun monitor.
                        </Text>
                      </View>
                    ) : (
                      <View style={s.childrenList}>
                        {groupChildren.map((child) => renderChildRow(child))}
                      </View>
                    )}
                  </View>
                )}

                <View style={[s.monitorCards, isWide && s.monitorCardsWide]}>
                  <View style={[s.card, s.monitorInfoCard, isWide && s.monitorCardWide]}>
                    <Text style={s.cardTitle}>Configuration</Text>
                    <ConfigRow label="Client" value={monitor.clientName || '—'} />
                    <ConfigRow label="Groupe" value={monitor.parentName || monitor.name} />
                    <ConfigRow label="URL surveillée" value={monitor.url || monitor.hostname || '—'} />
                    <ConfigRow label="Responsable" value={monitor.assignee || '—'} />
                    <ConfigRow label="Fréquence de contrôle" value={monitor.interval != null ? `${monitor.interval / 60} min` : '—'} />
                    <ConfigRow label="Dernier contrôle" value={formatLastChecked(monitor.lastCheckedAt)} last={!monitor.sslValidTo} />
                    {monitor.sslValidTo && <ConfigRow label="Expiration SSL" value={formatSSLExpiry(monitor.sslValidTo)} last />}
                  </View>

                  <View style={[s.card, s.heartbeatCard, isWide && s.monitorCardWide]}>
                    <View style={s.sectionHeader}>
                      <View>
                        <Text style={s.cardTitle}>Historique des contrôles</Text>
                        <Text style={s.sectionSubtitle}>{history.length} contrôles récents</Text>
                      </View>
                      <Clock size={18} color={C.primary} />
                    </View>
                    <HeartbeatTimeline history={history} />
                  </View>
                </View>
              </>
            )}

            {/* ── Tab: Statistique ── */}
            {activeTab === 'stats' && (
              <View style={s.card}>
                <Text style={s.cardTitle}>Statistiques</Text>
                <ProgressRow
                  label="Disponibilité moyenne :"
                  percent={uptimePercent}
                  leftText="0%"
                  rightText="100%"
                  percentDisplay={`${Math.round(uptimePercent)}%`}
                  barColor={C.green}
                />
                <ProgressRow
                  label="Temps de réponse :"
                  percent={pingPercent}
                  leftText={formatResponseTimeShort(monitor.loadTimeMs)}
                  rightText="Échelle max : 3,5 s"
                  percentDisplay={`${Math.round(pingPercent)}%`}
                  barColor={C.primary}
                />
              </View>
            )}

            {activeTab === 'qa' && isGroup && (
              <QaReportPanel report={monitor.qaReport} />
            )}
          </>
        )}
        </ScrollView>
      </View>

      {/* ── Backdrop Overlay ── */}
      {sidebarOpen && (
        <Animated.View style={[s.backdrop, { opacity: fadeAnim }]} pointerEvents="auto">
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={closeSidebar}
            activeOpacity={1}
          />
        </Animated.View>
      )}

      {/* ── Sidebar Drawer ── */}
      {sidebarOpen && (
        <Animated.View
          style={[s.sidebar, { width: SIDEBAR_WIDTH, transform: [{ translateX: slideAnim }] }]}
        >
          <View style={s.sidebarHeader}>
            <Text style={s.sidebarTitle}>Informations avancées</Text>
            <TouchableOpacity
              onPress={closeSidebar}
              activeOpacity={0.7}
              style={s.sidebarCloseBtn}
              accessibilityRole="button"
              accessibilityLabel="Fermer le panneau latéral"
            >
              <X size={22} color={C.textDark} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.sidebarContent} showsVerticalScrollIndicator={false}>
            {monitor && (
              <>
                <SidebarItem label="Nom" value={monitor.name} />
                <SidebarItem label="Type de monitor" value={monitor.type} />
                {(monitor.url || monitor.hostname) && (
                  <SidebarItem label="URL / Hôte" value={monitor.url || monitor.hostname || '—'} />
                )}
                {monitor.port != null && <SidebarItem label="Port" value={String(monitor.port)} />}
                <SidebarItem label="Intervalle" value={`${monitor.interval ?? 60} secondes`} />
                {monitor.retryInterval != null && (
                  <SidebarItem label="Intervalle de réessai" value={`${monitor.retryInterval} secondes`} />
                )}
                {monitor.parentName && <SidebarItem label="Groupe parent" value={monitor.parentName} />}
                <SidebarItem label="État" value={monitor.active ? 'Actif' : 'Inactif / Pausé'} />
                {monitor.sslValidTo ? (
                  <>
                    <SidebarItem label="SSL valide jusqu'au" value={monitor.sslValidTo} />
                    <SidebarItem label="Jours SSL restants" value={`${monitor.sslDaysRemaining ?? 0} jours`} />
                    {monitor.sslIssuer && <SidebarItem label="Émetteur SSL" value={monitor.sslIssuer} />}
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

  // ── Top Navigation Bar ─
  headerRow: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    backgroundColor: C.bg,
  },
  headerBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: C.textDark,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // ── Horizontal Tab Bar (fidèle à la maquette) ──
  tabBarContainer: {
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
  },
  tabBarContainerWide: {
    width: 224,
    borderBottomWidth: 0,
    borderRightWidth: 1,
    borderRightColor: C.cardBorder,
    paddingTop: 10,
    paddingBottom: 16,
  },
  detailBody: { flex: 1, minHeight: 0 },
  detailBodyWide: { flexDirection: 'row' },
  detailContentWide: { flex: 1, minWidth: 0 },
  navSectionLabel: {
    color: C.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 10,
  },
  tabScrollContent: {
    paddingHorizontal: 20,
    gap: 24,
    paddingVertical: 4,
  },
  tabItem: {
    paddingVertical: 14,
    alignItems: 'center',
    position: 'relative',
    minWidth: 60,
  },
  tabItemVertical: {
    minHeight: 48,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 12,
    marginHorizontal: 8,
    marginVertical: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  tabItemVerticalActive: { backgroundColor: C.card },
  tabTextVertical: { flex: 1, textAlign: 'left' },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: C.textDark,
  },
  tabTextActive: {
    color: C.primary,
    fontWeight: '700',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: C.primary,
    borderRadius: 2,
  },
  activeIndicatorVertical: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 3,
    backgroundColor: C.primary,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },

  // ── Scroll Content ──
  scrollContent: {
    padding: 16,
    gap: 16,
    width: '100%',
    alignSelf: 'center',
  },
  scrollContentWide: {
    maxWidth: 1160,
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 32,
    gap: 18,
  },
  detailHero: {
    gap: 18,
    padding: 20,
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  heroTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusIndicator: { width: 11, height: 11, borderRadius: 6 },
  heroTitleText: { gap: 3 },
  heroEyebrow: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  heroStatus: { color: C.textDark, fontSize: 18, fontWeight: '700' },
  liveBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: C.bg,
  },
  liveBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  heroMetrics: { flexDirection: 'row', alignItems: 'stretch', gap: 16 },
  heroMetric: { flex: 1, gap: 5, minWidth: 0 },
  heroMetricLabel: { color: C.muted, fontSize: 11, fontWeight: '600' },
  heroMetricValue: { color: C.textDark, fontSize: 21, fontWeight: '800' },
  heroMetricHint: { color: C.mutedLight, fontSize: 10, lineHeight: 15 },
  heroMetricDivider: { width: 1, backgroundColor: C.cardBorder },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  sectionSubtitle: { color: C.muted, fontSize: 11, marginTop: -8, marginBottom: 12 },
  countBadge: {
    minWidth: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  countBadgeText: { color: C.textDark, fontSize: 12, fontWeight: '700' },
  incidentsList: { gap: 2 },
  incidentRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
  },
  incidentIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: `${C.red}18`,
  },
  incidentContent: { flex: 1, gap: 4 },
  incidentTitle: { color: C.textDark, fontSize: 13, fontWeight: '700' },
  incidentMeta: { color: C.muted, fontSize: 11 },
  httpCodeBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, backgroundColor: C.bg },
  httpCodeText: { color: C.red, fontSize: 11, fontWeight: '700' },
  monitorCards: { gap: 14 },
  monitorCardsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  monitorCardWide: { flex: 1, minWidth: 0 },
  heartbeatCard: { minHeight: 190 },
  headerTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
  },
  headerLogo: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.card },
  headerLogoFallback: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  headerTitleTextGroup: { flex: 1, gap: 2 },
  headerSubtitle: { color: C.muted, fontSize: 11 },

  // ── Cards ──
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: C.cardBorder,
  },
  cardTitle: {
    color: C.textDark,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
  },

  // ── Config Rows ─
  configRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
  },
  configRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
  },
  configLabel: {
    color: C.muted,
    fontSize: 14,
  },
  configValue: {
    color: C.textDark,
    fontSize: 14,
    fontWeight: '500',
    maxWidth: '65%',
    textAlign: 'right',
  },

  // ── Sous-pages d'un groupe (onglet Monitor) ──
  childrenList: {
    gap: 8,
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.cardBorder,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  childTexts: {
    flex: 1,
    gap: 2,
  },
  childTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  childName: {
    flexShrink: 1,
    color: C.textDark,
    fontSize: 14,
    fontWeight: '600',
  },
  childSite: {
    color: C.muted,
    fontSize: 12,
  },
  childPath: {
    color: C.muted,
    fontSize: 12,
  },
  childTrendBadge: {
    width: 34,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },


  // ── Heartbeats Bar Visual ─
  heartbeatWrapper: {
    marginTop: 4,
  },
  heartbeatContainer: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    height: 28,
  },
  heartbeatBar: {
    flex: 1,
    height: '100%',
    borderRadius: 3,
  },
  heartbeatLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  heartbeatLegendText: {
    fontSize: 11,
    color: C.mutedLight,
  },

  // ── Progress Rows (Stats) ──
  progressRow: {
    marginBottom: 16,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    color: C.textDark,
    fontSize: 14,
    fontWeight: '500',
  },
  progressPercent: {
    fontSize: 14,
    fontWeight: '700',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#202833',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  progressFooterText: {
    color: C.muted,
    fontSize: 12,
  },

  // ── Empty States ──
  emptyStateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyStateTitle: {
    color: C.textDark,
    fontSize: 15,
    fontWeight: '600',
  },
  emptyStateSub: {
    color: C.muted,
    fontSize: 13,
    textAlign: 'center',
  },

  // ── Centered Loaders & Errors ─
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    color: C.muted,
    fontSize: 14,
  },
  errorText: {
    color: C.red,
    fontSize: 14,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: C.primary,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  retryBtnText: {
    color: '#082F49',
    fontWeight: '600',
  },

  // ── Sidebar Drawer ──
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
    backgroundColor: C.bg,
    borderLeftWidth: 1,
    borderLeftColor: C.cardBorder,
    paddingTop: 48,
    zIndex: 999,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  sidebarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
  },
  sidebarTitle: {
    color: C.textDark,
    fontSize: 16,
    fontWeight: '700',
  },
  sidebarCloseBtn: {
    padding: 4,
  },
  sidebarContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  sidebarItemRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.cardBorder,
  },
  sidebarItemLabel: {
    color: C.muted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sidebarItemValue: {
    color: C.textDark,
    fontSize: 14,
    fontWeight: '500',
  },
});