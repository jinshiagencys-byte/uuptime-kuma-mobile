import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Appbar, Chip, Searchbar, Surface, Text } from 'react-native-paper';
import { Menu, Bell, Plus, Activity, Globe, BarChart3, ArrowUp, ArrowDown } from 'lucide-react-native';
import { getMonitors, subscribeToMonitors, pauseMonitor, resumeMonitor, RelayError, type MonitorItem, type MonitorStatus, type MonitorsStats } from '../api/relayClient';
import {
  formatAvailabilityPercent,
  formatUrlLabel,
  getAverageAvailability,
  getPrimaryUrl,
  getStatusTone,
} from '../utils/monitors';
import type { DetailTabKey } from './MonitorDetailScreen';

const theme = {
  colors: {
    background: '#0F1115',
    surface: '#1A1E27',
    surfaceVariant: '#202833',
    surfaceHigh: '#232B36',
    primary: '#7DD3FC',
    onPrimary: '#082F49',
    onBackground: '#F8FAFC',
    outline: '#384456',
    textMuted: '#A6B0BF',
    chipActiveBg: '#2B3747',
    chipActiveText: '#E2E8F0',
    success: '#A7F3D0',
    warning: '#FCD34D',
    error: '#FCA5A5',
    up: '#A7F3D0',
    down: '#FCA5A5',
    pending: '#FCD34D',
    maintenance: '#93C5FD',
    paused: '#B9C3CF',
  },
};

const STATUS_COLORS: Record<MonitorStatus, string> = {
  up: theme.colors.up,
  down: theme.colors.down,
  pending: theme.colors.pending,
  maintenance: theme.colors.maintenance,
  paused: theme.colors.paused,
};

const STATUS_LABELS: Record<MonitorStatus, string> = {
  up: 'Active',
  down: 'Hors ligne',
  pending: 'En attente',
  maintenance: 'Maint.',
  paused: 'Pause',
};

const FILTERS: { label: string; status: MonitorStatus | 'All' }[] = [
  { label: 'Tous', status: 'All' },
  { label: 'Active', status: 'up' },
  { label: 'Hors ligne', status: 'down' },
  { label: 'Maint.', status: 'maintenance' },
  { label: 'Pause', status: 'paused' },
];

const FALLBACK_POLL_INTERVAL_MS = 60000;

function SiteLogo({
  uri,
  size = 20,
  variant = 'monitor',
}: {
  uri?: string | null;
  size?: number;
  variant?: 'monitor' | 'group';
}) {
  const [failed, setFailed] = useState(false);

  if (!uri || failed) {
    return (
      <View style={[styles.logoFallback, { width: size, height: size, borderRadius: size / 4 }]}>
        {variant === 'group' ? (
          <BarChart3 size={size * 0.62} color={theme.colors.primary} />
        ) : (
          <Globe size={size * 0.62} color={theme.colors.textMuted} />
        )}
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: theme.colors.surfaceVariant }}
      onError={() => setFailed(true)}
    />
  );
}

