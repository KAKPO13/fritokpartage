// lib/adminContext.js
'use client';

import { createContext, useContext } from 'react';

export const AdminContext = createContext({ authUser: null, isAdmin: false, ready: false });

export function useAdmin() {
  return useContext(AdminContext);
}