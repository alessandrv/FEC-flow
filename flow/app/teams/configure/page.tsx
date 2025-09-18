"use client";

import { useEffect, useState } from 'react';
import * as microsoftTeams from '@microsoft/teams-js';

export default function TeamsConfigureTab() {
  const [flowId, setFlowId] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        await microsoftTeams.app.initialize();
        setReady(true);
        microsoftTeams.pages.config.registerOnSaveHandler(async (saveEvent) => {
          try {
            const origin = window.location.origin;
            const contentUrl = `${origin}/`;
            microsoftTeams.pages.config.setConfig({
              entityId: 'flowcreator-channel',
              contentUrl,
              websiteUrl: contentUrl,
              suggestedDisplayName: 'Flow Creator',
            });
            saveEvent.notifySuccess();
          } catch (e) {
            // If config fails, notify failure
            // @ts-ignore
            saveEvent.notifyFailure(e?.message || 'Failed to save configuration');
          }
        });
        microsoftTeams.pages.config.setValidityState(true);
      } catch (e) {
        console.warn('Teams init failed for config page:', e);
      }
    }
    init();
  }, [flowId]);

  return (
    <div style={{ padding: 16 }}>
      <h2>Configure Flow Creator tab</h2>
      <p>Select a specific Flow ID to open by default (optional).</p>
      <input
        type="text"
        placeholder="Flow ID (optional)"
        value={flowId}
        onChange={(e) => setFlowId(e.target.value)}
        style={{ width: '100%', maxWidth: 400, padding: 8 }}
      />
      {!ready && <p>Initializing Teams…</p>}
    </div>
  );
}
