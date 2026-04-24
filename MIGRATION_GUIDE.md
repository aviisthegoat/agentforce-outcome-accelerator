# Migration Guide

This guide explains the changes made during the rebuild and how to migrate from the old IndexedDB-based system to the new PostgreSQL-based system.

## Major Changes

### 1. Database Migration
- **Old**: IndexedDB (browser-based, no user isolation)
- **New**: PostgreSQL (server-based, proper user isolation)

### 2. Authentication
- **Old**: Mock authentication with localStorage
- **New**: JWT-based authentication with password hashing

### 3. File Structure
- **Old**: Flat structure with pages and services
- **New**: MVC-like structure with clear separation of concerns

### 4. Data Storage
- **Old**: All data stored locally in browser
- **New**: All data stored in PostgreSQL database with user scoping

## New Directory Structure

```
src/
├── views/          # Page components (MVC Views)
├── components/     # Reusable UI components
├── hooks/          # Custom React hooks (MVC Controllers)
├── services/       # API client services
├── models/         # Type definitions
├── context/        # React context providers
└── utils/          # Helper functions
```

## Migration Steps

### For Existing Users

1. **Backup Data**: Export any important personas or chat data from the old version
2. **Set Up Database**: Follow the setup instructions in README.md
3. **Run Migrations**: Execute `npm run migrate` in the backend directory
4. **Create Account**: Register a new account in the new system
5. **Recreate Personas**: Manually recreate personas or use the import feature (if available)

### For Developers

1. **Update Imports**: All imports have changed:
   - `../types` → `../models/types`
   - `../services/storage` → Use API services instead
   - `../services/gemini` → `../services/gemini` (unchanged)

2. **Replace Storage Calls**:
   ```typescript
   // Old
   import { storageService } from '../services/storage';
   const personas = await storageService.getPersonas();
   
   // New
   import { usePersonas } from '../hooks/usePersonas';
   const { personas } = usePersonas();
   ```

3. **Update Authentication**:
   ```typescript
   // Old
   const [user, setUser] = useState(null);
   localStorage.setItem('spb_user', JSON.stringify(user));
   
   // New
   import { useAuth } from '../context/AuthContext';
   const { user, login, logout } = useAuth();
   ```

4. **Update API Calls**: All data fetching now goes through API services:
   - `personaApi.getAll()` instead of `storageService.getPersonas()`
   - `chatApi.getSessions()` instead of `storageService.getSessions()`
   - etc.

## Breaking Changes

1. **No More IndexedDB**: All data must be fetched from the API
2. **User Isolation**: Each user only sees their own data
3. **Authentication Required**: All pages require authentication
4. **API Format**: Backend uses snake_case, frontend normalizes to camelCase

## Environment Variables

New environment variables required:

**Frontend (.env):**
```
VITE_API_URL=http://localhost:3001/api
VITE_GEMINI_API_KEY=your-key
```

**Backend (backend/.env):**
```
DATABASE_URL=postgresql://...
JWT_SECRET=...
GEMINI_API_KEY=...
```

## Testing the Migration

1. Start the backend: `cd backend && npm run dev`
2. Start the frontend: `npm run dev`
3. Register a new account
4. Create a test persona
5. Verify data persists after refresh
6. Check that data is user-scoped (create second account to verify)

## Rollback Plan

If you need to rollback:
1. The old code is still in the `pages/` directory (not deleted)
2. You can revert to using IndexedDB by updating imports
3. However, user isolation and authentication will be lost

## Support

For issues during migration:
1. Check the README.md for setup instructions
2. Verify database connection
3. Check API endpoints are accessible
4. Review browser console for errors
5. Check backend logs for API errors


