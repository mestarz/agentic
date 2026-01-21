import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import type { Session, SessionSummary } from '../types';

export function useSessions() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await axios.get('/api/admin/sessions');
      setSessions(res.data || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSessions();
  }, [fetchSessions]);

  const selectSession = async (id: string) => {
    setSelectedId(id);
    try {
      const res = await axios.get(`/api/admin/sessions/${id}`);
      setCurrentSession(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const deleteSession = async (id: string) => {
    try {
      await axios.delete(`/api/admin/sessions/${id}`);
      if (selectedId === id) {
        setSelectedId(null);
        setCurrentSession(null);
      }
      await fetchSessions();
    } catch (err) {
      console.error(err);
    }
  };

  const deleteSessions = async () => {
    if (!selectedIds.length) return;
    try {
      await axios.delete('/api/admin/sessions', { data: selectedIds });
      if (selectedIds.includes(selectedId || '')) {
        setSelectedId(null);
        setCurrentSession(null);
      }
      setSelectedIds([]);
      await fetchSessions();
    } catch (err) {
      console.error(err);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    setSelectedIds(selectedIds.length === sessions.length ? [] : sessions.map((s) => s.id));
  };

  return {
    sessions,
    selectedId,
    setSelectedId,
    selectedIds,
    setSelectedIds,
    currentSession,
    setCurrentSession,
    fetchSessions,
    selectSession,
    deleteSession,
    deleteSessions,
    toggleSelect,
    toggleSelectAll,
  };
}
