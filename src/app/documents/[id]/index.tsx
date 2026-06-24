import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';

import {
  Catalogs,
  Documents,
  Navigation,
  Relationships,
  Search,
  type DocumentModel,
  type DocumentSummary,
  type RecentlyViewedItem,
  type RelatedDocument,
} from '@/db';
import type { OpenedFrom } from '@/db/types';
import { BODY_WARN_BYTES, MAX_BODY_BYTES, byteLength } from '@/domain/bytes';
import { buildDocumentUri, parseTopicsInput } from '@/domain/markdown';
import {
  applyHeading,
  applyWrap,
  insertHorizontalRule,
  insertLink,
  MarkdownPreview,
  type EditResult,
  type Selection,
} from '@/markdown';
import { useDatabase, useSettings, useT, useTheme, useToast } from '@/state';
import { catalogSyncService } from '@/sync';
import {
  AppHeader,
  Button,
  DocumentRow,
  IconButton,
  Screen,
  SegmentedControl,
  Sheet,
  SyncStatusPill,
  TextField,
} from '@/ui/components';
import { MarkdownToolbar } from '@/ui/editor/MarkdownToolbar';
import { NavigationStrip } from '@/ui/editor/NavigationStrip';

const AUTOSAVE_MS = 600;
const VALID_FROM: OpenedFrom[] = ['home', 'search', 'document_link', 'navigation_surface', 'direct'];

function coerceFrom(value: unknown): OpenedFrom {
  return typeof value === 'string' && (VALID_FROM as string[]).includes(value)
    ? (value as OpenedFrom)
    : 'direct';
}

function goBackSafe() {
  if (router.canGoBack()) router.back();
  else if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
}

type SaveStatus = 'saved' | 'saving' | 'unsaved';

