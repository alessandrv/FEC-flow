"use client";

import React from 'react';
import { Button, Card, CardBody, Avatar, Chip } from '@heroui/react';
import { LogIn, LogOut, Users } from 'lucide-react';
import { useTeamsAuth } from '../providers/teams-auth';

export const TeamsLogin: React.FC = () => {
  const { 
    account, 
    currentUser, 
    isLoggedIn, 
    isLoading, 
    login, 
    logout 
  } = useTeamsAuth();

  const handleLogin = async () => {
    try {
      await login();
    } catch (error) {
      console.error('Login failed:', error);
      alert('Login failed. Please try again.');
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
      alert('Logout failed. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <Card className="max-w-md">
        <CardBody className="text-center p-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading...</p>
        </CardBody>
      </Card>
    );
  }

  if (isLoggedIn && currentUser) {
    return (
      <Card className="max-w-md">
        <CardBody className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <Avatar 
              name={currentUser.displayName}
              size="lg"
            />
            <div className="flex-1">
              <h3 className="text-lg font-semibold">{currentUser.displayName}</h3>
              <p className="text-sm text-default-500">{currentUser.mail}</p>
              {currentUser.jobTitle && (
                <p className="text-xs text-default-400">{currentUser.jobTitle}</p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2 mb-4">
            <Chip color="success" size="sm" variant="flat">
              <Users className="w-3 h-3 mr-1" />
              Teams Connected
            </Chip>
          </div>

          <Button 
            color="danger" 
            variant="light" 
            onPress={handleLogout}
            startContent={<LogOut className="w-4 h-4" />}
            className="w-full"
          >
            Sign Out
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="max-w-md">
      <CardBody className="text-center p-6">
        <Users className="w-16 h-16 mx-auto mb-4 text-default-300" />
        <h3 className="text-xl font-semibold mb-2">Connect with Teams</h3>
        <p className="text-default-500 mb-6">
          Sign in with your Microsoft Teams account to access user search and notifications.
        </p>
        <Button 
          color="primary" 
          onPress={handleLogin}
          startContent={<LogIn className="w-4 h-4" />}
          className="w-full"
        >
          Sign in with Teams
        </Button>
      </CardBody>
    </Card>
  );
};
