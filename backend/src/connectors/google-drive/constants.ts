export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
export const GOOGLE_DRIVE_EXPORT_URL =
  "https://www.googleapis.com/drive/v3/files/{file_id}/export";
export const GOOGLE_DRIVE_DOWNLOAD_URL =
  "https://www.googleapis.com/drive/v3/files/{file_id}?alt=media";

export const ABSOLUTE_CONNECTOR_DOC_CAP = 5;

export const GOOGLE_DRIVE_FILE_TYPES = [
  { id: "google_docs", label: "Google Docs", mimeType: "application/vnd.google-apps.document", ext: "gdoc" },
  { id: "google_sheets", label: "Google Sheets", mimeType: "application/vnd.google-apps.spreadsheet", ext: "gsheet" },
  { id: "google_slides", label: "Google Slides", mimeType: "application/vnd.google-apps.presentation", ext: "gslides" },
  { id: "pdf", label: "PDF", mimeType: "application/pdf", ext: "pdf" },
  { id: "plain_text", label: "Plain Text", mimeType: "text/plain", ext: "txt" },
  { id: "markdown", label: "Markdown", mimeType: "text/markdown", ext: "md" },
  { id: "html", label: "HTML", mimeType: "text/html", ext: "html" },
  { id: "csv", label: "CSV", mimeType: "text/csv", ext: "csv" },
] as const;

export const EXPORT_MIME_TYPES: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};
