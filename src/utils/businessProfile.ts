import type { BusinessProfile } from '../models/types.js';

export function businessProfileToPromptString(profile: BusinessProfile): string {
  const parts: string[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value != null && String(value).trim() !== '') parts.push(`${label}: ${String(value).trim()}`);
  };
  add('Business name', profile.business_name);
  add('Mission', profile.mission_statement);
  add('Vision', profile.vision_statement);
  add('Main offerings', profile.description_main_offerings);
  add('Key features/benefits', profile.key_features_or_benefits);
  add('USP', profile.unique_selling_proposition);
  add('Pricing model', profile.pricing_model);
  add('Customer segments', profile.customer_segments);
  add('Geographic focus', profile.geographic_focus);
  add('Industry served', profile.industry_served);
  add('What differentiates', profile.what_differentiates);
  add('Market niche', profile.market_niche);
  add('Revenue streams', profile.revenue_streams);
  add('Distribution channels', profile.distribution_channels);
  add('Key personnel', profile.key_personnel);
  add('Major achievements', profile.major_achievements);
  add('Revenue', profile.revenue);
  add('KPIs', profile.key_performance_indicators);
  add('Funding', profile.funding_rounds);
  add('Website', profile.website);
  return parts.length ? parts.join('\n') : 'No business background content.';
}
