"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardBody, Button, Textarea, Chip, Select, SelectItem } from "@heroui/react";
import { Users, Send, Square } from "lucide-react";
import { useTeamsAuth } from "../providers/teams-auth";
import { useGroups } from "../providers";

export const GroupBroadcastTester: React.FC = () => {
  const { isLoggedIn, sendNotification, sendAdaptiveCardMessage, searchUsers } = useTeamsAuth();
  const { groups, loading: groupsLoading } = useGroups();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("Hello from Flow Creator!");
  const [isSending, setIsSending] = useState<boolean>(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const resolveMemberIds = async (
    members: Array<{ name: string; email: string; id?: string }>
  ): Promise<string[]> => {
    const ids: string[] = [];
    for (const m of members) {
      if (m.id) {
        ids.push(m.id);
        continue;
      }
      try {
        const found = await searchUsers(m.email);
        const exact = found.find(
          (u) =>
            u.mail?.toLowerCase() === m.email.toLowerCase() ||
            u.userPrincipalName?.toLowerCase() === m.email.toLowerCase()
        );
        if (exact) ids.push(exact.id);
      } catch (e) {
        console.warn("Failed to resolve member by email:", m.email, e);
      }
    }
    return Array.from(new Set(ids));
  };

  const handleSend = async (adaptive = false) => {
    if (!message.trim() || !selectedGroupId) return;
    setIsSending(true);
    setResult(null);
    try {
      const group = groups.find((g) => g.id === selectedGroupId);
      if (!group) throw new Error("Group not found");
      const ids = await resolveMemberIds(group.members);
      let ok = 0;
      for (const id of ids) {
        try {
          if (adaptive) {
            await sendAdaptiveCardMessage(id, message.trim(), "Flow Creator");
          } else {
            await sendNotification(id, message.trim());
          }
          ok++;
        } catch (e) {
          console.error("Send to member failed", id, e);
        }
      }
      setResult({
        ok: ok > 0,
        text: `${adaptive ? "Adaptive Card" : "Notification"} sent to ${ok}/${ids.length} members.`,
      });
    } catch (err: any) {
      const text = err?.message || `Failed to send ${adaptive ? "Adaptive Card" : "notification"}`;
      setResult({ ok: false, text });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex gap-2 items-center">
        <Users className="w-4 h-4" />
        <div className="font-medium">Broadcast to an app-defined group</div>
        {result && (
          <Chip size="sm" color={result.ok ? "success" : "danger"} variant="flat" className="ml-auto">
            {result.text}
          </Chip>
        )}
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <Select
          label="Group"
          placeholder="Select a group to broadcast..."
          selectedKeys={selectedGroupId ? new Set([selectedGroupId]) : new Set()}
          onSelectionChange={(keys) => {
            const id = Array.from(keys as Set<string>)[0] ?? null;
            setSelectedGroupId(id);
          }}
          isLoading={groupsLoading}
        >
          {groups.map((g) => (
            <SelectItem key={g.id}>
              {g.name} ({g.members.length})
            </SelectItem>
          ))}
        </Select>

        <Textarea
          label="Message"
          value={message}
          onValueChange={setMessage}
          placeholder="Type a message to send via Teams..."
          minRows={2}
        />

        <div className="flex justify-end gap-2">
          <Button
            variant="flat"
            startContent={<Square className="w-4 h-4" />}
            isDisabled={!isLoggedIn || isSending || !message.trim() || !selectedGroupId}
            isLoading={isSending}
            onPress={() => handleSend(true)}
          >
            Send adaptive card
          </Button>
          <Button
            color="primary"
            startContent={<Send className="w-4 h-4" />}
            isDisabled={!isLoggedIn || isSending || !message.trim() || !selectedGroupId}
            isLoading={isSending}
            onPress={() => handleSend(false)}
          >
            Send notification
          </Button>
        </div>
      </CardBody>
    </Card>
  );
};

export default GroupBroadcastTester;
