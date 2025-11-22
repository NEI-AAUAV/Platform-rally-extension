import React from 'react';
import { Navigate } from 'react-router-dom';
import useUser from '@/hooks/useUser';
import { LoadingState } from './LoadingState';

interface PermissionGuardProps {
  children: React.ReactNode;
  requiredScopes?: string[];
  fallbackPath?: string;
}

export default function PermissionGuard({ 
  children, 
  requiredScopes = ["manager-rally", "admin"], 
  fallbackPath = "/scoreboard" 
}: PermissionGuardProps) {
  const { isLoading, userStore } = useUser();
  
  if (isLoading) {
    return <LoadingState message="Carregando..." />;
  }

  const hasPermission = requiredScopes.some(scope => 
    userStore.scopes?.includes(scope)
  );

  if (!hasPermission) {
    return <Navigate to={fallbackPath} />;
  }

  return <>{children}</>;
}






