export type AvatarWizardStep = 'create' | 'edit' | 'product' | 'script' | 'generate' | 'done';

export interface AvatarItem {
  id: string;
  name: string;
  imageUrl: string;
  thumbnailUrl?: string;
  prompt?: string;
}

export interface ProductAngle {
  url: string;
  label: string;
}

export interface AvatarVideoState {
  // Step 1-2: Avatar
  avatarImageUrl?: string;
  avatarName?: string;
  avatarId?: string;
  avatarPrompt?: string;
  // Step 3: Product
  productImageUrl?: string;
  productAngles?: ProductAngle[];
  // Step 4: Script & Voice
  script?: string;
  voiceId?: string;
  voiceName?: string;
  voiceoverUrl?: string;
  voiceoverDuration?: number;
  // Step 5-6: Video
  finalVideoUrl?: string;
  finalVideoDuration?: number;
}
