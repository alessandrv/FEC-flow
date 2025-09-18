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

interface GroupManagementProps {
  isOpen: boolean
  onClose: () => void
}

const colorOptions = [
  { name: "Blue", value: "primary" },
  { name: "Green", value: "success" },
  { name: "Purple", value: "secondary" },
  { name: "Red", value: "danger" },
  { name: "Orange", value: "warning" },
  { name: "Yellow", value: "yellow" },
  { name: "Pink", value: "pink" },
  { name: "Indigo", value: "indigo" },
  { name: "Emerald", value: "emerald" },
  { name: "Rose", value: "rose" },
  { name: "Cyan", value: "cyan" },
  { name: "Gray", value: "default" },
]

export default function GroupManagement({ isOpen, onClose }: GroupManagementProps) {
  const { groups, refreshGroups } = useGroups()
  const { isLoggedIn, sendNotification, getUserTeams } = useTeamsAuth()
  const [editingGroup, setEditingGroup] = useState<any>(null)
  const [isCreateMode, setIsCreateMode] = useState(false)
  const [groupName, setGroupName] = useState("")
  const [groupColor, setGroupColor] = useState("primary")
  const [members, setMembers] = useState<Array<{ name: string; email: string; id?: string }>>([])
  const [useTeamsSearch, setUseTeamsSearch] = useState(true)
  const [newMemberName, setNewMemberName] = useState("")
  const [newMemberEmail, setNewMemberEmail] = useState("")
  // New: selected Team to associate Planner tasks with
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [isLoadingTeams, setIsLoadingTeams] = useState(false)

  const startCreateGroup = () => {
    setIsCreateMode(true)
    setEditingGroup(null)
    setGroupName("")
    setGroupColor("primary")
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
    setMembers([...group.members])
    setNewMemberName("")
    setNewMemberEmail("")
    // Preselect team from group if present
    if (group.team_id && teams.length) {
      const t = teams.find(t => t.id === group.team_id) || null
      setSelectedTeam(t)
    } else {
      setSelectedTeam(null)
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
      alert("Please enter a valid email address")
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
      alert("This user is already added to the group")
    }
  }

  const removeMember = (index: number) => {
    setMembers(members.filter((_, i) => i !== index))
  }

  const saveGroup = async () => {
    if (!groupName.trim()) {
      alert("Please enter a group name")
      return
    }

    if (members.length === 0) {
      alert("Please add at least one member to the group")
      return
    }

    const groupData = {
      name: groupName.trim(),
      color: groupColor,
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
      alert('Failed to save group. Please try again.')
    }
  }

  const deleteGroup = async (groupId: string) => {
    if (confirm("Are you sure you want to delete this group?")) {
      try {
        await apiService.deleteGroup(groupId)
        // Refresh groups from context
        await refreshGroups()
      } catch (error) {
        console.error('Failed to delete group:', error)
        alert('Failed to delete group. Please try again.')
      }
    }
  }

  const cancelEdit = () => {
    setEditingGroup(null)
    setIsCreateMode(false)
    setGroupName("")
    setGroupColor("primary")
    setMembers([])
    setNewMemberName("")
    setNewMemberEmail("")
  setSelectedTeam(null)
  }

  const notifyGroup = async (group: any) => {
    if (!isLoggedIn) {
      alert("Please log in with Teams to send notifications")
      return
    }

    const message = `You have been assigned a new task in the Flow Creator application. Please check your assigned workflows.`
    
    try {
      for (const member of group.members) {
        if (member.id) {
          await sendNotification(member.id, message)
        }
      }
      alert(`Notification sent to ${group.members.length} group members`)
    } catch (error) {
      console.error('Failed to send notifications:', error)
      alert('Failed to send notifications. Please try again.')
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
            <span>Manage User Groups</span>
          </div>
          <p className="text-sm text-default-500 font-normal">
            Create and manage groups of users responsible for completing tasks
          </p>
        </ModalHeader>
        <ModalBody>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Groups List */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Groups</h3>
                <Button
                  onPress={startCreateGroup}
                  size="sm"
                  color="primary"
                  startContent={<Plus className="w-4 h-4" />}
                >
                  New Group
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
                          {isLoggedIn && (
                            <Button
                              isIconOnly
                              variant="light"
                              size="sm"
                              onPress={() => notifyGroup(group)}
                              title="Send Teams notification"
                            >
                              <Mail className="w-3 h-3" />
                            </Button>
                          )}
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
                        <span>{group.members.length} members</span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {group.members.slice(0, 2).map((member: any, index: number) => (
                          <div key={index} className="text-xs text-default-600">
                            {member.name} ({member.email})
                          </div>
                        ))}
                        {group.members.length > 2 && (
                          <div className="text-xs text-default-400">
                            +{group.members.length - 2} more
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
                    <h3 className="text-lg font-semibold">{isCreateMode ? "Create New Group" : "Edit Group"}</h3>
                    <Button variant="light" onPress={cancelEdit} isIconOnly>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="space-y-4">
                    <Input
                      label="Group Name"
                      value={groupName}
                      onValueChange={setGroupName}
                      placeholder="Enter group name"
                    />

                    {/* Team selection for Planner tasks */}
                    <div>
                      <label className="text-sm font-medium flex items-center gap-2 mb-2">
                        <Users className="w-4 h-4" />
                        Associated Team for Planner Tasks
                      </label>
                      <div className="flex gap-2">
        <Button
                          variant="bordered"
                          className="flex-1 justify-between"
                          onPress={async () => {
                            if (!isLoggedIn) {
                              alert('Log in with Teams to pick a team')
                              return
                            }
                            try {
                              setIsLoadingTeams(true)
          const list = await getUserTeams()
                              setTeams(list)
                              // naive: pick via prompt for now if no custom dropdown
                              const names = list.map((t, i) => `${i + 1}. ${t.displayName}`).join('\n')
                              const input = prompt(`Select Team by number:\n${names}`)
                              const idx = input ? parseInt(input, 10) - 1 : -1
                              if (idx >= 0 && idx < list.length) setSelectedTeam(list[idx])
                            } catch (e) {
                              console.error('Failed to load teams', e)
                              alert('Failed to load teams. Ensure Graph permissions are granted.')
                            } finally {
                              setIsLoadingTeams(false)
                            }
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            {selectedTeam ? (
                              <span className="truncate">{selectedTeam.displayName}</span>
                            ) : (
                              <span>Select a Team</span>
                            )}
                          </div>
                        </Button>
                        {selectedTeam && (
                          <Button isIconOnly variant="light" onPress={() => setSelectedTeam(null)} title="Clear">
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      {isLoadingTeams && (
                        <div className="text-xs text-default-500 mt-1">Loading your Teams…</div>
                      )}
                      <div className="text-xs text-default-500 mt-1">
                        Optional. Tasks will be created in the Planner plan owned by this Team's M365 Group.
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium flex items-center gap-2 mb-2">
                        <Palette className="w-4 h-4" />
                        Group Color
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
                            title={color.name}
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

                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between mb-4">
                        <label className="text-sm font-medium">Add Members</label>
                        {isLoggedIn && (
                          <div className="flex items-center gap-2">
                            <Switch
                              size="sm"
                              isSelected={useTeamsSearch}
                              onValueChange={setUseTeamsSearch}
                            />
                            <span className="text-xs text-default-500">Teams Search</span>
                          </div>
                        )}
                      </div>

                      {useTeamsSearch && isLoggedIn ? (
                        <div className="space-y-3">
                          <UserSearch
                            onUserSelect={handleUserSelect}
                            selectedUsers={members.filter(m => m.id).map(m => ({ 
                              id: m.id!, 
                              displayName: m.name, 
                              mail: m.email,
                              userPrincipalName: m.email
                            }))}
                            placeholder="Search for users in your organization..."
                          />
                          <div className="text-xs text-default-500 flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            Search and select users from your Teams organization
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              value={newMemberName}
                              onValueChange={setNewMemberName}
                              placeholder="Member name"
                              size="sm"
                            />
                            <Input
                              type="email"
                              value={newMemberEmail}
                              onValueChange={setNewMemberEmail}
                              placeholder="member@example.com"
                              size="sm"
                            />
                          </div>
                          <Button
                            onPress={addManualMember}
                            size="sm"
                            className="w-full"
                            isDisabled={!newMemberName.trim() || !newMemberEmail.trim()}
                            startContent={<UserPlus className="w-3 h-3" />}
                          >
                            Add Member Manually
                          </Button>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium">Current Members ({members.length})</label>
                      <div className="space-y-2 mt-2 max-h-32 overflow-y-auto">
                        {members.map((member, index) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-default-50 rounded">
                            <div className="flex-1">
                              <div className="text-sm font-medium flex items-center gap-2">
                                {member.name}
                                {member.id && (
                                  <Chip size="sm" color="success" variant="flat">
                                    Teams User
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
                        {isCreateMode ? "Create Group" : "Save Changes"}
                      </Button>
                      <Button variant="bordered" onPress={cancelEdit} className="flex-1">
                        Cancel
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-default-500">
                  <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Select a group to edit or create a new one</p>
                  {!isLoggedIn && (
                    <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-600">
                        Log in with Teams to enable user search and notifications
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  )
}
