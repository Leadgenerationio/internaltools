import { google, type drive_v3 } from 'googleapis';

// ─── OAuth2 Client ───────────────────────────────────────────────────────────

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google Drive integration not configured: missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
  }
  return new google.auth.OAuth2(clientId, clientSecret);
}

// ─── Auth URL Generation ─────────────────────────────────────────────────────

/**
 * Generate Google OAuth consent URL with Drive file scope.
 * State param encodes userId for callback verification.
 */
export function getAuthUrl(userId: string, redirectUri: string): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // Force consent to always get refresh_token
    scope: [
      'https://www.googleapis.com/auth/drive.file', // Only files created by this app
      'https://www.googleapis.com/auth/userinfo.email', // To show connected email
    ],
    redirect_uri: redirectUri,
    state: JSON.stringify({ userId }),
  });
}

// ─── Token Exchange ──────────────────────────────────────────────────────────

/**
 * Exchange OAuth authorization code for tokens.
 * Returns both access token and refresh token.
 */
export async function exchangeCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; email?: string }> {
  const client = getOAuth2Client();

  const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to obtain tokens from Google');
  }

  // Get user email
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: client });
  let email: string | undefined;
  try {
    const { data } = await oauth2.userinfo.get();
    email = data.email ?? undefined;
  } catch {
    // Non-critical — email is just for display
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    email,
  };
}

// ─── Token Refresh ───────────────────────────────────────────────────────────

/**
 * Refresh an expired access token using the stored refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<string> {
  const client = getOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await client.refreshAccessToken();
  if (!credentials.access_token) {
    throw new Error('Failed to refresh Google access token');
  }
  return credentials.access_token;
}

// ─── Drive Client Helper ────────────────────────────────────────────────────

function getDriveClient(accessToken: string): drive_v3.Drive {
  const client = getOAuth2Client();
  client.setCredentials({ access_token: accessToken });
  return google.drive({ version: 'v3', auth: client });
}

// ─── Upload to Drive ─────────────────────────────────────────────────────────

/**
 * Upload a file to Google Drive.
 * If folderId is provided, the file is placed in that folder.
 */
export async function uploadToDrive(
  accessToken: string,
  fileName: string,
  fileStream: NodeJS.ReadableStream,
  mimeType: string,
  folderId?: string
): Promise<{ fileId: string; webViewLink: string }> {
  const drive = getDriveClient(accessToken);

  const fileMetadata: drive_v3.Schema$File = {
    name: fileName,
    ...(folderId && { parents: [folderId] }),
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: {
      mimeType,
      body: fileStream,
    },
    fields: 'id, webViewLink',
  });

  if (!response.data.id) {
    throw new Error('Google Drive upload failed: no file ID returned');
  }

  return {
    fileId: response.data.id,
    webViewLink: response.data.webViewLink || '',
  };
}

// ─── Create Folder ───────────────────────────────────────────────────────────

/**
 * Create a folder in Google Drive.
 * Returns the folder ID and web URL.
 */
export async function createFolder(
  accessToken: string,
  folderName: string,
  parentFolderId?: string
): Promise<{ folderId: string; webViewLink: string }> {
  const drive = getDriveClient(accessToken);

  const fileMetadata: drive_v3.Schema$File = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    ...(parentFolderId && { parents: [parentFolderId] }),
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id, webViewLink',
  });

  if (!response.data.id) {
    throw new Error('Failed to create Google Drive folder');
  }

  return {
    folderId: response.data.id,
    webViewLink: response.data.webViewLink || `https://drive.google.com/drive/folders/${response.data.id}`,
  };
}

// ─── List Folders ────────────────────────────────────────────────────────────

/**
 * List user's Google Drive folders for the folder picker.
 * Only lists folders the app has access to, plus root-level folders.
 */
export async function listFolders(
  accessToken: string
): Promise<Array<{ id: string; name: string }>> {
  const drive = getDriveClient(accessToken);

  const response = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: 'files(id, name)',
    orderBy: 'name',
    pageSize: 100,
  });

  return (response.data.files || []).map((f) => ({
    id: f.id || '',
    name: f.name || 'Untitled',
  }));
}

