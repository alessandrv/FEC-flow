"use client"

import { useState } from "react"
import { Plus, X, Users, Mail, Palette, Pencil, UserCheck, UserPlus } from "lucide-react"
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Input,
  Chip,
  Switch,
  Divider,
} from "@heroui/react"
import { useGroups } from "../providers"
import { apiService } from "../services/api"
import { UserSearch } from "./user-search"
import { useTeamsAuth } from "../providers/teams-auth"
import { User } from "../../services/teams-auth"
import type { Team } from "../../services/teams-auth"
import { useTranslation } from "../hooks/useTranslation"

interface GroupManagementProps {
  isOpen: boolean
  onClose: () => void
}

const colorOptions = [
  { name: "groups.colors.blue", value: "primary" },
  { name: "groups.colors.green", value: "success" },
  { name: "groups.colors.purple", value: "secondary" },
  { name: "groups.colors.red", value: "danger" },
  { name: "groups.colors.orange", value: "warning" },
  { name: "groups.colors.yellow", value: "yellow" },
  { name: "groups.colors.pink", value: "pink" },
  { name: "groups.colors.indigo", value: "indigo" },
  { name: "groups.colors.emerald", value: "emerald" },
  { name: "groups.colors.rose", value: "rose" },
  { name: "groups.colors.cyan", value: "cyan" },
  { name: "groups.colors.gray", value: "default" },
]

