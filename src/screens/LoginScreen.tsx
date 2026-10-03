import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, TextInput, Text, Surface } from 'react-native-paper';

const theme = {
  colors: {
    background: '#0F1115',
    surface: '#1A1E27',
    primary: '#7DD3FC',
    error: '#FCA5A5',
  },
};

export default function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!password.trim()) {
      setError('Mot de passe requis');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/relay/monitors', {
        method: 'GET',
        headers: { 'x-app-password': password },
      });

      if (res.ok) {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('app_password', password);
        }
        onLogin();
      } else if (res.status === 401) {
        setError('Mot de passe incorrect');
      } else {
        setError('Erreur de connexion');
      }
    } catch (err) {
      setError('Impossible de joindre le serveur');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Text variant="headlineMedium" style={styles.title}>
          Connexion requise
        </Text>
        <TextInput
          label="Mot de passe"
          secureTextEntry
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            if (error) setError('');
          }}
          style={styles.input}
          disabled={loading}
          mode="outlined"
        />
        {error && <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>}
        <Button
          onPress={handleSubmit}
          loading={loading}
          disabled={loading}
          mode="contained"
          style={styles.button}
        >
          Connecter
        </Button>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    padding: 24,
    borderRadius: 12,
  },
  title: {
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    marginVertical: 12,
  },
  button: {
    marginTop: 12,
  },
  error: {
    marginVertical: 8,
    textAlign: 'center',
  },
});
