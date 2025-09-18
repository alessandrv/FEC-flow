"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Search, User as UserIcon, Loader2, ChevronDown } from 'lucide-react';
import {
  Input,
  Button,
  Card,
  CardBody,
  Avatar,
  Chip,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from '@heroui/react';
import { useTeamsAuth } from '../providers/teams-auth';
import { User } from '../../services/teams-auth';

interface UserSearchProps {
  onUserSelect: (user: User) => void;
  selectedUsers?: User[];
  placeholder?: string;
  multiple?: boolean;
  className?: string;
}

export const UserSearch: React.FC<UserSearchProps> = ({
  onUserSelect,
  selectedUsers = [],
  placeholder = "Search for users in your organization...",
  multiple = false,
  className = "",
}) => {
  const { searchUsers, getAllUsers, isLoggedIn } = useTeamsAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [showAllUsers, setShowAllUsers] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
        setShowAllUsers(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const delayedSearch = setTimeout(async () => {
      if (searchQuery.trim() && isLoggedIn) {
        setIsSearching(true);
        try {
          const results = await searchUsers(searchQuery);
          setSearchResults(results);
          setShowResults(true);
          setShowAllUsers(false);
        } catch (error) {
          console.error('Error searching users:', error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
        setShowResults(false);
      }
    }, 300);

    return () => clearTimeout(delayedSearch);
  }, [searchQuery, isLoggedIn, searchUsers]);

  const handleShowAllUsers = async () => {
    if (!isLoggedIn) return;

    if (allUsers.length === 0) {
      setIsSearching(true);
      try {
        const users = await getAllUsers();
        setAllUsers(users);
        setShowAllUsers(true);
        setShowResults(false);
      } catch (error) {
        console.error('Error getting all users:', error);
      } finally {
        setIsSearching(false);
      }
    } else {
      setShowAllUsers(true);
      setShowResults(false);
    }
  };

  const handleUserClick = (user: User) => {
    onUserSelect(user);
    setSearchQuery('');
    setShowResults(false);
    setShowAllUsers(false);
  };

  const isUserSelected = (user: User) => {
    return selectedUsers.some(selected => selected.id === user.id);
  };

  const displayUsers = showAllUsers ? allUsers : searchResults;

  if (!isLoggedIn) {
    return (
      <div className={`p-4 text-center text-default-500 ${className}`}>
        <UserIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>Please log in to search for users</p>
      </div>
    );
  }

  return (
    <div ref={searchRef} className={`relative ${className}`}>
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Input
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder={placeholder}
            startContent={<Search className="w-4 h-4 text-default-400" />}
            endContent={
              isSearching ? (
                <Loader2 className="w-4 h-4 animate-spin text-default-400" />
              ) : null
            }
            classNames={{
              input: "pr-8",
            }}
            onFocus={() => {
              if (searchResults.length > 0) {
                setShowResults(true);
              }
            }}
          />
        </div>
        <Dropdown>
          <DropdownTrigger>
            <Button
              variant="bordered"
              isIconOnly
              aria-label="Show all users"
            >
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownTrigger>
          <DropdownMenu aria-label="User actions">
            <DropdownItem
              key="all-users"
              onPress={handleShowAllUsers}
            >
              Show All Users
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>

      {(showResults || showAllUsers) && displayUsers.length > 0 && (
        <Card className="absolute top-full left-0 right-0 mt-1 z-50 max-h-80 overflow-hidden">
          <CardBody className="p-0">
            <div className="max-h-80 overflow-y-auto">
              {displayUsers.map((user) => (
                <div
                  key={user.id}
                  className={`flex items-center gap-3 p-3 hover:bg-default-100 cursor-pointer border-b border-default-200 last:border-b-0 ${
                    isUserSelected(user) ? 'bg-primary-50 border-primary-200' : ''
                  }`}
                  onClick={() => handleUserClick(user)}
                >
                  <Avatar
                    name={user.displayName}
                    size="sm"
                    className="flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {user.displayName}
                      </p>
                      {isUserSelected(user) && (
                        <Chip size="sm" color="primary" variant="flat">
                          Selected
                        </Chip>
                      )}
                    </div>
                    <p className="text-xs text-default-500 truncate">
                      {user.mail || user.userPrincipalName}
                    </p>
                    {user.jobTitle && (
                      <p className="text-xs text-default-400 truncate">
                        {user.jobTitle}
                        {user.department && ` • ${user.department}`}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {(showResults || showAllUsers) && displayUsers.length === 0 && !isSearching && (
        <Card className="absolute top-full left-0 right-0 mt-1 z-50">
          <CardBody className="p-4 text-center text-default-500">
            <UserIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">
              {searchQuery ? 'No users found' : 'Start typing to search for users'}
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
};
