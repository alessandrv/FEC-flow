"use client";

import React, { useState } from "react";
import { Card, CardHeader, CardBody, Button, Textarea, Chip, Select, SelectItem } from "@heroui/react";
import { Send, User as UserIcon, Square } from "lucide-react";
import { User } from "../../services/teams-auth";
import { useTeamsAuth } from "../providers/teams-auth";
import { UserSearch } from "./user-search";
import { useGroups } from "../providers";

export const TeamsMessageTester: React.FC = () => {
  const { isLoggedIn, sendNotification, sendAdaptiveCardMessage, searchUsers } = useTeamsAuth();
  const { groups, loading: groupsLoading } = useGroups();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("Hello from Flow Creator!");
  const [isSending, setIsSending] = useState<boolean>(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const onSelectUser = (user: User | null) => {
    setSelectedUser(user);
    if (user) setSelectedGroupId(null);
  };

  const resolveMemberIds = async (members: Array<{ name: string; email: string; id?: string }>): Promise<string[]> => {
    const ids: string[] = [];
    for (const m of members) {
      if (m.id) {
        ids.push(m.id);
        continue;
      }
      try {
        const found = await searchUsers(m.email);
        const exact = found.find(u => (u.mail?.toLowerCase() === m.email.toLowerCase()) || (u.userPrincipalName?.toLowerCase() === m.email.toLowerCase()));
        if (exact) ids.push(exact.id);
      } catch (e) {
        console.warn("Failed to resolve member by email:", m.email, e);
      }
    }
    return Array.from(new Set(ids));
  };

  const handleSendNotification = async () => {
    if (!message.trim()) return;
    setIsSending(true);
    setResult(null);
    try {
      if (selectedGroupId) {
        const group = groups.find(g => g.id === selectedGroupId);
        if (!group) throw new Error("Group not found");
        const ids = await resolveMemberIds(group.members);
        let ok = 0;
        for (const id of ids) {
          try {
            await sendNotification(id, message.trim());
            ok++;
          } catch (e) {
            console.error("Send notification failed for", id, e);
          }
        }
        setResult({ ok: ok > 0, text: `Notification sent to ${ok}/${ids.length} members.` });
      } else if (selectedUser) {
        await sendNotification(selectedUser.id, message.trim());
        setResult({ ok: true, text: "Activity notification sent." });
      }
    } catch (err: any) {
      const text = err?.message || "Failed to send notification";
      setResult({ ok: false, text });
    } finally {
      setIsSending(false);
    }
  };

  const handleSendAdaptive = async () => {
    if (!message.trim()) return;
    setIsSending(true);
    setResult(null);
    try {
      if (selectedGroupId) {
        const group = groups.find(g => g.id === selectedGroupId);
        if (!group) throw new Error("Group not found");
        const ids = await resolveMemberIds(group.members);
        let ok = 0;
        for (const id of ids) {
          try {
            await sendAdaptiveCardMessage(id, message.trim(), 'Flow Creator');
            ok++;
          } catch (e) {
            console.error("Send adaptive card failed for", id, e);
          }
        }
        setResult({ ok: ok > 0, text: `Adaptive Card sent to ${ok}/${ids.length} members.` });
      } else if (selectedUser) {
        await sendAdaptiveCardMessage(selectedUser.id, message.trim(), 'Flow Creator');
        setResult({ ok: true, text: "Adaptive Card sent to chat." });
      }
    } catch (err: any) {
      const text = err?.message || "Failed to send Adaptive Card";
      setResult({ ok: false, text });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex gap-2 items-center">
        <UserIcon className="w-4 h-4" />
        <div className="font-medium">Send a Teams test message</div>
        {result && (
          <Chip size="sm" color={result.ok ? "success" : "danger"} variant="flat" className="ml-auto">
            {result.text}
          </Chip>
        )}
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        {/* Group selector (app-defined) */}
        <Select
          label="Group"
          placeholder="Select a group to broadcast..."
          selectedKeys={selectedGroupId ? new Set([selectedGroupId]) : new Set()}
          onSelectionChange={(keys) => {
            const id = Array.from(keys as Set<string>)[0] ?? null;
            setSelectedGroupId(id);
            if (id) setSelectedUser(null);
          }}
          isLoading={groupsLoading}
        >
          {groups.map(g => (
            <SelectItem key={g.id}>{g.name} ({g.members.length})</SelectItem>
          ))}
        </Select>

        {/* Individual user search (optional if no group selected) */}
        {!selectedGroupId && (
          <UserSearch
            onUserSelect={onSelectUser}
            selectedUsers={selectedUser ? [selectedUser] : []}
            placeholder="Search and select a user..."
            multiple={false}
          />
        )}

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
            isDisabled={!isLoggedIn || isSending || !message.trim() || (!selectedGroupId && !selectedUser)}
            isLoading={isSending}
            onPress={handleSendAdaptive}
          >
            Send adaptive card
          </Button>
          <Button
            color="primary"
            startContent={<Send className="w-4 h-4" />}
            isDisabled={!isLoggedIn || isSending || !message.trim() || (!selectedGroupId && !selectedUser)}
            isLoading={isSending}
            onPress={handleSendNotification}
          >
            Send notification
          </Button>
        </div>
      </CardBody>
    </Card>
  );
};

export default TeamsMessageTester;
