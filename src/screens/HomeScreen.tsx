import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Image,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Appbar, Text } from 'react-native-paper';
import { Swipeable } from 'react-native-gesture-handler';
import { Menu, Search, Activity, Check, Plus, ChevronRight, ChevronDown, ChevronUp, ArrowUp, ArrowDown, Globe, Pause, Play, Trash2 } from 'lucide-react-native';
import { toastiva } from 'toastiva';
import {
  getMonitors,
  subscribeToMonitors,
  pauseSite,
  resumeSite,
  deleteSite,
  pausePage,
  resumePage,
  deletePage,
  RelayError,
  type MonitorItem,
  type MonitorStatus,
  type MonitorsStats,
} from '../api/relayClient';

const theme = {
  colors: {
    background: '#0F1216',
    surface: '#161B22',
    surfaceChild: '#1C2128',
    primary: '#4ADE80',
    onPrimary: '#00391A',
    onBackground: '#FFFFFF',
    outline: '#334155',
    textMuted: '#94A3B8',
    chipActiveBg: '#3B3549',
    chipActiveText: '#E2E8F0',
    up: '#4ADE80',
    down: '#F87171',
    pending: '#FBBF24',
    maintenance: '#60A5FA',
    paused: '#94A3B8',
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
  up: 'Online',
  down: 'Offline',
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

function cleanUrl(rawUrl?: string | null): string {
  if (!rawUrl) return '—';
  return rawUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '');
}

// --- Logo avec fallback propre ---
function SiteLogo({ uri, size = 26 }: { uri?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);

  if (!uri || failed) {
    return (
      <View style={[styles.logoFallback, { width: size, height: size, borderRadius: size / 4 }]}>
        <Globe size={size * 0.65} color={theme.colors.textMuted} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 4, backgroundColor: 'transparent' }}
      onError={() => setFailed(true)}
    />
  );
}

// --- Actions de swipe façon Mail : Pause/Reprise + Suppression -------------
// Rendu générique réutilisé pour les lignes "site" (parent) et "page"
// (enfant) — seul ce qui se passe au tap change (voir onPause/onDelete).
function SwipeActions({
  isPaused,
  onPause,
  onDelete,
}: {
  isPaused: boolean;
  onPause: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.swipeActionsContainer}>
      <TouchableOpacity
        style={[styles.swipeActionBtn, styles.swipeActionPause]}
        onPress={onPause}
        activeOpacity={0.8}
      >
        {isPaused ? <Play size={20} color="#FFFFFF" /> : <Pause size={20} color="#FFFFFF" />}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeActionBtn, styles.swipeActionDelete]}
        onPress={onDelete}
        activeOpacity={0.8}
      >
        <Trash2 size={20} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

