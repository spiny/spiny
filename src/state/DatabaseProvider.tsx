import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDatabase } from '@/db';

interface DatabaseState {
  db: SQLiteDatabase | null;
  ready: boolean;
  error: Error | null;
}

const DatabaseContext = createContext<DatabaseState>({ db: null, ready: false, error: null });

/**
 * Opens the local SQLite database (running migrations) and gates the app until
 * it is ready. The database is the offline source of truth (constraints C-01).
 */
export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DatabaseState>({ db: null, ready: false, error: null });

  useEffect(() => {
    let cancelled = false;
    getDatabase()
      .then((db) => {
        if (!cancelled) setState({ db, ready: true, error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ db: null, ready: false, error });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Spiny</Text>
        <Text style={styles.errorBody}>Could not open the local database.</Text>
        <Text style={styles.errorDetail}>{state.error.message}</Text>
      </View>
    );
  }

  if (!state.ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return <DatabaseContext.Provider value={state}>{children}</DatabaseContext.Provider>;
}

/** Access the ready database connection (only valid inside DatabaseProvider). */
export function useDatabase(): SQLiteDatabase {
  const { db } = useContext(DatabaseContext);
  if (!db) throw new Error('useDatabase used before the database was ready');
  return db;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0E0F13' },
  errorTitle: { color: '#F3F4F8', fontSize: 24, fontWeight: '700', marginBottom: 8 },
  errorBody: { color: '#F3F4F8', fontSize: 15, textAlign: 'center' },
  errorDetail: { color: '#878D9C', fontSize: 12, textAlign: 'center', marginTop: 8 },
});