export default function GroupManagement({ isOpen, onClose }: GroupManagementProps) {
  const { t } = useTranslation()
  const { groups, refreshGroups } = useGroups()
  const { isLoggedIn, sendNotification, getUserTeams } = useTeamsAuth()
  const [editingGroup, setEditingGroup] = useState<any>(null)
  const [isCreateMode, setIsCreateMode] = useState(false)
  const [groupName, setGroupName] = useState("")
  const [groupColor, setGroupColor] = useState("primary")
  const [acceptAny, setAcceptAny] = useState<boolean>(false)
  const [members, setMembers] = useState<Array<{ name: string; email: string; id?: string }>>([])
  const [newMemberName, setNewMemberName] = useState("")
  const [newMemberEmail, setNewMemberEmail] = useState("")
  // Team selection for Planner tasks
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [isLoadingTeams, setIsLoadingTeams] = useState(false)
  const [isTeamPickerOpen, setIsTeamPickerOpen] = useState(false)
  const [teamQuery, setTeamQuery] = useState("")
  const filteredTeams = teams.filter(t => (t.displayName || '').toLowerCase().includes(teamQuery.toLowerCase()))

  const startCreateGroup = () => {
    setIsCreateMode(true)
    setEditingGroup(null)
    setGroupName("")
    setGroupColor("primary")
  setAcceptAny(false)
    setMembers([])
    setNewMemberName("")
    setNewMemberEmail("")
  setSelectedTeam(null)
  }

  const startEditGroup = (group: any) => {
    setIsCreateMode(false)
    setEditingGroup(group)
    setGroupName(group.name)
    setGroupColor(group.color)
  setAcceptAny(!!group.accept_any)
    setMembers([...group.members])
    setNewMemberName("")
    setNewMemberEmail("")
    // Preselect team from group if present and available in cache
    if (group.team_id && teams.length) {
      const t = teams.find(t => t.id === group.team_id) || null
      setSelectedTeam(t)
    } else {
      setSelectedTeam(group.team_id ? ({ id: group.team_id, displayName: 'Selected Team', description: '', webUrl: '' } as Team) : null)
    }
  }

  const handleUserSelect = (user: User) => {
    const newMember = {
      name: user.displayName,
      email: user.mail || user.userPrincipalName,
      id: user.id,
    }
    
    // Check if user is already added
    const isAlreadyAdded = members.some(member => 
      member.email === newMember.email || (member.id && member.id === newMember.id)
    )
    
    if (!isAlreadyAdded) {
      setMembers([...members, newMember])
    }
  }

  const addManualMember = () => {
    if (!newMemberName.trim() || !newMemberEmail.trim()) return

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newMemberEmail)) {
      alert(t("groups.validEmailRequired"))
      return
    }

    const newMember = { name: newMemberName.trim(), email: newMemberEmail.trim() }
    
    // Check if user is already added
    const isAlreadyAdded = members.some(member => member.email === newMember.email)
    
    if (!isAlreadyAdded) {
      setMembers([...members, newMember])
      setNewMemberName("")
      setNewMemberEmail("")
    } else {
      alert(t("groups.userAlreadyAdded"))
    }
  }

  const removeMember = (index: number) => {
    setMembers(members.filter((_, i) => i !== index))
  }

  const saveGroup = async () => {
    if (!groupName.trim()) {
      alert(t("groups.groupNameRequired"))
      return
    }

    if (members.length === 0) {
      alert(t("groups.atLeastOneMemberRequired"))
      return
    }

    const groupData = {
      name: groupName.trim(),
      color: groupColor,
      accept_any: acceptAny,
  team_id: selectedTeam?.id || null,
      members: [...members],
    }

    try {
      if (isCreateMode) {
        await apiService.createGroup(groupData)
      } else {
        await apiService.updateGroup(editingGroup!.id, groupData)
      }
      
      // Refresh groups from context
      await refreshGroups()
      cancelEdit()
    } catch (error) {
      console.error('Failed to save group:', error)
      alert(t("groups.saveGroupFailed"))
    }
  }

  const deleteGroup = async (groupId: string) => {
    if (confirm(t("groups.deleteGroupConfirm"))) {
      try {
        await apiService.deleteGroup(groupId)
        // Refresh groups from context
        await refreshGroups()
      } catch (error) {
        console.error('Failed to delete group:', error)
        alert(t("groups.deleteGroupFailed"))
      }
    }
  }

  const cancelEdit = () => {
    setEditingGroup(null)
    setIsCreateMode(false)
    setGroupName("")
    setGroupColor("primary")
  setAcceptAny(false)
    setMembers([])
    setNewMemberName("")
    setNewMemberEmail("")
  setSelectedTeam(null)
  }

  const notifyGroup = async (group: any) => {
    if (!isLoggedIn) {
      alert(t("groups.loginToSendNotifications"))
      return
    }

    const message = t("groups.notificationMessage")
    
    try {
      for (const member of group.members) {
        if (member.id) {
          await sendNotification(member.id, message)
        }
      }
      alert(t("groups.notificationSent", { count: group.members.length }))
    } catch (error) {
      console.error('Failed to send notifications:', error)
      alert(t("groups.notificationFailed"))
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="5xl"
      scrollBehavior="inside"
      classNames={{
        base: "max-h-[90vh]",
        body: "py-6",
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            <span>{t("groups.manage")}</span>
          </div>
          <p className="text-sm text-default-500 font-normal">
            {t("groups.description")}
          </p>
        </ModalHeader>
        <ModalBody>
          {!isLoggedIn ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-16 h-16 text-default-300 mb-4" />
              <h3 className="text-lg font-semibold text-default-600 mb-2">{t("groups.teamsIntegrationRequired")}</h3>
              <p className="text-default-500 mb-6 max-w-md">
                {t("groups.teamsIntegrationDescription")}
              </p>
              <div className="p-4 bg-warning-50 border border-warning-200 rounded-lg max-w-md">
                <p className="text-sm text-warning-700">
                  {t("groups.teamsLoginRequired")}
                </p>
              </div>
            </div>
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Groups List */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">{t("groups.title")}</h3>
                <Button
                  onPress={startCreateGroup}
                  size="sm"
                  color="primary"
                  startContent={<Plus className="w-4 h-4" />}
                >
                  {t("groups.newGroup")}
                </Button>
              </div>

              <div className="bg-white space-y-3 max-h-96 overflow-y-auto">
                {groups.map((group) => (
                  <Card key={group.id} className="cursor-pointer shadow-none transition-shadow">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start w-full">
                        <div className="flex items-center gap-2">
                          {["yellow", "pink", "indigo", "emerald", "rose", "cyan"].includes(group.color) ? (
                            <div 
                              className={`w-3 h-3 rounded-full ${
                                group.color === "yellow" ? "bg-yellow-400" :
                                group.color === "pink" ? "bg-pink-400" :
                                group.color === "indigo" ? "bg-indigo-400" :
                                group.color === "emerald" ? "bg-emerald-400" :
                                group.color === "rose" ? "bg-rose-400" :
                                "bg-cyan-400"
                              }`}
                            />
                          ) : (
                            <Chip size="sm" color={group.color as any} variant="dot" />
                          )}
                          <span className="font-medium">{group.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                       
                          <Button
                            isIconOnly
                            variant="light"
                            size="sm"
                            onPress={() => startEditGroup(group)}
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>
                          <Button
                            isIconOnly
                            variant="light"
                            size="sm"
                            color="danger"
                            onPress={() => deleteGroup(group.id)}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardBody className="pt-0">
                      <div className="flex items-center gap-2 text-sm text-default-500">
                        <Users className="w-3 h-3" />
                        <span>{t("groups.membersCount", { count: group.members.length })}</span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {group.members.slice(0, 2).map((member: any, index: number) => (
                          <div key={index} className="text-xs text-default-600">
                            {member.name} ({member.email})
                          </div>
                        ))}
                        {group.members.length > 2 && (
                          <div className="text-xs text-default-400">
                            {t("groups.moreMembers", { count: group.members.length - 2 })}
                          </div>
                        )}
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            </div>

            {/* Group Editor */}
            <div className="space-y-4">
              {editingGroup || isCreateMode ? (
                <>
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">{isCreateMode ? t("groups.createNewGroup") : t("groups.editGroup")}</h3>
                    <Button variant="light" onPress={cancelEdit} isIconOnly>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <Input
                      label={t("groups.groupName")}
                      value={groupName}
                      onValueChange={setGroupName}
                      placeholder={t("groups.enterGroupName")}
                    />

                    

                    <div>
                      <label className="text-sm font-medium flex items-center gap-2 mb-2">
                        <Palette className="w-4 h-4" />
                        {t("groups.groupColor")}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {colorOptions.map((color) => (
                          <Button
                            key={color.value}
                            isIconOnly
                            size="sm"
                            color={color.value === "yellow" || color.value === "pink" ? "default" : (color.value as any)}
                            variant={groupColor === color.value ? "solid" : "bordered"}
                            onPress={() => setGroupColor(color.value)}
                            title={t(color.name)}
                            className={
                              ["yellow", "pink", "teal", "indigo", "emerald", "rose", "amber", "cyan", "violet"].includes(color.value)
                                ? `${
                                    groupColor === color.value
                                      ? color.value === "yellow" ? "bg-yellow-400 text-yellow-900 border-yellow-500" :
                                        color.value === "pink" ? "bg-pink-400 text-pink-900 border-pink-500" :
                                        color.value === "teal" ? "bg-teal-400 text-teal-900 border-teal-500" :
                                        color.value === "indigo" ? "bg-indigo-400 text-indigo-900 border-indigo-500" :
                                        color.value === "emerald" ? "bg-emerald-400 text-emerald-900 border-emerald-500" :
                                        color.value === "rose" ? "bg-rose-400 text-rose-900 border-rose-500" :
                                        color.value === "amber" ? "bg-amber-400 text-amber-900 border-amber-500" :
                                        color.value === "cyan" ? "bg-cyan-400 text-cyan-900 border-cyan-500" :
                                        "bg-violet-400 text-violet-900 border-violet-500"
                                      : `border-2 ${
                                          color.value === "yellow" ? "border-yellow-400 text-yellow-600" :
                                          color.value === "pink" ? "border-pink-400 text-pink-600" :
                                          color.value === "teal" ? "border-teal-400 text-teal-600" :
                                          color.value === "indigo" ? "border-indigo-400 text-indigo-600" :
                                          color.value === "emerald" ? "border-emerald-400 text-emerald-600" :
                                          color.value === "rose" ? "border-rose-400 text-rose-600" :
                                          color.value === "amber" ? "border-amber-400 text-amber-600" :
                                          color.value === "cyan" ? "border-cyan-400 text-cyan-600" :
                                          "border-violet-400 text-violet-600"
                                        }`
                                  }`
                                : ""
                            }
                          />
                        ))}
                      </div>
                    </div>

                    <Divider />

                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <UserCheck className="w-4 h-4" />
                        {t("groups.canActOnAnyNode")}
                      </label>
                      <Switch isSelected={acceptAny} onValueChange={setAcceptAny} />
                    </div>

                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between mb-4">
                        <label className="text-sm font-medium">{t("groups.addMembers")}</label>
                      </div>

                      <div className="space-y-3">
                        <UserSearch
                          onUserSelect={handleUserSelect}
                          selectedUsers={members.filter(m => m.id).map(m => ({ 
                            id: m.id!, 
                            displayName: m.name, 
                            mail: m.email,
                            userPrincipalName: m.email
                          }))}
                          placeholder={t("groups.searchUsers")}
                        />
                        <div className="text-xs text-default-500 flex items-center gap-1">
                          <UserCheck className="w-3 h-3" />
                          {t("groups.searchUsersDescription")}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium">{t("groups.currentMembers")} ({members.length})</label>
                      <div className="space-y-2 mt-2 max-h-32 overflow-y-auto">
                        {members.map((member, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-default-50 rounded">
                            <div className="flex-1">
                              <div className="text-sm font-medium flex items-center gap-2">
                                {member.name}
                                {member.id && (
                                  <Chip size="sm" color="success" variant="flat">
                                    {t("groups.teamsUser")}
                                  </Chip>
                                )}
                              </div>
                              <div className="text-xs text-default-500">{member.email}</div>
                            </div>
                            <Button
                              isIconOnly
                              variant="light"
                              size="sm"
                              color="danger"
                              onPress={() => removeMember(index)}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-4 border-t">
                      <Button onPress={saveGroup} color="primary" className="flex-1">
                        {isCreateMode ? t("groups.createGroup") : t("groups.saveChanges")}
                      </Button>
                      <Button variant="bordered" onPress={cancelEdit} className="flex-1">
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-default-500">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>{t("groups.selectGroupToEdit")}</p>
                  {!isLoggedIn && (
                    <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-600">
                        {t("groups.teamsLoginToEnableFeatures")}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
