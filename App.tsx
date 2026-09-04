import React, { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ToastivaProvider } from 'toastiva';
import HomeScreen from './src/screens/HomeScreen';
import AddMonitorScreen from './src/screens/AddMonitorScreen';
import MonitorDetailScreen from './src/screens/MonitorDetailScreen';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<'home' | 'add'>('home');
  const [selectedMonitorId, setSelectedMonitorId] = useState<number | null>(null);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ToastivaProvider position="top-center">
          <PaperProvider settings={{ icon: (props) => <MaterialCommunityIcons {...props} /> }}>
            {selectedMonitorId !== null ? (
              <MonitorDetailScreen
                monitorId={selectedMonitorId}
                onBack={() => setSelectedMonitorId(null)}
              />
            ) : currentScreen === 'home' ? (
              <HomeScreen
                onNavigateToAdd={() => setCurrentScreen('add')}
                onSelectMonitor={(id) => setSelectedMonitorId(id)}
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