export default function DocumentEditorScreen() {
  const params = useLocalSearchParams<{ id: string; from?: string; fromDoc?: string }>();
  const id = params.id;
  const db = useDatabase();
  const t = useT();
  const theme = useTheme();
  const { showToast } = useToast();
  const { activeCatalogId } = useSettings();

  const [doc, setDoc] = useState<DocumentModel | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [title, setTitle] = useState('');
  const [topics, setTopics] = useState('');
  const [body, setBody] = useState('');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [related, setRelated] = useState<RelatedDocument[]>([]);
  const [recents, setRecents] = useState<RecentlyViewedItem[]>([]);
  const [catalogHasProvider, setCatalogHasProvider] = useState(false);

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkResults, setLinkResults] = useState<DocumentSummary[]>([]);
  const [externalOpen, setExternalOpen] = useState(false);
  const [externalUrl, setExternalUrl] = useState('');
  const [externalText, setExternalText] = useState('');

  const docRef = useRef<DocumentModel | null>(null);
  const latest = useRef({ title: '', topics: '', body: '' });
  const selRef = useRef<Selection>({ start: 0, end: 0 });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editedRef = useRef(false);
  const bodyRef = useRef<TextInput>(null);

  const refreshNav = useCallback(async () => {
    const d = docRef.current;
    if (!d) return;
    const [rel, rec] = await Promise.all([
      Relationships.getRelationships(db, d.catalogId, d.id),
      Navigation.listRecentlyViewed(db, d.catalogId),
    ]);
    setRelated(rel);
    setRecents(rec.filter((r) => r.id !== d.id));
  }, [db]);

  const applyDoc = useCallback((d: DocumentModel) => {
    docRef.current = d;
    setDoc(d);
    setTitle(d.title);
    setTopics(d.topics.join(', '));
    setBody(d.bodyMarkdown);
    latest.current = { title: d.title, topics: d.topics.join(', '), body: d.bodyMarkdown };
  }, []);

  // Initial load + document-open sync (UC-05/UC-10).
  useEffect(() => {
    let active = true;
    (async () => {
      const d = await Documents.getDocument(db, id);
      if (!active) return;
      if (!d) {
        setNotFound(true);
        return;
      }
      applyDoc(d);
      editedRef.current = false;
      await Navigation.recordNavigationEvent(db, {
        catalogId: d.catalogId,
        documentId: d.id,
        fromDocumentId: typeof params.fromDoc === 'string' ? params.fromDoc : null,
        openedFrom: coerceFrom(params.from),
      });
      await refreshNav();

      const cat = await Catalogs.getCatalog(db, d.catalogId);
      if (active) setCatalogHasProvider(!!cat?.activeSyncConnectionId);
      if (cat?.activeSyncConnectionId) {
        const outcome = await catalogSyncService.syncDocumentOnOpen(d.catalogId, d.id);
        if (active && !editedRef.current && (outcome.status === 'synced' || outcome.status === 'conflict')) {
          const fresh = await Documents.getDocument(db, d.id);
          if (fresh && !editedRef.current) {
            applyDoc(fresh);
            await refreshNav();
          }
        }
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const doSave = useCallback(
    async (triggerSync: boolean) => {
      const d = docRef.current;
      if (!d) return;
      const v = latest.current;
      setStatus('saving');
      const result = await Documents.saveDocument(db, d.id, {
        title: v.title,
        topics: parseTopicsInput(v.topics),
        body: v.body,
      });
      docRef.current = result.document;
      setDoc(result.document);
      editedRef.current = false;
      if (result.truncated) {
        setBody(result.document.bodyMarkdown);
        latest.current.body = result.document.bodyMarkdown;
        showToast(t('editor.bytes.exceeded'), 'error');
      }
      setStatus('saved');
      await refreshNav();
      if (triggerSync) void catalogSyncService.processDirty();
    },
    [db, refreshNav, showToast, t]
  );

  const scheduleSave = useCallback(() => {
    setStatus('unsaved');
    editedRef.current = true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void doSave(true), AUTOSAVE_MS);
  }, [doSave]);

  const onChangeTitle = (v: string) => {
    setTitle(v);
    latest.current.title = v;
    scheduleSave();
  };
  const onChangeTopics = (v: string) => {
    setTopics(v);
    latest.current.topics = v;
    scheduleSave();
  };
  const onChangeBody = (v: string) => {
    setBody(v);
    latest.current.body = v;
    scheduleSave();
  };

  const onSelectionChange = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    selRef.current = e.nativeEvent.selection;
    setSelection(e.nativeEvent.selection);
  };

  const applyEdit = (result: EditResult) => {
    setBody(result.text);
    latest.current.body = result.text;
    setSelection(result.selection);
    selRef.current = result.selection;
    scheduleSave();
    requestAnimationFrame(() => bodyRef.current?.focus());
  };

  // Flush pending autosave on blur (navigation away) and on background.
  useFocusEffect(
    useCallback(() => {
      void refreshNav();
      return () => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        if (editedRef.current && docRef.current) {
          const v = latest.current;
          void Documents.saveDocument(db, docRef.current.id, {
            title: v.title,
            topics: parseTopicsInput(v.topics),
            body: v.body,
          });
          editedRef.current = false;
        }
      };
    }, [db, refreshNav])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: string) => {
      if (s !== 'active' && editedRef.current && docRef.current) {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        void doSave(false);
      }
    });
    return () => sub.remove();
  }, [doSave]);

  // Document-link search inside the link sheet (scoped to the active catalog).
  useEffect(() => {
    if (!linkOpen) return;
    const d = docRef.current;
    if (!d) return;
    let active = true;
    const tmr = setTimeout(async () => {
      if (linkQuery.trim().length === 0) {
        const recent = await Documents.listRecentDocuments(db, d.catalogId, 20);
        if (active) {
          setLinkResults(
            recent
              .filter((r) => r.id !== d.id)
              .map((r) => ({ id: r.id, title: r.title, topics: r.topics, updatedAt: r.updatedAt }))
          );
        }
      } else {
        const res = await Search.searchDocuments(db, d.catalogId, linkQuery);
        if (active) setLinkResults(res.filter((r) => r.id !== d.id));
      }
    }, 150);
    return () => {
      active = false;
      clearTimeout(tmr);
    };
  }, [linkOpen, linkQuery, db]);

  const insertDocumentLink = (target: DocumentSummary) => {
    applyEdit(insertLink(latest.current.body, selRef.current, target.title || t('common.untitled'), buildDocumentUri(target.id)));
    setLinkOpen(false);
  };

  const confirmExternalLink = () => {
    const url = externalUrl.trim() || 'https://example.com';
    const text = externalText.trim() || t('toolbar.placeholder.linkText');
    applyEdit(insertLink(latest.current.body, selRef.current, text, url));
    setExternalOpen(false);
  };

  const openDocument = (targetId: string, from: OpenedFrom) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    router.push({ pathname: '/documents/[id]', params: { id: targetId, from, fromDoc: docRef.current?.id } });
  };

  const onPressDocumentLink = async (documentId: string) => {
    const target = await Documents.getDocument(db, documentId);
    if (!target || target.catalogId !== docRef.current?.catalogId) {
      showToast(t('editor.link.notFound'), 'error');
      return;
    }
    openDocument(documentId, 'document_link');
  };

  const onDelete = () => {
    Alert.alert(t('editor.deleteConfirm.title'), t('editor.deleteConfirm.body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          editedRef.current = false;
          await Documents.softDeleteDocument(db, id);
          goBackSafe();
        },
      },
    ]);
  };

  if (notFound) {
    return (
      <Screen edges={['top', 'left', 'right']}>
        <AppHeader title={t('common.appName')} onBack={goBackSafe} />
        <View style={styles.center}>
          <Text style={{ color: theme.colors.textMuted }}>{t('error.documentNotFound')}</Text>
        </View>
      </Screen>
    );
  }

  const bodyBytes = byteLength(body);
  const overLimit = bodyBytes > MAX_BODY_BYTES;
  const nearLimit = bodyBytes >= BODY_WARN_BYTES;
  const percent = Math.min(100, Math.round((bodyBytes / MAX_BODY_BYTES) * 100));

  const statusLabel =
    status === 'saving' ? t('editor.status.saving') : status === 'unsaved' ? t('editor.status.unsaved') : t('editor.status.saved');

  return (
    <Screen edges={['top', 'left', 'right', 'bottom']}>
      <AppHeader
        title={title.trim() || t('common.untitled')}
        onBack={goBackSafe}
        right={
          <IconButton
            name="trash-outline"
            onPress={onDelete}
            accessibilityLabel={t('editor.delete')}
            color={theme.colors.danger}
          />
        }
      />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TextInput
          value={title}
          onChangeText={onChangeTitle}
          placeholder={t('editor.titlePlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.titleInput, { color: theme.colors.text }]}
          accessibilityLabel={t('editor.titlePlaceholder')}
        />
        <TextInput
          value={topics}
          onChangeText={onChangeTopics}
          placeholder={t('editor.topicsPlaceholder')}
          placeholderTextColor={theme.colors.textMuted}
          autoCapitalize="none"
          style={[styles.topicsInput, { color: theme.colors.textSecondary }]}
          accessibilityLabel={t('editor.topicsPlaceholder')}
        />

        {nearLimit ? (
          <View style={[styles.warnBar, { backgroundColor: theme.colors.warningSurface }]}>
            <Text style={[styles.warnText, { color: theme.colors.warning }]}>
              {overLimit ? t('editor.bytes.exceeded') : t('editor.bytes.warning', { percent })}
            </Text>
          </View>
        ) : null}

        {mode === 'edit' ? (
          <>
            <MarkdownToolbar
              onBold={() => applyEdit(applyWrap(latest.current.body, selRef.current, '**', t('toolbar.placeholder.bold')))}
              onItalic={() => applyEdit(applyWrap(latest.current.body, selRef.current, '*', t('toolbar.placeholder.italic')))}
              onHeading={(level) => applyEdit(applyHeading(latest.current.body, selRef.current, level))}
              onHorizontalRule={() => applyEdit(insertHorizontalRule(latest.current.body, selRef.current))}
              onDocumentLink={() => {
                setLinkQuery('');
                setLinkOpen(true);
              }}
              onExternalLink={() => {
                setExternalUrl('');
                setExternalText('');
                setExternalOpen(true);
              }}
            />
            <TextInput
              ref={bodyRef}
              value={body}
              onChangeText={onChangeBody}
              onSelectionChange={onSelectionChange}
              selection={selection}
              placeholder={t('editor.bodyPlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
              multiline
              textAlignVertical="top"
              style={[styles.bodyInput, { color: theme.colors.text }]}
              accessibilityLabel={t('editor.bodyPlaceholder')}
            />
          </>
        ) : (
          <ScrollView style={styles.flex} contentContainerStyle={styles.previewContent}>
            {body.trim().length === 0 ? (
              <Text style={{ color: theme.colors.textMuted }}>{t('editor.bodyPlaceholder')}</Text>
            ) : (
              <MarkdownPreview markdown={body} onPressDocumentLink={onPressDocumentLink} />
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      <View style={[styles.footerRow, { borderTopColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
        <View style={styles.segment}>
          <SegmentedControl<'edit' | 'preview'>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'edit', label: t('editor.tab.edit') },
              { value: 'preview', label: t('editor.tab.preview') },
            ]}
          />
        </View>
        <View style={styles.statusGroup}>
          <Text style={[styles.statusText, { color: theme.colors.textMuted }]}>{statusLabel}</Text>
          <SyncStatusPill catalogId={doc?.catalogId ?? null} hasProvider={!!doc && catalogHasProvider} dirty={!!doc?.dirty} />
        </View>
      </View>

      {doc ? (
        <NavigationStrip
          currentId={doc.id}
          currentTitle={title}
          related={related}
          recents={recents}
          onOpen={(targetId) => openDocument(targetId, 'navigation_surface')}
          onExpand={() => router.push({ pathname: '/documents/[id]/navigation', params: { id: doc.id } })}
        />
      ) : null}

      {/* Document link picker */}
      <Sheet visible={linkOpen} onClose={() => setLinkOpen(false)} title={t('toolbar.documentLink.title')}>
        <View style={styles.linkSearch}>
          <TextField
            value={linkQuery}
            onChangeText={setLinkQuery}
            placeholder={t('toolbar.documentLink.search')}
            autoCorrect={false}
          />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.linkResults}>
          {linkResults.length === 0 ? (
            <Text style={[styles.emptyLink, { color: theme.colors.textMuted }]}>
              {t('toolbar.documentLink.empty')}
            </Text>
          ) : (
            linkResults.map((r) => (
              <View key={r.id} style={styles.linkRow}>
                <DocumentRow
                  title={r.title}
                  topics={r.topics}
                  updatedAt={r.updatedAt}
                  onPress={() => insertDocumentLink(r)}
                />
              </View>
            ))
          )}
        </ScrollView>
      </Sheet>

      {/* External link dialog */}
      <Sheet visible={externalOpen} onClose={() => setExternalOpen(false)} title={t('toolbar.externalLink.title')}>
        <View style={styles.externalForm}>
          <TextField
            label={t('toolbar.externalLink.urlLabel')}
            value={externalUrl}
            onChangeText={setExternalUrl}
            placeholder={t('toolbar.externalLink.urlPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            autoFocus
          />
          <TextField
            label={t('toolbar.externalLink.textLabel')}
            value={externalText}
            onChangeText={setExternalText}
            placeholder={t('toolbar.placeholder.linkText')}
          />
          <Button label={t('common.add')} onPress={confirmExternalLink} fullWidth icon="link-outline" />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  segment: { flex: 1, maxWidth: 220 },
  statusGroup: { alignItems: 'flex-end', gap: 2 },
  statusText: { fontSize: 11 },
  titleInput: { fontSize: 22, fontWeight: '700', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  topicsInput: { fontSize: 14, paddingHorizontal: 16, paddingBottom: 10 },
  warnBar: { paddingHorizontal: 16, paddingVertical: 6 },
  warnText: { fontSize: 12, fontWeight: '600' },
  bodyInput: { flex: 1, fontSize: 16, lineHeight: 23, paddingHorizontal: 16, paddingTop: 10 },
  previewContent: { padding: 16, paddingBottom: 32 },
  linkSearch: { paddingBottom: 10 },
  linkResults: { maxHeight: 360 },
  linkRow: { marginBottom: 8 },
  emptyLink: { fontSize: 14, paddingVertical: 16, textAlign: 'center' },
  externalForm: { gap: 12, paddingBottom: 8 },
});
