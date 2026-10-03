import React, { useCallback, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MD3DarkTheme, PaperProvider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ToastivaProvider } from 'toastiva';
import HomeScreen from './src/screens/HomeScreen';
import AddMonitorScreen from './src/screens/AddMonitorScreen';
import MonitorDetailScreen, { type DetailTabKey } from './src/screens/MonitorDetailScreen';

const appTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#7DD3FC',
    onPrimary: '#082F49',
    background: '#0F1115',
    surface: '#1A1E27',
    surfaceVariant: '#202833',
    secondaryContainer: '#2B3747',
    onSecondaryContainer: '#E2E8F0',
    tertiary: '#6EE7B7',
    onSurface: '#F8FAFC',
    onSurfaceVariant: '#B7C2CF',
    outline: '#384456',
    // ⚠️ elevation must define ALL levels (0→5): Paper's Surface interpolates
    // `colors.elevation.level${n}` for n in [0..5] when an Animated.Value
    // elevation is passed (e.g. every Paper `Button` does this). Missing
    // entries become `undefined` in the interpolate() outputRange and crash
    // with: "outputRange must contain color or value with numeric component".
    elevation: {
      ...MD3DarkTheme.colors.elevation,
      level0: '#0F1115',
      level1: '#171D26',
      level2: '#1B2430',
      level3: '#202B38',
      level4: '#253242',
      level5: '#2A3A4C',
    },
  },
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'home' | 'add'>('home');
  const [detailStack, setDetailStack] = useState<{ monitorId: number; tab: DetailTabKey }[]>([]);

  const openMonitorDetail = useCallback((monitorId: number, tab: DetailTabKey = 'monitor') => {
    setDetailStack((prev) => [...prev, { monitorId, tab }]);
  }, []);

  const closeMonitorDetail = useCallback(() => {
    setDetailStack((prev) => prev.slice(0, -1));
  }, []);

  const currentDetail = detailStack.length > 0 ? detailStack[detailStack.length - 1] : null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ToastivaProvider position="top-center">
          <PaperProvider theme={appTheme} settings={{ icon: (props) => <MaterialCommunityIcons {...props} /> }}>
            {currentDetail ? (
              <MonitorDetailScreen
                key={`${currentDetail.monitorId}-${detailStack.length}`}
                monitorId={currentDetail.monitorId}
                initialTab={currentDetail.tab}
                onBack={closeMonitorDetail}
              />
            ) : currentScreen === 'home' ? (
              <HomeScreen
                onNavigateToAdd={() => setCurrentScreen('add')}
                onSelectMonitor={openMonitorDetail}
              />
            ) : (
              <AddMonitorScreen onBack={() => setCurrentScreen('home')} />
            )}
          </PaperProvider>
        </ToastivaProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}