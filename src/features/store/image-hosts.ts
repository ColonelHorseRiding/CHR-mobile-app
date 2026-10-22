import { resolveImages, resolveImageUrl, type ImageHosts, type TackImage } from './tack-details';

// EXPO_PUBLIC_* values are inlined at build time, so they must be read with static property access.
const siteUrl = process.env.EXPO_PUBLIC_SITE_URL?.trim() || 'https://colonelhorseriding.com';
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || null;

/** Where product photographs may come from: the club website, and this project's public tack-images bucket. */
export const IMAGE_HOSTS: ImageHosts = {
  siteUrl: /^https:\/\//.test(siteUrl) ? siteUrl : 'https://colonelhorseriding.com',
  supabaseUrl,
};

export const photoUrl = (stored: string) => resolveImageUrl(stored, IMAGE_HOSTS);
export const photosOf = (images: TackImage[]) => resolveImages(images, IMAGE_HOSTS);