export default function HomeScreen({
  onNavigateToAdd,
  onSelectMonitor,
}: {
  onNavigateToAdd: () => void;
  onSelectMonitor: (monitorId: number) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<MonitorStatus | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [monitors, setMonitors] = useState<MonitorItem[]>([]);
  const [stats, setStats] = useState({ up: 0, down: 0, pending: 0, maintenance: 0, paused: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  const isLiveRef = useRef(false);
  const insets = useSafeAreaInsets();
  const isMounted = useRef(true);

  // Stocke les anciens statuts des monitors pour détecter les passages en Down / Up
  const prevStatusesRef = useRef<Map<number, MonitorStatus>>(new Map());

  // Réfs vers les Swipeable ouverts, pour pouvoir les refermer après action
  const swipeableRefs = useRef<Map<string, Swipeable | null>>(new Map());

  const applyUpdate = useCallback((data: { stats: MonitorsStats; monitors: MonitorItem[] }) => {
    if (!isMounted.current) return;

    // Détection des alertes Down / Up
    data.monitors.forEach((m) => {
      const prevStatus = prevStatusesRef.current.get(m.id);
      const name = cleanUrl(m.url || m.name);
      if (m.status === 'down' && prevStatus && prevStatus !== 'down') {
        toastiva.error(`Alerte : ${name} est HORS LIGNE`, {
          description: m.msg || 'Le serveur ne répond pas.',
          duration: 5000,
        });
      } else if (m.status === 'up' && prevStatus === 'down') {
        toastiva.success(`Rétablissement : ${name} est DE NOUVEAU EN LIGNE`, {
          description: 'Le serveur répond de nouveau normalement.',
          duration: 5000,
        });
      }
      prevStatusesRef.current.set(m.id, m.status);
    });

    setMonitors(data.monitors);
    setStats(data.stats);
    setLastUpdated(new Date());
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
        isLiveRef.current = true;
        applyUpdate(data);
      },
      (message) => {
        isLiveRef.current = false;
        // Silencieux : repli normal sur le polling HTTP
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

  const filteredMonitors = useMemo(() => monitors.filter((m) => {
    if (activeFilter !== 'All' && m.status !== activeFilter) return false;
    if (searchQuery.trim() && !m.name.toLowerCase().includes(searchQuery.trim().toLowerCase())) {
      return false;
    }
    return true;
  }), [monitors, activeFilter, searchQuery]);

  const { groups, childrenByParent, standalone } = useMemo(() => {
    // On construit la map des enfants à partir de TOUS les monitors (pas seulement
    // les filtrés) pour éviter qu'un groupe en pause disparaisse de la vue.
    const allGroupsById = new Map<number, MonitorItem>();
    const childrenMap = new Map<number, MonitorItem[]>();
    const standaloneList: MonitorItem[] = [];

    monitors.forEach(m => {
      if (m.type === 'group') {
        allGroupsById.set(m.id, m);
        if (!childrenMap.has(m.id)) childrenMap.set(m.id, []);
      }
    });

    monitors.forEach(m => {
      if (m.type !== 'group' && m.parent != null) {
        if (!childrenMap.has(m.parent)) childrenMap.set(m.parent, []);
        childrenMap.get(m.parent)!.push(m);
      }
    });

    // Un groupe est affiché si :
    //  - il correspond lui-même au filtre actif, OU
    //  - il a au moins un enfant correspondant au filtre actif
    // Cela empêche un groupe en pause de disparaître complètement.
    const matchesFilter = (m: MonitorItem) => {
      if (activeFilter !== 'All' && m.status !== activeFilter) return false;
      if (searchQuery.trim() && !m.name.toLowerCase().includes(searchQuery.trim().toLowerCase())) return false;
      return true;
    };

    const groupsList: MonitorItem[] = [];
    allGroupsById.forEach(group => {
      const children = childrenMap.get(group.id) || [];
      const selfMatches = matchesFilter(group);
      const childMatches = children.some(c => matchesFilter(c));
      if (selfMatches || childMatches) {
        groupsList.push(group);
      }
    });

    // Les moniteurs standalone (sans parent) filtrés normalement
    filteredMonitors.forEach(m => {
      if (m.type !== 'group' && m.parent == null) {
        standaloneList.push(m);
      }
    });

    return { groups: groupsList, childrenByParent: childrenMap, standalone: standaloneList };
  }, [monitors, filteredMonitors, activeFilter, searchQuery]);

  const toggleGroup = (groupId: number) => {
    LayoutAnimation.configureNext({
      duration: 280,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const closeSwipeable = (key: string) => {
    swipeableRefs.current.get(key)?.close();
  };

  // --- Actions niveau PAGE (enfant) ------------------------------------------
  const handleTogglePausePage = async (page: MonitorItem) => {
    closeSwipeable(`child-${page.id}`);
    const name = cleanUrl(page.url || page.name);
    try {
      if (page.status === 'paused') {
        await resumePage(page.id);
        toastiva.success(`Page reprise : ${name}`);
      } else {
        await pausePage(page.id);
        toastiva.success(`Page mise en pause : ${name}`);
      }
      fetchMonitors(true);
    } catch (err) {
      const msg = err instanceof RelayError ? err.message : "Impossible de modifier l'état de cette page.";
      toastiva.error(msg);
      Alert.alert('Erreur', msg);
    }
  };

  const handleDeletePage = (page: MonitorItem) => {
    Alert.alert(
      'Supprimer cette page ?',
      `"${cleanUrl(page.url || page.name)}" sera supprimée définitivement. Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel', onPress: () => closeSwipeable(`child-${page.id}`) },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            const name = cleanUrl(page.url || page.name);
            try {
              await deletePage(page.id);
              toastiva.success(`Page supprimée : ${name}`);
              fetchMonitors(true);
            } catch (err) {
              const msg = err instanceof RelayError ? err.message : 'Suppression impossible.';
              toastiva.error(msg);
              Alert.alert('Erreur', msg);
              closeSwipeable(`child-${page.id}`);
            }
          },
        },
      ]
    );
  };

  // --- Actions niveau SITE (parent / groupe) ---------------------------------
  const handleTogglePauseSite = async (group: MonitorItem) => {
    closeSwipeable(`group-${group.id}`);
    const name = cleanUrl(group.url || group.name);
    try {
      if (group.status === 'paused') {
        await resumeSite(group.id);
        toastiva.success(`Site repris : ${name}`);
      } else {
        await pauseSite(group.id);
        toastiva.success(`Site mis en pause : ${name}`);
      }
      fetchMonitors(true);
    } catch (err) {
      const msg = err instanceof RelayError ? err.message : "Impossible de modifier l'état de ce site.";
      toastiva.error(msg);
      Alert.alert('Erreur', msg);
    }
  };

  const handleDeleteSite = (group: MonitorItem) => {
    const children = childrenByParent.get(group.id) || [];
    const childCount = children.length;
    Alert.alert(
      'Supprimer ce site ?',
      childCount > 0
        ? `"${cleanUrl(group.url || group.name)}" et ${childCount === 1 ? 'sa page' : `ses ${childCount} pages`} seront supprimés définitivement. Cette action est irréversible.`
        : `"${cleanUrl(group.url || group.name)}" sera supprimé définitivement. Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel', onPress: () => closeSwipeable(`group-${group.id}`) },
        {
          text: 'Tout supprimer',
          style: 'destructive',
          onPress: async () => {
            const name = cleanUrl(group.url || group.name);
            try {
              await deleteSite(group.id);
              toastiva.success(`Site supprimé : ${name}`);
              fetchMonitors(true);
            } catch (err) {
              const msg = err instanceof RelayError ? err.message : 'Suppression impossible.';
              toastiva.error(msg);
              Alert.alert('Erreur', msg);
              closeSwipeable(`group-${group.id}`);
            }
          },
        },
      ]
    );
  };

  const STATS_DISPLAY = [
    { label: 'Active', value: String(stats.up), color: theme.colors.up },
    { label: 'Hors ligne', value: String(stats.down), color: theme.colors.down },
    { label: 'Atten.', value: String(stats.pending), color: theme.colors.pending },
    { label: 'Maint.', value: String(stats.maintenance), color: theme.colors.maintenance },
    { label: 'Pause', value: String(stats.paused), color: theme.colors.paused },
  ];

  const renderChildRow = (monitor: MonitorItem) => {
    const statusColor = STATUS_COLORS[monitor.status] || theme.colors.up;
    const statusLabel = monitor.status === 'up' ? 'Online' : monitor.status === 'down' ? 'Offline' : STATUS_LABELS[monitor.status];
    const displayName = cleanUrl(monitor.url || monitor.name);
    const key = `child-${monitor.id}`;

    return (
      <Swipeable
        key={key}
        ref={(ref) => swipeableRefs.current.set(key, ref)}
        renderRightActions={() => (
          <SwipeActions
            isPaused={monitor.status === 'paused'}
            onPause={() => handleTogglePausePage(monitor)}
            onDelete={() => handleDeletePage(monitor)}
          />
        )}
        overshootRight={false}
      >
        <TouchableOpacity
          style={styles.childCard}
          onPress={() => onSelectMonitor(monitor.id)}
          activeOpacity={0.7}
        >
          <View style={styles.childLeft}>
            <View style={styles.logoBox}>
              <SiteLogo uri={monitor.logoUrl} size={26} />
            </View>
            <View style={styles.childInfo}>
              <Text style={styles.childTitle} numberOfLines={1}>
                {displayName}
              </Text>
              <View style={styles.childStatusRow}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.childStatusText, { color: statusColor }]}>
                  {statusLabel}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.actionBtn}>
            <ChevronRight size={18} color="#E2E8F0" />
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Top App Bar */}
      <Appbar.Header style={{ backgroundColor: theme.colors.background }}>
        <Appbar.Action icon={() => <Menu color={theme.colors.onBackground} size={24} />} onPress={() => {}} />
        <Appbar.Content title="Uptime Kuma" titleStyle={{ color: theme.colors.onBackground, fontSize: 18, fontWeight: '700' }} />
      </Appbar.Header>

      {/* Stats Row */}
      <View style={styles.statsContainer}>
        {STATS_DISPLAY.map((stat, index) => (
          <View key={index} style={styles.statItem}>
            <Text style={[styles.statValue, stat.color ? { color: stat.color } : {}]}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Search color={theme.colors.textMuted} size={20} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search monitors..."
            placeholderTextColor={theme.colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Chips Row */}
      <View style={styles.chipsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContainer}>
          {FILTERS.map((filter) => {
            const isActive = activeFilter === filter.status;
            return (
              <TouchableOpacity
                key={filter.label}
                style={[
                  styles.chip,
                  isActive ? styles.chipActive : styles.chipInactive,
                ]}
                onPress={() => setActiveFilter(filter.status)}
                activeOpacity={0.7}
              >
                {isActive && <Check size={14} color={theme.colors.chipActiveText} style={styles.chipIcon} />}
                <Text
                  style={[
                    styles.chipText,
                    isActive ? { color: theme.colors.chipActiveText } : { color: theme.colors.textMuted },
                  ]}
                >
                  {filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {(searchQuery.trim() !== '' || activeFilter !== 'All') && (
          <Text style={{ color: theme.colors.textMuted, fontSize: 12, paddingHorizontal: 16, marginTop: -8, marginBottom: 8 }}>
            {filteredMonitors.length} résultat{filteredMonitors.length > 1 ? 's' : ''} trouvé{filteredMonitors.length > 1 ? 's' : ''}
          </Text>
        )}
      </View>

      {loadError && (
        <Text style={styles.errorBanner}>{loadError}</Text>
      )}

      {/* Liste des monitors */}
      <ScrollView
        style={styles.listContainer}
        contentContainerStyle={filteredMonitors.length === 0 ? styles.listContentEmpty : styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchMonitors(true)}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        {filteredMonitors.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Activity size={48} color={theme.colors.textMuted} strokeWidth={1.5} />
            <Text style={styles.emptyStateText}>
              {monitors.length === 0 ? 'No monitors yet' : 'No monitors match this filter'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {/* Rendu des groupes */}
            {groups.map(group => {
              const isExpanded = expandedGroups.has(group.id);
              const allChildren = childrenByParent.get(group.id) || [];
              // Affiche les enfants non-élément up : down, paused, maintenance, ET pending
              // (pending = nouveau monitor qui attend son premier check)
              const children = allChildren.filter(c =>
                c.status === 'down' || c.status === 'paused' || c.status === 'maintenance' || c.status === 'pending'
              );
              const hasDownChildren = children.length > 0;
              const groupStatusColor = STATUS_COLORS[group.status] || theme.colors.up;
              const groupKey = `group-${group.id}`;

              return (
                <View key={groupKey} style={styles.groupContainer}>
                  <Swipeable
                    ref={(ref) => swipeableRefs.current.set(groupKey, ref)}
                    renderRightActions={() => (
                      <SwipeActions
                        isPaused={group.status === 'paused'}
                        onPause={() => handleTogglePauseSite(group)}
                        onDelete={() => handleDeleteSite(group)}
                      />
                    )}
                    overshootRight={false}
                  >
                    <View style={styles.groupHeader}>
                      <TouchableOpacity
                        style={styles.groupHeaderLeft}
                        onPress={() => onSelectMonitor(group.id)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.groupStatusBadge, { backgroundColor: groupStatusColor }]}>
                          {group.status === 'down' ? (
                            <ArrowDown size={14} color="#FFFFFF" strokeWidth={3} />
                          ) : (
                            <ArrowUp size={14} color="#FFFFFF" strokeWidth={3} />
                          )}
                        </View>
                        <Text style={[styles.groupName, { color: groupStatusColor }]} numberOfLines={1}>
                          {cleanUrl(group.url || group.name)}
                        </Text>
                      </TouchableOpacity>
                      {hasDownChildren && (
                        <TouchableOpacity
                          style={styles.groupHeaderChevron}
                          onPress={() => toggleGroup(group.id)}
                          activeOpacity={0.7}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          {isExpanded ? (
                            <ChevronUp size={18} color={theme.colors.textMuted} />
                          ) : (
                            <ChevronDown size={18} color={theme.colors.textMuted} />
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  </Swipeable>

                  {isExpanded && hasDownChildren && (
                    <View style={styles.childrenContainer}>
                      {children.map(child => renderChildRow(child))}
                    </View>
                  )}
                </View>
              );
            })}

            {/* Rendu des éléments isolés */}
            {standalone.map(monitor => (
              <View key={`standalone-${monitor.id}`} style={styles.groupContainer}>
                {renderChildRow(monitor)}
              </View>
            ))}

            {lastUpdated && (
              <Text style={{ textAlign: 'center', color: theme.colors.textMuted, fontSize: 11, marginTop: 16 }}>
                Dernière mise à jour : {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: Math.max(insets.bottom + 24, 24) }]}
        onPress={onNavigateToAdd}
        activeOpacity={0.8}
      >
        <Plus size={24} color={theme.colors.onPrimary} strokeWidth={2.5} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.surface,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.onBackground,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textMuted,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.outline,
    borderRadius: 8,
    height: 44,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: theme.colors.onBackground,
    fontSize: 14,
  },
  chipsWrapper: {
    paddingBottom: 16,
  },
  chipsContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    minHeight: 36,
    borderRadius: 6,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: theme.colors.chipActiveBg,
    borderColor: 'transparent',
  },
  chipInactive: {
    backgroundColor: 'transparent',
    borderColor: theme.colors.outline,
  },
  chipIcon: {
    marginRight: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 60,
  },
  emptyStateText: {
    marginTop: 12,
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  errorBanner: {
    color: '#F87171',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 110,
  },
  listContentEmpty: {
    flexGrow: 1,
  },

  /* Style Groupe */
  groupContainer: {
    marginBottom: 8,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.background,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.outline,
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  groupStatusBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupName: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  groupHeaderChevron: {
    padding: 8,
    marginRight: -8, // Compensate for padding to keep it aligned with the right edge
  },

  /* Style Éléments Enfants (Indentés par rapport au groupe parent) */
  childrenContainer: {
    paddingTop: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  childCard: {
    backgroundColor: theme.colors.background,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.outline,
  },
  childLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  logoBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#0D1117',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  childInfo: {
    flex: 1,
  },
  childTitle: {
    color: theme.colors.onBackground,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  childStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  childStatusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#1E2530',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  logoFallback: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },

  /* Actions de swipe (Pause / Suppression) */
  swipeActionsContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginLeft: 8,
  },
  swipeActionBtn: {
    width: 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginLeft: 6,
  },
  swipeActionPause: {
    backgroundColor: theme.colors.pending,
  },
  swipeActionDelete: {
    backgroundColor: theme.colors.down,
  },

  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    backgroundColor: theme.colors.primary,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    zIndex: 99,
  },
});