export default function HomeScreen({
  onNavigateToAdd,
  onSelectMonitor,
}: {
  onNavigateToAdd: () => void;
  /** Ouvre le détail d'un groupe (ou d'un monitor) sur l'onglet demandé. */
  onSelectMonitor: (monitorId: number, initialTab?: DetailTabKey) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<MonitorStatus | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [monitors, setMonitors] = useState<MonitorItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  const isMounted = useRef(true);
  const isLiveRef = useRef(false);

  const applyUpdate = useCallback((data: { stats: MonitorsStats; monitors: MonitorItem[] }) => {
    if (!isMounted.current) return;
    setMonitors(data.monitors);
    setLoadError(null);
  }, []);

  const fetchMonitors = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await getMonitors();
      applyUpdate(data);
    } catch (err) {
      if (!isMounted.current) return;
      setLoadError(err instanceof RelayError ? err.message : 'Erreur pendant le chargement des monitors.');
    } finally {
      if (isMounted.current && isRefresh) setRefreshing(false);
    }
  }, [applyUpdate]);

  useEffect(() => {
    isMounted.current = true;
    fetchMonitors();

    const unsubscribe = subscribeToMonitors(
      (data) => {
        setIsLive(true);
        isLiveRef.current = true;
        applyUpdate(data);
      },
      (message) => {
        setIsLive(false);
        isLiveRef.current = false;
        console.warn('[HomeScreen] temps réel indisponible:', message);
      }
    );

    const interval = setInterval(() => {
      if (!isLiveRef.current) fetchMonitors();
    }, FALLBACK_POLL_INTERVAL_MS);

    return () => {
      isMounted.current = false;
      unsubscribe();
      clearInterval(interval);
    };
  }, [fetchMonitors, applyUpdate]);

  /** Groupes connus, indexés par id : sert à rattacher les sous-moniteurs. */
  const groupsById = useMemo(() => {
    const map = new Map<number, MonitorItem>();
    monitors.forEach((m) => {
      if (m.type === 'group') map.set(m.id, m);
    });
    return map;
  }, [monitors]);

  /**
   * Sous-moniteurs d'un groupe.
   * Un monitor dont le `parent` n'est pas un groupe connu est traité comme
   * autonome (voir `rows`) pour ne jamais disparaître de l'écran d'accueil.
   */
  const childrenByParent = useMemo(() => {
    const map = new Map<number, MonitorItem[]>();
    monitors.forEach((m) => {
      if (m.type === 'group' || m.parent == null || !groupsById.has(m.parent)) return;
      const list = map.get(m.parent);
      if (list) list.push(m);
      else map.set(m.parent, [m]);
    });
    return map;
  }, [monitors, groupsById]);

  /**
   * Lignes de l'accueil : les groupes et les monitors autonomes.
   * Plus de collapse : les sous-moniteurs d'un groupe ne sont plus listés ici
   * mais dans l'onglet « Monitor » du détail du groupe.
   */
  const rows = useMemo(
    () => monitors.filter((m) => m.type === 'group' || m.parent == null || !groupsById.has(m.parent)),
    [monitors, groupsById]
  );

  const matchesStatus = (m: MonitorItem) => activeFilter === 'All' || m.status === activeFilter;

  const matchesQuery = (m: MonitorItem) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return m.name.toLowerCase().includes(query) || (m.url ?? '').toLowerCase().includes(query);
  };

  /**
   * Un groupe reste visible dès qu'un de ses sous-moniteurs correspond au
   * filtre : sinon un groupe contenant un monitor hors ligne disparaîtrait de
   * la vue « Hors ligne » — et comme il n'y a plus de collapse, il serait
   * impossible de retrouver ce monitor.
   */
  const isRowVisible = (row: MonitorItem) => {
    if (matchesStatus(row) && matchesQuery(row)) return true;
    const children = childrenByParent.get(row.id) ?? [];
    return children.some((child) => matchesStatus(child) && matchesQuery(child));
  };

  const visibleRows = useMemo(() => rows.filter(isRowVisible), [rows, activeFilter, searchQuery, childrenByParent]);

  const filterCounts = useMemo<Record<MonitorStatus | 'All', number>>(() => {
    const counts: Record<MonitorStatus | 'All', number> = {
      All: rows.length,
      up: 0,
      down: 0,
      pending: 0,
      maintenance: 0,
      paused: 0,
    };
    const statuses: MonitorStatus[] = ['up', 'down', 'pending', 'maintenance', 'paused'];

    rows.forEach((row) => {
      const children = childrenByParent.get(row.id) ?? [];
      statuses.forEach((status) => {
        if (row.status === status || children.some((child) => child.status === status)) {
          counts[status] += 1;
        }
      });
    });

    return counts;
  }, [rows, childrenByParent]);

  const handleTogglePause = async (monitor: MonitorItem) => {
    try {
      if (monitor.active) {
        await pauseMonitor(monitor.id);
      } else {
        await resumeMonitor(monitor.id);
      }
      fetchMonitors();
    } catch (err) {
      const message = err instanceof RelayError ? err.message : 'Erreur lors du changement de statut.';
      setLoadError(message);
    }
  };

  const renderRow = (row: MonitorItem) => {
    const isGroup = row.type === 'group';
    const children = childrenByParent.get(row.id) ?? [];
    // La valeur affichée est la moyenne de disponibilité des sous-moniteurs
    // du groupe (ou celle du monitor lui-même) : 100% = jamais hors ligne.
    const percent = getAverageAvailability(children, row);
    const tone = getStatusTone(percent, row.status, STATUS_COLORS);
    const isPaused = !row.active || row.status === 'paused';
    // Badge de tendance (maquette Google Finance) : flèche vers le haut quand
    // le service n'est jamais tombé, sinon flèche vers le bas.
    const isTrendUp = tone === STATUS_COLORS.up;
    // Sous-titre : l'URL principale du site, c'est-à-dire la page d'accueil.
    // Pour un groupe on la déduit de ses sous-moniteurs, et on ne montre plus
    // le nombre de sous-moniteurs à cet endroit.
    const subtitle = formatUrlLabel(getPrimaryUrl(row, children)) ?? STATUS_LABELS[row.status];

    return (
      <Surface key={row.id} style={styles.rowCard} elevation={0}>
        <TouchableOpacity
          style={styles.row}
          onPress={() => onSelectMonitor(row.id, isGroup ? 'qa' : 'monitor')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${row.name}, disponibilité ${formatAvailabilityPercent(percent)}`}
        >
          <View style={styles.rowLogo}>
            <SiteLogo uri={row.logoUrl} size={22} variant={isGroup ? 'group' : 'monitor'} />
          </View>

          <View style={styles.rowTexts}>
            <Text style={styles.rowName} numberOfLines={1}>{row.name}</Text>
            <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text>
          </View>

          <View style={styles.rowRight}>
            <Text style={[styles.rowPercent, { color: tone }]}>{formatAvailabilityPercent(percent)}</Text>

            <TouchableOpacity
              style={[styles.trendBadge, { backgroundColor: `${tone}2E` }]}
              onPress={() => handleTogglePause(row)}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={isPaused ? `Reprendre ${row.name}` : `Mettre en pause ${row.name}`}
            >
              {isTrendUp ? (
                <ArrowUp size={14} color={tone} strokeWidth={3} />
              ) : (
                <ArrowDown size={14} color={tone} strokeWidth={3} />
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Surface>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        {/*
          The SafeAreaView above already applies the top inset, and Paper's
          Appbar.Header adds `paddingTop: insets.top` on its own (see
          AppbarHeader.tsx). Passing `statusBarHeight={0}` keeps a single top
          inset instead of stacking several and leaving an empty gap.
        */}
        <Appbar.Header mode="small" statusBarHeight={0} style={styles.appBar}>
          <Appbar.Action icon={() => <Menu size={22} color={theme.colors.onBackground} />} onPress={() => {}} />
          <Appbar.Content title="" />
          <Appbar.Action icon={() => <Bell size={20} color={theme.colors.onBackground} />} onPress={() => {}} />
          <Appbar.Action icon={() => <Plus size={22} color={theme.colors.onBackground} />} onPress={onNavigateToAdd} />
        </Appbar.Header>
      </View>

      <View style={styles.content}>
        <Searchbar
          placeholder="Search monitors..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
          placeholderTextColor={theme.colors.textMuted}
          iconColor={theme.colors.textMuted}
          elevation={0}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContainer}
          style={styles.chipsScroll}
        >
          {FILTERS.map((filter) => {
            const isActive = activeFilter === filter.status;
            const count = filterCounts[filter.status] ?? 0;

            return (
              <Chip
                key={filter.label}
                selected={isActive}
                onPress={() => setActiveFilter(filter.status)}
                showSelectedCheck={isActive}
                style={[styles.filterChip, isActive ? styles.filterChipActive : styles.filterChipInactive]}
                textStyle={[styles.filterChipText, isActive && styles.filterChipTextActive]}
                compact
              >
                {`${filter.label} (${count})`}
              </Chip>
            );
          })}
        </ScrollView>

        {loadError && <Text style={styles.errorBanner}>{loadError}</Text>}

        <ScrollView
          style={styles.listContainer}
          contentContainerStyle={visibleRows.length === 0 ? styles.listContentEmpty : styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchMonitors(true)}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
        >
          {visibleRows.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Activity size={44} color={theme.colors.textMuted} strokeWidth={1.6} />
              <Text style={styles.emptyStateText}>
                {monitors.length === 0 ? 'No monitors yet' : 'No monitors match this filter'}
              </Text>
            </View>
          ) : (
            <View style={styles.listStack}>{visibleRows.map((row) => renderRow(row))}</View>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    backgroundColor: theme.colors.background,
  },
  appBar: {
    backgroundColor: 'rgba(0, 0, 0, 0)',
    elevation: 0,
    shadowOpacity: 0,
    borderBottomWidth: 0,
  },
  content: {
    flex: 1,
    paddingHorizontal: 14,
  },
  searchBar: {
    backgroundColor: '#1D2430',
    borderRadius: 16,
    height: 52,
    marginTop: 6,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#303B4A',
  },
  searchInput: {
    color: theme.colors.onBackground,
    fontSize: 14,
    includeFontPadding: false,
  },
  chipsScroll: {
    // A horizontal ScrollView inherits `flexGrow: 1` from React Native's own
    // base style (Libraries/Components/ScrollView/ScrollView.js), so inside a
    // flex column it stretches vertically and swallows half of the free
    // space: that leaves a wide empty band under the chips and makes any
    // horizontal swipe over that band scroll the filters. Pinning it to its
    // content height gives all the remaining space back to the list.
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 10,
  },
  chipsContainer: {
    paddingRight: 8,
    gap: 8,
  },
  filterChip: {
    borderRadius: 12,
    height: 36,
    justifyContent: 'center',
    borderWidth: 1,
  },
  filterChipActive: {
    backgroundColor: theme.colors.chipActiveBg,
    borderColor: 'rgba(0, 0, 0, 0)',
  },
  filterChipInactive: {
    backgroundColor: 'rgba(0, 0, 0, 0)',
    borderColor: '#384456',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  filterChipTextActive: {
    color: theme.colors.chipActiveText,
  },
  errorBanner: {
    color: '#FCA5A5',
    fontSize: 12,
    paddingHorizontal: 6,
    paddingBottom: 8,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingTop: 6,
    paddingBottom: 20,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  listStack: {
    gap: 10,
  },
  // ── Ligne « maquette » : logo, nom + url, disponibilité + badge de tendance ──
  rowCard: {
    backgroundColor: '#171C24',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A3543',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  rowLogo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#26303D',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#101923',
    overflow: 'hidden',
  },
  logoFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#101923',
  },
  rowTexts: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    color: theme.colors.onBackground,
    fontSize: 15,
    fontWeight: '700',
  },
  rowSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowPercent: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  trendBadge: {
    width: 34,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 50,
  },
  emptyStateText: {
    marginTop: 10,
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
});