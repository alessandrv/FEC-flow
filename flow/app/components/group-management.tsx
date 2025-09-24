"use client"

import { useState } from "react"
import { Plus, X, Users, Mail, Palette, Pencil, UserCheck, UserPlus, ArrowLeft } from "lucide-react"
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
  const [currentView, setCurrentView] = useState<'list' | 'edit'>('list')
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
    setCurrentView('edit')
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
    setCurrentView('edit')
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
      setCurrentView('list')
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
    setCurrentView('list')
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

  const handleModalClose = () => {
    setCurrentView('list')
    cancelEdit()
    onClose()
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
      onClose={handleModalClose}
      size="5xl"
      scrollBehavior="inside"
      classNames={{
        base: "max-h-[90vh]",
        body: "py-6",
      }}
    >
      <ModalContent>
        {!isLoggedIn ? (
          <>
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
            </ModalBody>
          </>
        ) : currentView === 'list' ? (
          <>
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

                <div className="space-y-3 max-h-96 overflow-y-auto p-1">
                  {groups.map((group) => (
                    <Card 
                      key={group.id} 
                      isPressable
                      className="w-full m-2 border-2 border-default-200 shadow-sm transition-all duration-200 hover:shadow-md hover:border-primary-300 " 
                      onPress={() => startEditGroup(group)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start w-full">
                          <div className="flex items-center gap-2">
                            <div 
                              className={`w-3 h-3 rounded-full ${
                                group.color === "primary" ? "bg-blue-500" :
                                group.color === "success" ? "bg-green-500" :
                                group.color === "secondary" ? "bg-purple-500" :
                                group.color === "danger" ? "bg-red-500" :
                                group.color === "warning" ? "bg-orange-500" :
                                group.color === "yellow" ? "bg-yellow-400" :
                                group.color === "pink" ? "bg-pink-400" :
                                group.color === "indigo" ? "bg-indigo-400" :
                                group.color === "emerald" ? "bg-emerald-400" :
                                group.color === "rose" ? "bg-rose-400" :
                                group.color === "cyan" ? "bg-cyan-400" :
                                "bg-gray-400"
                              }`}
                            />
                            <span className="font-medium">{group.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              isIconOnly
                              variant="light"
                              size="sm"
                              onPress={() => startEditGroup(group)}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button
                              isIconOnly
                              variant="light"
                              size="sm"
                              color="danger"
                              onPress={() => deleteGroup(group.id)}
                              onClick={(e) => e.stopPropagation()}
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
            </ModalBody>
          </>
        ) : (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Button
                  variant="light"
                  isIconOnly
                  onPress={() => setCurrentView('list')}
                  className="mr-2"
                  title={t("groups.backToList")}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <Users className="w-5 h-5" />
                <span>{isCreateMode ? t("groups.createNewGroup") : t("groups.editGroup")}</span>
              </div>
              <p className="text-sm text-default-500 font-normal ml-12">
                {isCreateMode ? t("groups.description") : `${t("groups.editGroup")}: ${groupName || editingGroup?.name}`}
              </p>
            </ModalHeader>
            <ModalBody>
              <div className="space-y-6">
                {/* Group Settings Section */}
                <div className="bg-default-50 rounded-lg p-4">
                  <h4 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <Palette className="w-5 h-5" />
                    {t("groups.groupSettings")}
                  </h4>
                  
                  <div className="space-y-4">
                    <Input
                      label={t("groups.groupName")}
                      value={groupName}
                      onValueChange={setGroupName}
                      placeholder={t("groups.enterGroupName")}
                    />

                    <div>
                      <label className="text-sm font-medium flex items-center gap-2 mb-3">
                        <Palette className="w-4 h-4" />
                        {t("groups.groupColor")}
                      </label>
                      <div className="flex flex-wrap gap-3">
                        {colorOptions.map((color) => (
                          <Button
                            key={color.value}
                            isIconOnly
                            size="md"
                            variant={groupColor === color.value ? "solid" : "bordered"}
                            onPress={() => setGroupColor(color.value)}
                            title={t(color.name)}
                            className={`relative transition-all ${
                              groupColor === color.value ? "ring-2 ring-offset-2 ring-blue-500 scale-110" : ""
                            }`}
                          >
                            <div 
                              className={`w-5 h-5 rounded-full ${
                                color.value === "primary" ? "bg-blue-500" :
                                color.value === "success" ? "bg-green-500" :
                                color.value === "secondary" ? "bg-purple-500" :
                                color.value === "danger" ? "bg-red-500" :
                                color.value === "warning" ? "bg-orange-500" :
                                color.value === "yellow" ? "bg-yellow-400" :
                                color.value === "pink" ? "bg-pink-400" :
                                color.value === "indigo" ? "bg-indigo-400" :
                                color.value === "emerald" ? "bg-emerald-400" :
                                color.value === "rose" ? "bg-rose-400" :
                                color.value === "cyan" ? "bg-cyan-400" :
                                "bg-gray-400"
                              }`}
                            />
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <UserCheck className="w-4 h-4" />
                        {t("groups.canActOnAnyNode")}
                      </label>
                      <Switch isSelected={acceptAny} onValueChange={setAcceptAny} />
                    </div>
                  </div>
                </div>

                {/* Members Management Section */}
                <div className="bg-default-50 rounded-lg p-4">
                  <h4 className="font-semibold text-lg mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    {t("groups.membersManagement")} ({members.length})
                  </h4>

                  <div className="space-y-4">
                    {/* Add Members */}
                    <div className="bg-white rounded-lg p-4 border">
                      <label className="text-sm font-medium mb-3 block">{t("groups.addMembers")}</label>
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

                    {/* Current Members List */}
                    <div className="bg-white rounded-lg border">
                      <div className="p-4 border-b">
                        <label className="text-sm font-medium">{t("groups.currentMembers")}</label>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        {members.length === 0 ? (
                          <div className="p-8 text-center text-default-400">
                            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">{t("groups.noMembersYet")}</p>
                          </div>
                        ) : (
                          members.map((member, index) => (
                            <div key={index} className="flex items-center justify-between p-4 hover:bg-default-50 border-b last:border-b-0">
                              <div className="flex-1">
                                <div className="text-sm font-medium flex items-center gap-2">
                                  {member.name}
                                 
                                </div>
                                <div className="text-xs text-default-500 mt-1">{member.email}</div>
                              </div>
                              <Button
                                isIconOnly
                                variant="light"
                                size="sm"
                                color="danger"
                                onPress={() => removeMember(index)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <Button onPress={saveGroup} color="primary" size="lg" className="flex-1">
                    {isCreateMode ? t("groups.createGroup") : t("groups.saveChanges")}
                  </Button>
                  <Button variant="bordered" onPress={() => setCurrentView('list')} size="lg" className="flex-1">
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  )
}
