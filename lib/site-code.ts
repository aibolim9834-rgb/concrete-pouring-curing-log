import { Site } from './types';

// Include archived codes and continue after the highest number without reusing gaps.
export function nextSiteCode(sites: Pick<Site, 'code'>[]): string {
  let highest = 0;
  for (const site of sites) {
    const match = site.code?.trim().match(/^A(\d{4})$/i);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest >= 9999 ? '' : `A${String(highest + 1).padStart(4, '0')}`;
}
