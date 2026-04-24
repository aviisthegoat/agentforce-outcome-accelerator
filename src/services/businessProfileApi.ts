import { apiClient } from './api.js';
import type { BusinessProfile } from '../models/types.js';

export async function getBusinessProfile(): Promise<BusinessProfile | null> {
  const data = await apiClient.get<BusinessProfile | null>('/profile/business');
  return data;
}

export async function saveBusinessProfile(data: Partial<BusinessProfile>): Promise<BusinessProfile> {
  const profile = await apiClient.put<BusinessProfile>('/profile/business', data);
  return profile;
}
