/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  Plus,
  Trash2,
  Edit2,
  ArrowUp,
  ArrowDown,
  Download,
  Upload,
  Link,
  RefreshCw,
  Save,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  LogOut,
  FileText,
  Search,
  AlertTriangle,
  Check,
  Activity,
} from 'lucide-react';
import { Category, Channel, M3UImportOptions, StreamValidationResult } from '../../types/tv';
import { ApiService } from '../../services/api';
import { parseM3UPlaylist, exportToM3U } from '../../utils/m3uParser';
import { DEFAULT_DEMO_CHANNELS } from '../../data/defaultChannels';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  channels: Channel[];
  onUpdateChannels: (channels: Channel[]) => void;
  onSelectChannelForPreview: (channel: Channel) => void;
  isAuthenticated: boolean;
  requiresSetup: boolean;
  onAuthSuccess: () => void;
  onLogout: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  isOpen,
  onClose,
  channels,
  onUpdateChannels,
  onSelectChannelForPreview,
  isAuthenticated,
  requiresSetup,
  onAuthSuccess,
  onLogout,
}) => {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'channels' | 'import' | 'export'>('channels');

  // Auth Form State
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Channel Manager State
  const [localChannels, setLocalChannels] = useState<Channel[]>(channels);
  const [filterQuery, setFilterQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);
  const [isCleaningOffline, setIsCleaningOffline] = useState(false);
  const [cleanReport, setCleanReport] = useState<string | null>(null);

  // Edit / Add Channel Modal State & Validation
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [isNewChannelModalOpen, setIsNewChannelModalOpen] = useState(false);
  const [streamUrlInput, setStreamUrlInput] = useState('');
  const [validationStatus, setValidationStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [validationResult, setValidationResult] = useState<StreamValidationResult | null>(null);
  const [bypassValidation, setBypassValidation] = useState(false);

  const handleOpenAddModal = (ch: Channel | null = null) => {
    setEditingChannel(ch);
    setStreamUrlInput(ch ? ch.streamUrl : '');
    setValidationStatus(ch ? 'valid' : 'idle');
    setValidationResult(null);
    setBypassValidation(false);
    setIsNewChannelModalOpen(true);
  };

  const handleValidateStream = async (urlOverride?: string): Promise<boolean> => {
    const url = (urlOverride ?? streamUrlInput).trim();
    if (!url) {
      setValidationStatus('invalid');
      setValidationResult({ valid: false, error: 'Please enter a stream URL to validate' });
      return false;
    }

    setValidationStatus('validating');
    setValidationResult(null);

    const result = await ApiService.validateStreamUrl(url);
    if (result.valid) {
      setValidationStatus('valid');
      setValidationResult(result);
      if (result.normalizedUrl && result.normalizedUrl !== url) {
        setStreamUrlInput(result.normalizedUrl);
      }
      return true;
    } else {
      setValidationStatus('invalid');
      setValidationResult(result);
      return false;
    }
  };

  // M3U Import State
  const [importUrl, setImportUrl] = useState('');
  const [importRawText, setImportRawText] = useState('');
  const [importSource, setImportSource] = useState<'url' | 'text' | 'file'>('url');
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [defaultCategory, setDefaultCategory] = useState<Category>('Other');
  const [autoDetectCategory, setAutoDetectCategory] = useState(true);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<{
    channels: Channel[];
    total: number;
    groups: string[];
  } | null>(null);

  // Sync props channels to local channels when modal opens
  React.useEffect(() => {
    setLocalChannels(channels);
  }, [channels, isOpen]);

  if (!isOpen) return null;

  // Handle Auth Submission
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      if (requiresSetup) {
        if (password.length < 6) {
          setAuthError('Password must be at least 6 characters long');
          setAuthLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setAuthError('Passwords do not match');
          setAuthLoading(false);
          return;
        }
        const res = await ApiService.setupAdmin(password);
        if (res.success) {
          onAuthSuccess();
          setPassword('');
          setConfirmPassword('');
        } else {
          setAuthError(res.error || 'Failed to setup admin credentials');
        }
      } else {
        const res = await ApiService.loginAdmin(password);
        if (res.success) {
          onAuthSuccess();
          setPassword('');
        } else {
          setAuthError(res.error || 'Invalid administrator password');
        }
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication error');
    } finally {
      setAuthLoading(false);
    }
  };

  // Channel Actions
  const handleToggleChannel = (id: string) => {
    const updated = localChannels.map((c) =>
      c.id === id ? { ...c, enabled: !c.enabled } : c
    );
    setLocalChannels(updated);
  };

  const handleMoveChannel = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= localChannels.length) return;

    const list = [...localChannels];
    const [moved] = list.splice(index, 1);
    list.splice(targetIndex, 0, moved);

    // Update orders
    const reordered = list.map((item, idx) => ({ ...item, order: idx + 1 }));
    setLocalChannels(reordered);
  };

  const handleDeleteChannel = (id: string) => {
    if (window.confirm('Are you sure you want to remove this channel from ReneeTV Live?')) {
      const updated = localChannels.filter((c) => c.id !== id);
      setLocalChannels(updated);
    }
  };

  // Save changes persistently
  const handleSaveAll = async () => {
    setIsSaving(true);
    setSaveSuccessNotice(false);
    try {
      const res = await ApiService.saveChannels(localChannels);
      if (res.success) {
        onUpdateChannels(localChannels);
        setSaveSuccessNotice(true);
        setTimeout(() => setSaveSuccessNotice(false), 3000);
      } else {
        alert('Failed to save channels: ' + res.error);
      }
    } catch (err: any) {
      alert('Error saving channels: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Restore Default Demo Channels
  const handleRestoreDemoChannels = async () => {
    if (
      window.confirm(
        'Restore default authorized demo streams? This will replace your current channel list with clearly labeled test streams.'
      )
    ) {
      setLocalChannels(DEFAULT_DEMO_CHANNELS);
      await ApiService.saveChannels(DEFAULT_DEMO_CHANNELS);
      onUpdateChannels(DEFAULT_DEMO_CHANNELS);
      setSaveSuccessNotice(true);
      setTimeout(() => setSaveSuccessNotice(false), 3000);
    }
  };

  // Check and Clean Offline Channels ("kontrolloni kanalet qe sjan online largoi")
  const handleCleanOfflineChannels = async () => {
    if (!window.confirm('A doni të kontrolloni kanalet dhe të largoni automatikisht të gjitha ato që sjan online?')) {
      return;
    }

    setIsCleaningOffline(true);
    setCleanReport('Duke skanuar dhe kontrolluar kanalet live...');

    try {
      const res = await ApiService.cleanOfflineChannels('remove');
      if (res.success && res.remainingChannels) {
        setLocalChannels(res.remainingChannels);
        onUpdateChannels(res.remainingChannels);
        setCleanReport(
          `U kontrolluan të gjitha kanalet: ${res.offlineCount || 0} kanale offline u larguan. Mbetën ${res.onlineCount || res.remainingChannels.length} kanale aktive online!`
        );
        setTimeout(() => setCleanReport(null), 6000);
      } else {
        alert(res.error || 'Nuk mund të kryhej pastrimi i kanaleve.');
        setCleanReport(null);
      }
    } catch (err: any) {
      alert('Gabim gjatë pastrimit: ' + err.message);
      setCleanReport(null);
    } finally {
      setIsCleaningOffline(false);
    }
  };

  // Handle M3U Parse & Preview
  const handleParseM3U = async () => {
    setImportError(null);
    setImportLoading(true);
    setImportPreview(null);

    let contentToParse = '';

    try {
      if (importSource === 'url') {
        if (!importUrl.trim()) {
          setImportError('Please enter a valid M3U playlist URL');
          setImportLoading(false);
          return;
        }

        // Fetch via server-side CORS proxy
        const res = await ApiService.fetchRemoteM3U(importUrl.trim());
        if (!res.success || !res.content) {
          setImportError(res.error || 'Failed to download M3U playlist from provided URL');
          setImportLoading(false);
          return;
        }
        contentToParse = res.content;
      } else if (importSource === 'text') {
        if (!importRawText.trim()) {
          setImportError('Please paste M3U playlist content');
          setImportLoading(false);
          return;
        }
        contentToParse = importRawText;
      }

      const options: Partial<M3UImportOptions> = {
        mode: importMode,
        defaultCategory,
        autoDetectCategory,
        onlyValidUrls: true,
      };

      const result = parseM3UPlaylist(contentToParse, importSource === 'url' ? importUrl : undefined, options);

      if (result.channels.length === 0) {
        setImportError('No valid streams or #EXTINF entries were detected in the playlist content.');
      } else {
        setImportPreview({
          channels: result.channels,
          total: result.totalParsed,
          groups: result.groupsFound,
        });
      }
    } catch (err: any) {
      setImportError(err.message || 'An error occurred while parsing the playlist');
    } finally {
      setImportLoading(false);
    }
  };

  // Confirm Import
  const handleConfirmImport = async () => {
    if (!importPreview || importPreview.channels.length === 0) return;

    let nextChannels: Channel[];
    if (importMode === 'replace') {
      nextChannels = importPreview.channels.map((ch, idx) => ({ ...ch, order: idx + 1 }));
    } else {
      const existingIds = new Set(localChannels.map((c) => c.streamUrl));
      const freshChannels = importPreview.channels.filter((c) => !existingIds.has(c.streamUrl));
      nextChannels = [...localChannels, ...freshChannels].map((ch, idx) => ({ ...ch, order: idx + 1 }));
    }

    setLocalChannels(nextChannels);
    onUpdateChannels(nextChannels);
    await ApiService.saveChannels(nextChannels);

    setImportPreview(null);
    setImportUrl('');
    setImportRawText('');
    setActiveTab('channels');
    setSaveSuccessNotice(true);
    setTimeout(() => setSaveSuccessNotice(false), 3000);
  };

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setImportRawText(text);
      setImportSource('text');
    };
    reader.readAsText(file);
  };

  // Export handlers
  const handleDownloadM3U = () => {
    const m3uContent = exportToM3U(localChannels);
    const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reneetv-channels-${new Date().toISOString().slice(0, 10)}.m3u`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadJSON = () => {
    const blob = new Blob([JSON.stringify(localChannels, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reneetv-channels-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Save Single Add / Edit
  const handleSaveChannelModal = (channelData: Partial<Channel>) => {
    if (!channelData.name || !channelData.streamUrl) {
      alert('Channel name and stream URL are required');
      return;
    }

    if (editingChannel) {
      // Update existing
      const updated = localChannels.map((c) =>
        c.id === editingChannel.id ? ({ ...c, ...channelData } as Channel) : c
      );
      setLocalChannels(updated);
      setEditingChannel(null);
    } else {
      // Add new
      const newChan: Channel = {
        id: `ch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: channelData.name,
        streamUrl: channelData.streamUrl,
        logoUrl: channelData.logoUrl,
        category: (channelData.category as Category) || 'Other',
        enabled: channelData.enabled ?? true,
        isDemo: false,
        resolution: channelData.resolution || '1080p',
        currentProgram: channelData.currentProgram,
        description: channelData.description,
        order: localChannels.length + 1,
        addedAt: new Date().toISOString(),
      };
      setLocalChannels([newChan, ...localChannels]);
      setIsNewChannelModalOpen(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#10131d] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#141824]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-600/20 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                ReneeTV Live Administration
              </h2>
              <p className="text-xs text-slate-400">
                Authorized playlist ingestion & channel fleet management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <button
                onClick={onLogout}
                title="Logout from Admin"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Area */}
        {!isAuthenticated ? (
          /* Authentication Screen */
          <div className="p-8 max-w-md mx-auto my-auto w-full text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-600/10 border border-rose-500/30 text-rose-500 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-7 h-7" />
            </div>

            <h3 className="text-lg font-bold text-white mb-2">
              {requiresSetup ? 'Administrator Initial Setup' : 'Administrator Authentication'}
            </h3>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              {requiresSetup
                ? 'Create a secure master passcode to protect authorized M3U playlist imports, channel configuration, and server controls.'
                : 'Enter your administrator passcode to access playlist ingestion and channel controls.'}
            </p>

            <form onSubmit={handleAuthSubmit} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Administrator Passcode
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter passcode (min. 6 characters)"
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500 font-mono"
                />
              </div>

              {requiresSetup && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Confirm Passcode
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat passcode"
                    required
                    className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500 font-mono"
                  />
                </div>
              )}

              {authError && (
                <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs rounded-lg transition-all shadow-lg shadow-rose-950/40 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {authLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <span>{requiresSetup ? 'Configure & Access' : 'Authenticate'}</span>
                )}
              </button>
            </form>
          </div>
        ) : (
          /* Authenticated Dashboard */
          <div className="flex-1 flex flex-col min-h-0">
            {/* Sub-navigation Tabs */}
            <div className="px-6 border-b border-white/10 bg-[#121622] flex items-center justify-between">
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setActiveTab('channels')}
                  className={`py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                    activeTab === 'channels'
                      ? 'border-rose-500 text-rose-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Channel Fleet ({localChannels.length})
                </button>
                <button
                  onClick={() => setActiveTab('import')}
                  className={`py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                    activeTab === 'import'
                      ? 'border-rose-500 text-rose-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Import M3U / M3U8 Playlist
                </button>
                <button
                  onClick={() => setActiveTab('export')}
                  className={`py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                    activeTab === 'export'
                      ? 'border-rose-500 text-rose-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Export & Backups
                </button>
              </div>

              {/* Save All Persistent Button */}
              <div className="flex items-center gap-2">
                {saveSuccessNotice && (
                  <span className="text-xs text-emerald-400 flex items-center gap-1 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Saved
                  </span>
                )}
                <button
                  onClick={handleSaveAll}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-all shadow-md shadow-rose-950/40 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save Configuration</span>
                </button>
              </div>
            </div>

            {/* Tab 1: Channels Manager */}
            {activeTab === 'channels' && (
              <div className="flex-1 p-6 overflow-y-auto space-y-4">
                {/* Channel Actions Toolbar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={filterQuery}
                      onChange={(e) => setFilterQuery(e.target.value)}
                      placeholder="Filter channels by name, category, or group..."
                      className="w-full pl-9 pr-4 py-2 bg-black/40 border border-white/10 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleCleanOfflineChannels}
                      disabled={isCleaningOffline}
                      title="Skano dhe largo kanalet që sjan online"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-950/60 hover:bg-rose-900/70 text-rose-200 border border-rose-500/40 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Activity className={`w-3.5 h-3.5 text-rose-400 ${isCleaningOffline ? 'animate-spin' : ''}`} />
                      <span>{isCleaningOffline ? 'Duke Pastruar...' : 'Pastro Kanalet Offline'}</span>
                    </button>

                    <button
                      onClick={() => handleOpenAddModal(null)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Individual Channel</span>
                    </button>

                    <button
                      onClick={handleRestoreDemoChannels}
                      title="Reset to default verified demo channels"
                      className="px-3 py-2 rounded-lg bg-amber-950/30 hover:bg-amber-900/40 text-amber-300 border border-amber-500/30 text-xs font-medium transition-colors cursor-pointer"
                    >
                      Reset to Demo
                    </button>
                  </div>
                </div>

                {cleanReport && (
                  <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200 flex items-center gap-2.5 animate-in fade-in duration-200">
                    <Activity className="w-4 h-4 text-rose-400 shrink-0 animate-pulse" />
                    <span className="font-medium">{cleanReport}</span>
                  </div>
                )}

                {/* Channels Table / List */}
                <div className="rounded-xl border border-white/10 overflow-hidden bg-black/20">
                  <div className="max-h-[50vh] overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-[#161a27] text-slate-400 uppercase font-mono text-[10px] tracking-wider border-b border-white/10">
                        <tr>
                          <th className="py-2.5 px-3 w-12 text-center">#</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Channel Name & Logo</th>
                          <th className="py-2.5 px-3">Category</th>
                          <th className="py-2.5 px-3 hidden md:table-cell">Stream URL</th>
                          <th className="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {localChannels
                          .filter((ch) => {
                            if (!filterQuery) return true;
                            const q = filterQuery.toLowerCase();
                            return (
                              ch.name.toLowerCase().includes(q) ||
                              ch.category.toLowerCase().includes(q) ||
                              ch.groupTitle?.toLowerCase().includes(q)
                            );
                          })
                          .map((ch, idx) => (
                            <tr
                              key={ch.id}
                              className={`hover:bg-white/[0.02] transition-colors ${
                                !ch.enabled ? 'opacity-50' : ''
                              }`}
                            >
                              <td className="py-2.5 px-3 text-center font-mono text-slate-500 tabular-nums">
                                {idx + 1}
                              </td>

                              <td className="py-2.5 px-3">
                                <button
                                  onClick={() => handleToggleChannel(ch.id)}
                                  title={ch.enabled ? 'Channel Enabled (Click to Disable)' : 'Channel Disabled (Click to Enable)'}
                                  className={`p-1 rounded cursor-pointer transition-colors ${
                                    ch.enabled ? 'text-emerald-400 hover:text-emerald-300' : 'text-slate-500 hover:text-slate-400'
                                  }`}
                                >
                                  {ch.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                </button>
                              </td>

                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-2.5">
                                  {ch.logoUrl ? (
                                    <img
                                      src={ch.logoUrl}
                                      alt=""
                                      referrerPolicy="no-referrer"
                                      className="w-7 h-7 rounded object-contain bg-black/50 p-0.5 border border-white/10 shrink-0"
                                      onError={(e) => {
                                        (e.target as HTMLElement).style.display = 'none';
                                      }}
                                    />
                                  ) : (
                                    <div className="w-7 h-7 rounded bg-slate-800 text-slate-300 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                                      {ch.name.substring(0, 2).toUpperCase()}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <span className="font-semibold text-white block truncate">
                                      {ch.name}
                                    </span>
                                    {ch.groupTitle && (
                                      <span className="text-[10px] text-slate-400 block truncate">
                                        {ch.groupTitle}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>

                              <td className="py-2.5 px-3">
                                <span className="font-medium text-slate-300">
                                  {ch.category}
                                </span>
                              </td>

                              <td className="py-2.5 px-3 hidden md:table-cell font-mono text-[11px] text-slate-400 max-w-xs truncate">
                                {ch.streamUrl}
                              </td>

                              <td className="py-2.5 px-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {/* Test Preview */}
                                  <button
                                    onClick={() => onSelectChannelForPreview(ch)}
                                    title="Play in main screen"
                                    className="p-1 text-slate-400 hover:text-rose-400 rounded cursor-pointer"
                                  >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Move Up */}
                                  <button
                                    onClick={() => handleMoveChannel(idx, 'up')}
                                    disabled={idx === 0}
                                    title="Move up"
                                    className="p-1 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Move Down */}
                                  <button
                                    onClick={() => handleMoveChannel(idx, 'down')}
                                    disabled={idx === localChannels.length - 1}
                                    title="Move down"
                                    className="p-1 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Edit */}
                                  <button
                                    onClick={() => handleOpenAddModal(ch)}
                                    title="Edit Channel"
                                    className="p-1 text-slate-400 hover:text-white cursor-pointer"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Delete */}
                                  <button
                                    onClick={() => handleDeleteChannel(ch.id)}
                                    title="Delete Channel"
                                    className="p-1 text-slate-400 hover:text-rose-400 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Import M3U */}
            {activeTab === 'import' && (
              <div className="flex-1 p-6 overflow-y-auto space-y-6">
                {/* Method selector */}
                <div className="flex items-center gap-2 p-1 bg-black/40 rounded-lg border border-white/10 max-w-md">
                  <button
                    onClick={() => setImportSource('url')}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                      importSource === 'url' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Link className="w-3.5 h-3.5" />
                    <span>M3U URL</span>
                  </button>

                  <button
                    onClick={() => setImportSource('text')}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                      importSource === 'text' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Paste Text</span>
                  </button>

                  <label className="flex-1 py-1.5 text-xs font-semibold rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer flex items-center justify-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload File</span>
                    <input
                      type="file"
                      accept=".m3u,.m3u8,text/plain"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Source Inputs */}
                {importSource === 'url' ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-300">
                      M3U / M3U8 Playlist Web URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={importUrl}
                        onChange={(e) => setImportUrl(e.target.value)}
                        placeholder="https://example.com/playlist.m3u or https://.../playlist.m3u8"
                        className="flex-1 px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-lg text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
                      />
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Fetched securely via server-side proxy to bypass browser Cross-Origin (CORS) restrictions.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-300">
                      Raw M3U Content
                    </label>
                    <textarea
                      rows={6}
                      value={importRawText}
                      onChange={(e) => setImportRawText(e.target.value)}
                      placeholder="#EXTM3U&#10;#EXTINF:-1 tvg-id=&quot;...&quot; tvg-logo=&quot;...&quot; group-title=&quot;News&quot;,Channel Name&#10;https://domain.com/live/stream.m3u8"
                      className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-lg text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
                    />
                  </div>
                )}

                {/* Ingestion Parameters */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-white/[0.02] border border-white/5 rounded-xl">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Import Destination Mode
                    </label>
                    <select
                      value={importMode}
                      onChange={(e) => setImportMode(e.target.value as any)}
                      aria-label="Import Destination Mode"
                      className="w-full px-3 py-1.5 bg-[#141824] border border-white/10 rounded-lg text-xs text-white"
                    >
                      <option value="append">Append to existing channels</option>
                      <option value="replace">Replace all existing channels</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Default Category Fallback
                    </label>
                    <select
                      value={defaultCategory}
                      onChange={(e) => setDefaultCategory(e.target.value as Category)}
                      aria-label="Default Category Fallback"
                      className="w-full px-3 py-1.5 bg-[#141824] border border-white/10 rounded-lg text-xs text-white"
                    >
                      <option value="Kosovo">Kosovo</option>
                      <option value="Albania">Albania</option>
                      <option value="Germany">Germany</option>
                      <option value="News">News</option>
                      <option value="Sports">Sports</option>
                      <option value="Movies">Movies</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={autoDetectCategory}
                        onChange={(e) => setAutoDetectCategory(e.target.checked)}
                        className="rounded border-white/20 bg-black/40 text-rose-600 focus:ring-0"
                      />
                      <span>Auto-classify categories from group titles</span>
                    </label>
                  </div>
                </div>

                {importError && (
                  <div className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{importError}</span>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleParseM3U}
                    disabled={importLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    {importLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileText className="w-4 h-4" />
                    )}
                    <span>Parse & Preview Playlist</span>
                  </button>
                </div>

                {/* Preview Results */}
                {importPreview && (
                  <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          Successfully parsed {importPreview.total} channels across{' '}
                          {importPreview.groups.length} groups
                        </span>
                      </div>
                      <button
                        onClick={handleConfirmImport}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-md transition-colors cursor-pointer"
                      >
                        Confirm & Save Import
                      </button>
                    </div>

                    <div className="max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-black/40 p-2 text-xs font-mono space-y-1">
                      {importPreview.channels.slice(0, 15).map((ch, idx) => (
                        <div key={idx} className="flex justify-between text-slate-300 py-0.5 border-b border-white/5">
                          <span className="truncate max-w-sm">{ch.name}</span>
                          <span className="text-rose-400">{ch.category}</span>
                        </div>
                      ))}
                      {importPreview.total > 15 && (
                        <div className="text-slate-500 text-center py-1">
                          ... and {importPreview.total - 15} more channels
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Export & Backups */}
            {activeTab === 'export' && (
              <div className="flex-1 p-6 overflow-y-auto space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-white mb-1">Backup & Playlist Export</h3>
                  <p className="text-xs text-slate-400">
                    Export your current active channels as an M3U playlist file for IPTV players or download a full JSON backup.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-5 bg-white/[0.03] border border-white/10 rounded-xl space-y-3">
                    <div className="flex items-center gap-2.5 text-white font-semibold text-sm">
                      <FileText className="w-5 h-5 text-rose-500" />
                      <span>Download M3U Playlist</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Generates a standard `.m3u` playlist containing channel metadata, groups, logos, and authorized stream URLs.
                    </p>
                    <button
                      onClick={handleDownloadM3U}
                      className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download .m3u File</span>
                    </button>
                  </div>

                  <div className="p-5 bg-white/[0.03] border border-white/10 rounded-xl space-y-3">
                    <div className="flex items-center gap-2.5 text-white font-semibold text-sm">
                      <Download className="w-5 h-5 text-cyan-400" />
                      <span>Download JSON Snapshot</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Download complete structured configuration backup including custom orders, descriptions, and categories.
                    </p>
                    <button
                      onClick={handleDownloadJSON}
                      className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download .json Backup</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-white/10 bg-[#121622] flex items-center justify-between text-xs text-slate-400">
          <span>ReneeTV Live Administrator Management</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-lg font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Add / Edit Channel Modal */}
      {isNewChannelModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#121622] border border-white/10 rounded-xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white">
                {editingChannel ? 'Edit Channel Details' : 'Add New Channel'}
              </h3>
              <button
                onClick={() => {
                  setIsNewChannelModalOpen(false);
                  setEditingChannel(null);
                }}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const formData = new FormData(form);

                const name = (formData.get('name') as string)?.trim();
                const rawStreamUrl = streamUrlInput.trim();
                const logoUrl = (formData.get('logoUrl') as string)?.trim();
                const category = (formData.get('category') as Category) || 'Other';
                const groupTitle = (formData.get('groupTitle') as string)?.trim();
                const resolution = (formData.get('resolution') as string)?.trim() || '1080p';
                const currentProgram = (formData.get('currentProgram') as string)?.trim();

                if (!name || !rawStreamUrl) {
                  alert('Channel name and stream URL are required.');
                  return;
                }

                // URL Validation Step: Must return a valid HLS manifest before saving
                let targetUrl = rawStreamUrl;
                if (validationStatus !== 'valid' && !bypassValidation) {
                  const isValid = await handleValidateStream(rawStreamUrl);
                  if (!isValid) {
                    // Block saving
                    return;
                  }
                  if (validationResult?.normalizedUrl) {
                    targetUrl = validationResult.normalizedUrl;
                  }
                } else if (validationResult?.normalizedUrl) {
                  targetUrl = validationResult.normalizedUrl;
                }

                handleSaveChannelModal({
                  name,
                  streamUrl: targetUrl,
                  logoUrl,
                  category,
                  groupTitle,
                  resolution,
                  currentProgram,
                });
              }}
              className="space-y-3.5 text-xs"
            >
              <div>
                <label className="block text-slate-300 font-medium mb-1">Channel Name *</label>
                <input
                  name="name"
                  defaultValue={editingChannel?.name || ''}
                  required
                  placeholder="e.g. Pristina 1 HD"
                  className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white"
                />
              </div>

              {/* Stream URL with Manifest Validator */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-slate-300 font-medium">
                    HLS Stream URL (.m3u8) *
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Must return valid #EXTM3U manifest
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="url"
                    value={streamUrlInput}
                    onChange={(e) => {
                      setStreamUrlInput(e.target.value);
                      setValidationStatus('idle');
                      setValidationResult(null);
                    }}
                    required
                    placeholder="https://domain.com/live/stream.m3u8"
                    className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded-lg font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500"
                  />

                  <button
                    type="button"
                    onClick={() => handleValidateStream()}
                    disabled={validationStatus === 'validating' || !streamUrlInput.trim()}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold text-xs transition-all cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40 ${
                      validationStatus === 'valid'
                        ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
                        : validationStatus === 'invalid'
                        ? 'bg-rose-950/60 border border-rose-500/40 text-rose-300'
                        : 'bg-white/10 hover:bg-white/15 text-white'
                    }`}
                  >
                    {validationStatus === 'validating' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : validationStatus === 'valid' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : validationStatus === 'invalid' ? (
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <Activity className="w-3.5 h-3.5 text-cyan-400" />
                    )}
                    <span>
                      {validationStatus === 'validating'
                        ? 'Checking...'
                        : validationStatus === 'valid'
                        ? 'Verified'
                        : validationStatus === 'invalid'
                        ? 'Re-validate'
                        : 'Validate Link'}
                    </span>
                  </button>
                </div>

                {/* Validation Status Container */}
                {validationStatus === 'validating' && (
                  <div className="p-2.5 rounded-lg bg-cyan-950/20 border border-cyan-500/20 text-cyan-300 text-xs flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin shrink-0 text-cyan-400" />
                    <span>Connecting to stream server and verifying HLS (#EXTM3U) manifest type...</span>
                  </div>
                )}

                {validationStatus === 'valid' && validationResult && (
                  <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-emerald-200 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Valid HLS Manifest Confirmed</span>
                    </div>
                    <div className="text-[11px] text-emerald-300/80 font-mono space-y-0.5 pt-1">
                      <div>Type: {validationResult.playlistType || 'HLS Stream'}</div>
                      {validationResult.targetDuration && (
                        <div>Target Segment Duration: {validationResult.targetDuration}s</div>
                      )}
                      {validationResult.segmentCount !== undefined && (
                        <div>Active Segments: {validationResult.segmentCount}</div>
                      )}
                      {validationResult.variantCount !== undefined && (
                        <div>Bitrate Variants: {validationResult.variantCount}</div>
                      )}
                      {validationResult.contentType && (
                        <div>MIME: {validationResult.contentType}</div>
                      )}
                    </div>
                  </div>
                )}

                {validationStatus === 'invalid' && validationResult && (
                  <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs space-y-2">
                    <div className="flex items-center gap-1.5 font-semibold text-rose-300">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>Validation Failed — Not a Valid HLS Manifest</span>
                    </div>
                    <p className="text-[11px] text-rose-300/90 leading-relaxed">
                      {validationResult.error}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Saving is blocked until the URL returns a valid #EXTM3U playlist manifest.
                    </p>
                    <label className="flex items-center gap-2 cursor-pointer pt-1 text-[11px] text-slate-300">
                      <input
                        type="checkbox"
                        checked={bypassValidation}
                        onChange={(e) => setBypassValidation(e.target.checked)}
                        className="rounded border-white/20 bg-black/40 text-rose-600 focus:ring-0"
                      />
                      <span>Bypass validation (force save offline/scheduled feed)</span>
                    </label>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Category</label>
                <select
                  name="category"
                  defaultValue={editingChannel?.category || 'Kosovo'}
                  className="w-full px-3 py-2 bg-[#161a27] border border-white/10 rounded-lg text-white"
                >
                  <option value="Kosovo">Kosovo</option>
                  <option value="Albania">Albania</option>
                  <option value="Germany">Germany</option>
                  <option value="News">News</option>
                  <option value="Sports">Sports</option>
                  <option value="Movies">Movies</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Logo URL (Optional)</label>
                <input
                  name="logoUrl"
                  type="url"
                  defaultValue={editingChannel?.logoUrl || ''}
                  placeholder="https://.../logo.png"
                  className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Resolution Tag</label>
                  <input
                    name="resolution"
                    defaultValue={editingChannel?.resolution || '1080p'}
                    placeholder="1080p, 4K, 720p"
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">M3U Group Title</label>
                  <input
                    name="groupTitle"
                    defaultValue={editingChannel?.groupTitle || ''}
                    placeholder="Group Title"
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Current Program / EPG</label>
                <input
                  name="currentProgram"
                  defaultValue={editingChannel?.currentProgram || ''}
                  placeholder="e.g. Evening News Live"
                  className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-white/10">
                <span className="text-[11px] text-slate-400">
                  {validationStatus === 'valid'
                    ? '✓ Ready to save'
                    : validationStatus === 'invalid' && !bypassValidation
                    ? '⚠ Valid M3U8 manifest required'
                    : 'Click save to validate and store'}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewChannelModalOpen(false);
                      setEditingChannel(null);
                    }}
                    className="px-3.5 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg cursor-pointer shadow-md flex items-center gap-1.5"
                  >
                    <span>Save Channel</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
