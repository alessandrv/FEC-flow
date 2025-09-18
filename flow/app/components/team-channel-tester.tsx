"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardBody, Button, Textarea, Chip, Select, SelectItem } from '@heroui/react';
import { Hash, Send, Square } from 'lucide-react';
import { useTeamsAuth } from '../providers/teams-auth';

export const TeamChannelTester: React.FC = () => {
  const { isLoggedIn, getUserTeams, getTeamChannels, sendChannelMessage, sendChannelAdaptiveCard } = useTeamsAuth();
  const [teams, setTeams] = useState<Array<{ id: string; displayName: string }>>([]);
  const [channels, setChannels] = useState<Array<{ id: string; displayName: string }>>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>('Hello team from Flow Creator!');
  const [isLoadingTeams, setIsLoadingTeams] = useState<boolean>(false);
  const [isLoadingChannels, setIsLoadingChannels] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!isLoggedIn) return;
      setIsLoadingTeams(true);
      try {
        const list = await getUserTeams();
        setTeams(list);
      } catch (err: any) {
        console.error('Failed to load teams', err);
      } finally {
        setIsLoadingTeams(false);
      }
    };
    load();
  }, [isLoggedIn, getUserTeams]);

  useEffect(() => {
    const loadChannels = async () => {
      if (!selectedTeamId) return;
      setIsLoadingChannels(true);
      try {
        const list = await getTeamChannels(selectedTeamId);
        setChannels(list);
      } catch (err: any) {
        console.error('Failed to load channels', err);
      } finally {
        setIsLoadingChannels(false);
      }
    };
    loadChannels();
  }, [selectedTeamId, getTeamChannels]);

  const onSend = async (adaptive = false) => {
    if (!selectedTeamId || !selectedChannelId || !message.trim()) return;
    setIsSending(true);
    setResult(null);
    try {
      if (adaptive) {
        await sendChannelAdaptiveCard(selectedTeamId, selectedChannelId, message.trim(), 'Flow Creator');
      } else {
        await sendChannelMessage(selectedTeamId, selectedChannelId, message.trim(), 'Flow Creator');
      }
      setResult({ ok: true, text: adaptive ? 'Adaptive Card sent to channel.' : 'Message sent to channel.' });
    } catch (err: any) {
      setResult({ ok: false, text: err?.message || 'Failed to send message' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex gap-2 items-center">
        <Hash className="w-4 h-4" />
        <div className="font-medium">Send a message to a Team channel</div>
        {result && (
          <Chip size="sm" color={result.ok ? 'success' : 'danger'} variant="flat" className="ml-auto">
            {result.text}
          </Chip>
        )}
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Select
            label="Team"
            selectedKeys={selectedTeamId ? new Set([selectedTeamId]) : new Set()}
            onSelectionChange={(keys) => {
              const id = Array.from(keys as Set<string>)[0] ?? null;
              setSelectedTeamId(id);
              setSelectedChannelId(null);
              setChannels([]);
            }}
            isLoading={isLoadingTeams}
            placeholder="Select a team"
          >
            {teams.map(t => (
              <SelectItem key={t.id}>{t.displayName}</SelectItem>
            ))}
          </Select>
          <Select
            label="Channel"
            selectedKeys={selectedChannelId ? new Set([selectedChannelId]) : new Set()}
            onSelectionChange={(keys) => {
              const id = Array.from(keys as Set<string>)[0] ?? null;
              setSelectedChannelId(id);
            }}
            isLoading={isLoadingChannels}
            placeholder="Select a channel"
            isDisabled={!selectedTeamId}
          >
            {channels.map(c => (
              <SelectItem key={c.id}>{c.displayName}</SelectItem>
            ))}
          </Select>
        </div>

        <Textarea
          label="Message"
          value={message}
          onValueChange={setMessage}
          placeholder="Type a message to send to the selected channel..."
          minRows={2}
        />

        <div className="flex justify-end gap-2">
          <Button
            variant="flat"
            startContent={<Square className="w-4 h-4" />}
            isDisabled={!isLoggedIn || !selectedTeamId || !selectedChannelId || isSending || !message.trim()}
            isLoading={isSending}
            onPress={() => onSend(true)}
          >
            Send adaptive card
          </Button>
          <Button
            color="primary"
            startContent={<Send className="w-4 h-4" />}
            isDisabled={!isLoggedIn || !selectedTeamId || !selectedChannelId || isSending || !message.trim()}
            isLoading={isSending}
            onPress={() => onSend(false)}
          >
            Send message
          </Button>
        </div>
      </CardBody>
    </Card>
  );
};

export default TeamChannelTester;
